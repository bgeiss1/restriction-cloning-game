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

  createTerrain(scene)       { return new MembraineTerrain(scene); },
  createPlayer(scene)        { return new PlayerVirus(scene); },
  createBronchialWalls(scene){ return new BronchialTunnel(scene); },
  createRBCs(scene)          { return new RBCManager(scene); },

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

      // Store original X positions before any per-frame displacement
      const pos0 = geo.attributes.position;
      const origX = new Float32Array(pos0.count);
      for (let v = 0; v < pos0.count; v++) origX[v] = pos0.getX(v);

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
        origX,
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
  // curvature: signed value driving parabolic X displacement (xDisp = curvature * z² / 2)
  // At curvature = bendX/450, terrain at z=30 is displaced by bendX — matching camera look-ahead.
  update(dt, speed, curvature) {
    curvature = curvature || 0;
    this._time    += dt;
    const dz       = dt * speed * 8;
    this._scrollZ += dz;

    const CL = P2_CFG.CHUNK_LENGTH;

    for (let i = 0; i < this._chunks.length; i++) {
      const ch = this._chunks[i];
      ch.zOffset -= dz;

      // Curve X offset at chunk center (used for decorative sub-objects)
      const curveX = curvature * ch.zOffset * ch.zOffset * 0.5;

      // Main mesh: X handled per-vertex in _waveChunk; only set Z here
      ch.mesh.position.z    = ch.zOffset;
      ch.mesh.position.x    = 0;
      // Sub-objects shifted by chunk-center curve offset (good approximation)
      ch.subMesh.position.set(curveX, -2, ch.zOffset);
      ch.dots.position.set(curveX, -1.9, ch.zOffset);
      ch.cilia.position.set(curveX, 0, ch.zOffset);
      ch.rafts.position.set(curveX, 0, ch.zOffset);

      // Recycle chunk that has fully passed behind the camera
      if (ch.zOffset < -(CL * 1.5)) {
        let maxZ = -Infinity;
        this._chunks.forEach(c => { if (c.zOffset > maxZ) maxZ = c.zOffset; });
        ch.zOffset = maxZ + CL;
        const newCurveX = curvature * ch.zOffset * ch.zOffset * 0.5;
        ch.mesh.position.z = ch.zOffset;
        ch.subMesh.position.set(newCurveX, -2, ch.zOffset);
        ch.dots.position.set(newCurveX, -1.9, ch.zOffset);
        ch.cilia.position.set(newCurveX, 0, ch.zOffset);
        ch.rafts.position.set(newCurveX, 0, ch.zOffset);
        this._repositionRafts(i, ch);
        this._raftZones[i] = this._computeRaftZones(ch.zOffset, ch.rafts);
      }

      // Wave + curve displacement on membrane vertices
      this._waveChunk(ch, this._time, curvature);
    }

    // Lipid segments — follow the same curve
    const SLEN = 30;
    for (const seg of this._lipidSegs) {
      seg.zOffset -= dz;
      seg.mesh.position.z = seg.zOffset;
      seg.mesh.position.x = curvature * seg.zOffset * seg.zOffset * 0.5;
      if (seg.zOffset < -(SLEN * 1.5)) {
        let maxZ = -Infinity;
        this._lipidSegs.forEach(s => { if (s.zOffset > maxZ) maxZ = s.zOffset; });
        seg.zOffset = maxZ + SLEN;
        seg.mesh.position.z = seg.zOffset;
        seg.mesh.position.x = curvature * seg.zOffset * seg.zOffset * 0.5;
      }
    }
  }

  // Wave + curve: use stored origX so X modifications don't accumulate across frames.
  _waveChunk(ch, t, curvature) {
    const pos   = ch.mesh.geometry.attributes.position;
    const count = pos.count;
    for (let v = 0; v < count; v++) {
      const origX  = ch.origX[v];
      const z      = pos.getZ(v);
      const worldZ = ch.zOffset + z;
      // Parabolic lateral displacement — zero underfoot, increases with distance
      const xCurve = curvature * worldZ * worldZ * 0.5;
      pos.setX(v, origX + xCurve);
      const yWave = Math.sin(origX * 0.3 + t * 0.5) * 0.15
                  + Math.sin(z      * 0.2 + t * 0.3) * 0.10;
      pos.setY(v, yWave);
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
      ch.mesh.position.set(0, 0, ch.zOffset);
      ch.subMesh.position.set(0, -2, ch.zOffset);
      ch.dots.position.set(0, -1.9, ch.zOffset);
      ch.cilia.position.set(0, 0, ch.zOffset);
      ch.rafts.position.set(0, 0, ch.zOffset);
    });
    const SLEN = 30;
    this._lipidSegs.forEach((seg, i) => {
      seg.zOffset = i * SLEN;
      seg.mesh.position.set(0, 0, seg.zOffset);
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
// BronchialTunnel — continuous curved bronchial tube built from InstancedMesh.
//
// Every frame each ring/fill segment is repositioned to:
//   position.x  = curvature × worldZ² / 2   (same parabola as terrain)
//   quaternion  = setFromUnitVectors(axis, tangent) — aligns fill cylinder or
//                 cartilage ring to the LOCAL curve direction at that Z
//
// This means the tube geometry physically follows the same curve as the ground,
// with no segments sliding across each other.  Narrowing is applied via
// instance scale.x/z (radial) while scale.y (length) stays fixed.
// ────────────────────────────────────────────────────────────────────────────
class BronchialTunnel {

  constructor(scene) {
    this._scene   = scene;
    this._N       = 130;                          // fill + ring instance count
    this._SP      = 1.5;                          // world units between instances
    this._C_STEP  = Math.round(14 / 1.5);         // cartilage every ~9 instances (14 wu)
    this._V_STEP  = 3;                            // vessel dot every 3 instances
    this._BR_N    = 10;                           // branch openings
    this._BR_SP   = 28;                           // branch Z spacing
    this._scroll  = 0;
    this._dummy   = new THREE.Object3D();
    this._yAxis   = new THREE.Vector3(0, 1, 0);  // default CylinderGeometry axis
    this._zAxis   = new THREE.Vector3(0, 0, 1);  // default TorusGeometry normal
    this._tangent = new THREE.Vector3();
    this._build();
  }

  _build() {
    const N = this._N;

    // ── Tube fill: open-ended cylinder, BackSide, scaled to SP per instance ─
    this._fillMesh = new THREE.InstancedMesh(
      _geo('tnlFill', () => new THREE.CylinderGeometry(18, 18, 1, 36, 1, true)),
      _mat('tnlFill', () => new THREE.MeshPhongMaterial({
        color: 0x4a1820, emissive: new THREE.Color(0x120408),
        emissiveIntensity: 0.5, side: THREE.BackSide, shininess: 4,
      })),
      N
    );
    this._fillMesh.matrixAutoUpdate = false;
    this._scene.add(this._fillMesh);

    // ── Cartilage rings: torus bracelets around the tube ─────────────────
    const cartCount   = Math.ceil(N / this._C_STEP);
    this._cartCount   = cartCount;
    this._cartMesh    = new THREE.InstancedMesh(
      _geo('tnlCart', () => new THREE.TorusGeometry(18.3, 0.65, 8, 36)),
      _mat('tnlCart', () => new THREE.MeshPhongMaterial({
        color: 0x8c6048, emissive: new THREE.Color(0x1c0c06),
        emissiveIntensity: 0.3, shininess: 22,
      })),
      cartCount
    );
    this._cartMesh.matrixAutoUpdate = false;
    this._scene.add(this._cartMesh);

    // ── Blood vessel dots: 4 chains of spheres running along the wall ────
    this._VES_ANGS  = [-0.55, -0.22, 0.52, 1.08];
    const vesCount  = Math.ceil(N / this._V_STEP);
    this._vesCount  = vesCount;
    const dotGeo    = _geo('tnlDot', () => new THREE.SphereGeometry(0.13, 4, 4));
    const dotMat    = _mat('tnlDot', () => new THREE.MeshPhongMaterial({
      color: 0x881420, emissive: new THREE.Color(0x330008), emissiveIntensity: 0.5,
    }));
    this._vesMeshes = this._VES_ANGS.map(() => {
      const m = new THREE.InstancedMesh(dotGeo, dotMat, vesCount);
      m.matrixAutoUpdate = false;
      this._scene.add(m);
      return m;
    });

    // ── Branch openings: tapered sub-bronchus tunnels through the wall ───
    // Directions pre-baked (alternating L/R, slight downward + forward lean)
    this._brDirs = Array.from({ length: this._BR_N }, (_, j) => {
      const side = (j % 2 === 0) ? 1 : -1;
      return new THREE.Vector3(
        side  * (0.84 + (j % 3) * 0.04),
        -0.15 - (j % 4) * 0.05,
         0.12 + (j % 3) * 0.08,
      ).normalize();
    });
    this._branchMesh = new THREE.InstancedMesh(
      _geo('tnlBranch', () => new THREE.CylinderGeometry(5.0, 3.5, 42, 12, 1, true)),
      _mat('tnlBranch', () => new THREE.MeshPhongMaterial({
        color: 0x30100f, emissive: new THREE.Color(0x080204),
        emissiveIntensity: 0.4, side: THREE.BackSide,
        transparent: true, opacity: 0.90, shininess: 2,
      })),
      this._BR_N
    );
    this._branchMesh.matrixAutoUpdate = false;
    this._scene.add(this._branchMesh);
  }

  update(dt, speed, elapsed, curvature) {
    curvature     = curvature || 0;
    const dz      = dt * speed * 8;
    this._scroll -= dz;

    const N      = this._N;
    const SP     = this._SP;
    const TOTAL  = N * SP;   // full wrap period
    const nScale = Math.max(0.42, 1 - (elapsed || 0) * 0.0038);

    let cIdx = 0;
    const vIdx = new Array(this._vesMeshes.length).fill(0);

    for (let i = 0; i < N; i++) {
      // Scroll with wrap — keeps instances distributed from ~-12 to TOTAL-12 ahead
      let wz = this._scroll + i * SP;
      if (wz < -12) wz += TOTAL;

      // Curve centre X and tangent direction at this worldZ
      const cx  = curvature * wz * wz * 0.5;
      const tx  = curvature * wz;          // un-normalised tangent X component
      const mag = Math.sqrt(tx * tx + 1);
      this._tangent.set(tx / mag, 0, 1 / mag);

      this._dummy.position.set(cx, 0, wz);

      // Fill segment: cylinder axis (Y) → tangent; scale Y = SP (length), XZ = nScale (radius)
      this._dummy.quaternion.setFromUnitVectors(this._yAxis, this._tangent);
      this._dummy.scale.set(nScale, SP, nScale);
      this._dummy.updateMatrix();
      this._fillMesh.setMatrixAt(i, this._dummy.matrix);

      // Cartilage ring: torus normal (Z) → tangent; uniform scale
      if (i % this._C_STEP === 0 && cIdx < this._cartCount) {
        this._dummy.quaternion.setFromUnitVectors(this._zAxis, this._tangent);
        this._dummy.scale.setScalar(nScale);
        this._dummy.updateMatrix();
        this._cartMesh.setMatrixAt(cIdx++, this._dummy.matrix);
      }

      // Vessel dots — sphere on wall surface at pre-set angular positions
      if (i % this._V_STEP === 0) {
        const vr = 18 * nScale;
        for (let v = 0; v < this._vesMeshes.length; v++) {
          const ang = this._VES_ANGS[v];
          this._dummy.position.set(cx + Math.sin(ang) * vr, Math.cos(ang) * vr, wz);
          this._dummy.quaternion.identity();
          this._dummy.scale.setScalar(0.9);
          this._dummy.updateMatrix();
          this._vesMeshes[v].setMatrixAt(vIdx[v]++, this._dummy.matrix);
        }
      }
    }

    // Branch openings — sub-bronchus tunnels exiting through the wall
    const BR_TOTAL = this._BR_N * this._BR_SP;
    const halfLen  = 21;  // CylinderGeometry half-height (height=42)
    for (let j = 0; j < this._BR_N; j++) {
      let wz = this._scroll + j * this._BR_SP + 15;
      if (wz < -12) wz += BR_TOTAL;

      const dir    = this._brDirs[j];
      const cx     = curvature * wz * wz * 0.5;
      const wallR  = 18 * nScale;

      // Inner face of branch cylinder sits at the wall surface;
      // centre is displaced by halfLen×dir beyond that point.
      this._dummy.position.set(
        cx + dir.x * wallR + dir.x * halfLen,
        dir.y * halfLen,
        wz  + dir.z * halfLen
      );
      this._dummy.quaternion.setFromUnitVectors(this._yAxis, dir);
      this._dummy.scale.set(nScale, 1, nScale);
      this._dummy.updateMatrix();
      this._branchMesh.setMatrixAt(j, this._dummy.matrix);
    }

    this._fillMesh.instanceMatrix.needsUpdate   = true;
    this._cartMesh.instanceMatrix.needsUpdate   = true;
    this._branchMesh.instanceMatrix.needsUpdate = true;
    this._vesMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }

  reset() { this._scroll = 0; }

  destroy() {
    this._scene.remove(this._fillMesh);
    this._scene.remove(this._cartMesh);
    this._scene.remove(this._branchMesh);
    this._vesMeshes.forEach(m => this._scene.remove(m));
  }
}


// ────────────────────────────────────────────────────────────────────────────
// BronchialWalls — kept as a stub; factory now returns BronchialTunnel above.
// ────────────────────────────────────────────────────────────────────────────
class BronchialWalls {

  constructor(scene) {
    this._scene      = scene;
    this._segs       = [];   // { group, zOffset }
    this._SLEN       = 90;
    this._vesselGeos = [];   // unique TubeGeometry per vessel — must dispose on destroy
    this._buildSegments();
  }

  _buildSegments() {
    for (let i = 0; i < 3; i++) {
      const group = this._buildOneSegment();
      group.position.z = i * this._SLEN;
      this._scene.add(group);
      this._segs.push({ group, zOffset: i * this._SLEN });
    }
  }

  _buildOneSegment() {
    const group = new THREE.Group();
    const SLEN  = this._SLEN;

    // ── Bronchial tube wall (interior surface) ──────────────────────────
    // Large open-ended cylinder; BackSide so it renders from inside.
    const tubeGeo = _geo('bronchTube', () =>
      new THREE.CylinderGeometry(18, 18, 1, 36, 1, true)
    );
    const tubeMat = _mat('bronchTube', () => new THREE.MeshPhongMaterial({
      color:             0x5a1c22,
      emissive:          new THREE.Color(0x1a0408),
      emissiveIntensity: 0.5,
      side:              THREE.BackSide,
      shininess:         8,
    }));
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.rotation.x = Math.PI / 2;
    tubeMesh.scale.y    = SLEN;
    group.add(tubeMesh);

    // ── Cartilage C-rings ───────────────────────────────────────────────
    const ringGeo = _geo('cartilageRing', () =>
      new THREE.TorusGeometry(18, 0.55, 8, 36)
    );
    const ringMat = _mat('cartilageRing', () => new THREE.MeshPhongMaterial({
      color:             0x8c6048,
      emissive:          new THREE.Color(0x1c0c06),
      emissiveIntensity: 0.3,
      shininess:         22,
    }));
    const RING_SPACING = 14;
    const ringCount    = Math.floor(SLEN / RING_SPACING);
    for (let r = 0; r < ringCount; r++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = -SLEN / 2 + r * RING_SPACING + RING_SPACING * 0.5;
      group.add(ring);
    }

    // ── Blood vessel streaks — organic TubeGeometry with curved waypoints ──
    const vesselMat = _mat('bronchVessel', () => new THREE.MeshPhongMaterial({
      color:             0x881420,
      emissive:          new THREE.Color(0x330008),
      emissiveIntensity: 0.4,
      shininess:         18,
    }));
    const vesselAngles = [-0.65, -0.35, 0.10, 0.40, 0.80, 1.15];
    for (const ang of vesselAngles) {
      const R    = 17.5;
      const bx   = Math.sin(ang) * R;
      const by   = Math.cos(ang) * R;
      const len  = SLEN * (0.45 + Math.random() * 0.55);
      const r    = 0.08 + Math.random() * 0.08;  // vary vessel calibre
      // Build a wiggly CatmullRom curve in local Z space
      const pts  = [];
      const N    = 7;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        pts.push(new THREE.Vector3(
          (Math.random() - 0.5) * 1.0,   // lateral meander on wall surface
          (Math.random() - 0.5) * 1.0,   // radial meander
          (t - 0.5) * len
        ));
      }
      const curve  = new THREE.CatmullRomCurve3(pts);
      const geo    = new THREE.TubeGeometry(curve, 18, r, 6, false);
      this._vesselGeos.push(geo);
      const v = new THREE.Mesh(geo, vesselMat);
      v.position.set(bx, by, (Math.random() - 0.5) * SLEN * 0.2);
      group.add(v);
    }

    // ── Branch openings — side passages into sub-bronchi ───────────────
    // Each branch is an open-ended tapered cylinder pointing outward at an
    // angle, giving the impression of a side passage going deeper into the lung.
    const branchGeo = _geo('bronchBranch', () =>
      new THREE.CylinderGeometry(5.0, 3.5, 42, 12, 1, true)
    );
    const branchMat = _mat('bronchBranch', () => new THREE.MeshPhongMaterial({
      color:             0x3a1015,
      emissive:          new THREE.Color(0x0c0204),
      emissiveIntensity: 0.4,
      side:              THREE.BackSide,
      transparent:       true,
      opacity:           0.88,
      shininess:         4,
    }));
    const nBranches = 1 + (Math.random() > 0.35 ? 1 : 0); // 1 or 2 per segment
    for (let b = 0; b < nBranches; b++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const zPos = -SLEN * 0.35 + Math.random() * SLEN * 0.7;
      const yPos = (Math.random() - 0.5) * 5;
      // Direction: mostly outward in X, slightly downward, slight forward lean
      const dir = new THREE.Vector3(
        side * (0.82 + Math.random() * 0.12),
        -0.18 - Math.random() * 0.18,
         0.10 + Math.random() * 0.25
      ).normalize();
      // Position branch so its inner face sits at the tube wall (radius 18),
      // with the rest of the cylinder extending outward beyond the wall.
      const halfLen = 21; // CylinderGeometry height = 42, halfHeight = 21
      const branch = new THREE.Mesh(branchGeo, branchMat);
      branch.position.set(
        side * 18 + dir.x * halfLen,
        yPos      + dir.y * halfLen,
        zPos      + dir.z * halfLen
      );
      branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      group.add(branch);
    }

    return group;
  }

  update(dt, speed, elapsed, curvature) {
    curvature = curvature || 0;
    const dz   = dt * speed * 8;
    const SLEN = this._SLEN;
    const narrowScale = Math.max(0.42, 1 - (elapsed || 0) * 0.0038);
    for (const seg of this._segs) {
      seg.zOffset -= dz;
      const curveX = curvature * seg.zOffset * seg.zOffset * 0.5;
      seg.group.position.set(curveX, 0, seg.zOffset);
      seg.group.scale.set(narrowScale, narrowScale, 1);
      if (seg.zOffset < -(SLEN * 1.5)) {
        let maxZ = -Infinity;
        this._segs.forEach(s => { if (s.zOffset > maxZ) maxZ = s.zOffset; });
        seg.zOffset = maxZ + SLEN;
        seg.group.position.set(curvature * seg.zOffset * seg.zOffset * 0.5, 0, seg.zOffset);
      }
    }
  }

  reset() {
    const SLEN = this._SLEN;
    this._segs.forEach((seg, i) => {
      seg.zOffset = i * SLEN;
      seg.group.position.z = seg.zOffset;
      seg.group.scale.set(1, 1, 1);
    });
  }

  destroy() {
    this._segs.forEach(seg => this._scene.remove(seg.group));
    this._segs = [];
    this._vesselGeos.forEach(g => g.dispose());
    this._vesselGeos = [];
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
