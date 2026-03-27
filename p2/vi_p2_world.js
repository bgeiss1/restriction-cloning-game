// vi_p2_world.js — Phase 2 Attachment: terrain chunks + player virus
// Depends on: three.js r128, vi_p2_config.js, vi_p2_main.js
'use strict';

// ── Shared geometry / material cache (created once, never re-created) ──────
const _P2GEO = {};
const _P2MAT = {};

function _geo(key, fn) { if (!_P2GEO[key]) _P2GEO[key] = fn(); return _P2GEO[key]; }
function _mat(key, fn) { if (!_P2MAT[key]) _P2MAT[key] = fn(); return _P2MAT[key]; }

// ────────────────────────────────────────────────────────────────────────────
// P2World — factory exposed to vi_p2_main.js
// ────────────────────────────────────────────────────────────────────────────
const P2World = {

  createTerrain(scene) { return new MembraineTerrain(scene); },
  createPlayer(scene)  { return new PlayerVirus(scene); },
  createRBCs(scene)    { return new RBCManager(scene); },

};

window.P2World = P2World;


// ────────────────────────────────────────────────────────────────────────────
// MembraineTerrain — 3-chunk infinite scrolling cell membrane
// ────────────────────────────────────────────────────────────────────────────
class MembraineTerrain {

  constructor(scene) {
    this._scene  = scene;
    this._chunks = [];       // array of { mesh, subMesh, zOffset }
    this._time   = 0;
    this._scrollZ = 0;       // cumulative Z scrolled (used for spawn coord)

    // Raft zone definitions per chunk (recomputed on recycle)
    this._raftZones = [[], [], []];  // array of { xMin, xMax, zMin, zMax }

    this._mat4 = new THREE.Matrix4(); // reused for lipid instance matrix writes
    this._lipidSegs = [];             // independent short-segment lipid sheet

    this._buildMaterials();
    this._buildChunks();
    this._buildLipidSegments();
  }

  // ── Materials ──────────────────────────────────────────────────────────
  _buildMaterials() {
    this._matMem = _mat('membrane', () => new THREE.MeshPhongMaterial({
      color:       P2_CFG.COL_MEMBRANE,
      emissive:    new THREE.Color(P2_CFG.COL_MEM_EMI),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity:     0.85,
      side:        THREE.FrontSide,
    }));

    this._matSub = _mat('submem', () => new THREE.MeshPhongMaterial({
      color:       P2_CFG.COL_SUBMEM,
      emissive:    new THREE.Color(0x000822),
      emissiveIntensity: 0.6,
      transparent: true,
      opacity:     0.6,
    }));

    this._matRaft = _mat('raft', () => new THREE.MeshPhongMaterial({
      color:       P2_CFG.COL_RAFT,
      emissive:    new THREE.Color(0x0a1830),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity:     0.9,
    }));

    this._matLipid = _mat('lipidHead', () => new THREE.MeshPhongMaterial({
      color:             P2_CFG.COL_LIPID_HEAD,
      emissive:          new THREE.Color(P2_CFG.COL_LIPID_EMI),
      emissiveIntensity: 0.3,
      shininess:         60,
    }));
  }

  // ── Chunk construction ─────────────────────────────────────────────────
  _buildChunks() {
    const CL = P2_CFG.CHUNK_LENGTH;
    const CW = P2_CFG.CHUNK_WIDTH;

    for (let i = 0; i < P2_CFG.NUM_CHUNKS; i++) {
      // Main membrane plane (80×400 verts for wave displacement)
      const geo = new THREE.PlaneGeometry(CW, CL, 60, 200);
      geo.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(geo, this._matMem);
      mesh.position.set(0, 0, i * CL);
      this._scene.add(mesh);

      // Sub-membrane layer (decorative; slightly below)
      const subGeo = new THREE.PlaneGeometry(CW, CL, 1, 1);
      subGeo.rotateX(-Math.PI / 2);
      const subMesh = new THREE.Mesh(subGeo, this._matSub);
      subMesh.position.set(0, -2, i * CL);
      this._scene.add(subMesh);

      // Emissive cytoplasm dots on sub-membrane
      const dots = this._buildCytoDots();
      dots.position.set(0, -1.9, i * CL);
      this._scene.add(dots);

      // Lipid raft overlay patches
      const rafts = this._buildRaftPatches(i);

      // Cilia (respiratory epithelium — important influenza biology)
      const cilia = this._buildCiliaInstances(i);

      this._chunks.push({
        mesh, subMesh, dots, cilia, rafts,
        zOffset: i * CL,
      });
      this._raftZones[i] = this._computeRaftZones(i * CL, rafts);
    }
  }

  // ── Cytoplasm decorative dots ──────────────────────────────────────────
  _buildCytoDots() {
    const count  = 40;
    const dotGeo = _geo('cytoDot', () => new THREE.SphereGeometry(0.08, 4, 4));
    const dotMat = _mat('cytoDot', () => new THREE.MeshPhongMaterial({
      color:    0x881828,
      emissive: new THREE.Color(0x380010),
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.5,
    }));
    const group = new THREE.Group();
    const CL = P2_CFG.CHUNK_LENGTH;
    const CW = P2_CFG.CHUNK_WIDTH;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(dotGeo, dotMat);
      m.position.set(
        (Math.random() - 0.5) * CW,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * CL
      );
      group.add(m);
    }
    return group;
  }

  // ── Lipid raft patches ─────────────────────────────────────────────────
  _buildRaftPatches(chunkIdx) {
    const count  = 2 + Math.floor(Math.random() * 2); // 2–3 rafts per chunk
    const CL     = P2_CFG.CHUNK_LENGTH;
    const CW     = P2_CFG.CHUNK_WIDTH;
    const group  = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const w   = 6 + Math.random() * 6;
      const d   = 10 + Math.random() * 15;
      const geo = new THREE.PlaneGeometry(w, d, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const m   = new THREE.Mesh(geo, this._matRaft);
      m.position.set(
        (Math.random() - 0.5) * (CW - w),
        0.01,
        (Math.random() - 0.5) * CL
      );
      group.add(m);
    }
    this._scene.add(group);
    return group;
  }

  // ── Cilia — epithelial surface hairs, hallmark of respiratory tract ───
  _buildCiliaInstances(chunkIdx) {
    const CL    = P2_CFG.CHUNK_LENGTH;
    const CW    = P2_CFG.CHUNK_WIDTH;
    const count = 200;
    const geo   = _geo('cilia', () => new THREE.CylinderGeometry(0.015, 0.010, 0.40, 4));
    const mat   = _mat('cilia', () => new THREE.MeshPhongMaterial({
      color:             0x9c404c,
      emissive:          new THREE.Color(0x280808),
      emissiveIntensity: 0.35,
      transparent:       true,
      opacity:           0.70,
    }));

    const mesh  = new THREE.InstancedMesh(geo, mat, count);
    mesh.matrixAutoUpdate = false;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * CW,
        0.20,   // half-height above membrane surface
        (Math.random() - 0.5) * CL
      );
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.35,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.35
      );
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.position.z = chunkIdx * CL;
    this._scene.add(mesh);
    return mesh;
  }

  // ── Lipid headgroup sheet — short independent segments that scroll and
  //    recycle independently of the terrain chunks.
  //    Each segment is SLEN units long; 4 segments give continuous coverage.
  //    CircleGeometry (flat disc, normals up) is ~6× cheaper than a sphere
  //    and indistinguishable from above at this scale.
  _buildLipidSegments() {
    const sp    = P2_CFG.LIPID_SPACING;
    const r     = P2_CFG.LIPID_RADIUS;
    const CW    = P2_CFG.CHUNK_WIDTH;
    const SLEN  = 30;   // Z length per segment in world units
    const NSEGS = 4;

    const geo = _geo('lipidDisc', () => {
      const g = new THREE.CircleGeometry(r, 6);
      g.rotateX(-Math.PI / 2); // lay flat in XZ plane, normal pointing +Y
      return g;
    });

    const cols  = Math.round(CW   / sp);
    const rows  = Math.round(SLEN / sp);
    const count = cols * rows;

    for (let s = 0; s < NSEGS; s++) {
      const mesh = new THREE.InstancedMesh(geo, this._matLipid, count);
      mesh.matrixAutoUpdate = false;

      let idx = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = -CW / 2 + (col + 0.5) * sp;
          const z = (row + 0.5) * sp; // local Z: 0 → SLEN
          this._mat4.makeTranslation(x, r, z);
          mesh.setMatrixAt(idx, this._mat4);
          idx++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      const zOff = s * SLEN;
      mesh.position.z = zOff;
      this._scene.add(mesh);
      this._lipidSegs.push({ mesh, zOffset: zOff });
    }
  }

  _computeRaftZones(chunkWorldZ, raftGroup) {
    const zones = [];
    raftGroup.children.forEach(m => {
      const geo = m.geometry;
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      zones.push({
        xMin: m.position.x + bb.min.x,
        xMax: m.position.x + bb.max.x,
        zMin: chunkWorldZ + m.position.z + bb.min.z,
        zMax: chunkWorldZ + m.position.z + bb.max.z,
      });
    });
    return zones;
  }

  // ── inRaft — used by gameplay system for spawn weighting ──────────────
  inRaft(worldX, worldZ) {
    for (let ci = 0; ci < this._raftZones.length; ci++) {
      for (const z of this._raftZones[ci]) {
        if (worldX >= z.xMin && worldX <= z.xMax &&
            worldZ >= z.zMin && worldZ <= z.zMax) return true;
      }
    }
    return false;
  }

  // ── update — scroll chunks toward camera each frame ───────────────────
  update(dt, speed) {
    this._time    += dt;
    const dz       = dt * speed * 8; // world units scrolled this frame
    this._scrollZ += dz;

    const CL = P2_CFG.CHUNK_LENGTH;

    for (let i = 0; i < this._chunks.length; i++) {
      const ch = this._chunks[i];
      ch.zOffset -= dz;

      // Reposition chunk group
      ch.mesh.position.z    = ch.zOffset;
      ch.subMesh.position.z = ch.zOffset;
      ch.dots.position.z    = ch.zOffset;
      ch.cilia.position.z   = ch.zOffset;
      ch.rafts.position.z   = ch.zOffset;

      // Recycle chunk that has fully passed behind the camera
      if (ch.zOffset < -(CL * 1.5)) {
        // Find the frontmost chunk Z and place this one ahead
        let maxZ = -Infinity;
        this._chunks.forEach(c => { if (c.zOffset > maxZ) maxZ = c.zOffset; });
        ch.zOffset = maxZ + CL;
        ch.mesh.position.z    = ch.zOffset;
        ch.subMesh.position.z = ch.zOffset;
        ch.dots.position.z    = ch.zOffset;
        ch.cilia.position.z   = ch.zOffset;
        ch.rafts.position.z   = ch.zOffset;

        // Randomise raft positions in recycled chunk
        this._repositionRafts(i, ch);
        this._raftZones[i] = this._computeRaftZones(ch.zOffset, ch.rafts);
      }

      // Wave displacement on membrane vertices
      this._waveChunk(ch, this._time);
    }

    // Scroll lipid segments independently (short 30-unit segments, 4 total)
    const SLEN = 30;
    for (const seg of this._lipidSegs) {
      seg.zOffset -= dz;
      seg.mesh.position.z = seg.zOffset;
      if (seg.zOffset < -(SLEN * 1.5)) {
        let maxZ = -Infinity;
        this._lipidSegs.forEach(s => { if (s.zOffset > maxZ) maxZ = s.zOffset; });
        seg.zOffset = maxZ + SLEN;
        seg.mesh.position.z = seg.zOffset;
      }
    }
  }

  _waveChunk(ch, t) {
    const pos = ch.mesh.geometry.attributes.position;
    const count = pos.count;
    for (let v = 0; v < count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const y = Math.sin(x * 0.3 + t * 0.5) * 0.15 + Math.sin(z * 0.2 + t * 0.3) * 0.10;
      pos.setY(v, y);
    }
    pos.needsUpdate = true;
    ch.mesh.geometry.computeVertexNormals();
  }

  _repositionRafts(idx, ch) {
    const CL = P2_CFG.CHUNK_LENGTH;
    const CW = P2_CFG.CHUNK_WIDTH;
    ch.rafts.children.forEach(m => {
      m.position.set(
        (Math.random() - 0.5) * (CW - 8),
        0.01,
        (Math.random() - 0.5) * CL
      );
    });
  }

  reset() {
    this._time = 0;
    this._scrollZ = 0;
    const CL = P2_CFG.CHUNK_LENGTH;
    this._chunks.forEach((ch, i) => {
      ch.zOffset = i * CL;
      ch.mesh.position.z    = ch.zOffset;
      ch.subMesh.position.z = ch.zOffset;
      ch.dots.position.z    = ch.zOffset;
      ch.cilia.position.z   = ch.zOffset;
      ch.rafts.position.z   = ch.zOffset;
    });
    const SLEN = 30;
    this._lipidSegs.forEach((seg, i) => {
      seg.zOffset = i * SLEN;
      seg.mesh.position.z = seg.zOffset;
    });
  }

  destroy() {
    this._chunks.forEach(ch => {
      [ch.mesh, ch.subMesh, ch.dots, ch.rafts].forEach(obj => {
        this._scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
      });
      // Cilia geometry shared via cache; do not dispose
      this._scene.remove(ch.cilia);
    });
    this._chunks = [];
    // Lipid segment geometry is shared via _P2GEO cache; do not dispose
    this._lipidSegs.forEach(seg => this._scene.remove(seg.mesh));
    this._lipidSegs = [];
  }
}


// ────────────────────────────────────────────────────────────────────────────
// PlayerVirus — influenza virion with HA/NA spikes, lane movement, jump, slide
// ────────────────────────────────────────────────────────────────────────────
class PlayerVirus {

  constructor(scene) {
    this._scene = scene;
    this.x      = 0;      // current world X (lane position)
    this.y      = 1.0;    // current world Y (above membrane)
    this.z      = P2_CFG.PLAYER_Z;

    // Lane state
    this._laneIdx  = 2;   // center lane (0–4)
    this._targetX  = P2_CFG.LANES[2];
    this._prevX    = P2_CFG.LANES[2];
    this._laneT    = 1.0; // 1 = arrived, 0 = just started

    // Jump state
    this._jumping   = false;
    this._jumpTimer = 0;
    this._jumpPhase = 'none'; // 'rise'|'fall'|'none'
    this._baseY     = 1.0;

    // Slide state
    this._sliding     = false;
    this._slideTimer  = 0;

    // Animation
    this._bobT       = 0;
    this._rollAngle  = 0;   // lateral tilt during lane change
    this._squashT    = 0;   // landing squash timer

    // State flags for obstacle logic
    this.isAirborne  = false;
    this.isSliding   = false;

    // Input tracking (debounce)
    this._lastLeft   = false;
    this._lastRight  = false;
    this._lastJump   = false;
    this._lastSlide  = false;

    this._buildModel();
  }

  // ── Model — sphere body + fibonacci spikes ─────────────────────────────
  _buildModel() {
    this._group = new THREE.Group();
    this._group.position.set(P2_CFG.LANES[2], 1.0, P2_CFG.PLAYER_Z);

    // Core body
    const bodyGeo = _geo('virusBody', () => new THREE.SphereGeometry(0.5, 16, 16));
    const bodyMat = _mat('virusBody', () => new THREE.MeshPhongMaterial({
      color:    P2_CFG.COL_PLAYER,
      emissive: new THREE.Color(0x661100),
      emissiveIntensity: 0.5,
      shininess: 40,
    }));
    this._body = new THREE.Mesh(bodyGeo, bodyMat);
    this._group.add(this._body);

    // Envelope (translucent outer sphere)
    const envGeo = _geo('virusEnv', () => new THREE.SphereGeometry(0.58, 12, 12));
    const envMat = _mat('virusEnv', () => new THREE.MeshPhongMaterial({
      color:       0xff9944,
      transparent: true,
      opacity:     0.18,
      side:        THREE.BackSide,
    }));
    this._group.add(new THREE.Mesh(envGeo, envMat));

    // HA spikes (slightly redder)
    const haMat = _mat('virusHA', () => new THREE.MeshPhongMaterial({
      color:    P2_CFG.COL_SPIKE_HA,
      emissive: new THREE.Color(0x440800),
      emissiveIntensity: 0.4,
    }));
    // NA spikes (slightly more orange)
    const naMat = _mat('virusNA', () => new THREE.MeshPhongMaterial({
      color:    P2_CFG.COL_SPIKE_NA,
      emissive: new THREE.Color(0x442200),
      emissiveIntensity: 0.4,
    }));
    const spikeGeo = _geo('virusSpike', () => new THREE.ConeGeometry(0.08, 0.3, 6));

    const N = 14;
    for (let i = 0; i < N; i++) {
      // Fibonacci sphere distribution
      const phi   = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const dir   = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      const spike = new THREE.Mesh(spikeGeo, i % 2 === 0 ? haMat : naMat);
      // Position at surface
      spike.position.copy(dir.clone().multiplyScalar(0.52));
      // Rotate cone to point outward
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this._group.add(spike);
    }

    this._scene.add(this._group);
  }

  // ── update — called each frame from vi_p2_main._updateGame ────────────
  update(dt, keys, speed) {
    this._handleInput(keys);
    this._updateLane(dt);
    this._updateJump(dt);
    this._updateSlide(dt);
    this._updateBob(dt);
    this._updateRoll(dt);
    this._updateSquash(dt);

    // Apply position to mesh group
    this._group.position.set(this.x, this.y, this.z);
  }

  // ── Input ──────────────────────────────────────────────────────────────
  _handleInput(keys) {
    const left  = keys['ArrowLeft']  || keys['KeyA'];
    const right = keys['ArrowRight'] || keys['KeyD'];
    const jump  = keys['Space'] || keys['KeyW'] || keys['ArrowUp'];
    const slide = keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyS'] || keys['ArrowDown'];

    // Lane left — rising edge only, no mid-air lane switch
    // Camera right vector is -X (camera behind player looking +Z), so increasing
    // lane index (higher X) moves the virion leftward on screen, and vice versa.
    if (left && !this._lastLeft && !this.isAirborne && !this.isSliding) {
      this._switchLane(1);
    }
    if (right && !this._lastRight && !this.isAirborne && !this.isSliding) {
      this._switchLane(-1);
    }

    // Jump — rising edge, only from ground
    if (jump && !this._lastJump && !this.isAirborne && !this.isSliding) {
      this._startJump();
    }

    // Slide — rising edge, only from ground
    if (slide && !this._lastSlide && !this.isAirborne && !this.isSliding) {
      this._startSlide();
    }

    this._lastLeft  = !!left;
    this._lastRight = !!right;
    this._lastJump  = !!jump;
    this._lastSlide = !!slide;
  }

  // ── Lane switching ─────────────────────────────────────────────────────
  _switchLane(dir) {
    const newIdx = Math.max(0, Math.min(P2_CFG.LANES.length - 1, this._laneIdx + dir));
    if (newIdx === this._laneIdx) return;
    this._prevX   = this.x;
    this._laneIdx = newIdx;
    this._targetX = P2_CFG.LANES[newIdx];
    this._laneT   = 0;
    this._rollDir = dir; // +1 right, -1 left
  }

  _updateLane(dt) {
    if (this._laneT >= 1) { this.x = this._targetX; return; }
    const dur = (window.P2Attachment && P2Attachment.mucusSlow)
      ? P2_CFG.LANE_LERP_DURATION * 2
      : P2_CFG.LANE_LERP_DURATION;
    this._laneT = Math.min(1, this._laneT + dt / dur);
    // Smoothstep
    const t = this._laneT * this._laneT * (3 - 2 * this._laneT);
    this.x = this._prevX + (this._targetX - this._prevX) * t;
    this._group.position.x = this.x;
  }

  // ── Jump ───────────────────────────────────────────────────────────────
  _startJump() {
    this._jumping   = true;
    this._jumpPhase = 'rise';
    this._jumpTimer = 0;
    this.isAirborne = true;
  }

  _updateJump(dt) {
    if (!this._jumping) return;
    this._jumpTimer += dt;

    if (this._jumpPhase === 'rise') {
      const t  = this._jumpTimer / P2_CFG.JUMP_RISE_TIME;
      const te = 1 - (1 - t) * (1 - t); // ease-out
      this.y   = this._baseY + te * P2_CFG.JUMP_HEIGHT;
      if (this._jumpTimer >= P2_CFG.JUMP_RISE_TIME) {
        this._jumpPhase = 'fall';
        this._jumpTimer = 0;
      }
    } else if (this._jumpPhase === 'fall') {
      const t  = this._jumpTimer / P2_CFG.JUMP_FALL_TIME;
      const te = t * t; // ease-in
      this.y   = this._baseY + P2_CFG.JUMP_HEIGHT * (1 - te);
      if (this._jumpTimer >= P2_CFG.JUMP_FALL_TIME) {
        this.y          = this._baseY;
        this._jumping   = false;
        this._jumpPhase = 'none';
        this.isAirborne = false;
        this._squashT   = P2_CFG.LAND_SQUASH_DURATION; // trigger squash
      }
    }
  }

  // ── Slide ──────────────────────────────────────────────────────────────
  _startSlide() {
    this._sliding    = true;
    this._slideTimer = P2_CFG.SLIDE_DURATION;
    this.isSliding   = true;
    this._group.scale.set(P2_CFG.SLIDE_SCALE_XZ, P2_CFG.SLIDE_SCALE_Y, P2_CFG.SLIDE_SCALE_XZ);
    // Drop the group slightly so it hugs the floor
    this.y = this._baseY * 0.5;
  }

  _updateSlide(dt) {
    if (!this._sliding) return;
    this._slideTimer -= dt;
    if (this._slideTimer <= 0) {
      this._sliding  = false;
      this.isSliding = false;
      this.y         = this._baseY;
      this._group.scale.set(1, 1, 1);
    }
  }

  // ── Bob ────────────────────────────────────────────────────────────────
  _updateBob(dt) {
    if (this._jumping || this._sliding) return;
    this._bobT += dt;
    const bob = Math.sin(this._bobT * (2 * Math.PI / P2_CFG.BOB_PERIOD)) * P2_CFG.BOB_AMPLITUDE;
    this.y     = this._baseY + bob;
  }

  // ── Roll tilt during lane change ───────────────────────────────────────
  _updateRoll(dt) {
    const tiltTarget = (this._laneT < 1)
      ? (this._rollDir || 0) * (P2_CFG.LANE_ROLL_DEG * Math.PI / 180) * Math.sin(this._laneT * Math.PI)
      : 0;
    this._rollAngle += (tiltTarget - this._rollAngle) * Math.min(1, dt * 12);
    this._group.rotation.z = -this._rollAngle;
  }

  // ── Landing squash ─────────────────────────────────────────────────────
  _updateSquash(dt) {
    if (this._squashT <= 0) return;
    this._squashT -= dt;
    if (this._squashT > 0) {
      const t   = this._squashT / P2_CFG.LAND_SQUASH_DURATION;
      const sy  = P2_CFG.LAND_SQUASH_SCALE + (1 - P2_CFG.LAND_SQUASH_SCALE) * (1 - t);
      const sxz = 1 + (1 / sy - 1) * 0.5; // conserve volume roughly
      this._group.scale.set(sxz, sy, sxz);
    } else {
      this._group.scale.set(1, 1, 1);
    }
  }

  reset() {
    this._laneIdx  = 2;
    this._targetX  = P2_CFG.LANES[2];
    this._prevX    = P2_CFG.LANES[2];
    this._laneT    = 1;
    this._jumping  = false;
    this._sliding  = false;
    this.isAirborne = false;
    this.isSliding  = false;
    this._bobT      = 0;
    this._rollAngle = 0;
    this._squashT   = 0;
    this.x = P2_CFG.LANES[2];
    this.y = this._baseY;
    this._group.position.set(this.x, this.y, this.z);
    this._group.scale.set(1, 1, 1);
    this._group.rotation.set(0, 0, 0);
  }

  destroy() {
    this._scene.remove(this._group);
    // Geometries and materials are cached in _P2GEO/_P2MAT; do not dispose here.
  }
}


// ────────────────────────────────────────────────────────────────────────────
// RBCManager — biconcave red blood cells drifting slowly through background
// Gives depth cue that the virion is traversing a host vascular environment.
// ────────────────────────────────────────────────────────────────────────────
class RBCManager {

  constructor(scene) {
    this._scene = scene;
    this._cells = [];
    this._buildPool();
  }

  _buildPool() {
    const geo = _geo('rbcDisc', () => {
      // LatheGeometry with biconcave cross-section profile
      // x = radial distance from axis (0→1), y = height at that radius
      // Thickest near the rim, thin and concave at centre
      const pts = [
        new THREE.Vector2(0.00,  0.040),
        new THREE.Vector2(0.30,  0.108),
        new THREE.Vector2(0.60,  0.185),
        new THREE.Vector2(0.82,  0.175),
        new THREE.Vector2(1.00,  0.118),
        new THREE.Vector2(1.00, -0.118),
        new THREE.Vector2(0.82, -0.175),
        new THREE.Vector2(0.60, -0.185),
        new THREE.Vector2(0.30, -0.108),
        new THREE.Vector2(0.00, -0.040),
      ];
      return new THREE.LatheGeometry(pts, 20);
    });

    const mat = _mat('rbcCell', () => new THREE.MeshPhongMaterial({
      color:             0xcc2233,
      emissive:          new THREE.Color(0x3a0008),
      emissiveIntensity: 0.3,
      transparent:       true,
      opacity:           0.52,
      side:              THREE.DoubleSide,
    }));

    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this._scene.add(mesh);
      this._cells.push({
        mesh,
        z: 0, x: 0, y: 0,
        active:  false,
        rotSpd:  (Math.random() - 0.5) * 0.35,
        tiltX:   (Math.random() - 0.5) * 0.45,
        tiltZ:   (Math.random() - 0.5) * 0.30,
        scale:   1.8 + Math.random() * 1.2,
      });
    }

    // Activate 4 cells spread across the initial Z range
    for (let i = 0; i < 4; i++) this._spawnCell(this._cells[i], 30 + i * 22);
  }

  _spawnCell(cell, zOverride) {
    const CW = P2_CFG.CHUNK_WIDTH;
    cell.x = (Math.random() - 0.5) * (CW + 20);
    cell.y = 5.0 + Math.random() * 3.5;           // Y 5–8.5 → appears near top of view
    cell.z = zOverride !== undefined ? zOverride : (55 + Math.random() * 35);
    cell.mesh.position.set(cell.x, cell.y, cell.z);
    cell.mesh.rotation.set(cell.tiltX, 0, cell.tiltZ);
    cell.mesh.scale.setScalar(cell.scale);
    cell.mesh.visible = true;
    cell.active = true;
  }

  update(dt, speed) {
    const dz = dt * speed * 8 * 0.22; // 22% of terrain speed — languid drift
    for (const cell of this._cells) {
      if (!cell.active) continue;
      cell.z -= dz;
      cell.mesh.position.z  = cell.z;
      cell.mesh.rotation.y += cell.rotSpd * dt;
      if (cell.z < -20) this._spawnCell(cell);
    }
  }

  reset() {
    this._cells.forEach((cell, i) => {
      if (i < 4) this._spawnCell(cell, 30 + i * 22);
      else { cell.active = false; cell.mesh.visible = false; }
    });
  }

  destroy() {
    this._cells.forEach(cell => this._scene.remove(cell.mesh));
    this._cells = [];
  }
}
