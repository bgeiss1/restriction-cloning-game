/**
 * vi_p4_nucleus.js — Nuclear environment for Phase 4.
 *
 * Builds and owns:
 *   - Floor (dark circle)
 *   - Nuclear envelope (two concentric torus rings)
 *   - 8 Nuclear pore complexes (NPC amber toruses on the envelope)
 *   - Heterochromatin blobs (opaque squished spheres, movement obstacles)
 *   - Euchromatin fibers (semi-transparent instanced cylinders)
 *   - Nucleolus (decorative dark sphere)
 *   - Environment lights (NPC point lights, nucleolus glow, overhead key light)
 *
 * API:
 *   P4Nucleus.init(scene)
 *   P4Nucleus.destroy()
 *   P4Nucleus.getHeteroObstacles()   → [{x, z, r}]
 *   P4Nucleus.getNPCPositions()      → [{x, z, mesh}]
 *   P4Nucleus.tick(dt)               — gentle ambient animations
 */

/* global THREE, P4_CFG */

const P4Nucleus = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let _scene   = null;
  let _root    = null;   // Group containing all nucleus objects
  let _geos    = [];     // for disposal
  let _mats    = [];     // for disposal
  let _lights  = [];     // PointLights added to scene

  let _npcMeshes    = [];  // {mesh, x, z, angle} one per NPC
  let _npcLights    = [];  // PointLights attached to NPCs

  let _t = 0;              // elapsed for animations

  // ── Geometry / material helpers ───────────────────────────────────────────
  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  function _mesh(geo, mat, castShadow, receiveShadow) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow    = !!castShadow;
    m.receiveShadow = !!receiveShadow;
    _root.add(m);
    return m;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
    _root  = new THREE.Group();
    _root.name = 'P4Nucleus';
    scene.add(_root);

    _buildFloor();
    _buildEnvelope();
    _buildNPCs();
    _buildHeterochromatin();
    _buildEuchromatin();
    _buildNucleolus();
    _buildLights();
  }

  function destroy() {
    // Remove lights from scene
    for (const l of _lights) {
      if (l.parent) l.parent.remove(l);
    }
    _lights  = [];
    _npcLights = [];

    // Remove root group (all child meshes) from scene
    if (_root && _root.parent) _root.parent.remove(_root);
    _root = null;

    // Dispose geometries and materials
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos  = [];
    _mats  = [];
    _npcMeshes = [];
    _scene = null;
  }

  function tick(dt) {
    _t += dt;

    // Gentle NPC glow pulse
    for (let i = 0; i < _npcLights.length; i++) {
      const base = P4_CFG.LIGHT_NPC_INTENSITY;
      _npcLights[i].intensity = base + 0.08 * Math.sin(_t * 1.8 + i * 0.9);
    }
  }

  /**
   * Returns bounding-sphere obstacle data for steering behaviour.
   * Each entry: { x, z, r } — polymerases steer around these.
   */
  function getHeteroObstacles() {
    return P4_CFG.HETERO_BLOBS.map(b => ({ x: b.x, z: b.z, r: b.bsr }));
  }

  /**
   * Returns NPC data for the export system (positions + mesh references).
   * Each entry: { x, z, angle, mesh }
   */
  function getNPCPositions() {
    return _npcMeshes.map(n => ({ x: n.x, z: n.z, angle: n.angle, mesh: n.mesh }));
  }

  // ── Build functions ───────────────────────────────────────────────────────

  function _buildFloor() {
    const geo = _geo(new THREE.CircleGeometry(P4_CFG.FLOOR_RADIUS, 72));
    // Subtle radial dark-to-slightly-lighter gradient via vertex colors
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:   P4_CFG.COL_FLOOR,
      side:    THREE.FrontSide,
    }));
    const floor = _mesh(geo, mat, false, true);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.name = 'floor';

    // Faint outer glow ring on the floor (slightly inside the envelope) to
    // give the nuclear boundary a sense of depth from the inside.
    const ringGeo = _geo(new THREE.RingGeometry(27.5, 29.8, 72));
    const ringMat = _mat(new THREE.MeshBasicMaterial({
      color:       0x221155,
      transparent: true,
      opacity:     0.18,
      side:        THREE.FrontSide,
      depthWrite:  false,
    }));
    const ring = _mesh(ringGeo, ringMat, false, false);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    ring.name = 'floorGlowRing';
  }

  function _buildEnvelope() {
    // Outer nuclear membrane
    const outerGeo = _geo(new THREE.TorusGeometry(
      P4_CFG.ENVELOPE_OUTER_R, P4_CFG.ENVELOPE_TUBE_OUTER, 10, 80
    ));
    const envMat = _mat(new THREE.MeshLambertMaterial({
      color:       P4_CFG.COL_ENVELOPE,
      transparent: true,
      opacity:     0.55,
      emissive:    new THREE.Color(P4_CFG.COL_ENVELOPE),
      emissiveIntensity: 0.12,
    }));
    const outer = _mesh(outerGeo, envMat, false, false);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = 0.6;
    outer.name = 'envelopeOuter';

    // Inner nuclear membrane (slightly smaller)
    const innerGeo = _geo(new THREE.TorusGeometry(
      P4_CFG.ENVELOPE_INNER_R, P4_CFG.ENVELOPE_TUBE_INNER, 10, 80
    ));
    const inner = _mesh(innerGeo, envMat, false, false);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.3;
    inner.name = 'envelopeInner';

    // Bridging spokes between the two membranes at each NPC location
    _buildEnvelopeSpokes();
  }

  function _buildEnvelopeSpokes() {
    const spokeGeo = _geo(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 4));
    const spokeMat = _mat(new THREE.MeshLambertMaterial({
      color:       0x5533cc,
      transparent: true,
      opacity:     0.5,
    }));
    for (let i = 0; i < P4_CFG.NPC_COUNT; i++) {
      const angle = (i / P4_CFG.NPC_COUNT) * Math.PI * 2;
      const r     = P4_CFG.NUCLEUS_RADIUS;
      const spoke = new THREE.Mesh(spokeGeo, spokeMat);
      spoke.position.set(Math.cos(angle) * r, 0.45, Math.sin(angle) * r);
      spoke.name = `spoke_${i}`;
      _root.add(spoke);
    }
  }

  function _buildNPCs() {
    const npcGeo = _geo(new THREE.TorusGeometry(
      P4_CFG.NPC_MAJOR_RADIUS, P4_CFG.NPC_TUBE_RADIUS, 10, 24
    ));
    const npcMat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_NPC,
      emissive:          new THREE.Color(P4_CFG.COL_NPC),
      emissiveIntensity: 0.45,
    }));

    // Inner glow disc
    const glowGeo = _geo(new THREE.CircleGeometry(P4_CFG.NPC_MAJOR_RADIUS * 0.75, 16));
    const glowMat = _mat(new THREE.MeshBasicMaterial({
      color:       P4_CFG.COL_NPC,
      transparent: true,
      opacity:     0.18,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    }));

    const n   = P4_CFG.NPC_COUNT;
    const r   = P4_CFG.NUCLEUS_RADIUS;
    const y   = P4_CFG.NPC_HEIGHT;

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const x     = Math.cos(angle) * r;
      const z     = Math.sin(angle) * r;

      const npc = new THREE.Mesh(npcGeo, npcMat);
      npc.position.set(x, y, z);
      // Lay the torus flat (ring visible from top) then tilt it slightly
      // toward the center so the isometric view shows depth.
      npc.rotation.x = -Math.PI / 2;
      npc.name = `npc_${i}`;
      _root.add(npc);

      // Glow disc inside the ring
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, y + 0.01, z);
      glow.name = `npcGlow_${i}`;
      _root.add(glow);

      // PointLight at each NPC — gives amber glow to the surrounding envelope
      const pl = new THREE.PointLight(
        P4_CFG.COL_NPC,
        P4_CFG.LIGHT_NPC_INTENSITY,
        P4_CFG.LIGHT_NPC_DIST
      );
      pl.position.set(x, y + 0.5, z);
      _scene.add(pl);
      _lights.push(pl);
      _npcLights.push(pl);

      _npcMeshes.push({ mesh: npc, x, z, angle });
    }
  }

  function _buildHeterochromatin() {
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:   P4_CFG.COL_HET_CHROM,
      opacity: 1.0,
    }));

    for (const b of P4_CFG.HETERO_BLOBS) {
      // Use a sphere squished vertically to look like a dense chromatin mass
      const geo = _geo(new THREE.SphereGeometry(1, 12, 8));
      const blob = new THREE.Mesh(geo, mat);
      blob.position.set(b.x, 0.0, b.z);
      blob.scale.set(b.rx, b.ry, b.rz);
      blob.name = 'heterochromatin';
      _root.add(blob);

      // Dark cap on top
      const capGeo = _geo(new THREE.SphereGeometry(0.98, 10, 6,
        0, Math.PI * 2, 0, Math.PI * 0.5));
      const capMat = _mat(new THREE.MeshLambertMaterial({
        color: 0x130e1e,
      }));
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(b.x, b.ry * 0.9, b.z);
      cap.scale.set(b.rx * 0.95, b.ry * 0.5, b.rz * 0.95);
      cap.name = 'heteroChromCap';
      _root.add(cap);
    }
  }

  function _buildEuchromatin() {
    // Single shared geometry and material for all fibers via InstancedMesh.
    // Individual lengths are baked into scale.y of each instance matrix.
    const geo = _geo(new THREE.CylinderGeometry(
      P4_CFG.EU_FIBER_RADIUS, P4_CFG.EU_FIBER_RADIUS, 1.0, 4, 1
    ));
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:       P4_CFG.COL_EU_CHROM,
      transparent: true,
      opacity:     0.32,
      depthWrite:  false,
    }));

    // Count total fibers
    let total = 0;
    for (const c of P4_CFG.EU_CLUSTERS) total += c.n;

    const inst = new THREE.InstancedMesh(geo, mat, total);
    inst.name = 'euchromatin';
    _root.add(inst);

    const dummy  = new THREE.Object3D();
    const spread = P4_CFG.EU_FIBER_SPREAD;
    let idx = 0;

    // Seeded LCG so layout is deterministic each run
    let seed = 0xdeadbeef;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 0) / 0x100000000);
    };

    for (const cluster of P4_CFG.EU_CLUSTERS) {
      for (let i = 0; i < cluster.n; i++) {
        const ox = (rand() - 0.5) * 2 * spread;
        const oz = (rand() - 0.5) * 2 * spread;
        const len = P4_CFG.EU_FIBER_LENGTH_MIN +
                    rand() * (P4_CFG.EU_FIBER_LENGTH_MAX - P4_CFG.EU_FIBER_LENGTH_MIN);
        // Random tilt angles
        const rx = (rand() - 0.5) * Math.PI * 0.7;
        const rz = (rand() - 0.5) * Math.PI * 0.7;

        dummy.position.set(cluster.x + ox, len * 0.5, cluster.z + oz);
        dummy.rotation.set(rx, rand() * Math.PI, rz);
        dummy.scale.set(1, len, 1);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  function _buildNucleolus() {
    const pos = P4_CFG.NUCLEOLUS_POS;
    const r   = P4_CFG.NUCLEOLUS_RADIUS;

    // Main body — opaque dark magenta sphere
    const geo = _geo(new THREE.SphereGeometry(r, 18, 12));
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_NUCLEOLUS,
      emissive:          new THREE.Color(P4_CFG.COL_NUCLEOLUS),
      emissiveIntensity: 0.08,
    }));
    const body = _mesh(geo, mat, false, false);
    body.position.set(pos[0], pos[1] * 0.5, pos[2]);
    body.scale.y = 0.55;   // flatten slightly
    body.name = 'nucleolus';

    // Inner glow (back-face visible sphere, slightly smaller)
    const innerGeo = _geo(new THREE.SphereGeometry(r * 0.88, 14, 10));
    const innerMat = _mat(new THREE.MeshBasicMaterial({
      color:       0x6e1e6e,
      transparent: true,
      opacity:     0.22,
      side:        THREE.BackSide,
      depthWrite:  false,
    }));
    const inner = _mesh(innerGeo, innerMat, false, false);
    inner.position.set(pos[0], pos[1] * 0.5, pos[2]);
    inner.scale.y = 0.55;
    inner.name = 'nucleolusInner';

    // Dim PointLight
    const pl = new THREE.PointLight(
      P4_CFG.COL_NUCLEOLUS,
      P4_CFG.LIGHT_NUCLEOLUS_INT,
      P4_CFG.LIGHT_NUCLEOLUS_DIST
    );
    pl.position.set(pos[0], 2, pos[2]);
    _scene.add(pl);
    _lights.push(pl);
  }

  function _buildLights() {
    // Hemisphere overhead — cool sky, dark ground
    const hemi = new THREE.HemisphereLight(0xccccee, 0x080610, 0.30);
    hemi.name = 'p4HemiLight';
    _scene.add(hemi);
    _lights.push(hemi);

    // Ambient fill — keeps shadows from going totally black
    const amb = new THREE.AmbientLight(0xffffff, 0.18);
    amb.name = 'p4AmbLight';
    _scene.add(amb);
    _lights.push(amb);

    // Directional key light from above-front (matches camera angle)
    const dir = new THREE.DirectionalLight(0xdde0ff, 0.55);
    dir.position.set(5, 20, 10);
    dir.name = 'p4DirLight';
    _scene.add(dir);
    _lights.push(dir);
  }

  // ── Public object ─────────────────────────────────────────────────────────
  return { init, destroy, tick, getHeteroObstacles, getNPCPositions };

})();
