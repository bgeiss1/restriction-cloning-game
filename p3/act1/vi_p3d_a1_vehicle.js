'use strict';
/**
 * P3DEndosomeVehicle — the player-controlled endosome sphere.
 *
 * Visual layers:
 *   1. Endosome membrane  — shared SphereGeometry with vertex breathing animation
 *   2. Clathrin coat      — EdgesGeometry lattice + triskelion InstancedMesh; fades pH 7.4 → 6.5
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

    // Interior H⁺ ions accumulate here as player pumps ions in
    this._interiorIons       = [];
    this._interiorGeosReady  = false;
  }

  // ── Build helpers ──────────────────────────────────────────────────────

  _buildEndosome() {
    this._endoMesh = new THREE.Mesh(P3DGeoLib.endoSphere, P3DMatLib.endosome);
    this._group.add(this._endoMesh);
  }

  _buildClathrin() {
    this._clathrinGroup = new THREE.Group();
    this._clathrinRotY  = 0;

    // ── Edge lattice (LineSegments over EdgesGeometry) ─────────────────
    const edgesGeo = new THREE.EdgesGeometry(P3DGeoLib.clathrin);
    this._clathrinEdgesGeo = edgesGeo;   // locally owned — disposed in destroy()
    this._clathrinGroup.add(new THREE.LineSegments(edgesGeo, P3DMatLib.clathrin));

    // ── Triskelion arms at each unique vertex ──────────────────────────
    // Real clathrin is built from three-legged triskelion proteins.
    // One triskelion sits at each lattice vertex with three arms radiating
    // 120° apart in the local tangent plane of the sphere.
    const icoPos    = P3DGeoLib.clathrin.attributes.position;
    const nVerts    = icoPos.count;
    const armLen    = 0.20;

    this._clathrinIMesh = new THREE.InstancedMesh(
      P3DGeoLib.clathrinArm, P3DMatLib.clathrinNode, nVerts * 3
    );
    this._clathrinIMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    const up    = new THREE.Vector3(0, 1, 0);
    const _q    = new THREE.Quaternion();
    let   idx   = 0;

    for (let i = 0; i < nVerts; i++) {
      const v = new THREE.Vector3(icoPos.getX(i), icoPos.getY(i), icoPos.getZ(i));
      const n = v.clone().normalize();
      // Stable tangent vector perpendicular to outward normal
      const ref = Math.abs(n.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const t0 = new THREE.Vector3().crossVectors(ref, n).normalize();

      for (let j = 0; j < 3; j++) {
        const armDir = t0.clone().applyAxisAngle(n, j * (Math.PI * 2 / 3));
        // Place cylinder center at vertex + armDir*(armLen/2)
        dummy.position.copy(v).addScaledVector(armDir, armLen * 0.5);
        _q.setFromUnitVectors(up, armDir);
        dummy.quaternion.copy(_q);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this._clathrinIMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    this._clathrinIMesh.instanceMatrix.needsUpdate = true;
    this._clathrinGroup.add(this._clathrinIMesh);

    this._group.add(this._clathrinGroup);
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
    this._buildHATrimers();
  }

  _buildHATrimers() {
    // Locally-owned geo/mat for trimers
    this._haStemGeo   = new THREE.CylinderGeometry(0.04, 0.055, 0.28, 6);
    this._haHeadGeo   = new THREE.SphereGeometry(0.085, 7, 5);
    this._haTrimerMat = new THREE.MeshPhongMaterial({
      color:     P3D_CFG.COL_HA,
      emissive:  P3D_CFG.COL_HA_EM,
      shininess: 80,
    });

    // 8 evenly-spread directions from cube-corner normals
    const virusR = 1.65;   // just outside the 1.6-scaled virus sphere
    const up     = new THREE.Vector3(0, 1, 0);
    const dirs   = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      dirs.push(new THREE.Vector3(x, y, z).normalize());
    }

    for (const dir of dirs) {
      // Stalk
      const stalk = new THREE.Mesh(this._haStemGeo, this._haTrimerMat);
      stalk.position.copy(dir).multiplyScalar(virusR + 0.14);
      stalk.quaternion.setFromUnitVectors(up, dir);
      this._group.add(stalk);

      // 3 head spheres arranged 120° apart at stalk tip
      const tipCenter = dir.clone().multiplyScalar(virusR + 0.30);
      const ref       = Math.abs(dir.x) < 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
      const tangent   = new THREE.Vector3().crossVectors(dir, ref).normalize();
      for (let j = 0; j < 3; j++) {
        const head   = new THREE.Mesh(this._haHeadGeo, this._haTrimerMat);
        const offset = tangent.clone()
          .applyAxisAngle(dir, j * (Math.PI * 2 / 3))
          .multiplyScalar(0.10);
        head.position.copy(tipCenter).add(offset);
        this._group.add(head);
      }
    }
  }

  _buildVATPases() {
    this._vatpGroup    = new THREE.Group();
    this._vatpMeshes   = [];
    this._vatpBasePos  = [];   // base world positions (Vector3, relative to group)
    this._vatpDirs     = [];   // outward radial unit vectors (XZ plane)
    this._vatpPhase    = 0;

    const R = P3D_CFG.A1_ENDO_RADIUS;
    for (let i = 0; i < 6; i++) {
      const a    = (i / 6) * Math.PI * 2;
      const m    = new THREE.Mesh(P3DGeoLib.cylinderThin, P3DMatLib.haStalk);
      const yOff = (Math.sin(a * 1.3) * 0.5) * R;
      const bx   = Math.cos(a) * R, bz = Math.sin(a) * R;
      m.position.set(bx, yOff, bz);
      m.lookAt(new THREE.Vector3(0, yOff, 0));
      m.rotateX(Math.PI / 2);
      m.scale.y = 0.45;   // shortened — ~0.40 units long at rest
      this._vatpMeshes.push(m);
      this._vatpBasePos.push(new THREE.Vector3(bx, yOff, bz));
      this._vatpDirs.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      this._vatpGroup.add(m);
    }
    this._group.add(this._vatpGroup);
  }

  // ── Interior H⁺ ion helpers ───────────────────────────────────────────

  _initInteriorGeos() {
    this._intCoreGeo = new THREE.SphereGeometry(0.08, 7, 7);
    this._intRingGeo = new THREE.TorusGeometry(0.16, 0.012, 7, 24);
    this._intElecGeo = new THREE.SphereGeometry(0.038, 5, 5);
    this._intCoreMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 });
    this._intRingMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    this._intElecMat = new THREE.MeshLambertMaterial({ color: 0xffee44, emissive: 0x443300 });
    this._interiorGeosReady = true;
  }

  /**
   * Return world-space tip positions for all 6 V-ATPase pumps.
   * Tips are ~0.65 units past the pump base in the outward direction.
   * @returns {THREE.Vector3[]}
   */
  getPumpTipPositions() {
    const tips = [];
    for (let i = 0; i < 6; i++) {
      const local = this._vatpBasePos[i].clone()
        .addScaledVector(this._vatpDirs[i], 0.65);
      tips.push(this._group.localToWorld(local));
    }
    return tips;
  }

  /**
   * Spawn one small H⁺ atom model inside the endosome.
   * Called when the pump successfully picks up an exterior ion.
   */
  addHIon() {
    if (!this._interiorGeosReady) this._initInteriorGeos();

    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(this._intCoreGeo, this._intCoreMat));

    const ring = new THREE.Mesh(this._intRingGeo, this._intRingMat);
    ring.rotation.x = Math.PI / 5.1;
    grp.add(ring);

    const elec = new THREE.Mesh(this._intElecGeo, this._intElecMat);
    elec.position.set(0.16, 0, 0);
    ring.add(elec);

    // Uniform random position inside the endosome interior
    const r     = P3D_CFG.A1_ENDO_RADIUS * 0.62;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const rr    = r * Math.cbrt(Math.random());
    grp.position.set(
      rr * Math.sin(phi) * Math.cos(theta),
      rr * Math.sin(phi) * Math.sin(theta),
      rr * Math.cos(phi)
    );
    this._group.add(grp);
    this._interiorIons.push({ group: grp, ring, phase: Math.random() * Math.PI * 2 });
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

    // Clathrin: slow rotation + opacity fade pH 7.4 → 6.5
    const cf = Math.max(0, Math.min(1, (pH - 6.5) / (7.4 - 6.5)));
    this._clathrinRotY = (this._clathrinRotY + dt * 0.15) % (Math.PI * 2);
    this._clathrinGroup.rotation.y = this._clathrinRotY;
    this._clathrinGroup.visible    = cf > 0.02;
    if (cf > 0.02) {
      P3DMatLib.clathrin.opacity     = cf * 0.70;
      P3DMatLib.clathrinNode.opacity = cf * 0.65;
    }

    // V-ATPase pump animation — staggered piston strokes, rate scales with pH drop
    this._vatpPhase += dt * (3.5 + Math.max(0, (7.4 - pH)) * 1.2);
    for (let i = 0; i < this._vatpMeshes.length; i++) {
      const m       = this._vatpMeshes[i];
      const stagger = i * (Math.PI * 2 / 6);
      // Half-rectified sine: smooth outward extension, sharp retract — pump stroke feel
      const stroke  = Math.max(0, Math.sin(this._vatpPhase + stagger));
      m.scale.y = 0.45 + 0.25 * stroke;
      m.position.copy(this._vatpBasePos[i])
        .addScaledVector(this._vatpDirs[i], 0.18 * stroke);
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

    // Animate interior H⁺ ions
    const tNow = performance.now() * 0.001;
    for (const ion of this._interiorIons) {
      ion.group.rotation.y += dt * 0.7;
      ion.ring.rotation.z  += dt * 2.0;
      ion.group.position.y += Math.sin(tNow * 1.5 + ion.phase) * 0.003 * dt * 60;
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
    // Dispose only locally-owned resources
    this._rab5Mat.dispose();
    this._rab7Mat.dispose();
    if (this._clathrinEdgesGeo) this._clathrinEdgesGeo.dispose();
    // HA trimer geo/mat (stalks and heads are children of _group, removed above)
    if (this._haStemGeo)   { this._haStemGeo.dispose(); this._haHeadGeo.dispose(); this._haTrimerMat.dispose(); }
    // Interior H⁺ ions — groups are children of _group (removed above)
    this._interiorIons = [];
    if (this._interiorGeosReady) {
      this._intCoreGeo.dispose(); this._intRingGeo.dispose(); this._intElecGeo.dispose();
      this._intCoreMat.dispose(); this._intRingMat.dispose(); this._intElecMat.dispose();
    }
    // Shared geo/mat (endoSphere, clathrin, clathrinArm, clathrinNode, virusSphere, haStalk, cylinderThin) left to P3DGeoLib/MatLib
  }
}
