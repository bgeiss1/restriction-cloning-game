/**
 * vi_p4_polymerase.js — Phase 4 RdRp polymerase complex visuals.
 *
 * Each complex is a tri-lobe group (PA endonuclease, PB1 catalytic,
 * PB2 cap-binding) with idle bobbing animation and hover highlight.
 *
 * Initially one complex is docked at the 3′ end of each vRNP template
 * (positioned slightly outside the template ring).
 *
 * API:
 *   P4Polymerases.init(scene, segmentCount)
 *   P4Polymerases.tick(dt)
 *   P4Polymerases.destroy()
 *   P4Polymerases.getAll()       → poly[]
 *   P4Polymerases.getByIndex(i)  → poly | null
 *
 * Poly object shape:
 *   { group, lobeMeshes[], lobeMats[], idx,
 *     baseY, phase, assignedTemplate: idx | null,
 *     state: 'idle' | 'selected' | 'moving' | 'busy' }
 */

/* global THREE, P4_CFG, P4Interaction */

const P4Polymerases = (() => {

  let _scene = null;
  let _polys = [];
  let _t     = 0;

  let _geos           = [];
  let _mats           = [];
  let _polyCbs        = [];   // callbacks objects, one per poly (for setClickHandler)
  let _clickHandlerFn = null; // saved so dynamically spawned polys get it too

  // Shared lobe geometry (all polymerases reuse the same sphere geo)
  let _lobeGeo = null;

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Build one polymerase ──────────────────────────────────────────────────

  function _buildPolymerase(idx, total) {
    // Position just outside the template ring, at the template's 3′ end
    const angle  = (idx / total) * Math.PI * 2;
    const r      = P4_CFG.TEMPLATE_RING_RADIUS + P4_CFG.TEMPLATE_LENGTH * 0.5 + 0.55;
    const wx     = Math.cos(angle) * r;
    const wz     = Math.sin(angle) * r;
    const baseY  = 0.28;

    if (!_lobeGeo) {
      _lobeGeo = _geo(new THREE.SphereGeometry(P4_CFG.POLY_LOBE_RADIUS, 9, 7));
    }

    const group = new THREE.Group();
    group.position.set(wx, baseY, wz);
    group.rotation.y = -angle;   // match template orientation
    _scene.add(group);

    // ── Three lobes arranged in a triangular cluster ──────────────────────
    //  PB2 (orange) : front-center — cap-binding subunit, most forward
    //  PB1 (blue)   : back-left    — catalytic / elongation subunit
    //  PA  (green)  : back-right   — endonuclease subunit
    const off = P4_CFG.POLY_LOBE_OFFSET;
    const lobeData = [
      { name: 'PB2', color: P4_CFG.COL_PB2, px:  0,          py: 0, pz: -off        },
      { name: 'PB1', color: P4_CFG.COL_PB1, px: -off,         py: 0, pz:  off * 0.58 },
      { name: 'PA',  color: P4_CFG.COL_PA,  px:  off,         py: 0, pz:  off * 0.58 },
    ];

    const lobeMeshes = [];
    const lobeMats   = [];

    for (const ld of lobeData) {
      const mat = _mat(new THREE.MeshLambertMaterial({
        color:             ld.color,
        emissive:          new THREE.Color(ld.color),
        emissiveIntensity: 0.22,
      }));
      const mesh = new THREE.Mesh(_lobeGeo, mat);
      mesh.position.set(ld.px, ld.py, ld.pz);
      mesh.name = `poly_${idx}_${ld.name}`;
      group.add(mesh);
      lobeMeshes.push(mesh);
      lobeMats.push(mat);
    }

    // ── Hover callbacks (shared across all three lobe meshes) ─────────────
    const tooltipHTML = () =>
      `<strong>RdRp Complex ${idx + 1}</strong><br>`
      + `<span style="color:#aaaaaa;font-size:0.68rem">`
      + `<span style="color:#cc9966">PB2</span> cap-binding &nbsp;·&nbsp; `
      + `<span style="color:#6688cc">PB1</span> catalytic &nbsp;·&nbsp; `
      + `<span style="color:#55bb77">PA</span> endonuclease</span>`;

    const onHover = (mesh, sx, sy) => {
      for (const m of lobeMats) m.emissiveIntensity = 0.70;
      P4Interaction.showTooltip(tooltipHTML(), sx, sy);
    };
    const onHoverMove = (mesh, sx, sy) => {
      P4Interaction.showTooltip(tooltipHTML(), sx, sy);
    };
    const onHoverEnd = () => {
      for (const m of lobeMats) m.emissiveIntensity = 0.22;
      P4Interaction.hideTooltip();
    };

    // Share a single callbacks object across all lobe meshes so
    // setClickHandler can add onClick by mutating it in-place.
    const cbObj = { onHover, onHoverMove, onHoverEnd };
    _polyCbs.push(cbObj);
    for (const mesh of lobeMeshes) {
      P4Interaction.register(mesh, cbObj);
    }

    const poly = {
      group,
      lobeMeshes,
      lobeMats,
      idx,
      baseY,
      phase: idx * 0.72,   // stagger bobbing so they don't all move in sync
      assignedTemplate: idx,
      state: 'idle',       // 'idle' | 'selected' | 'moving' | 'busy'
      taskMode: 'transcription',  // 'transcription' | 'replication'
    };

    return poly;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, segmentCount) {
    _scene = scene;
    const n = Math.min(segmentCount || 8, 8);
    for (let i = 0; i < n; i++) {
      _polys.push(_buildPolymerase(i, n));
    }
  }

  function tick(dt) {
    _t += dt;
    for (const poly of _polys) {
      const bob = Math.sin(_t * P4_CFG.POLY_BOB_SPEED + poly.phase)
                * P4_CFG.POLY_BOB_AMPLITUDE;
      poly.group.position.y = poly.baseY + bob;

      // Slow yaw rotation while idle
      if (poly.state === 'idle') {
        poly.group.rotation.y -= dt * 0.18;
      }
    }
  }

  function destroy() {
    for (const poly of _polys) {
      for (const mesh of poly.lobeMeshes) {
        P4Interaction.unregister(mesh);
      }
      if (poly.group.parent) poly.group.parent.remove(poly.group);
    }
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _polys   = [];
    _geos    = [];
    _mats    = [];
    _polyCbs = [];
    _lobeGeo = null;
    _scene   = null;
  }

  function getAll()      { return _polys; }
  function getByIndex(i) { return _polys[i] || null; }

  /**
   * Add an onClick handler to every polymerase.
   * Called by P4PolymeraseManager after init.
   * fn(polyIdx, worldPos)
   */
  function setClickHandler(fn) {
    _clickHandlerFn = fn;
    _polyCbs.forEach((cb, idx) => {
      cb.onClick = (mesh, worldPos) => fn(idx, worldPos);
    });
  }

  /**
   * Dynamically spawn a new RdRp complex at world position (wx, wz).
   * Called by P4PolymeraseAssembly after a successful subunit assembly.
   * The new poly is immediately selectable by the player.
   */
  function spawnPolymerase(wx, wz) {
    const idx   = _polys.length;
    const angle = Math.atan2(wz, wx);
    const baseY = 0.28;

    if (!_lobeGeo) {
      _lobeGeo = _geo(new THREE.SphereGeometry(P4_CFG.POLY_LOBE_RADIUS, 9, 7));
    }

    const group = new THREE.Group();
    group.position.set(wx, baseY, wz);
    group.rotation.y = -angle;
    _scene.add(group);

    const off      = P4_CFG.POLY_LOBE_OFFSET;
    const lobeData = [
      { name: 'PB2', color: P4_CFG.COL_PB2, px:  0,   py: 0, pz: -off         },
      { name: 'PB1', color: P4_CFG.COL_PB1, px: -off,  py: 0, pz:  off * 0.58  },
      { name: 'PA',  color: P4_CFG.COL_PA,  px:  off,  py: 0, pz:  off * 0.58  },
    ];

    const lobeMeshes = [];
    const lobeMats   = [];
    for (const ld of lobeData) {
      const mat = _mat(new THREE.MeshLambertMaterial({
        color:             ld.color,
        emissive:          new THREE.Color(ld.color),
        emissiveIntensity: 0.22,
      }));
      const mesh = new THREE.Mesh(_lobeGeo, mat);
      mesh.position.set(ld.px, ld.py, ld.pz);
      mesh.name = `poly_${idx}_${ld.name}`;
      group.add(mesh);
      lobeMeshes.push(mesh);
      lobeMats.push(mat);
    }

    const tooltipHTML = () =>
      `<strong>RdRp Complex ${idx + 1}</strong> <span style="color:#88ee88;font-size:0.65rem">NEW</span><br>`
      + `<span style="color:#aaaaaa;font-size:0.68rem">`
      + `<span style="color:#cc9966">PB2</span> cap-binding &nbsp;·&nbsp; `
      + `<span style="color:#6688cc">PB1</span> catalytic &nbsp;·&nbsp; `
      + `<span style="color:#55bb77">PA</span> endonuclease</span>`;

    const cbObj = {
      onHover(m, sx, sy)     { for (const lm of lobeMats) lm.emissiveIntensity = 0.70; P4Interaction.showTooltip(tooltipHTML(), sx, sy); },
      onHoverMove(m, sx, sy) { P4Interaction.showTooltip(tooltipHTML(), sx, sy); },
      onHoverEnd()           { for (const lm of lobeMats) lm.emissiveIntensity = 0.22; P4Interaction.hideTooltip(); },
    };
    if (_clickHandlerFn) {
      cbObj.onClick = (mesh, worldPos) => _clickHandlerFn(idx, worldPos);
    }
    _polyCbs.push(cbObj);
    for (const mesh of lobeMeshes) P4Interaction.register(mesh, cbObj);

    const poly = {
      group, lobeMeshes, lobeMats,
      idx, baseY,
      phase:            idx * 0.72,
      assignedTemplate: null,   // no home template; player assigns freely
      state:            'idle',
      taskMode:         'transcription',
    };

    _polys.push(poly);
    return poly;
  }

  return { init, tick, destroy, getAll, getByIndex, setClickHandler, spawnPolymerase };

})();
