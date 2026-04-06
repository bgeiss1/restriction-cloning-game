/**
 * vi_p4_templates.js — Phase 4 vRNP template segments.
 *
 * Builds 8 (or fewer, based on carryover) vRNP template objects arranged in a
 * central ring.  Each template consists of:
 *   - Amber-gold cylinder strand (orientated radially)
 *   - NP bead chain (small gold spheres along the strand)
 *   - Health bar (horizontal plane above the strand)
 *   - Hover tooltip showing segment gene + full label
 *   - Drag support (lifts to TEMPLATE_DRAG_Y, free XZ placement)
 *
 * API:
 *   P4Templates.init(scene, segmentCount)
 *   P4Templates.tick(dt)
 *   P4Templates.destroy()
 *   P4Templates.getAll()       → template[]
 *   P4Templates.getByIndex(i)  → template | null
 *
 * Template object shape:
 *   { group, strandMesh, hbFg, idx, x, z, angle,
 *     health: 0-100, isDragging: bool, baseY }
 */

/* global THREE, P4_CFG, P4Interaction */

const P4Templates = (() => {

  let _scene     = null;
  let _templates = [];
  let _t         = 0;

  // Shared geometry/material arrays for disposal
  let _geos = [];
  let _mats = [];

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Build one template ────────────────────────────────────────────────────

  function _buildTemplate(idx, total) {
    const angle  = (idx / total) * Math.PI * 2;
    const r      = P4_CFG.TEMPLATE_RING_RADIUS;
    const wx     = Math.cos(angle) * r;
    const wz     = Math.sin(angle) * r;
    const baseY  = 0.18;

    const group = new THREE.Group();
    group.position.set(wx, baseY, wz);
    // rotation.y = -angle aligns local +X with the radial direction
    group.rotation.y = -angle;
    _scene.add(group);

    // ── Strand ────────────────────────────────────────────────────────────
    const strandLen = P4_CFG.TEMPLATE_LENGTH;
    const strandGeo = _geo(new THREE.CylinderGeometry(
      P4_CFG.TEMPLATE_TUBE_RADIUS, P4_CFG.TEMPLATE_TUBE_RADIUS,
      strandLen, 8, 1
    ));
    const strandMat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_VRNA,
      emissive:          new THREE.Color(P4_CFG.COL_VRNA),
      emissiveIntensity: 0.15,
    }));
    const strandMesh = new THREE.Mesh(strandGeo, strandMat);
    strandMesh.rotation.z = Math.PI / 2;  // cylinder default axis is Y → lay along local X
    strandMesh.name = `template_strand_${idx}`;
    group.add(strandMesh);

    // ── NP bead chain ─────────────────────────────────────────────────────
    const beadGeo = _geo(new THREE.SphereGeometry(0.10, 6, 5));
    const beadMat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_NP,
      emissive:          new THREE.Color(P4_CFG.COL_NP),
      emissiveIntensity: 0.10,
    }));
    const nBeads = P4_CFG.TEMPLATE_NP_BEADS;
    for (let b = 0; b < nBeads; b++) {
      const frac  = b / (nBeads - 1);
      const bx    = (frac - 0.5) * strandLen;
      const bz    = (b % 2 === 0 ? 0.07 : -0.07);  // slight zigzag
      const bead  = new THREE.Mesh(beadGeo, beadMat);
      bead.position.set(bx, 0.11, bz);
      bead.name = `template_bead_${idx}_${b}`;
      group.add(bead);
    }

    // ── Health bar ────────────────────────────────────────────────────────
    const hbW = 1.2;
    const hbH = 0.10;

    const hbBgGeo = _geo(new THREE.PlaneGeometry(hbW, hbH));
    const hbBgMat = _mat(new THREE.MeshBasicMaterial({
      color: 0x1a1020, depthWrite: false, transparent: true, opacity: 0.80,
    }));
    const hbBg = new THREE.Mesh(hbBgGeo, hbBgMat);
    hbBg.rotation.x = -Math.PI / 2;
    hbBg.position.set(0, 0.85, 0);
    group.add(hbBg);

    const hbFgW   = hbW * 0.88;
    const hbFgGeo = _geo(new THREE.PlaneGeometry(hbFgW, hbH * 0.65));
    const hbFgMat = _mat(new THREE.MeshBasicMaterial({
      color: 0x44ee44, depthWrite: false, transparent: true, opacity: 0.90,
    }));
    const hbFg = new THREE.Mesh(hbFgGeo, hbFgMat);
    hbFg.rotation.x = -Math.PI / 2;
    hbFg.position.set(0, 0.86, 0);
    group.add(hbFg);

    // ── Template object (declared before callbacks so closures can ref it) ─
    const tmpl = {
      group, strandMesh, hbFg,
      strandMat, beadMat, hbFgMat,
      hbFgHalfW: hbFgW * 0.5,
      idx, x: wx, z: wz, angle,
      health: 100,
      isDragging: false,
      baseY,
    };

    // ── Hover / drag callbacks ────────────────────────────────────────────
    function _tooltipHTML() {
      return `<strong>${P4_CFG.SEGMENT_GENES[idx]}</strong><br>`
           + `<span style="color:#aaaaaa;font-size:0.68rem">`
           + `${P4_CFG.SEGMENT_LABELS[idx]}</span>`;
    }

    const callbacks = {
      dragPlaneY: P4_CFG.TEMPLATE_DRAG_Y,

      onHover(mesh, sx, sy) {
        strandMat.emissiveIntensity = 0.50;
        beadMat.emissiveIntensity   = 0.35;
        P4Interaction.showTooltip(_tooltipHTML(), sx, sy);
      },
      onHoverMove(mesh, sx, sy) {
        P4Interaction.showTooltip(_tooltipHTML(), sx, sy);
      },
      onHoverEnd() {
        strandMat.emissiveIntensity = 0.15;
        beadMat.emissiveIntensity   = 0.10;
        P4Interaction.hideTooltip();
      },
      onDragStart(mesh, worldPos) {
        group.position.y = P4_CFG.TEMPLATE_DRAG_Y;
        tmpl.isDragging  = true;
      },
      onDrag(mesh, worldPos) {
        const c = P4_CFG.CAM_PAN_CLAMP;
        group.position.x = Math.max(-c, Math.min(c, worldPos.x));
        group.position.z = Math.max(-c, Math.min(c, worldPos.z));
      },
      onDragEnd(mesh, worldPos) {
        group.position.y = baseY;
        tmpl.isDragging  = false;
      },
    };

    P4Interaction.register(strandMesh, callbacks);

    // Store callbacks ref on tmpl so setClickHandler can extend it in-place.
    tmpl.callbacks = callbacks;

    return tmpl;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, segmentCount) {
    _scene = scene;
    const n = Math.min(segmentCount || 8, 8);
    for (let i = 0; i < n; i++) {
      _templates.push(_buildTemplate(i, n));
    }
  }

  function tick(dt) {
    _t += dt;
    for (const tmpl of _templates) {
      // Gentle ambient float (suppressed while dragging)
      if (!tmpl.isDragging) {
        tmpl.group.position.y = tmpl.baseY
          + Math.sin(_t * 0.65 + tmpl.idx * 0.80) * 0.045;
      }

      // Update health bar scale and left-align pivot (clamp > 0 to avoid degenerate matrix)
      const fill = Math.max(0, Math.min(1, tmpl.health / 100));
      tmpl.hbFg.scale.x      = Math.max(0.001, fill);
      tmpl.hbFg.position.x   = (fill - 1) * tmpl.hbFgHalfW;
    }
  }

  function destroy() {
    for (const tmpl of _templates) {
      P4Interaction.unregister(tmpl.strandMesh);
      if (tmpl.group.parent) tmpl.group.parent.remove(tmpl.group);
    }
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _templates = [];
    _geos  = [];
    _mats  = [];
    _scene = null;
  }

  function getAll()      { return _templates; }
  function getByIndex(i) { return _templates[i] || null; }

  /**
   * Add an onClick handler to every template strand mesh.
   * Called by P4PolymeraseManager after init.
   * fn(templateIdx, worldPos)
   */
  function setClickHandler(fn) {
    for (const tmpl of _templates) {
      tmpl.callbacks.onClick = (mesh, worldPos) => fn(tmpl.idx, worldPos);
    }
  }

  return { init, tick, destroy, getAll, getByIndex, setClickHandler };

})();
