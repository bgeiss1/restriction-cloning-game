'use strict';
/**
 * P3DLysosomeManager — Act 1 hazard system.
 *
 * Manages:
 *   • Lysosomes: homing + sinusoidal drift, damage on contact, near-miss scoring
 *   • Antibody stragglers: slow trackers, raise Alert bar on contact
 *
 * Public API:
 *   spawnForChunk(descentY, pH)     — called when a new chunk begins
 *   update(dt, vehiclePos, endoR)   — returns { damage, nearMissScore, nearMissCount, alertDelta }
 *   cull(vehicleWorldY)             — remove passed hazards, returns { dodged }
 *   destroy()                       — scene teardown
 */
class P3DLysosomeManager {
  constructor(scene) {
    this._scene  = scene;
    this._lysos  = [];      // active lysosomes
    this._abs    = [];      // antibody stragglers
    this._t      = 0;       // global time accumulator
    this._tmpV   = new THREE.Vector3();
  }

  // ── Spawn ─────────────────────────────────────────────────────────────

  /**
   * Spawn lysosomes (and optionally an antibody straggler) for the new chunk.
   * Lysosomes are suppressed until descentTime >= 60 s.
   *
   * @param {number} descentY     accumulated descent depth
   * @param {number} pH           current pH
   * @param {number} descentTime  elapsed Act 1 time (seconds)
   */
  spawnForChunk(descentY, pH, descentTime = 0) {
    if (descentTime >= 60) {
      // Look up the lyso-count range for this pH
      const row = P3D_CFG.A1_LYSO_TABLE.find(r => pH > r.above)
               || P3D_CFG.A1_LYSO_TABLE[P3D_CFG.A1_LYSO_TABLE.length - 1];

      const cap = P3D_CFG.A1_LYSO_MAX - this._lysos.length;
      const n   = Math.min(cap, row.min + Math.floor(Math.random() * (row.max - row.min + 1)));

      for (let i = 0; i < n; i++) {
        this._spawnLyso(descentY);
      }
    }

    // Probabilistic antibody straggler (not gated — appears from start)
    if (Math.random() < 1 / P3D_CFG.A1_AB_STRAG_FREQ) {
      this._spawnAB(descentY);
    }
  }

  // Build a canvas-texture sprite label reading "LYSOSOME"
  _makeLysoLabel() {
    const canvas  = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 56;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 56);
    ctx.font         = 'bold 24px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Subtle dark outline for readability against any background
    ctx.strokeStyle  = 'rgba(80,0,0,0.85)';
    ctx.lineWidth    = 4;
    ctx.strokeText('LYSOSOME', 128, 28);
    ctx.fillStyle    = 'rgba(255,100,100,0.95)';
    ctx.fillText('LYSOSOME', 128, 28);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 0.70, 1);
    return { sprite, mat, tex };
  }

  _spawnLyso(descentY) {
    const rMin  = P3D_CFG.A1_LYSO_R_MIN;
    const rMax  = P3D_CFG.A1_LYSO_R_MAX;
    const R     = P3D_CFG.A1_BOUNDARY_R;
    const H     = P3D_CFG.A1_CHUNK_H;

    const radius = rMin + Math.random() * (rMax - rMin);

    const grp = new THREE.Group();

    // Body — lysosomeSphere has base radius 1.75; scale to desired radius
    const bodyScale = radius / 1.75;
    const body = new THREE.Mesh(P3DGeoLib.lysosomeSphere, P3DMatLib.lysosome);
    body.scale.setScalar(bodyScale);
    grp.add(body);

    // Danger zone shell — lysoDanger geo is radius A1_LYSO_DANGER_R, no scale needed
    const danger = new THREE.Mesh(P3DGeoLib.lysoDanger, P3DMatLib.lysoDanger);
    grp.add(danger);

    // "LYSOSOME" label sprite — sits above the sphere in group-local space
    const { sprite, mat: labelMat, tex: labelTex } = this._makeLysoLabel();
    sprite.position.set(0, radius + 1.0, 0);
    grp.add(sprite);

    // World position: random XZ inside play field, placed in the lower 50% of this chunk
    const angle = Math.random() * Math.PI * 2;
    const dist  = R * 0.3 + Math.random() * R * 0.65;
    const posX  = Math.cos(angle) * dist;
    const posZ  = Math.sin(angle) * dist;
    const posY  = -(descentY + H * (0.25 + Math.random() * 0.60));

    grp.position.set(posX, posY, posZ);
    this._scene.add(grp);

    this._lysos.push({
      group:         grp,
      radius,
      posX, posZ, posY,
      phase:         Math.random() * Math.PI * 2,
      nearMissFired: false,
      labelMat,
      labelTex,
    });
  }

  _spawnAB(descentY) {
    const R = P3D_CFG.A1_BOUNDARY_R;
    const H = P3D_CFG.A1_CHUNK_H;

    const mat  = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.65 });
    const mesh = new THREE.Mesh(P3DGeoLib.sphereMid, mat);
    mesh.scale.setScalar(1.8);

    const angle = Math.random() * Math.PI * 2;
    const dist  = R * 0.4 + Math.random() * R * 0.5;
    const posX  = Math.cos(angle) * dist;
    const posZ  = Math.sin(angle) * dist;
    const posY  = -(descentY + H * (0.35 + Math.random() * 0.45));

    mesh.position.set(posX, posY, posZ);
    this._scene.add(mesh);

    this._abs.push({ mesh, posX, posZ, posY, _mat: mat });
  }

  _removeLyso(l) {
    this._scene.remove(l.group);
    l.labelMat.dispose();
    l.labelTex.dispose();
  }

  // ── Per-frame update ──────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {THREE.Vector3} vehiclePos   world position of the endosome centre
   * @param {number} endoR               endosome collision radius
   * @returns {{ damage, nearMissScore, nearMissCount, alertDelta }}
   */
  update(dt, vehiclePos, endoR) {
    this._t += dt;

    let damage       = 0;
    let nearMissScore = 0;
    let nearMissCount = 0;
    let alertDelta   = 0;

    const driftAmp = P3D_CFG.A1_LYSO_DRIFT_AMP;
    const driftPer = P3D_CFG.A1_LYSO_DRIFT_PER;
    const homeSpd  = P3D_CFG.A1_LYSO_HOME_SPD;
    const dangerR  = P3D_CFG.A1_LYSO_DANGER_R;
    const omega    = (Math.PI * 2) / driftPer;

    // ── Lysosomes ──────────────────────────────────────────────────────
    for (let i = this._lysos.length - 1; i >= 0; i--) {
      const l = this._lysos[i];

      // Sinusoidal drift in XZ (two slightly different frequencies for variety)
      const driftVx = driftAmp * Math.cos(this._t * omega       + l.phase);
      const driftVz = driftAmp * Math.sin(this._t * omega * 1.3 + l.phase);

      // Homing vector toward vehicle XZ
      const dx2 = vehiclePos.x - l.posX;
      const dz2 = vehiclePos.z - l.posZ;
      const d2d = Math.sqrt(dx2 * dx2 + dz2 * dz2) + 0.001;
      const homeVx = (dx2 / d2d) * homeSpd;
      const homeVz = (dz2 / d2d) * homeSpd;

      l.posX += (driftVx + homeVx) * dt;
      l.posZ += (driftVz + homeVz) * dt;

      // Keep within boundary (soft clamp)
      const R = P3D_CFG.A1_BOUNDARY_R;
      const dSq = l.posX * l.posX + l.posZ * l.posZ;
      if (dSq > (R + 2) * (R + 2)) {
        const d = Math.sqrt(dSq);
        l.posX = (l.posX / d) * (R + 2);
        l.posZ = (l.posZ / d) * (R + 2);
      }

      // Pulse scale on group
      const pulse = 1 + 0.06 * Math.sin(this._t * 2.8 + l.phase);
      l.group.scale.setScalar(pulse);
      l.group.position.set(l.posX, l.posY, l.posZ);

      // Distance to vehicle (3-D)
      const dist3 = vehiclePos.distanceTo(l.group.position);
      const collideR = endoR + l.radius;

      if (dist3 < collideR) {
        // Direct collision — deal damage and destroy lyso
        damage += P3D_CFG.A1_LYSO_DMG;
        this._removeLyso(l);
        this._lysos.splice(i, 1);
      } else if (dist3 < endoR + dangerR) {
        // Inside danger zone — fire near-miss once per pass
        if (!l.nearMissFired) {
          l.nearMissFired = true;
          nearMissScore  += P3D_CFG.A1_NEAR_MISS_PTS;
          nearMissCount  += 1;
        }
      } else {
        // Outside danger zone — allow next near-miss
        l.nearMissFired = false;
      }
    }

    // ── Antibody stragglers ────────────────────────────────────────────
    const abSpd = 1.2;
    for (let i = this._abs.length - 1; i >= 0; i--) {
      const ab = this._abs[i];

      const dx = vehiclePos.x - ab.posX;
      const dy = vehiclePos.y - ab.posY;
      const dz = vehiclePos.z - ab.posZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;

      ab.posX += (dx / dist) * abSpd * dt;
      ab.posY += (dy / dist) * abSpd * dt;
      ab.posZ += (dz / dist) * abSpd * dt;
      ab.mesh.position.set(ab.posX, ab.posY, ab.posZ);

      if (dist < endoR + 0.5) {
        alertDelta += P3D_CFG.A1_AB_ALERT_INC;
        ab._mat.dispose();
        this._scene.remove(ab.mesh);
        this._abs.splice(i, 1);
      }
    }

    return { damage, nearMissScore, nearMissCount, alertDelta };
  }

  // ── Cull ──────────────────────────────────────────────────────────────

  /**
   * Remove hazards that are more than one chunk above the vehicle (safely passed).
   * @param {number} vehicleWorldY   vehicle world Y (negative, equals -descentY)
   * @returns {{ dodged: number }}   count of lysosomes that were safely passed
   */
  cull(vehicleWorldY) {
    let dodged = 0;
    const threshold = vehicleWorldY + P3D_CFG.A1_CHUNK_H;

    for (let i = this._lysos.length - 1; i >= 0; i--) {
      if (this._lysos[i].posY > threshold) {
        this._removeLyso(this._lysos[i]);
        this._lysos.splice(i, 1);
        dodged++;
      }
    }
    for (let i = this._abs.length - 1; i >= 0; i--) {
      if (this._abs[i].posY > threshold) {
        this._abs[i]._mat.dispose();
        this._scene.remove(this._abs[i].mesh);
        this._abs.splice(i, 1);
      }
    }
    return { dodged };
  }

  // ── Destroy ───────────────────────────────────────────────────────────

  destroy() {
    for (const l of this._lysos) this._removeLyso(l);
    for (const ab of this._abs) {
      ab._mat.dispose();
      this._scene.remove(ab.mesh);
    }
    this._lysos = [];
    this._abs   = [];
  }
}
