'use strict';
/**
 * P3DEndosomeVehicle — the player-controlled endosome sphere.
 *
 * Visual layers:
 *   1. Endosome membrane  — shared SphereGeometry with vertex breathing animation
 *   2. Clathrin coat      — wireframe IcosahedronGeometry; fades pH 7.4 → 6.5
 *   3. Rab5 ring markers  — green tori, disappear at pH ≤ A1_RAB5_PH
 *   4. Rab7 ring markers  — amber tori, appear    at pH ≤ A1_RAB7_PH
 *   5. Virus core         — orange sphere inside
 *   6. V-ATPase pumps     — 6 thin cylinders arrayed on surface equator
 *
 * Note: this class does NOT own shared geometries/materials — never call
 * dispose() on them; P3DGeoLib/P3DMatLib handle that.
 */
class P3DEndosomeVehicle {
  constructor(scene) {
    this._scene      = scene;
    this._beatPhase  = 0;
    this._rab5Active = true;
    this._rab7Active = false;

    // Root group (tilts with lateral velocity)
    this._group = new THREE.Group();
    scene.add(this._group);

    // Rab marker groups live in scene space so they stay axis-aligned
    this._rab5Group = new THREE.Group();
    this._rab7Group = new THREE.Group();
    scene.add(this._rab5Group);
    scene.add(this._rab7Group);

    this._buildEndosome();
    this._buildClathrin();
    this._buildRabMarkers();
    this._buildVirus();
    this._buildVATPases();
  }

  // ── Build helpers ──────────────────────────────────────────────────────

  _buildEndosome() {
    this._endoMesh = new THREE.Mesh(P3DGeoLib.endoSphere, P3DMatLib.endosome);
    this._group.add(this._endoMesh);
  }

  _buildClathrin() {
    this._clathrinMesh = new THREE.Mesh(P3DGeoLib.clathrin, P3DMatLib.clathrin);
    this._group.add(this._clathrinMesh);
  }

  _buildRabMarkers() {
    const r5mat = new THREE.MeshBasicMaterial({ color: P3D_CFG.COL_RAB5 });
    const r7mat = new THREE.MeshBasicMaterial({ color: P3D_CFG.COL_RAB7 });
    this._rab5Mat = r5mat;
    this._rab7Mat = r7mat;

    const R = P3D_CFG.A1_ENDO_RADIUS * 0.92;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const m = new THREE.Mesh(P3DGeoLib.torusRab, r5mat);
      m.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      m.lookAt(0, 0, 0);
      this._rab5Group.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = new THREE.Mesh(P3DGeoLib.torusRab, r7mat);
      m.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      m.lookAt(0, 0, 0);
      this._rab7Group.add(m);
    }
    this._rab7Group.visible = false;
  }

  _buildVirus() {
    this._virusMesh = new THREE.Mesh(P3DGeoLib.virusSphere, P3DMatLib.virus);
    this._virusMesh.scale.setScalar(1.6);
    this._group.add(this._virusMesh);
  }

  _buildVATPases() {
    this._vatpGroup = new THREE.Group();
    const R = P3D_CFG.A1_ENDO_RADIUS;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const m = new THREE.Mesh(P3DGeoLib.cylinderThin, P3DMatLib.haStalk);
      const yOff = (Math.sin(a * 1.3) * 0.5) * R;
      m.position.set(Math.cos(a) * R, yOff, Math.sin(a) * R);
      // Point outward from centre
      m.lookAt(new THREE.Vector3(0, yOff, 0));
      m.rotateX(Math.PI / 2);
      this._vatpGroup.add(m);
    }
    this._group.add(this._vatpGroup);
  }

  // ── Per-frame update ───────────────────────────────────────────────────

  /**
   * @param {number}        dt
   * @param {THREE.Vector3} worldPos   desired world position
   * @param {THREE.Vector2} lateralVel X/Z velocity for tilt
   * @param {number}        pH
   */
  update(dt, worldPos, lateralVel, pH) {
    // Move group
    this._group.position.copy(worldPos);

    // Rab marker rings follow the group in scene space
    this._rab5Group.position.copy(worldPos);
    this._rab7Group.position.copy(worldPos);

    // Tilt toward lateral motion
    const tiltMax = P3D_CFG.A1_TILT_MAX_DEG * (Math.PI / 180);
    const tX = -lateralVel.y / P3D_CFG.A1_MOVE_MAX * tiltMax;  // forward/back
    const tZ =  lateralVel.x / P3D_CFG.A1_MOVE_MAX * tiltMax;  // side
    this._group.rotation.x += (tX - this._group.rotation.x) * P3D_CFG.A1_TILT_LERP;
    this._group.rotation.z += (tZ - this._group.rotation.z) * P3D_CFG.A1_TILT_LERP;

    // Vertex breathing
    this._animateBreathing(dt, pH);

    // Clathrin opacity: fully visible pH≥7.4, gone by pH≤6.5
    const cf = Math.max(0, Math.min(1, (pH - 6.5) / (7.4 - 6.5)));
    if (P3DMatLib.clathrin.transparent) {
      P3DMatLib.clathrin.opacity    = cf * 0.65;
      this._clathrinMesh.visible    = cf > 0.02;
    }

    // Rab5 shed
    if (this._rab5Active && pH <= P3D_CFG.A1_RAB5_PH) {
      this._rab5Active         = false;
      this._rab5Group.visible  = false;
    }
    // Rab7 appear
    if (!this._rab7Active && pH <= P3D_CFG.A1_RAB7_PH) {
      this._rab7Active         = true;
      this._rab7Group.visible  = true;
    }
  }

  _animateBreathing(dt, pH) {
    // Rate increases as pH drops below A1_BEAT_PH_START
    const phFrac = Math.max(0, Math.min(1,
      (P3D_CFG.A1_BEAT_PH_START - pH) / 1.5));
    const rate = P3D_CFG.A1_BEAT_RATE_S +
      (P3D_CFG.A1_BEAT_RATE_E - P3D_CFG.A1_BEAT_RATE_S) * phFrac;
    this._beatPhase = (this._beatPhase + dt * rate * Math.PI * 2) % (Math.PI * 4);

    const disp  = Math.sin(this._beatPhase) * 0.05;
    const pos   = P3DGeoLib.endoSphere.attributes.position;
    const base  = P3DGeoLib.endoSpherePos;

    for (let i = 0, n = pos.count; i < n; i++) {
      const i3 = i * 3;
      const bx = base[i3], by = base[i3+1], bz = base[i3+2];
      const len = Math.sqrt(bx*bx + by*by + bz*bz) || 1;
      pos.setXYZ(i, bx + (bx/len)*disp, by + (by/len)*disp, bz + (bz/len)*disp);
    }
    pos.needsUpdate = true;
    P3DGeoLib.endoSphere.computeVertexNormals();
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  get worldPosition() { return this._group.position; }
  get radius()        { return P3D_CFG.A1_ENDO_RADIUS; }

  // ── Cleanup ───────────────────────────────────────────────────────────

  destroy() {
    this._scene.remove(this._group);
    this._scene.remove(this._rab5Group);
    this._scene.remove(this._rab7Group);
    // Dispose only locally-owned materials
    this._rab5Mat.dispose();
    this._rab7Mat.dispose();
    // Shared geo/mat (endoSphere, clathrin, virusSphere, haStalk, cylinderThin) left to P3DGeoLib/MatLib
  }
}
