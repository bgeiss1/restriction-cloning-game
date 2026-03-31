'use strict';
/**
 * vi_p3d_a2_mol.js — Local PDB structure viewer for Act 2 phase transition cards.
 *
 * Loads pre-oriented PDB files from p3/act2/pdbs/ (saved from PyMOL) and renders
 * them in three simultaneously-spinning panels labeled X · Y · Z.
 *
 * Structures (Benton et al., Nature 583, 2020 · doi:10.1038/s41586-020-2333-6):
 *   Phase A — 6Y5G.pdb  (pre-fusion / native HA)
 *   Phase B — 6Y5I.pdb  (early head loosening)
 *   Phase C — 6Y5J.pdb  (coiled-coil extension)
 *   Phase D — 6Y5K.pdb  (extended intermediate)
 *   Phase E — 1QU1.pdb  (post-fusion hairpin)
 *
 * Drop oriented PDB files into:  p3/act2/pdbs/
 * Expected filenames:            6Y5G.pdb  6Y5I.pdb  6Y5J.pdb  6Y5K.pdb  1QU1.pdb
 *
 * ── Fusion loop config ────────────────────────────────────────────────────────
 * Update FUSION_LOOP_CFG below with the correct chain IDs and residue ranges
 * once you've inspected each structure in PyMOL.  Fusion loop residues are
 * rendered as bright orange spheres on top of the cartoon backbone.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Public API  (window.A2MolViewer):
 *   .show(x, y, w, h, phaseIdx)  — position overlay and load all three panels
 *   .setAlpha(a)                 — sync CSS opacity with canvas card fade
 *   .hide()                      — collapse overlay on card dismiss
 *   .destroy()                   — full teardown when Act 2 ends
 *   .ready                       — true when $3Dmol is available
 *   .panelCenters(animX, animW)  — returns [cx0, cx1, cx2] for label drawing
 *   .pdbsForPhase(phaseIdx)      — returns [code, code, code] for bottom label
 */
window.A2MolViewer = (() => {

  // ── Phase → PDB mapping ────────────────────────────────────────────────────
  // All three panels show the same structure; each panel spins on a different axis.
  const PHASE_PDBS = [
    '6Y5G',   // Phase A — pre-fusion / native HA
    '6Y5I',   // Phase B — early head loosening
    '6Y5J',   // Phase C — coiled-coil extension
    '6Y5K',   // Phase D — extended intermediate
    '1QU1',   // Phase E — post-fusion hairpin
  ];

  const PDB_DIR = 'p3/act2/pdbs/';

  // ── Fusion loop config ─────────────────────────────────────────────────────
  // For each PDB file, list the chain IDs and residue numbers that make up the
  // fusion loop (HA2 N-terminus).  Update these after inspecting in PyMOL.
  //
  // Example — to tell Claude: "for 6Y5G, the fusion loop is chain B residues 1-23,
  //   chain D residues 1-23, chain F residues 1-23"
  // → set: '6Y5G': { chains: ['B','D','F'], resi: [1,2,...,23] }
  //
  // If a structure's chain IDs differ (e.g. after PyMOL renaming), update here.
  // Set chains: [] to disable fusion loop highlighting for that structure.
  const FUSION_LOOP_CFG = {
    '6Y5G': { chains: ['B', 'D', 'F'], resi: Array.from({ length: 20 }, (_, i) => i + 1) },
    '6Y5I': { chains: ['B', 'D', 'F'], resi: Array.from({ length: 20 }, (_, i) => i + 1) },
    '6Y5J': { chains: ['B', 'D', 'F'], resi: Array.from({ length: 20 }, (_, i) => i + 1) },
    '6Y5K': { chains: ['B', 'D', 'F'], resi: Array.from({ length: 20 }, (_, i) => i + 1) },
    '1QU1': { chains: ['B', 'D', 'F'], resi: Array.from({ length: 20 }, (_, i) => i + 1) },
  };

  // ── Config ─────────────────────────────────────────────────────────────────
  const BG_COLOR     = '#080c1e';
  const PANEL_GAP    = 8;           // px between the three viewer panels
  const FUSION_COLOR = '#ff6600';   // bright orange for fusion loop spheres

  // X panel → x-axis spin; Y panel → z-axis spin (side view); Z panel → z-axis spin
  const PANEL_AXES    = ['x', 'z', 'z'];
  // Y panel (index 1) gets a 90° initial rotation around Y to show a side/lateral view
  const PANEL_PRETILT = [null, { deg: 90, axis: 'y' }, null];

  // ── State ──────────────────────────────────────────────────────────────────
  let _container = null;
  let _divs      = [null, null, null];
  let _viewers   = [null, null, null];

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

  function _applyStyle(viewer, pdbCode) {
    // Base cartoon — chain colours
    viewer.setStyle({ hetflag: false }, { cartoon: { colorscheme: 'chain', opacity: 0.92 } });

    // Fusion loop — bright orange spheres overlaid on cartoon
    const fl = FUSION_LOOP_CFG[pdbCode];
    if (fl && fl.chains.length > 0) {
      fl.chains.forEach(ch => {
        viewer.addStyle(
          { chain: ch, resi: fl.resi, hetflag: false },
          { sphere: { color: FUSION_COLOR, radius: 0.8, opacity: 1.0 } }
        );
      });
    }
  }

  function _loadLocal(viewer, pdbCode, axis, pretilt) {
    viewer.removeAllModels();
    viewer.render();

    fetch(PDB_DIR + pdbCode + '.pdb')
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + pdbCode + '.pdb');
        return r.text();
      })
      .then(data => {
        viewer.addModel(data, 'pdb');
        _applyStyle(viewer, pdbCode);
        viewer.zoomTo();
        if (pretilt) viewer.rotate(pretilt.deg, pretilt.axis);
        viewer.render();
        viewer.spin(axis, 1);
      })
      .catch(err => {
        console.warn('A2MolViewer: falling back to RCSB for', pdbCode, '—', err.message);
        // Fallback: fetch from RCSB if local file is missing
        $3Dmol.download('pdb:' + pdbCode, viewer, {}, () => {
          _applyStyle(viewer, pdbCode);
          viewer.zoomTo();
          if (pretilt) viewer.rotate(pretilt.deg, pretilt.axis);
          viewer.render();
          viewer.spin(axis, 1);
        });
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

    Object.assign(_container.style, {
      display: 'block',
      left:    x + 'px',
      top:     y + 'px',
      width:   w + 'px',
      height:  h + 'px',
      opacity: '1',
    });

    for (let i = 0; i < 3; i++) {
      _divs[i].style.left  = (i * (pw + PANEL_GAP)) + 'px';
      _divs[i].style.width = pw + 'px';

      if (!_viewers[i]) {
        _viewers[i] = $3Dmol.createViewer(_divs[i], { backgroundColor: BG_COLOR, antialias: true });
      } else {
        try { _viewers[i].resize(); } catch(e) {}
      }
    }

    const pdbCode = PHASE_PDBS[phaseIdx];
    for (let i = 0; i < 3; i++) {
      _loadLocal(_viewers[i], pdbCode, PANEL_AXES[i], PANEL_PRETILT[i]);
    }
  }

  /** X-centers (in canvas/CSS px) of each panel — used by boss to draw X Y Z labels. */
  function panelCenters(animX, animW) {
    const pw = _panelW(animW);
    return [0, 1, 2].map(i => animX + i * (pw + PANEL_GAP) + pw / 2);
  }

  /** Returns the PDB code for phaseIdx — used by boss for the bottom label. */
  function pdbsForPhase(phaseIdx) {
    const code = PHASE_PDBS[phaseIdx] || '';
    return [code, code, code];
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
