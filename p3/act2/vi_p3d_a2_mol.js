'use strict';
/**
 * vi_p3d_a2_mol.js — Real PDB structure viewer for Act 2 phase transition cards.
 *
 * Uses $3Dmol (already loaded by viral_infiltration.html) to render live RCSB
 * structures from Benton et al., Nature 2020 (doi:10.1038/s41586-020-2333-6).
 *
 * Two persistent 3Dmol viewers cross-fade to show each conformational transition.
 *
 * PDB mapping (Benton et al., Nature 583, 2020):
 *   Phase A — 6Y5G  (native pre-fusion trimer, pH 7.4 conformation)
 *   Phase B — 6Y5G → 6Y5I  (pH-triggered HA1 head separation begins)
 *   Phase C — 6Y5I → 6Y5J  (stem exposure, coiled-coil primed)
 *   Phase D — 6Y5J → 6Y5K  (coiled-coil extension, FP targeted)
 *   Phase E — 6Y5K → 1QU1  (final post-fusion hairpin conformation)
 *
 * Public API  (window.A2MolViewer):
 *   .show(x, y, w, h, phaseIdx)  — position overlay and load structures (call once per card)
 *   .setAlpha(a)                 — sync CSS opacity with canvas card fade
 *   .hide()                      — collapse overlay on card dismiss
 *   .destroy()                   — full teardown when Act 2 ends
 *   .ready                       — true when $3Dmol is available
 */
window.A2MolViewer = (() => {

  // ── PDB pairs per phase card [fromCode, toCode | null] ─────────────────────
  const PHASE_PDBS = [
    ['6Y5G', null  ],   // Phase A — native pre-fusion
    ['6Y5G', '6Y5I'],   // Phase B — head loosening begins
    ['6Y5I', '6Y5J'],   // Phase C — stem exposure
    ['6Y5J', '6Y5K'],   // Phase D — coiled-coil fires + FP insertion
    ['6Y5K', '1QU1'],   // Phase E — final post-fusion hairpin
  ];

  // ── Config ─────────────────────────────────────────────────────────────────
  const BG_COLOR   = '#080c1e';   // matches card background rgba(8,12,30)
  const HOLD_S     = 3.5;        // seconds to display structure A before cross-fade
  const FADE_CSS   = '1.5s ease-in-out';
  const STYLE_PROT = { cartoon: { color: 'spectrum', opacity: 0.92 } };

  // ── State ──────────────────────────────────────────────────────────────────
  let _container = null;   // fixed overlay div
  let _divA      = null;   // slot A: "from" structure
  let _divB      = null;   // slot B: "to"   structure
  let _viewerA   = null;   // $3Dmol GLViewer for slot A
  let _viewerB   = null;   // $3Dmol GLViewer for slot B
  let _fadeTimer = null;   // setTimeout handle for cross-fade trigger

  // ── DOM helpers ────────────────────────────────────────────────────────────

  function _ensureDOM() {
    if (_container) return;

    _container = document.createElement('div');
    Object.assign(_container.style, {
      position:      'fixed',
      display:       'none',
      zIndex:        '19',       // above rhythm canvas (z-index 18)
      overflow:      'hidden',
      pointerEvents: 'none',     // all clicks pass through to canvas
      borderRadius:  '8px',
    });

    _divA = _mkSlot('1');
    _divB = _mkSlot('0');
    _container.appendChild(_divA);
    _container.appendChild(_divB);
    document.body.appendChild(_container);
  }

  function _mkSlot(opacity) {
    const d = document.createElement('div');
    Object.assign(d.style, {
      position:      'absolute',
      inset:         '0',
      pointerEvents: 'none',
      opacity:       opacity,
    });
    return d;
  }

  // ── 3Dmol helpers ──────────────────────────────────────────────────────────

  function _createViewers() {
    // Called after container is visible + sized so $3Dmol reads correct dimensions
    _viewerA = $3Dmol.createViewer(_divA, { backgroundColor: BG_COLOR, antialias: true });
    _viewerB = $3Dmol.createViewer(_divB, { backgroundColor: BG_COLOR, antialias: true });
  }

  function _loadPDB(viewer, pdbCode, onDone) {
    viewer.removeAllModels();
    viewer.render();
    $3Dmol.download('pdb:' + pdbCode, viewer, {}, () => {
      viewer.setStyle({ hetflag: false }, STYLE_PROT);
      viewer.zoomTo();
      viewer.render();
      viewer.spin('z', 1);
      if (onDone) onDone();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Position the overlay and begin loading PDB structures.
   * x/y/w/h are in CSS fixed-position pixels (= canvas pixels since canvas
   * is position:fixed at 100vw × 100vh with no DPR scaling).
   * Call once per card (boss guards with _card._molShown).
   */
  function show(x, y, w, h, phaseIdx) {
    if (!window.$3Dmol) return;
    _ensureDOM();
    clearTimeout(_fadeTimer);

    // Position + reveal container BEFORE creating viewers (so they size correctly)
    Object.assign(_container.style, {
      display: 'block',
      left:    x + 'px',
      top:     y + 'px',
      width:   w + 'px',
      height:  h + 'px',
      opacity: '1',
    });

    // Create on first call; resize on subsequent calls (window resize edge-case)
    if (!_viewerA) {
      _createViewers();
    } else {
      try { _viewerA.resize(); } catch(e) {}
      try { _viewerB.resize(); } catch(e) {}
    }

    // Reset cross-fade: slot A visible, slot B hidden (instant, no transition)
    _divA.style.transition = 'none';
    _divB.style.transition = 'none';
    _divA.style.opacity    = '1';
    _divB.style.opacity    = '0';

    const [pdbA, pdbB] = PHASE_PDBS[phaseIdx];

    // Load structure A immediately
    _loadPDB(_viewerA, pdbA);

    // Load structure B (if this card has a transition) and schedule cross-fade
    if (pdbB) {
      _loadPDB(_viewerB, pdbB, () => {
        // B is ready — schedule the fade after hold delay
        _fadeTimer = setTimeout(() => {
          _divA.style.transition = `opacity ${FADE_CSS}`;
          _divB.style.transition = `opacity ${FADE_CSS}`;
          _divA.style.opacity    = '0';
          _divB.style.opacity    = '1';
        }, HOLD_S * 1000);
      });
    }
  }

  /** Sync overlay opacity with canvas card fade (called every frame). */
  function setAlpha(a) {
    if (_container) _container.style.opacity = String(a);
  }

  /** Hide overlay. Called on card dismiss. */
  function hide() {
    clearTimeout(_fadeTimer);
    if (!_container) return;
    _container.style.display = 'none';
    try { if (_viewerA) _viewerA.spin(false); } catch(e) {}
    try { if (_viewerB) _viewerB.spin(false); } catch(e) {}
  }

  /** Full teardown — dispose viewers, remove DOM nodes. */
  function destroy() {
    hide();
    clearTimeout(_fadeTimer);
    try { if (_viewerA) { _viewerA.clear(); _viewerA = null; } } catch(e) {}
    try { if (_viewerB) { _viewerB.clear(); _viewerB = null; } } catch(e) {}
    if (_container) { _container.remove(); _container = null; }
    _divA = _divB = null;
  }

  return {
    show,
    hide,
    setAlpha,
    destroy,
    get ready() { return !!window.$3Dmol; },
  };
})();
