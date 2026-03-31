'use strict';
/**
 * vi_p3d_a2_mol.js — Real PDB structure viewer for Act 2 phase transition cards.
 *
 * Uses $3Dmol (already loaded by viral_infiltration.html) to render three
 * simultaneously-spinning RCSB structures from Benton et al., Nature 2020
 * (doi:10.1038/s41586-020-2333-6), labeled X · Y · Z.
 *
 * PDB mapping — a sliding window of 3 consecutive conformational states per phase:
 *   Phase A: X=6Y5G  Y=6Y5I  Z=6Y5J   (pre-fusion → early loosening)
 *   Phase B: X=6Y5G  Y=6Y5I  Z=6Y5J   (same early window)
 *   Phase C: X=6Y5I  Y=6Y5J  Z=6Y5K   (mid-transition window)
 *   Phase D: X=6Y5J  Y=6Y5K  Z=1QU1   (late window)
 *   Phase E: X=6Y5J  Y=6Y5K  Z=1QU1   (same late window — fusion committed)
 *
 * Public API  (window.A2MolViewer):
 *   .show(x, y, w, h, phaseIdx)  — position overlay and load all three structures
 *   .setAlpha(a)                 — sync CSS opacity with canvas card fade
 *   .hide()                      — collapse overlay on card dismiss
 *   .destroy()                   — full teardown when Act 2 ends
 *   .ready                       — true when $3Dmol is available
 *   .panelCenters(animX, animW)  — returns [cx0, cx1, cx2] for label drawing
 */
window.A2MolViewer = (() => {

  // ── PDB triples per phase [X, Y, Z] ───────────────────────────────────────
  // One PDB per phase — all three panels show the same structure, different view angles
  const PHASE_PDBS = [
    ['6Y5G', '6Y5G', '6Y5G'],   // Phase A — pre-fusion / native HA
    ['6Y5I', '6Y5I', '6Y5I'],   // Phase B — early head loosening
    ['6Y5J', '6Y5J', '6Y5J'],   // Phase C — coiled-coil extension
    ['6Y5K', '6Y5K', '6Y5K'],   // Phase D — extended intermediate
    ['1QU1', '1QU1', '1QU1'],   // Phase E — post-fusion / hairpin
  ];

  // ── Config ─────────────────────────────────────────────────────────────────
  const BG_COLOR    = '#080c1e';
  const PANEL_GAP   = 8;           // px between the three viewer panels
  const HA2_CHAINS  = ['B', 'D', 'F'];   // HA2 chain IDs in H3 trimers (typical)
  const FUSION_RESI = Array.from({ length: 20 }, (_, i) => i + 1);  // residues 1–20
  const FUSION_COLOR = '#ff5500';  // vivid orange for fusion loop

  // ── State ──────────────────────────────────────────────────────────────────
  let _container = null;
  let _divs      = [null, null, null];    // X, Y, Z viewer host elements
  let _viewers   = [null, null, null];    // $3Dmol GLViewer instances

  // ── DOM helpers ────────────────────────────────────────────────────────────

  function _ensureDOM() {
    if (_container) return;

    _container = document.createElement('div');
    Object.assign(_container.style, {
      position:      'fixed',
      display:       'none',
      zIndex:        '19',
      overflow:      'hidden',
      pointerEvents: 'none',
    });

    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position:      'absolute',
        top:           '0',
        bottom:        '0',
        pointerEvents: 'none',
      });
      _divs[i] = d;
      _container.appendChild(d);
    }
    document.body.appendChild(_container);
  }

  function _panelW(containerW) {
    return Math.floor((containerW - 2 * PANEL_GAP) / 3);
  }

  // ── 3Dmol helpers ──────────────────────────────────────────────────────────

  function _applyStyle(viewer) {
    viewer.setStyle({ hetflag: false }, { cartoon: { colorscheme: 'chain', opacity: 0.92 } });
    // Overlay vivid orange on fusion loop (HA2 N-terminus, residues 1–20)
    HA2_CHAINS.forEach(ch => {
      viewer.setStyle(
        { chain: ch, resi: FUSION_RESI, hetflag: false },
        { cartoon: { color: FUSION_COLOR, opacity: 0.98 } }
      );
    });
  }

  // X panel → x-axis spin; Y panel → z-axis spin (side view); Z panel → z-axis spin
  const PANEL_AXES    = ['x', 'z', 'z'];
  // Y panel (index 1) gets a 90° initial rotation around Y to show a side/lateral view
  const PANEL_PRETILT = [null, { deg: 90, axis: 'y' }, null];

  function _loadPDB(viewer, pdbCode, axis, pretilt) {
    viewer.removeAllModels();
    viewer.render();
    $3Dmol.download('pdb:' + pdbCode, viewer, {}, () => {
      _applyStyle(viewer);
      viewer.zoomTo();
      if (pretilt) viewer.rotate(pretilt.deg, pretilt.axis);
      viewer.render();
      viewer.spin(axis, 1);
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Position the three-panel overlay and load PDB structures for phaseIdx.
   * x/y/w/h are in CSS fixed-position pixels.
   * Call once per card (boss guards with _card._molShown).
   */
  function show(x, y, w, h, phaseIdx) {
    if (!window.$3Dmol) return;
    _ensureDOM();

    const pw = _panelW(w);

    // Position + reveal container
    Object.assign(_container.style, {
      display: 'block',
      left:    x + 'px',
      top:     y + 'px',
      width:   w + 'px',
      height:  h + 'px',
      opacity: '1',
    });

    // Size and create/resize each viewer panel
    for (let i = 0; i < 3; i++) {
      _divs[i].style.left  = (i * (pw + PANEL_GAP)) + 'px';
      _divs[i].style.width = pw + 'px';

      if (!_viewers[i]) {
        _viewers[i] = $3Dmol.createViewer(_divs[i], { backgroundColor: BG_COLOR, antialias: true });
      } else {
        try { _viewers[i].resize(); } catch(e) {}
      }
    }

    // Load all three structures — each spins on its own axis with optional pretilt
    const pdbs = PHASE_PDBS[phaseIdx];
    for (let i = 0; i < 3; i++) {
      _loadPDB(_viewers[i], pdbs[i], PANEL_AXES[i], PANEL_PRETILT[i]);
    }
  }

  /** X-centers (in canvas/CSS px) of each panel — used by boss to draw X Y Z labels. */
  function panelCenters(animX, animW) {
    const pw = _panelW(animW);
    return [0, 1, 2].map(i => animX + i * (pw + PANEL_GAP) + pw / 2);
  }

  /** Sync overlay opacity with canvas card fade (called every frame). */
  function setAlpha(a) {
    if (_container) _container.style.opacity = String(a);
  }

  /** Hide overlay. Called on card dismiss / act complete. */
  function hide() {
    if (!_container) return;
    _container.style.display = 'none';
    _viewers.forEach(v => { try { if (v) v.spin(false); } catch(e) {} });
  }

  /** Full teardown — dispose viewers, remove DOM nodes. */
  function destroy() {
    hide();
    _viewers.forEach((v, i) => {
      try { if (v) { v.clear(); _viewers[i] = null; } } catch(e) {}
    });
    if (_container) { _container.remove(); _container = null; }
    _divs = [null, null, null];
  }

  /** Returns the [X, Y, Z] PDB codes for phaseIdx — used by boss to draw per-panel labels. */
  function pdbsForPhase(phaseIdx) {
    return PHASE_PDBS[phaseIdx] || ['', '', ''];
  }

  return {
    show,
    hide,
    setAlpha,
    destroy,
    panelCenters,
    pdbsForPhase,
    get ready() { return !!window.$3Dmol; },
  };
})();
