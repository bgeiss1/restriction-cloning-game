/**
 * vi_p4_mrna.js — Phase 4 mRNA product manager (Chunk 5).
 *
 * Manages the fully-transcribed viral mRNA products that float inside the
 * nucleus after a transcription run completes.
 *
 * Each mRNA product:
 *   - Orange TubeGeometry strand (fixed shape, slightly curled) + gold 5′ cap
 *     sphere + MRNA_POLYA_BEADS small spheres for the poly-A tail
 *   - Gently bobs and rotates while floating
 *   - Clickable: first click selects it (pulsing ring), second click on an
 *     NPC mesh routes it for export (via P4NPCExport.routeMRNA)
 *   - Auto-export mode ([X] key): newly spawned mRNAs are automatically
 *     routed to the NPC with the shortest queue
 *   - IFIT vulnerability flag (false by default; set true by Chunk 8 antiviral)
 *
 * API:
 *   P4MRNAProduct.init(scene)
 *   P4MRNAProduct.spawnMRNA(templateIdx, efficiency, wx, wz)   → mrna
 *   P4MRNAProduct.tick(dt)
 *   P4MRNAProduct.destroy()
 *   P4MRNAProduct.getSelected()       → mrna | null
 *   P4MRNAProduct.clearSelection()
 *   P4MRNAProduct.getAll()            → mrna[]
 *   P4MRNAProduct.remove(mrna)        — called by P4NPCExport on export complete
 *   P4MRNAProduct.setAutoExport(bool)
 *   P4MRNAProduct.getAutoExport()     → bool
 *
 * mRNA object shape:
 *   { idx, templateIdx, efficiency, ifit,
 *     group, strandMesh, strandMat, capMesh, beadMat, selRingMat,
 *     state: 'floating'|'selected'|'routed'|'exporting',
 *     bobPhase }
 */

/* global THREE, P4_CFG, P4Interaction, P4NPCExport */

const P4MRNAProduct = (() => {

  let _scene      = null;
  let _mrnas      = [];
  let _selected   = null;
  let _autoExport = false;
  let _nextIdx    = 0;
  let _t          = 0;

  let _geos = [];
  let _mats = [];

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Layout constants ──────────────────────────────────────────────────────

  const FLOAT_Y      = 1.15;
  const BOB_AMP      = 0.08;
  const BOB_SPEED    = 0.85;
  const YAW_SPEED    = 0.28;   // rad/s slow spin

  // ── Auto-export HUD ───────────────────────────────────────────────────────

  let _autoHudEl = null;

  function _createAutoHUD() {
    _autoHudEl = document.createElement('div');
    _autoHudEl.style.cssText = [
      'position:fixed;bottom:52px;right:18px;pointer-events:none;z-index:310',
      'background:rgba(10,8,24,0.82)',
      'border:1px solid rgba(100,80,200,0.30)',
      'border-radius:5px;padding:4px 12px',
      'color:#8888bb;font-size:0.65rem;letter-spacing:0.07em',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    _updateAutoHUD();
    document.body.appendChild(_autoHudEl);
  }

  function _updateAutoHUD() {
    if (!_autoHudEl) return;
    const stateSpan = _autoExport
      ? '<span style="color:#88ee88">ON</span>'
      : '<span style="color:#554466">OFF</span>';
    _autoHudEl.innerHTML =
      '[<span style="color:#ccbbee">X</span>] AUTO-EXPORT: ' + stateSpan;
  }

  function _destroyAutoHUD() {
    if (_autoHudEl && _autoHudEl.parentNode) _autoHudEl.parentNode.removeChild(_autoHudEl);
    _autoHudEl = null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  let _keyHandler = null;

  function _bindKeys() {
    _keyHandler = (e) => {
      if (e.code === 'KeyX') {
        _autoExport = !_autoExport;
        _updateAutoHUD();
        // Route all currently floating mRNAs immediately if turning on
        if (_autoExport) {
          for (const mrna of _mrnas) {
            if (mrna.state === 'floating' || mrna.state === 'selected') {
              if (mrna === _selected) _deselect();
              _autoRoute(mrna);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', _keyHandler);
  }

  function _unbindKeys() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────

  function _tooltipHTML(mrna) {
    const effMap = {
      optimal: '<span style="color:#44ff88">Optimal (full speed)</span>',
      short:   '<span style="color:#ffcc44">Short cap (−30 % speed)</span>',
      long:    '<span style="color:#ffaa22">Long cap (−25 pts)</span>',
    };
    return `<strong>${P4_CFG.SEGMENT_GENES[mrna.templateIdx]} mRNA</strong><br>`
         + `<span style="color:#aaaaaa;font-size:0.68rem">`
         + `${P4_CFG.SEGMENT_LABELS[mrna.templateIdx]}</span><br>`
         + `<span style="font-size:0.68rem">Cap: ${effMap[mrna.efficiency] || ''}</span><br>`
         + `<span style="color:#776699;font-size:0.65rem">`
         + (mrna.state === 'selected'
             ? 'Click an NPC to export'
             : 'Click to select → route to NPC')
         + '</span>';
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  function _onMRNAClick(mrna) {
    if (mrna.state === 'routed' || mrna.state === 'exporting') return;
    if (_selected === mrna) {
      _deselect();
    } else {
      if (_selected) _deselect();
      _select(mrna);
    }
  }

  function _select(mrna) {
    _selected      = mrna;
    mrna.state     = 'selected';
    mrna.selRingMat.opacity = 0.70;
  }

  function _deselect() {
    if (!_selected) return;
    if (_selected.state === 'selected') _selected.state = 'floating';
    _selected.selRingMat.opacity = 0;
    _selected = null;
  }

  // ── Auto-routing ──────────────────────────────────────────────────────────

  function _autoRoute(mrna) {
    const n = P4NPCExport.getNPCCount();
    if (n === 0) return;
    let bestIdx = 0, bestLen = Infinity;
    for (let i = 0; i < n; i++) {
      const len = P4NPCExport.getQueueLength(i);
      if (len < bestLen) { bestLen = len; bestIdx = i; }
    }
    mrna.state = 'routed';
    P4NPCExport.routeMRNA(mrna, bestIdx);
  }

  // ── Build one mRNA product ────────────────────────────────────────────────

  function _buildMRNA(idx, templateIdx, efficiency, wx, wz) {
    const group = new THREE.Group();
    group.position.set(wx, FLOAT_Y, wz);
    _scene.add(group);

    // ── Strand: orange TubeGeometry, slightly curled ──────────────────────
    const strandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,    0,     0),
      new THREE.Vector3(0.07, 0.38,  0.04),
      new THREE.Vector3(0,    0.78,  0),
    ]);
    const strandGeo  = _geo(new THREE.TubeGeometry(strandCurve, 8, 0.036, 5, false));
    const strandMat  = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_MRNA_PROD,
      emissive:          new THREE.Color(P4_CFG.COL_MRNA_PROD),
      emissiveIntensity: 0.20,
    }));
    const strandMesh = new THREE.Mesh(strandGeo, strandMat);
    strandMesh.name  = `mrna_strand_${idx}`;
    group.add(strandMesh);

    // ── 5′ cap: gold sphere at top ────────────────────────────────────────
    const capGeo  = _geo(new THREE.SphereGeometry(P4_CFG.MRNA_CAP_RADIUS * 1.25, 8, 6));
    const capMat  = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_MRNA_CAP,
      emissive:          new THREE.Color(P4_CFG.COL_MRNA_CAP),
      emissiveIntensity: 0.65,
    }));
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.position.set(0, 0.88, 0);
    capMesh.name  = `mrna_cap_${idx}`;
    group.add(capMesh);

    // ── Poly-A tail beads at bottom ───────────────────────────────────────
    const beadGeo = _geo(new THREE.SphereGeometry(0.045, 5, 4));
    const beadMat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_MRNA_PROD,
      emissive:          new THREE.Color(P4_CFG.COL_MRNA_PROD),
      emissiveIntensity: 0.12,
    }));
    for (let b = 0; b < P4_CFG.MRNA_POLYA_BEADS; b++) {
      const ang  = (b / P4_CFG.MRNA_POLYA_BEADS) * Math.PI * 2;
      const bead = new THREE.Mesh(beadGeo, beadMat);
      bead.position.set(
        Math.cos(ang) * 0.09,
        -0.06 - b * 0.055,
        Math.sin(ang) * 0.09
      );
      bead.name = `mrna_bead_${idx}_${b}`;
      group.add(bead);
    }

    // ── Selection ring (XZ plane, below strand) ───────────────────────────
    const selGeo = _geo(new THREE.RingGeometry(0.20, 0.30, 18));
    const selMat = _mat(new THREE.MeshBasicMaterial({
      color:       0xffdd88,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    }));
    const selRing = new THREE.Mesh(selGeo, selMat);
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = -0.12;
    group.add(selRing);

    const mrna = {
      idx, templateIdx, efficiency,
      group, strandMesh, strandMat, capMesh, beadMat,
      selRing, selRingMat: selMat,
      ifit: false,
      state: 'floating',
      bobPhase: Math.random() * Math.PI * 2,
    };

    // ── Hover / click registration ────────────────────────────────────────
    const cbObj = {
      onHover(mesh, sx, sy) {
        strandMat.emissiveIntensity = 0.55;
        capMat.emissiveIntensity    = 0.90;
        P4Interaction.showTooltip(_tooltipHTML(mrna), sx, sy);
      },
      onHoverMove(mesh, sx, sy) {
        P4Interaction.showTooltip(_tooltipHTML(mrna), sx, sy);
      },
      onHoverEnd() {
        strandMat.emissiveIntensity = 0.20;
        capMat.emissiveIntensity    = 0.65;
        P4Interaction.hideTooltip();
      },
      onClick(mesh, wp) { _onMRNAClick(mrna); },
    };
    P4Interaction.register(strandMesh, cbObj);
    P4Interaction.register(capMesh,    cbObj);

    return mrna;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
    _bindKeys();
    _createAutoHUD();
  }

  function spawnMRNA(templateIdx, efficiency, wx, wz) {
    const mrna = _buildMRNA(_nextIdx++, templateIdx, efficiency, wx, wz);
    _mrnas.push(mrna);

    if (_autoExport) {
      _autoRoute(mrna);
    }

    return mrna;
  }

  function tick(dt) {
    _t += dt;

    for (const mrna of _mrnas) {
      // Floating bob + slow rotation
      if (mrna.state === 'floating' || mrna.state === 'selected') {
        mrna.group.position.y =
          FLOAT_Y + Math.sin(_t * BOB_SPEED + mrna.bobPhase) * BOB_AMP;
        mrna.group.rotation.y += YAW_SPEED * dt;
      }
    }

    // Pulse selection ring
    if (_selected && _selected.selRingMat) {
      const op = 0.50 + 0.28 * Math.sin(_t * 4.2);
      _selected.selRingMat.opacity = op;
    }
  }

  function destroy() {
    for (const mrna of _mrnas) {
      P4Interaction.unregister(mrna.strandMesh);
      P4Interaction.unregister(mrna.capMesh);
      if (mrna.group.parent) mrna.group.parent.remove(mrna.group);
    }
    _mrnas    = [];
    _selected = null;

    _unbindKeys();
    _destroyAutoHUD();

    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos  = [];
    _mats  = [];
    _scene = null;
  }

  /** Route selected mRNA to an NPC (called when NPC is clicked by P4NPCExport). */
  function routeSelectedToNPC(npcIdx) {
    if (!_selected) return false;
    const mrna = _selected;
    _deselect();
    mrna.state = 'routed';
    P4NPCExport.routeMRNA(mrna, npcIdx);
    return true;
  }

  /** Remove a specific mRNA from the scene (called by P4NPCExport on export completion). */
  function remove(mrna) {
    P4Interaction.unregister(mrna.strandMesh);
    P4Interaction.unregister(mrna.capMesh);
    if (mrna.group.parent) mrna.group.parent.remove(mrna.group);
    if (_selected === mrna) _selected = null;
    const i = _mrnas.indexOf(mrna);
    if (i >= 0) _mrnas.splice(i, 1);
  }

  function getSelected()    { return _selected; }
  function clearSelection() { _deselect(); }
  function getAll()         { return _mrnas; }
  function setAutoExport(v) { _autoExport = v; _updateAutoHUD(); }
  function getAutoExport()  { return _autoExport; }

  return {
    init, spawnMRNA, tick, destroy,
    routeSelectedToNPC,
    remove,
    getSelected, clearSelection, getAll,
    setAutoExport, getAutoExport,
  };

})();
