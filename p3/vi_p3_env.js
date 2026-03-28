// vi_p3_env.js — P3Environment: endosome interior, V-ATPase pumps, TLR nodes
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js
'use strict';

class P3Environment {

  // scene   — the THREE.Scene owned by P3Escape
  // cfg     — P3_CFG reference
  constructor(scene, cfg) {
    this._scene = scene;
    this._cfg   = cfg;
    this._t     = 0;      // total elapsed seconds (animation clock)

    // Endosome sphere
    this._endoGeo   = null;   // geometry (animated each frame)
    this._endoVerts = null;   // Float32Array copy of original vertex positions
    this._endoMesh  = null;

    // Outer cytoplasm shell (purely decorative)
    this._cytMesh  = null;

    // V-ATPase pump structs: { group, rotor, light, phase }
    this._vAtpases = [];

    // TLR sensor structs: { mesh, group, dir, index, state, ring, bodyMat }
    this._tlrNodes = [];

    // Lysosome (approaching from outside)
    this._lysoMesh  = null;
    this._lysoLight = null;

    // IFITM patches placed by integrity system
    this._ifitmMeshes = [];

    this._build();
  }

  // ── Build ────────────────────────────────────────────────────────────────────
  _build() {
    this._buildEndoSphere();
    this._buildCytoplasmShell();
    this._buildVAtpases();
    this._buildTLRNodes();
    this._buildLysosome();
  }

  _buildEndoSphere() {
    const cfg   = this._cfg;
    // Higher subdivision for smooth vertex animation (65×49 = 3185 verts)
    this._endoGeo = new THREE.SphereGeometry(cfg.ENDO_RADIUS, 64, 48);

    // Store pristine vertex positions as a reference for animation
    const origPos = this._endoGeo.attributes.position.array;
    this._endoVerts = new Float32Array(origPos.length);
    this._endoVerts.set(origPos);

    const mat = new THREE.MeshPhongMaterial({
      color:             0x2244aa,   // overridden each frame by applyPHColors
      emissive:          0x000811,
      emissiveIntensity: 0.15,
      transparent:       true,
      opacity:           0.28,
      side:              THREE.BackSide,
      depthWrite:        false,
    });
    this._endoMesh = new THREE.Mesh(this._endoGeo, mat);
    this._scene.add(this._endoMesh);
  }

  _buildCytoplasmShell() {
    const cfg = this._cfg;
    const geo = new THREE.SphereGeometry(cfg.CYTOPLASM_RADIUS, 32, 24);
    const mat = new THREE.MeshBasicMaterial({
      color:       cfg.COL_CYTOPLASM_BG,
      side:        THREE.BackSide,
      transparent: true,
      opacity:     0.92,
      depthWrite:  false,
    });
    this._cytMesh = new THREE.Mesh(geo, mat);
    this._scene.add(this._cytMesh);
  }

  _buildVAtpases() {
    const cfg   = this._cfg;
    const R     = cfg.ENDO_RADIUS;
    const count = 7;

    for (let i = 0; i < count; i++) {
      // Sunflower distribution avoids clustering at poles
      const phi   = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      const group = new THREE.Group();
      group.position.copy(dir.clone().multiplyScalar(R - 0.05));
      group.lookAt(0, 0, 0); // z-axis points inward toward origin

      // Stator ring (flat disc on the membrane)
      const statorGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 12);
      const statorMat = new THREE.MeshPhongMaterial({
        color: cfg.COL_VATPASE, emissive: 0x331100, emissiveIntensity: 0.4,
      });
      const stator = new THREE.Mesh(statorGeo, statorMat);
      stator.rotation.x = Math.PI / 2;  // disc lies in XY plane of group
      group.add(stator);

      // Rotor shaft (protrudes inward into the endosome lumen)
      const rotorGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.55, 8);
      const rotorMat = new THREE.MeshPhongMaterial({
        color: 0xffaa44, emissive: 0x551100, emissiveIntensity: 0.7,
      });
      const rotor = new THREE.Mesh(rotorGeo, rotorMat);
      rotor.position.z = -0.36; // inward
      rotor.rotation.x = Math.PI / 2;
      group.add(rotor);

      // Point light for acidic orange glow
      const light = new THREE.PointLight(cfg.COL_VATPASE, 0.35, 5);
      light.position.z = -0.5;
      group.add(light);

      this._scene.add(group);
      this._vAtpases.push({ group, rotor, light, phase: i * 0.87 });
    }
  }

  _buildTLRNodes() {
    const cfg   = this._cfg;
    const R     = cfg.ENDO_RADIUS;
    const count = cfg.TLR_COUNT;

    for (let i = 0; i < count; i++) {
      // Alternate between two latitude bands so sensors aren't all on the equator
      const phi   = Math.PI * (0.35 + (i % 2) * 0.18);
      const theta = (i / count) * Math.PI * 2 + (i % 2) * 0.6;

      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      const group = new THREE.Group();
      group.position.copy(dir.clone().multiplyScalar(R - 0.15));
      group.lookAt(0, 0, 0);

      // Sensor body
      const bodyGeo = new THREE.SphereGeometry(0.32, 12, 10);
      const bodyMat = new THREE.MeshPhongMaterial({
        color:             cfg.COL_TLR,
        emissive:          0x330066,
        emissiveIntensity: 0.5,
        transparent:       true,
        opacity:           0.9,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);

      // Scan ring — animated by scale, NOT by recreating geometry each frame
      const ringGeo = new THREE.TorusGeometry(0.5, 0.045, 6, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color:       cfg.COL_TLR_SCAN,
        transparent: true,
        opacity:     0.55,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;  // ring faces along group's local z-axis
      group.add(ring);

      // Soft point light for ambient TLR glow
      const glow = new THREE.PointLight(cfg.COL_TLR, 0.2, 6);
      group.add(glow);

      // Invisible hitbox sphere for easier targeting at endosome-wall distance
      const hitGeo = new THREE.SphereGeometry(0.52, 6, 4);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitbox = new THREE.Mesh(hitGeo, hitMat);
      group.add(hitbox);

      this._scene.add(group);

      const nodeObj = { mesh: body, group, dir, index: i,
                        state: 'idle', ring, ringMat, bodyMat, glow };
      // Tag the GROUP so any child hit (body, ring, hitbox) walks up and finds the type
      group.userData = { p3type: 'tlr', p3index: i, p3ref: nodeObj };
      this._tlrNodes.push(nodeObj);
    }
  }

  _buildLysosome() {
    const cfg = this._cfg;

    // Lysosome: starts far above and outside the endosome, approaches as timer runs down
    const geo = new THREE.SphereGeometry(2.8, 20, 16);
    const mat = new THREE.MeshPhongMaterial({
      color:             cfg.COL_LYSOSOME,
      emissive:          0x660000,
      emissiveIntensity: 0.9,
      transparent:       true,
      opacity:           0.0,   // fades in as the threat mounts
      depthWrite:        false,
    });
    this._lysoMesh  = new THREE.Mesh(geo, mat);
    this._scene.add(this._lysoMesh);

    // Red point light that pulses and strengthens as the lysosome closes in
    this._lysoLight = new THREE.PointLight(0xff2200, 0.0, 20);
    this._scene.add(this._lysoLight);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Returns array of TLR node objects (each has .mesh used by raycaster / integrity system)
  getTLRNodes() { return this._tlrNodes; }

  // Called every frame from P3Escape._updateSubSystems
  // lysosomeFraction: 1.0 = full timer remaining, 0.0 = expired
  update(dt, pH, lysosomeFraction) {
    this._t += dt;
    this._animateEndoMembrane(pH);
    this._animateVAtpases();
    this._animateTLRNodes();
    this._animateLysosome(lysosomeFraction);
  }

  // Called every frame from P3Escape._applyPHColors with the interpolated color state
  applyPHColors(c /*, pH */) {
    if (this._endoMesh) {
      this._endoMesh.material.color.setHex(c.membrane);
      this._endoMesh.material.opacity = c.memOpacity;
    }
  }

  // Place a new IFITM patch at a world-space position on the endosome wall.
  // Returns the mesh so the caller can remove it later.
  addIFITMPatch(center) {
    const geo = new THREE.CircleGeometry(this._cfg.IFITM_RADIUS, 20);
    const mat = new THREE.MeshBasicMaterial({
      color:       this._cfg.COL_IFITM,
      transparent: true,
      opacity:     0.55,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Orient the disc against the endosome surface (face inward toward origin)
    mesh.position.copy(center.clone().normalize().multiplyScalar(this._cfg.ENDO_RADIUS - 0.3));
    mesh.lookAt(0, 0, 0);
    this._scene.add(mesh);
    this._ifitmMeshes.push(mesh);
    return mesh;
  }

  removeIFITMPatch(mesh) {
    const idx = this._ifitmMeshes.indexOf(mesh);
    if (idx !== -1) this._ifitmMeshes.splice(idx, 1);
    mesh.geometry.dispose();
    mesh.material.dispose();
    this._scene.remove(mesh);
  }

  getIFITMPatches() { return this._ifitmMeshes; }

  destroy() {
    if (this._endoMesh) {
      this._endoGeo.dispose();
      this._endoMesh.material.dispose();
      this._scene.remove(this._endoMesh);
    }
    if (this._cytMesh) {
      this._cytMesh.geometry.dispose();
      this._cytMesh.material.dispose();
      this._scene.remove(this._cytMesh);
    }
    this._vAtpases.forEach(v => {
      v.group.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this._scene.remove(v.group);
    });
    this._tlrNodes.forEach(n => {
      n.group.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this._scene.remove(n.group);
    });
    if (this._lysoMesh) {
      this._lysoMesh.geometry.dispose();
      this._lysoMesh.material.dispose();
      this._scene.remove(this._lysoMesh);
    }
    if (this._lysoLight) this._scene.remove(this._lysoLight);
    this._ifitmMeshes.forEach(m => {
      m.geometry.dispose(); m.material.dispose();
      this._scene.remove(m);
    });
    this._endoVerts = null;
  }

  // ── Animation helpers ────────────────────────────────────────────────────────

  _animateEndoMembrane(pH) {
    if (!this._endoGeo || !this._endoVerts) return;

    const t    = this._t;
    // Ripple amplitude and speed increase as pH drops (more acidic = more turbulent)
    const amp  = 0.04 + (7.4 - pH) * 0.025;
    const freq = 0.35 + (7.4 - pH) * 0.06;

    const pos  = this._endoGeo.attributes.position;
    const orig = this._endoVerts;
    const n    = pos.count;

    for (let i = 0; i < n; i++) {
      const ox = orig[i * 3];
      const oy = orig[i * 3 + 1];
      const oz = orig[i * 3 + 2];

      // Radial distance from origin
      const r0 = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (r0 < 0.001) continue;

      // Two overlapping surface waves for an organic membrane feel
      const theta = Math.atan2(oz, ox);
      const phi   = Math.acos(Math.max(-1, Math.min(1, oy / r0)));
      const wave  = Math.sin(phi * 5.0 + t * freq) * Math.cos(theta * 4.0 + t * freq * 0.8)
                  + Math.sin(phi * 3.0 - t * freq * 0.6) * 0.4;

      const r = r0 + wave * amp;
      const s = r / r0;
      pos.setXYZ(i, ox * s, oy * s, oz * s);
    }

    pos.needsUpdate = true;
    // For BackSide rendering normals are flipped by Three.js — skip expensive recompute
  }

  _animateVAtpases() {
    const t = this._t;
    this._vAtpases.forEach(v => {
      // Rotate shaft to simulate F0 rotor turning
      v.rotor.rotation.z += 0.04 + Math.sin(t * 0.4 + v.phase) * 0.015;
      // Pulse emissive and light
      const pulse = 0.45 + Math.sin(t * 2.2 + v.phase) * 0.3;
      v.rotor.material.emissiveIntensity = pulse;
      v.light.intensity = 0.15 + pulse * 0.35;
    });
  }

  _animateTLRNodes() {
    const t   = this._t;
    const cfg = this._cfg;

    this._tlrNodes.forEach(n => {
      if (n.state === 'jammed') {
        n.bodyMat.emissiveIntensity = 0.04;
        n.ringMat.opacity           = 0.04;
        n.glow.intensity            = 0.0;
        return;
      }

      // Sensor body pulse
      const pulse = 0.3 + Math.sin(t * 1.6 + n.index * 1.3) * 0.2;
      n.bodyMat.emissiveIntensity = pulse;
      n.glow.intensity            = 0.12 + pulse * 0.15;

      // Scan ring expands outward continuously, fade as it expands
      const phase     = ((t * 0.75 + n.index * 0.63) % 1.0);  // 0→1 over ~1.33s
      const minR      = 0.5;
      const maxR      = cfg.TLR_SCAN_MAX_RADIUS;
      const targetScale = (minR + phase * (maxR - minR)) / minR;
      n.ring.scale.setScalar(targetScale);
      n.ringMat.opacity = 0.55 * (1 - phase * 0.8);
    });
  }

  _animateLysosome(lysosomeFraction) {
    if (!this._lysoMesh) return;

    // lysosomeFraction decreases from 1 → 0 as lysosome timer runs down
    const approach = 1 - lysosomeFraction;   // 0 = full timer, 1 = expired

    // Lysosome sits directly "above" the endosome from the player's perspective.
    // Starts at y=33 (well outside endosome, invisible), closes to y=21 (kissing the wall).
    const dist = 33 - approach * 12;         // 33 → 21
    this._lysoMesh.position.set(0, dist, 0);
    this._lysoLight.position.set(0, dist, 0);

    // Only become visible in the last ~60% of the timer
    const visLevel = Math.max(0, (approach - 0.4) / 0.6);
    this._lysoMesh.material.opacity = visLevel * 0.78;
    this._lysoLight.intensity       = visLevel * 2.0;

    // Slow rotation for visual interest
    this._lysoMesh.rotation.y += 0.004;
    this._lysoMesh.rotation.z += 0.002;
  }
}

// Self-register if P3Escape is already running (dynamic load scenario)
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.env) {
  P3Escape.env = new P3Environment(P3Escape.scene, P3_CFG);
}
