// vi_p3_surface.js — P3ViralSurface: viral sphere, HA trimers, M2 channels, vRNP segments
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js
'use strict';

class P3ViralSurface {

  // scene — the THREE.Scene owned by P3Escape
  // cfg   — P3_CFG reference
  constructor(scene, cfg) {
    this._scene = scene;
    this._cfg   = cfg;

    this._surfaceMesh  = null;
    this._haTrimers    = [];   // { group, stem, stemMat, heads, headMats, pepMeshes, pepMats, state, index, dir, laserLine }
    this._m2Channels   = [];   // { group, body, pore, bodyMat, poreMat, state, index, dir }
    this._vrnpSegments = [];   // { mesh, mat, index, health, extracted }

    this._build();
  }

  // ── Build ────────────────────────────────────────────────────────────────────
  _build() {
    this._buildSurface();
    this._buildHATrimers();
    this._buildM2Channels();
    this._buildVRNPSegments();
  }

  _buildSurface() {
    const cfg = this._cfg;
    const geo = new THREE.SphereGeometry(cfg.VIRAL_RADIUS, 32, 24);
    const mat = new THREE.MeshPhongMaterial({
      color:             cfg.COL_VIRAL_SURFACE,
      emissive:          0x001108,
      emissiveIntensity: 0.18,
      transparent:       true,
      opacity:           0.52,
      depthWrite:        false,
    });
    this._surfaceMesh = new THREE.Mesh(geo, mat);
    this._scene.add(this._surfaceMesh);
  }

  _buildHATrimers() {
    const cfg   = this._cfg;
    const R     = cfg.VIRAL_RADIUS;
    const count = cfg.HA_COUNT;

    for (let i = 0; i < count; i++) {
      // Sunflower distribution — even coverage across full sphere surface
      const phi   = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      const group = new THREE.Group();
      group.position.copy(dir.clone().multiplyScalar(R));
      // Align local +Y to point outward from sphere so the stem extends toward endosome wall
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      // Tag group so _identifyHit() can walk up from any child mesh
      // (p3ref backfilled below after trimerObj is created)
      group.userData = { p3type: 'ha', p3index: i, p3ref: null };

      // ── Stem (HA2 stalk) ───────────────────────────────────────────────────
      const stemGeo = new THREE.CylinderGeometry(0.07, 0.13, 0.88, 8);
      const stemMat = new THREE.MeshPhongMaterial({
        color:             cfg.COL_HA_BASE,
        emissive:          0x002211,
        emissiveIntensity: 0.18,
      });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.44;   // base flush with sphere surface, tip at y ≈ 0.88
      group.add(stem);

      // ── Three HA1 head domains at 120° around stem tip ────────────────────
      const heads    = [];
      const headMats = [];
      for (let j = 0; j < 3; j++) {
        const a   = (j / 3) * Math.PI * 2;
        const geo = new THREE.SphereGeometry(0.20, 10, 8);
        const mat = new THREE.MeshPhongMaterial({
          color:             cfg.COL_HA_BASE,
          emissive:          0x002211,
          emissiveIntensity: 0.15,
        });
        const head = new THREE.Mesh(geo, mat);
        head.position.set(Math.cos(a) * 0.23, 1.10, Math.sin(a) * 0.23);
        group.add(head);
        heads.push(head);
        headMats.push(mat);
      }

      // ── Fusion peptides (HA2 N-terminus) — hidden until pH activates ──────
      // Small pointed cones that emerge between the heads in the activated state.
      const pepMeshes = [];
      const pepMats   = [];
      for (let j = 0; j < 3; j++) {
        const a   = (j / 3) * Math.PI * 2 + Math.PI / 3;  // offset 60° from heads
        const geo = new THREE.ConeGeometry(0.055, 0.28, 6);
        const mat = new THREE.MeshPhongMaterial({
          color:             cfg.COL_HA_FUSION_PEP,
          emissive:          0x441122,
          emissiveIntensity: 0.5,
          transparent:       true,
          opacity:           0.0,   // fully hidden initially
        });
        const pep = new THREE.Mesh(geo, mat);
        // Tip aimed outward (cone points in +Y local = outward from stem center)
        pep.position.set(Math.cos(a) * 0.15, 0.80, Math.sin(a) * 0.15);
        group.add(pep);
        pepMeshes.push(pep);
        pepMats.push(mat);
      }

      this._scene.add(group);

      const trimerObj = {
        group,
        stem, stemMat,
        heads, headMats,
        pepMeshes, pepMats,
        state:     'native',   // 'native'|'pre-activated'|'transition'|'activated'|'fusion-ready'|'aimed'
        index:     i,
        dir:       dir.clone(),
        laserLine: null,       // THREE.Line added in Chunk 5 when aimed
      };

      // Backfill group userData ref
      group.userData.p3ref = trimerObj;
      this._haTrimers.push(trimerObj);
    }
  }

  _buildM2Channels() {
    const cfg   = this._cfg;
    const R     = cfg.VIRAL_RADIUS;
    const count = cfg.M2_COUNT;

    for (let i = 0; i < count; i++) {
      // Distribute M2 channels in a mid-latitude band, avoiding poles
      const phi   = Math.PI * (0.42 + (i * 0.11) % 0.32);
      const theta = (i / count) * Math.PI * 2 * 1.618;   // golden angle spacing

      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      const group = new THREE.Group();
      group.position.copy(dir.clone().multiplyScalar(R));
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      group.userData = { p3type: 'm2', p3index: i, p3ref: null };

      // ── Outer ring (membrane-spanning body) ───────────────────────────────
      const bodyGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.22, 14);
      const bodyMat = new THREE.MeshPhongMaterial({
        color:             cfg.COL_M2_CLOSED,
        emissive:          0x001133,
        emissiveIntensity: 0.30,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.11;
      group.add(body);

      // ── Inner pore indicator (state-colored center) ───────────────────────
      const poreGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10);
      const poreMat = new THREE.MeshPhongMaterial({
        color:             cfg.COL_M2_CLOSED,
        emissive:          0x001133,
        emissiveIntensity: 0.55,
        transparent:       true,
        opacity:           0.82,
      });
      const pore = new THREE.Mesh(poreGeo, poreMat);
      pore.position.y = 0.16;
      group.add(pore);

      this._scene.add(group);

      const chanObj = {
        group,
        body, bodyMat,
        pore, poreMat,
        state:        'closed',   // 'closed'|'open'|'burnout'
        index:        i,
        dir:          dir.clone(),
        openDuration: 0,          // seconds continuously open (used by M2 system, Chunk 4)
      };

      group.userData.p3ref = chanObj;
      this._m2Channels.push(chanObj);
    }
  }

  _buildVRNPSegments() {
    const cfg    = this._cfg;
    const count  = cfg.VRNP_COUNT;
    const colors = cfg.COL_VRNP;
    const R      = cfg.VIRAL_RADIUS;

    for (let i = 0; i < count; i++) {
      // Pack segments into the viral interior in two offset rings
      const angle  = (i / count) * Math.PI * 2;
      const ring   = (i < 4) ? 1 : 0;                      // 4 outer, 4 inner
      const radius = R * (ring === 1 ? 0.58 : 0.30);
      const yOff   = Math.sin(angle * 1.5 + ring) * R * 0.22;

      const geo = new THREE.CylinderGeometry(0.105, 0.105, 1.65, 8, 1);
      const mat = new THREE.MeshPhongMaterial({
        color:             colors[i] || cfg.COL_VRNP_BASE,
        emissive:          0x221100,
        emissiveIntensity: 0.25,
      });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(
        Math.cos(angle) * radius,
        yOff,
        Math.sin(angle) * radius
      );
      // Tilt each segment so they look tightly packed (not all perfectly upright)
      mesh.rotation.set(
        angle * 0.28,
        angle,
        angle * 0.18
      );

      this._scene.add(mesh);
      this._vrnpSegments.push({ mesh, mat, index: i, health: 100, extracted: false });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  getHATrimers()    { return this._haTrimers; }
  getM2Channels()   { return this._m2Channels; }
  getVRNPSegments() { return this._vrnpSegments; }

  destroy() {
    if (this._surfaceMesh) {
      this._surfaceMesh.geometry.dispose();
      this._surfaceMesh.material.dispose();
      this._scene.remove(this._surfaceMesh);
    }
    this._haTrimers.forEach(t => {
      t.group.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      if (t.laserLine) {
        t.laserLine.geometry.dispose();
        t.laserLine.material.dispose();
        this._scene.remove(t.laserLine);
      }
      this._scene.remove(t.group);
    });
    this._m2Channels.forEach(c => {
      c.group.traverse(ch => {
        if (ch.geometry) ch.geometry.dispose();
        if (ch.material) ch.material.dispose();
      });
      this._scene.remove(c.group);
    });
    this._vrnpSegments.forEach(v => {
      v.mesh.geometry.dispose();
      v.mesh.material.dispose();
      this._scene.remove(v.mesh);
    });
  }
}

// Self-register if P3Escape is already running (dynamic load scenario)
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.surface) {
  P3Escape.surface = new P3ViralSurface(P3Escape.scene, P3_CFG);
}
