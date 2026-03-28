// vi_p2_gameplay.js — Phase 2 Attachment: receptors, obstacles, power-ups
// Depends on: three.js r128, vi_p2_config.js, vi_p2_main.js
'use strict';

// ── Shared helpers ───────────────────────────────────────────────────────────

function _p2Shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Lazy halo texture (soft radial gradient → AdditiveBlending fake bloom)
let _haloTex = null;
function _getHaloTex() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g   = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _haloTex = new THREE.CanvasTexture(c);
  return _haloTex;
}

function _haloSprite(size, hexColor) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: _getHaloTex(), color: hexColor,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

// First-encounter education triggers — delegate to P2EducationSystem when available
// _edu(id, text)        → ticker only on first encounter
// _edu(id, title, text) → modal info card on first encounter
// Image is auto-derived: p2/images/{id.toLowerCase()}.png (hidden via onerror if absent)
function _edu(id, title, text) {
  if (text === undefined) { text = title; title = null; }
  const imgSrc = 'p2/images/' + id.toLowerCase() + '.png';
  const PA = window.P2Attachment;
  if (!PA) return;
  if (PA.education) {
    PA.education.trigger(id, title, text, imgSrc);
  } else {
    // Fallback: simple dedup + direct display (used if fx file not yet loaded)
    if (_edu._seen[id]) return;
    _edu._seen[id] = true;
    if (title) PA.showInfoCard(title, text, imgSrc);
    else PA.showTicker(text, 3.5);
  }
}
_edu._seen = {};
function _resetEdu() { _edu._seen = {}; }


function _getStage() {
  const t = window.P2Attachment ? P2Attachment.elapsed : 0;
  if (t < P2_CFG.STAGE_TUTORIAL_END) return 'tutorial';
  if (t < P2_CFG.STAGE_HARD_START)   return 'mid';
  if (t < P2_CFG.STAGE_FULL_START)   return 'hard';
  if (t < P2_CFG.STAGE_MAX_START)    return 'full';
  return 'max';
}

// ── P2Gameplay factory ───────────────────────────────────────────────────────

const P2Gameplay = {
  createReceptors(scene, terrain) { return new ReceptorManager(scene, terrain); },
  createObstacles(scene)          { return new ObstacleManager(scene); },
  createPowerups(scene, terrain)  { return new PowerUpManager(scene, terrain); },
};
window.P2Gameplay = P2Gameplay;


// ═══════════════════════════════════════════════════════════════════════════════
// ReceptorManager — 5 receptor types, object pool, row-based spawning
// ═══════════════════════════════════════════════════════════════════════════════

class ReceptorManager {

  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    this._pool   = [];   // all pre-built receptor items
    this._active = [];   // currently in-scene

    this._totalScrolled   = 0;
    this._lastRowScrolled = 0;
    this._rowsSinceSialic = 0;
    this._HORIZON_Z       = 40;

    this._buildPool();
  }

  // ── Pool construction ─────────────────────────────────────────────────

  _buildPool() {
    const counts = { sialic: 7, ace2: 6, cd4: 5, icam1: 5, decoy: 4 };
    Object.entries(counts).forEach(([type, n]) => {
      for (let i = 0; i < n; i++) {
        const group = this._buildGroup(type);
        group.visible = false;
        this._scene.add(group);
        this._pool.push({ type, group, z: 0, lane: 0, active: false, hit: false, riseT: 0 });
      }
    });
  }

  _getFree(type) {
    return this._pool.find(p => p.type === type && !p.active) || null;
  }

  _activate(item, laneIdx, z) {
    item.active = true;
    item.hit    = false;
    item.riseT  = 0;
    item.z      = z;
    item.lane   = laneIdx;
    item.group.position.set(P2_CFG.LANES[laneIdx], -0.5, z);
    item.group.rotation.y = Math.random() * Math.PI * 2;
    item.group.visible = true;
    this._active.push(item);
  }

  _retire(item) {
    item.active        = false;
    item.hit           = true;
    item.group.visible = false;
    this._active = this._active.filter(a => a !== item);
  }

  // ── Receptor geometries ───────────────────────────────────────────────

  _buildGroup(type) {
    switch (type) {
      case 'sialic': return this._buildSialic();
      case 'ace2':   return this._buildACE2();
      case 'cd4':    return this._buildCD4();
      case 'icam1':  return this._buildICAM1();
      case 'decoy':  return this._buildDecoy();
      default:       return new THREE.Group();
    }
  }

  _mat(type) {
    const defs = {
      sialic: [P2_CFG.COL_SIALIC,    0x00aa44, 0.8],
      ace2:   [P2_CFG.COL_ACE2,      0x1133bb, 0.7],
      cd4:    [P2_CFG.COL_CD4,       0x551199, 0.7],
      icam1:  [P2_CFG.COL_ICAM1,     0xaa4400, 0.7],
      decoy:  [P2_CFG.COL_DECOY,     0x448800, 0.6],
    }[type] || [0xffffff, 0x333333, 0.5];
    return new THREE.MeshPhongMaterial({
      color: defs[0], emissive: new THREE.Color(defs[1]),
      emissiveIntensity: defs[2], shininess: 60,
    });
  }

  _mk(geo, mat, px, py, pz) {
    const m = new THREE.Mesh(geo, mat);
    if (px !== undefined) m.position.set(px, py, pz);
    return m;
  }

  _buildSialic() {
    const g = new THREE.Group();
    const mat = this._mat('sialic');
    // Base + stalk
    g.add(this._mk(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 8), mat, 0, 0.2, 0));
    g.add(this._mk(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), mat, 0, 0.6, 0));
    // 3-pronged Y fork (sialic acid terminal sugar)
    for (let i = 0; i < 3; i++) {
      const a   = (i / 3) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a) * 0.38, 0.30, Math.cos(a) * 0.38).normalize();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 5), mat);
      arm.position.set(dir.x * 0.45, 0.85 + dir.y * 0.45, dir.z * 0.45);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.add(arm);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mat);
      tip.position.set(dir.x * 0.85, 0.85 + dir.y * 0.85, dir.z * 0.85);
      g.add(tip);
    }
    g.add(_haloSprite(1.8, P2_CFG.COL_SIALIC));
    return g;
  }

  _buildACE2() {
    const g = new THREE.Group();
    const mat = this._mat('ace2');
    g.add(this._mk(new THREE.CylinderGeometry(0.10, 0.10, 1.2, 8), mat, 0, 0.6, 0));
    const cap = this._mk(new THREE.SphereGeometry(0.36, 10, 8), mat, 0, 1.36, 0);
    cap.scale.y = 0.52;
    g.add(cap);
    return g;
  }

  _buildCD4() {
    const g = new THREE.Group();
    const mat = this._mat('cd4');
    g.add(this._mk(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), mat, 0, 0.55, 0));
    g.add(this._mk(new THREE.BoxGeometry(0.68, 0.08, 0.08), mat, 0, 1.16, 0));
    g.add(this._mk(new THREE.SphereGeometry(0.07, 5, 5), mat, -0.34, 1.16, 0));
    g.add(this._mk(new THREE.SphereGeometry(0.07, 5, 5), mat,  0.34, 1.16, 0));
    return g;
  }

  _buildICAM1() {
    const g = new THREE.Group();
    const mat = this._mat('icam1');
    g.add(this._mk(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 6), mat, 0, 0.19, 0));
    g.add(this._mk(new THREE.CylinderGeometry(0.46, 0.42, 0.10, 12), mat, 0, 0.43, 0));
    // Dark dish depression on top
    const inner = this._mk(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 10), mat, 0, 0.52, 0);
    inner.material = new THREE.MeshPhongMaterial({ color: 0x883311, emissive: new THREE.Color(0x441100), emissiveIntensity: 0.5 });
    g.add(inner);
    return g;
  }

  _buildDecoy() {
    // Deliberately similar to sialic but: yellow-green, 2 branches instead of 3, wider angle
    const g = new THREE.Group();
    const mat = this._mat('decoy');
    g.add(this._mk(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 8), mat, 0, 0.2, 0));
    g.add(this._mk(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), mat, 0, 0.6, 0));
    for (let i = 0; i < 2; i++) {
      const a   = (i / 2) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a) * 0.48, 0.22, Math.cos(a) * 0.48).normalize();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 5), mat);
      arm.position.set(dir.x * 0.45, 0.85 + dir.y * 0.45, dir.z * 0.45);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.add(arm);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mat);
      tip.position.set(dir.x * 0.85, 0.85 + dir.y * 0.85, dir.z * 0.85);
      g.add(tip);
    }
    return g;
  }

  // ── Update loop ───────────────────────────────────────────────────────

  update(dt, speed) {
    const dz = dt * speed * 8;
    this._totalScrolled += dz;

    // Move active receptors toward player; rise animation; recycle
    for (let i = this._active.length - 1; i >= 0; i--) {
      const item = this._active[i];
      item.z -= dz;
      // Rise from membrane
      if (item.riseT < 1) {
        item.riseT = Math.min(1, item.riseT + dt * 3.0);
        const t  = item.riseT;
        const ss = t * t * (3 - 2 * t);      // smoothstep
        item.group.position.y = -0.5 + 1.5 * ss;
      }
      item.group.position.z  = item.z;
      item.group.rotation.y += dt * 0.55;
      if (item.z < -10) this._retire(item);
    }

    // Spawn new rows
    while (this._totalScrolled - this._lastRowScrolled >= P2_CFG.ROW_SPACING) {
      this._spawnRow();
      this._lastRowScrolled += P2_CFG.ROW_SPACING;
    }

    this._checkCollisions();
  }

  // ── Row spawning ──────────────────────────────────────────────────────

  _spawnRow() {
    const z = this._HORIZON_Z;
    const maxReceptors = Math.min(3, P2_CFG.RECEPTORS_PER_ROW[1]);
    const count   = P2_CFG.RECEPTORS_PER_ROW[0]
      + Math.floor(Math.random() * (maxReceptors - P2_CFG.RECEPTORS_PER_ROW[0] + 1));
    const lanes   = _p2Shuffle([0, 1, 2, 3, 4]);
    const used    = lanes.slice(0, count);
    const needsSialic = this._rowsSinceSialic >= P2_CFG.SPAWN_GUARANTEE_ROWS;
    let rowHasSialic  = false;

    used.forEach((laneIdx, i) => {
      const laneX     = P2_CFG.LANES[laneIdx];
      const inRaft    = this._terrain ? this._terrain.inRaft(laneX, z) : false;
      const forceSia  = needsSialic && i === 0 && !rowHasSialic;
      const type      = this._pickType(inRaft, forceSia);

      if (type === 'sialic') rowHasSialic = true;

      const item = this._getFree(type);
      if (item) this._activate(item, laneIdx, z);
    });

    this._rowsSinceSialic = rowHasSialic ? 0 : this._rowsSinceSialic + 1;
  }

  _pickType(inRaft, forceSialic) {
    if (forceSialic) return 'sialic';
    const stage   = _getStage();
    const correct = window.P2Attachment ? P2Attachment.correctCollected : 0;
    const useRaft = window.P2Attachment && P2Attachment.raftActive;
    const decoyOk = stage !== 'tutorial' && correct >= P2_CFG.DECOY_MIN_COLLECTED;

    const wSialic = (inRaft || useRaft) ? P2_CFG.SPAWN_W_SIALIC_RAFT : P2_CFG.SPAWN_W_SIALIC;
    const weights = [
      ['sialic', wSialic],
      ['ace2',   P2_CFG.SPAWN_W_ACE2],
      ['cd4',    P2_CFG.SPAWN_W_CD4],
      ['icam1',  P2_CFG.SPAWN_W_ICAM1],
      ['decoy',  decoyOk ? P2_CFG.SPAWN_W_DECOY : 0],
    ];
    let total = weights.reduce((s, [, w]) => s + w, 0);
    let r     = Math.random() * total;
    for (const [type, w] of weights) { r -= w; if (r <= 0) return type; }
    return 'sialic';
  }

  // ── Collision detection ───────────────────────────────────────────────

  _checkCollisions() {
    if (!window.P2Attachment || !P2Attachment.player) return;
    const P  = P2Attachment.player;
    const rr = (P2_CFG.RADIUS_PLAYER + P2_CFG.RADIUS_RECEPTOR) ** 2;

    for (const item of this._active) {
      if (item.hit || item.riseT < 0.85) continue;
      if (Math.abs(item.z - P.z) > P2_CFG.COLLISION_Z_RANGE) continue;
      const dx = item.group.position.x - P.x;
      const dy = item.group.position.y - P.y;
      const dz = item.z - P.z;
      if (dx * dx + dy * dy + dz * dz < rr) {
        item.hit = true;
        this._onHit(item);
      }
    }
  }

  _onHit(item) {
    const PA = window.P2Attachment;
    if (!PA) return;

    const edu = PA.education;
    switch (item.type) {
      case 'sialic':
        PA.collectSialic();
        _edu('SA_INTRO', 'Sialic Acid — Target Receptor', 'Influenza hemagglutinin (HA) binds α2,6-linked sialic acid on respiratory epithelial cells. This is your target receptor — collect as many as possible to complete attachment!');
        break;
      case 'ace2':
        _edu('ACE2_WRONG', 'ACE2 — Wrong Receptor', 'ACE2 (angiotensin-converting enzyme 2) is the host receptor for SARS-CoV-2 (COVID-19), not influenza. Receptor specificity is a key determinant of viral host range and tissue tropism.');
        if (edu && edu.hasSeen('ACE2_WRONG')) { PA.takeDamage(P2_CFG.DMG_WRONG_RECEPTOR, P2_CFG.ALERT_WRONG_RECEPTOR, true); PA.recordWrongCollision(); }
        break;
      case 'cd4':
        _edu('CD4_WRONG', 'CD4 — Wrong Receptor', 'CD4 is expressed on T-helper cells and used by HIV (together with CCR5 or CXCR4 co-receptors) for cell entry. Influenza HA has no affinity for CD4 — completely different viral machinery.');
        if (edu && edu.hasSeen('CD4_WRONG')) { PA.takeDamage(P2_CFG.DMG_WRONG_RECEPTOR, P2_CFG.ALERT_WRONG_RECEPTOR, true); PA.recordWrongCollision(); }
        break;
      case 'icam1':
        _edu('ICAM1_WRONG', 'ICAM-1 — Wrong Receptor', 'ICAM-1 (intercellular adhesion molecule 1) mediates rhinovirus (common cold) attachment to host cells. Each virus has evolved surface proteins that recognize unique host receptors.');
        if (edu && edu.hasSeen('ICAM1_WRONG')) { PA.takeDamage(P2_CFG.DMG_WRONG_RECEPTOR, P2_CFG.ALERT_WRONG_RECEPTOR, true); PA.recordWrongCollision(); }
        break;
      case 'decoy':
        _edu('DECOY_HIT', 'Modified Sialic Acid', 'A host defense: cells can chemically modify sialic acid residues (e.g., O-acetylation) to reduce viral binding affinity. This is one way the host fights back at the molecular level.');
        if (edu && edu.hasSeen('DECOY_HIT')) { PA.takeDamage(P2_CFG.DMG_DECOY, Math.round(P2_CFG.ALERT_WRONG_RECEPTOR * 0.5), false); PA.recordWrongCollision(); }
        break;
    }
    // Brief delay before retiring so the flash is visible
    setTimeout(() => this._retire(item), 180);
  }

  reset() {
    [...this._active].forEach(item => this._retire(item));
    this._totalScrolled   = 0;
    this._lastRowScrolled = 0;
    this._rowsSinceSialic = 0;
    // Education reset is handled by P2EducationSystem.reset() in _retryRun()
  }

  destroy() {
    this._pool.forEach(item => this._scene.remove(item.group));
    this._pool = [];
    this._active = [];
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// ObstacleManager — antibodies, complement clusters, mucus
// ═══════════════════════════════════════════════════════════════════════════════

class ObstacleManager {

  constructor(scene) {
    this._scene       = scene;
    this._antibodies  = [];
    this._complements = [];
    this._mucus       = [];

    // Scroll trackers (negative start = grace period before first spawn)
    this._totalScrolled   = 0;
    this._lastAbAt        = -28;
    this._lastCompAt      = -50;
    this._lastMucusAt     = -55;
    this._HORIZON_Z       = 42;

    this._buildPools();
  }

  _buildPools() {
    for (let i = 0; i < 8; i++) {
      const g = this._buildAntibody();
      g.visible = false;
      this._scene.add(g);
      this._antibodies.push({
        group: g, z: 0, lane: 0, active: false, hit: false, rotY: 0,
      });
    }
    for (let i = 0; i < 6; i++) {
      const g = this._buildComplement();
      g.visible = false;
      this._scene.add(g);
      this._complements.push({
        group: g, z: 0, lane: 0, active: false, hit: false,
        state: 'idle', detonTimer: 0,
        ringMat: g.userData.ringMat,
      });
    }
    for (let i = 0; i < 4; i++) {
      const g = this._buildMucus();
      g.visible = false;
      this._scene.add(g);
      this._mucus.push({ group: g, z: 0, lane: 0, active: false, spanLanes: 2 });
    }
  }

  // ── Geometry builders ─────────────────────────────────────────────────

  _buildAntibody() {
    // IgA secretory dimer lying flat in XZ plane — two Y-shapes linked Fc-to-Fc
    // Spans ±2.6 units in X (covers two adjacent lanes), slow Y-axis rotation in-game
    const g = new THREE.Group();

    const mat = new THREE.MeshPhongMaterial({
      color:    P2_CFG.COL_ANTIBODY,
      emissive: new THREE.Color(0xaa8800),
      emissiveIntensity: 0.6,
      shininess: 50,
    });

    // ── Central Fc bar (X axis, shared between both monomers) ────────────
    const fcBar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 6), mat);
    fcBar.rotation.z = Math.PI / 2;
    g.add(fcBar);

    // J-chain connector at centre
    const jChain = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 7), mat);
    g.add(jChain);

    // ── Fab arms — 2 per Fc end (fork ±36° in XZ plane) ─────────────────
    const fabLen   = 1.4;
    const fabAngle = Math.PI / 5;  // 36°
    const cosFab   = Math.cos(fabAngle);
    const sinFab   = Math.sin(fabAngle);
    const forkXs   = [-1.5, 1.5];
    const zSigns   = [1, -1];

    forkXs.forEach(fx => {
      const xSign = fx < 0 ? -1 : 1;
      zSigns.forEach(zs => {
        const dx  = xSign * cosFab;
        const dz  = zs   * sinFab;
        const dir = new THREE.Vector3(dx, 0, dz);   // already unit length (cos²+sin²=1)

        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, fabLen, 5), mat);
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        arm.position.set(fx + dx * fabLen / 2, 0, dz * fabLen / 2);
        g.add(arm);

        // Antigen-binding tip
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), mat);
        tip.position.set(fx + dx * fabLen, 0, dz * fabLen);
        g.add(tip);
      });
    });

    g.userData.mat = mat;
    g.position.y   = 1.0;
    return g;
  }

  _buildComplement() {
    const g   = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({
      color:    P2_CFG.COL_COMPLEMENT,
      emissive: new THREE.Color(0xaa1100),
      emissiveIntensity: 0.7,
    });
    const offsets = [
      [0, 0, 0], [0.22, 0.12, 0.08], [-0.18, 0.14, -0.10],
      [0.10, -0.08, 0.20], [-0.12, 0.20, -0.16],
    ];
    offsets.forEach(([ox, oy, oz]) => {
      const r = 0.14 + Math.random() * 0.08;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), mat);
      m.position.set(ox, oy + 0.16, oz);
      g.add(m);
    });
    // Danger ring on membrane surface
    const ringGeo = new THREE.RingGeometry(P2_CFG.RADIUS_COMP_RING - 0.12, P2_CFG.RADIUS_COMP_RING, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: P2_CFG.COL_COMPLEMENT, transparent: true, opacity: 0.38,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02;
    g.add(ring);
    g.userData.ringMat = ringMat;
    return g;
  }

  _buildMucus() {
    const g   = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({
      color:       P2_CFG.COL_MUCUS,
      transparent: true,
      opacity:     0.38,
      shininess:   90,
    });
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 7), mat);
    blob.scale.set(1, 0.20, 0.75);
    blob.position.y = 0.22;
    g.add(blob);
    g.userData.mat = mat;
    return g;
  }

  // ── Spawn helpers ─────────────────────────────────────────────────────

  _getFree(pool) { return pool.find(p => !p.active) || null; }

  _activateObs(item, laneIdx, z, extra) {
    item.active = true;
    item.hit    = false;
    item.z      = z;
    item.lane   = laneIdx;
    if (extra) Object.assign(item, extra);
    item.group.position.z = z;
    item.group.visible    = true;
  }

  _retireObs(pool, item) {
    item.active        = false;
    item.hit           = true;
    item.group.visible = false;
    if (item.ringMat) {
      item.ringMat.color.setHex(P2_CFG.COL_COMPLEMENT);
      item.ringMat.opacity = 0.38;
    }
  }

  // ── Update ────────────────────────────────────────────────────────────

  update(dt, speed) {
    const dz    = dt * speed * 8;
    this._totalScrolled += dz;
    const stage = _getStage();
    this._trySpawn(stage);
    this._updateAntibodies(dt, dz);
    this._updateComplements(dt, dz);
    this._updateMucus(dz);
    if (window.P2Attachment && P2Attachment.naActive) this._applyNABurst();
  }

  // Clear all active obstacles within NA_RADIUS units ahead while NA power-up is active
  _applyNABurst() {
    const PA = window.P2Attachment;
    if (!PA || !PA.player) return;
    const pz = PA.player.z;
    const r  = P2_CFG.NA_RADIUS;

    for (const ab of this._antibodies) {
      if (ab.active && !ab.hit && ab.z > pz - 2 && ab.z < pz + r) {
        ab.hit = true;
        if (PA.emitBurst) PA.emitBurst(ab.group.position.x, 1.8, ab.z, 8, P2_CFG.COL_PU_NA, { speed: 4, duration: 0.4 });
        setTimeout(() => this._retireObs(this._antibodies, ab), 120);
      }
    }
    for (const comp of this._complements) {
      if (comp.active && !comp.hit && comp.z > pz - 2 && comp.z < pz + r) {
        comp.hit = true;
        if (PA.emitBurst) PA.emitBurst(comp.group.position.x, 0.3, comp.z, 8, P2_CFG.COL_PU_NA, { speed: 4, duration: 0.4 });
        setTimeout(() => this._retireObs(this._complements, comp), 120);
      }
    }
    for (const m of this._mucus) {
      if (m.active && m.z > pz - 2 && m.z < pz + r) {
        this._retireObs(this._mucus, m);
      }
    }
  }

  _trySpawn(stage) {
    const s = this._totalScrolled;
    // Antibodies
    if (stage !== 'tutorial') {
      const abGap = stage === 'max' ? 17 : stage === 'full' ? 21 : 27;
      if (s - this._lastAbAt >= abGap) {
        this._spawnAntibody();
        this._lastAbAt = s;
      }
    }
    // Complement
    if (stage !== 'tutorial' && stage !== 'mid') {
      const cGap = stage === 'max' ? 32 : 46;
      if (s - this._lastCompAt >= cGap) {
        this._spawnComplement();
        this._lastCompAt = s;
      }
    }
    // Mucus
    if (stage !== 'tutorial') {
      if (s - this._lastMucusAt >= 55) {
        this._spawnMucus();
        this._lastMucusAt = s;
      }
    }
  }

  _spawnAntibody() {
    const item = this._getFree(this._antibodies);
    if (!item) return;
    // Centre the dimer between two adjacent lanes
    const pairIdx = Math.floor(Math.random() * 4);
    const laneX   = (P2_CFG.LANES[pairIdx] + P2_CFG.LANES[pairIdx + 1]) / 2;
    this._activateObs(item, pairIdx, this._HORIZON_Z);
    item.group.position.set(laneX, 1.0, this._HORIZON_Z);
    item.rotY = 0;
  }

  _spawnComplement() {
    const item = this._getFree(this._complements);
    if (!item) return;
    const laneIdx = Math.floor(Math.random() * 5);
    this._activateObs(item, laneIdx, this._HORIZON_Z, { state: 'idle', detonTimer: 0 });
    item.group.position.set(P2_CFG.LANES[laneIdx], 0, this._HORIZON_Z);
    if (item.ringMat) {
      item.ringMat.color.setHex(P2_CFG.COL_COMPLEMENT);
      item.ringMat.opacity = 0.38;
    }
  }

  _spawnMucus() {
    const item = this._getFree(this._mucus);
    if (!item) return;
    const spanLanes = 2 + Math.floor(Math.random() * 2); // 2–3 lanes wide
    const centerLane = 1 + Math.floor(Math.random() * 3);
    this._activateObs(item, centerLane, this._HORIZON_Z, { spanLanes });
    item.group.position.set(P2_CFG.LANES[centerLane], 0, this._HORIZON_Z);
    item.group.scale.x = spanLanes * 1.7;
    _edu('MUCUS_HINT', 'Respiratory Mucus', 'Mucus traps pathogens and limits movement through the mucosal layer. Mucins can also bind sialic acid, competing with host cell receptors. Passing through will slow your lateral movement.');
  }

  // ── Per-type update loops ─────────────────────────────────────────────

  _updateAntibodies(dt, dz) {
    for (const ab of this._antibodies) {
      if (!ab.active) continue;
      ab.z -= dz;
      ab.group.position.z = ab.z;
      if (ab.z < -12) { this._retireObs(this._antibodies, ab); continue; }

      // Slow Y-axis rotation for visual interest
      ab.rotY += dt * 0.4;
      ab.group.rotation.y = ab.rotY;

      // Emissive pulse
      if (ab.group.userData.mat) {
        ab.group.userData.mat.emissiveIntensity = 0.35 + 0.45 * Math.abs(Math.sin(ab.rotY * 2));
      }

      if (ab.hit) continue;
      if (!window.P2Attachment || !P2Attachment.player) continue;
      const P = P2Attachment.player;
      if (P.y > 2.2) continue;  // jumped over
      const dx  = ab.group.position.x - P.x;
      const dz2 = ab.z - P.z;
      // Wide box collision: dimer spans ±2.6 in X across two lanes
      if (Math.abs(dx) < 3.2 && dz2 * dz2 < 2.25) {
        ab.hit = true;
        const igaSeen = P2Attachment.education
          ? P2Attachment.education.hasSeen('IGA_HINT')
          : _edu._seen['IGA_HINT'];
        if (!igaSeen) {
          _edu('IGA_HINT', 'IgA Antibody', 'Secretory IgA patrols mucosal surfaces and blocks pathogen attachment to host receptors — this is neutralization. Jump (↑) to clear the dimer, or switch to a lane it does not cover!');
        } else {
          P2Attachment.takeDamage(P2_CFG.DMG_ANTIBODY, P2_CFG.ALERT_ANTIBODY, true);
          _edu('IGA_HIT', 'IgA — secretory antibodies patrol mucosal surfaces and block receptor binding. This is neutralization.');
        }
        setTimeout(() => this._retireObs(this._antibodies, ab), 280);
      }
    }
  }

  _updateComplements(dt, dz) {
    for (const comp of this._complements) {
      if (!comp.active) continue;
      comp.z -= dz;
      comp.group.position.z = comp.z;
      if (comp.z < -12) { this._retireObs(this._complements, comp); continue; }

      if (!window.P2Attachment || !P2Attachment.player) continue;
      const P    = P2Attachment.player;
      const cdx  = P2_CFG.LANES[comp.lane] - P.x;
      const cdz  = comp.z - P.z;
      const dist = Math.sqrt(cdx * cdx + cdz * cdz);
      const inRing = dist < P2_CFG.RADIUS_COMP_RING;

      if (comp.state === 'idle') {
        if (inRing) {
          comp.state      = 'warning';
          comp.detonTimer = 0;
          _edu('C3B_WARN', 'Complement C3b', 'Complement protein C3b has tagged the virus for destruction (opsonization). If the membrane attack complex (MAC) fully assembles on your envelope, it will lyse you. Escape the activation zone now!');
        }
      } else if (comp.state === 'warning') {
        comp.detonTimer += dt;
        // Pulse the ring red
        const pulse = 0.5 + 0.5 * Math.sin(comp.detonTimer * 22);
        if (comp.ringMat) {
          comp.ringMat.color.setHex(0xff2200);
          comp.ringMat.opacity = 0.25 + 0.55 * pulse;
        }
        if (!inRing) {
          // Player escaped
          comp.state = 'idle';
          if (comp.ringMat) {
            comp.ringMat.color.setHex(P2_CFG.COL_COMPLEMENT);
            comp.ringMat.opacity = 0.38;
          }
        } else if (comp.detonTimer >= 0.5) {
          // Detonate
          if (!comp.hit) {
            comp.hit = true;
            _edu('C3B_HIT', 'Complement C3b tags pathogens for destruction and can trigger the membrane attack complex.');
            if (P2Attachment.education && P2Attachment.education.hasSeen('C3B_WARN')) {
              P2Attachment.takeDamage(P2_CFG.DMG_COMPLEMENT, P2_CFG.ALERT_COMPLEMENT, true);
            }
            if (window.P2Attachment && P2Attachment.emitBurst) {
              P2Attachment.emitBurst(comp.group.position.x, 0.3, comp.z,
                30, P2_CFG.COL_COMPLEMENT, { speed: 6, duration: 0.8 });
            }
          }
          this._retireObs(this._complements, comp);
        }
      }
    }
  }

  _updateMucus(dz) {
    let inMucus = false;
    for (const m of this._mucus) {
      if (!m.active) continue;
      m.z -= dz;
      m.group.position.z = m.z;
      if (m.z < -12) { this._retireObs(this._mucus, m); continue; }

      if (window.P2Attachment && P2Attachment.player) {
        const P   = P2Attachment.player;
        const mdx = m.group.position.x - P.x;
        const mdz = m.z - P.z;
        const r   = P2_CFG.RADIUS_MUCUS * Math.max(1, m.spanLanes * 0.7);
        if (mdx * mdx + mdz * mdz < r * r) inMucus = true;
      }
    }
    if (window.P2Attachment) {
      P2Attachment.mucusSlow = inMucus;
      P2Attachment.setMucusEffect(inMucus);
    }
  }

  reset() {
    [...this._antibodies, ...this._complements, ...this._mucus].forEach(item => {
      if (item.active) this._retireObs(
        item.ringMat ? this._complements : (item.oscT !== undefined ? this._antibodies : this._mucus),
        item
      );
    });
    this._totalScrolled = 0;
    this._lastAbAt    = -28;
    this._lastCompAt  = -50;
    this._lastMucusAt = -55;
  }

  destroy() {
    [...this._antibodies, ...this._complements, ...this._mucus].forEach(item => {
      this._scene.remove(item.group);
    });
    this._antibodies = [];
    this._complements = [];
    this._mucus = [];
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// PowerUpManager — antigenic drift, neuraminidase burst, lipid raft magnet
// ═══════════════════════════════════════════════════════════════════════════════

class PowerUpManager {

  constructor(scene, terrain) {
    this._scene   = scene;
    this._terrain = terrain;

    this._pool          = [];
    this._totalScrolled = 0;
    this._lastChunkAt   = 0;
    this._HORIZON_Z     = 44;
    this._CHUNK_LEN     = P2_CFG.CHUNK_LENGTH;

    this._buildPool();
  }

  _buildPool() {
    const types = ['drift', 'na', 'raft', 'drift', 'na'];
    types.forEach(type => {
      const g = this._buildGroup(type);
      g.visible = false;
      this._scene.add(g);
      this._pool.push({ type, group: g, z: 0, active: false, bobT: Math.random() * Math.PI * 2 });
    });
  }

  _buildGroup(type) {
    const g   = new THREE.Group();
    const col = { drift: P2_CFG.COL_PU_DRIFT, na: P2_CFG.COL_PU_NA, raft: P2_CFG.COL_PU_RAFT }[type];
    const mat = new THREE.MeshPhongMaterial({
      color: col, emissive: new THREE.Color(col),
      emissiveIntensity: 0.5, transparent: true, opacity: 0.92, shininess: 80,
    });

    if (type === 'drift') {
      // Double helix coil
      const pts = Array.from({ length: 28 }, (_, i) => {
        const t = (i / 27) * Math.PI * 4;
        return new THREE.Vector3(Math.cos(t) * 0.28, (i / 27) * 0.9, Math.sin(t) * 0.28);
      });
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.055, 5, false), mat
      );
      g.add(tube);

    } else if (type === 'na') {
      // Flat enzyme disc + 8 starburst spines
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 12), mat));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.34), mat);
        spine.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
        spine.rotation.y = a;
        g.add(spine);
      }

    } else {
      // Lipid raft patch: flat tile with receptor dots
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.07, 0.82), mat));
      for (let i = 0; i < 5; i++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), mat);
        dot.position.set((Math.random() - 0.5) * 0.55, 0.09, (Math.random() - 0.5) * 0.55);
        g.add(dot);
      }
    }

    // Halo below
    const halo = _haloSprite(2.4, col);
    halo.position.y = -0.5;
    g.add(halo);

    g.position.y = 1.25;
    return g;
  }

  update(dt, speed) {
    const dz = dt * speed * 8;
    this._totalScrolled += dz;

    for (const pu of this._pool) {
      if (!pu.active) continue;
      pu.z    -= dz;
      pu.bobT += dt;
      pu.group.position.z = pu.z;
      pu.group.position.y = 1.25 + Math.sin(pu.bobT * 2.0) * 0.13;
      pu.group.rotation.y += dt * 1.3;
      if (pu.z < -12) { this._retire(pu); continue; }

      if (!window.P2Attachment || !P2Attachment.player) continue;
      const P  = P2Attachment.player;
      const dx = pu.group.position.x - P.x;
      const dy = pu.group.position.y - P.y;
      const dz2= pu.z - P.z;
      const rr = (P2_CFG.RADIUS_PLAYER + P2_CFG.RADIUS_POWERUP) ** 2;
      if (dx * dx + dy * dy + dz2 * dz2 < rr) {
        this._collect(pu);
      }
    }

    // One spawn attempt per chunk length scrolled
    if (this._totalScrolled - this._lastChunkAt >= this._CHUNK_LEN) {
      this._lastChunkAt += this._CHUNK_LEN;
      if (Math.random() < P2_CFG.POWERUP_CHANCE) this._spawn();
    }
  }

  _spawn() {
    const free = this._pool.filter(p => !p.active);
    if (!free.length) return;
    const pu      = free[Math.floor(Math.random() * free.length)];
    const laneIdx = Math.floor(Math.random() * 5);
    pu.active = true;
    pu.z      = this._HORIZON_Z;
    pu.group.position.set(P2_CFG.LANES[laneIdx], 1.25, this._HORIZON_Z);
    pu.group.visible = true;
  }

  _collect(pu) {
    this._retire(pu);
    if (!window.P2Attachment) return;
    P2Attachment.collectPowerup(pu.type);

    if (pu.type === 'drift') {
      const alreadySeen = P2Attachment.education && P2Attachment.education.hasSeen('DRIFT_PU');
      _edu('DRIFT_PU', 'Antigenic Drift', 'Point mutations in hemagglutinin have gradually shifted your surface epitopes — existing antibodies no longer recognize you! Receptor binding affinity is slightly reduced as a fitness cost of mutation. This is why flu vaccines must be updated every year: the virus drifts away from what immune memory knows.');
      if (alreadySeen) P2Attachment.showTicker('Antigenic Drift — antibodies can\'t detect you!', 3.0);
    } else {
      const msgs = {
        na:   'Neuraminidase Burst — clears mucus and glycocalyx ahead. NA is the target of Tamiflu.',
        raft: 'Lipid Raft Targeting — sialic acid receptors cluster in raft zones for the next 6 seconds.',
      };
      P2Attachment.showTicker(msgs[pu.type] || '', 3.5);
    }
  }

  _retire(pu) {
    pu.active = false;
    pu.group.visible = false;
  }

  reset() {
    this._pool.forEach(pu => this._retire(pu));
    this._totalScrolled = 0;
    this._lastChunkAt   = 0;
  }

  destroy() {
    this._pool.forEach(pu => this._scene.remove(pu.group));
    this._pool = [];
  }
}
