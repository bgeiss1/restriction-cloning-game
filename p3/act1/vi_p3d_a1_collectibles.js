'use strict';
/**
 * P3DCollectibleMgr — spawns and tracks collectible tokens in Act 1.
 *
 * Token types:
 *   'H_ION'  — H⁺ atom model (white proton sphere + red orbital ring + yellow electron)
 *   'HEALTH' — small green sphere — restores HP
 *
 * Collection is detected by sphere–sphere overlap with the endosome radius
 * + pickup margin.  Pump-specific interaction is added in Chunk 3.
 */
class P3DCollectibleMgr {
  constructor(scene) {
    this._scene  = scene;
    this._tokens = [];  // { object, ring, type, collected, id }

    // H⁺ ion shared geometries and materials (one set, reused by all tokens)
    this._hIonCoreGeo = new THREE.SphereGeometry(0.14, 8, 8);
    this._hIonRingGeo = new THREE.TorusGeometry(0.28, 0.022, 8, 32);
    this._hIonElecGeo = new THREE.SphereGeometry(0.065, 6, 6);
    this._hIonCoreMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 });
    this._hIonRingMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    this._hIonElecMat = new THREE.MeshLambertMaterial({ color: 0xffee44, emissive: 0x443300 });

    // Health pickup material
    this._matHealth = new THREE.MeshLambertMaterial({
      color: P3D_CFG.COL_HEALTH_TOK, emissive: 0x001100 });

    this._nextId = 0;
  }

  // ── H⁺ atom model builder ──────────────────────────────────────────────

  _buildHIonGroup() {
    const grp = new THREE.Group();

    // Proton core
    grp.add(new THREE.Mesh(this._hIonCoreGeo, this._hIonCoreMat));

    // Orbital ring — tilted 35° for visual depth
    const ring = new THREE.Mesh(this._hIonRingGeo, this._hIonRingMat);
    ring.rotation.x = Math.PI / 5.1;
    grp.add(ring);

    // Electron on the ring
    const elec = new THREE.Mesh(this._hIonElecGeo, this._hIonElecMat);
    elec.position.set(0.28, 0, 0);   // sits at ring radius
    ring.add(elec);                   // child of ring → orbits with it

    return { group: grp, ring };
  }

  // ── Spawn ──────────────────────────────────────────────────────────────

  /**
   * Spawn a single token at worldPos.
   * @param {'H_ION'|'HEALTH'} type
   * @param {THREE.Vector3}    worldPos
   */
  spawn(type, worldPos) {
    let object, ring = null;

    if (type === 'H_ION') {
      const built = this._buildHIonGroup();
      object = built.group;
      ring   = built.ring;
    } else {
      // HEALTH
      object = new THREE.Mesh(P3DGeoLib.sphereSmall, this._matHealth);
      object.scale.setScalar(1.5);
    }

    object.position.copy(worldPos);
    this._scene.add(object);
    this._tokens.push({ object, ring, type, collected: false, id: this._nextId++ });
  }

  /**
   * Spawn a cluster of tokens around a descent depth.
   * Called once per chunk as the vehicle passes the chunk boundary.
   *
   * @param {number} descentY  current accumulated descent depth
   */
  spawnGroup(descentY) {
    const H    = P3D_CFG.A1_CHUNK_H;
    const R    = P3D_CFG.A1_BOUNDARY_R * 0.7;
    const baseY = -(descentY + H * 0.5);

    const _rnd = (spread) => (Math.random() - 0.5) * spread;
    const _pos = (dy) => new THREE.Vector3(
      _rnd(R * 2),
      baseY + dy + _rnd(H * 0.35),
      _rnd(R * 2)
    );

    // 10 H⁺ ions spread through the chunk
    for (let i = 0; i < 10; i++) {
      const dy = (i / 10 - 0.5) * H * 0.7;
      this.spawn('H_ION', _pos(dy));
    }

    // 1 health pickup, deeper in the chunk
    this.spawn('HEALTH', _pos(-H * 0.2));
  }

  // ── Per-frame update ───────────────────────────────────────────────────

  /**
   * Animate tokens, check pickup.
   * H_ION tokens are collected by pump-tip proximity; HEALTH by endosome sphere.
   *
   * @param {number}          dt
   * @param {THREE.Vector3[]} pumpTips      world positions of the 6 V-ATPase tips
   * @param {THREE.Vector3}   vehiclePos    world position of endosome centre
   * @param {number}          vehicleRadius endosome radius (for HEALTH pickup margin)
   * @returns {{ type: string }[]}  array of items collected this frame
   */
  update(dt, pumpTips, vehiclePos, vehicleRadius) {
    const collected = [];
    const healthR2  = (vehicleRadius + 0.5) ** 2;
    const pumpR2    = 0.7 * 0.7;   // pump-tip capture radius
    const t         = performance.now() * 0.001;

    for (const tok of this._tokens) {
      if (tok.collected) continue;

      // Animation
      tok.object.rotation.y += dt * 0.9;
      // Gentle bob
      tok.object.position.y += Math.sin(t * 1.8 + tok.id * 1.1) * 0.004 * dt * 60;
      // Electron orbital spin (faster than group rotation)
      if (tok.ring) tok.ring.rotation.z += dt * 2.8;

      // Pickup test
      if (tok.type === 'H_ION') {
        // Must be touched by a pump tip
        let hit = false;
        for (const tip of pumpTips) {
          const dx = tok.object.position.x - tip.x;
          const dy = tok.object.position.y - tip.y;
          const dz = tok.object.position.z - tip.z;
          if (dx*dx + dy*dy + dz*dz < pumpR2) { hit = true; break; }
        }
        if (hit) {
          tok.collected = true;
          this._scene.remove(tok.object);
          collected.push({ type: tok.type });
        }
      } else {
        // HEALTH: endosome sphere pickup
        const dx = tok.object.position.x - vehiclePos.x;
        const dy = tok.object.position.y - vehiclePos.y;
        const dz = tok.object.position.z - vehiclePos.z;
        if (dx*dx + dy*dy + dz*dz < healthR2) {
          tok.collected = true;
          this._scene.remove(tok.object);
          collected.push({ type: tok.type });
        }
      }
    }

    if (collected.length) {
      this._tokens = this._tokens.filter(t => !t.collected);
    }

    return collected;
  }

  /**
   * Remove tokens that have scrolled well above the vehicle (unreachable).
   * @param {number} vehicleWorldY   vehicle's current world Y
   */
  cullAbove(vehicleWorldY) {
    const threshold = vehicleWorldY + P3D_CFG.A1_CHUNK_H * 1.5;
    this._tokens = this._tokens.filter(tok => {
      if (tok.object.position.y > threshold) {
        this._scene.remove(tok.object);
        return false;
      }
      return true;
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  destroy() {
    for (const tok of this._tokens) this._scene.remove(tok.object);
    this._tokens = [];

    // Dispose shared H⁺ ion resources
    this._hIonCoreGeo.dispose();
    this._hIonRingGeo.dispose();
    this._hIonElecGeo.dispose();
    this._hIonCoreMat.dispose();
    this._hIonRingMat.dispose();
    this._hIonElecMat.dispose();
    this._matHealth.dispose();
  }
}
