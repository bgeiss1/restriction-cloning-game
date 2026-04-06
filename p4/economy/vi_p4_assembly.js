/**
 * vi_p4_assembly.js — Phase 4 polymerase subunit assembly (Chunk 6).
 *
 * Watches PA/PB1/PB2 subunit inventory each tick.  When all three ≥ 1 and
 * no assembly is in progress, triggers auto-assembly:
 *   1. Flash "ASSEMBLY READY" toast
 *   2. Consume one of each subunit via P4ProteinProduction.consumeSubunits()
 *   3. Animate three lobe-spheres converging from offset positions near the
 *      nucleolus (1.2 s animation)
 *   4. On completion: spawn new idle RdRp at the assembly site via
 *      P4Polymerases.spawnPolymerase(wx, wz)
 *   5. Fire edu trigger RDRP_ASSEMBLED
 *
 * API:
 *   P4PolymeraseAssembly.init(scene)
 *   P4PolymeraseAssembly.tick(dt)
 *   P4PolymeraseAssembly.destroy()
 *
 * Educational triggers:
 *   RDRP_ASSEMBLED — when new polymerase becomes available
 */

/* global THREE, P4_CFG, P4ProteinProduction, P4Polymerases, P4Resources */

const P4PolymeraseAssembly = (() => {

  let _scene     = null;
  let _animating = false;
  let _animT     = 0;
  const ANIM_DUR = 1.2;   // seconds for convergence animation

  // Assembly site — just outside the nucleolus
  const ASM_X = P4_CFG.NUCLEOLUS_POS[0] + 4.5;
  const ASM_Z = P4_CFG.NUCLEOLUS_POS[2] + 1.5;

  // Three lobe spheres created during animation
  let _lobes = [];
  let _lobeMats = [];

  // Lobe start offsets (world-space, relative to assembly center)
  // PB2 from north, PB1 from southwest, PA from southeast
  const LOBE_STARTS = [
    { dx: 0,    dz: -3.5, color: P4_CFG.COL_PB2 },  // PB2
    { dx: -3.0, dz:  1.8, color: P4_CFG.COL_PB1 },  // PB1
    { dx:  3.0, dz:  1.8, color: P4_CFG.COL_PA  },  // PA
  ];

  // Toast banner
  let _toastEl = null;
  let _toastT  = 0;
  const TOAST_DUR = 2.5;

  function _showToast() {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.style.cssText = [
        'position:fixed;top:50%;left:50%',
        'transform:translate(-50%,-50%)',
        'pointer-events:none;z-index:500',
        'background:rgba(10,8,24,0.92)',
        'border:2px solid #88ee88',
        'border-radius:8px;padding:12px 28px',
        'color:#88ee88;font-weight:700;font-size:1.0rem;letter-spacing:0.12em',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'text-align:center',
        'display:none',
      ].join(';');
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = '★ RDRP ASSEMBLED';
    _toastEl.style.display = 'block';
    _toastEl.style.opacity = '1';
    _toastT = TOAST_DUR;
  }

  function _tickToast(dt) {
    if (!_toastEl || _toastT <= 0) return;
    _toastT -= dt;
    if (_toastT <= 0) {
      _toastEl.style.display = 'none';
    } else if (_toastT < 0.5) {
      _toastEl.style.opacity = (_toastT / 0.5).toFixed(3);
    }
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  function _startAnimation() {
    // Build three temporary lobe spheres
    const geo = new THREE.SphereGeometry(0.22, 9, 7);
    for (const ls of LOBE_STARTS) {
      const mat = new THREE.MeshLambertMaterial({
        color:             ls.color,
        emissive:          new THREE.Color(ls.color),
        emissiveIntensity: 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(ASM_X + ls.dx, 0.5, ASM_Z + ls.dz);
      _scene.add(mesh);
      _lobes.push(mesh);
      _lobeMats.push(mat);
    }
    _animating = true;
    _animT     = 0;
  }

  function _tickAnimation(dt) {
    _animT += dt;
    const frac = Math.min(1, _animT / ANIM_DUR);
    // Ease-out cubic
    const s = 1 - Math.pow(1 - frac, 3);

    for (let i = 0; i < _lobes.length; i++) {
      const ls = LOBE_STARTS[i];
      _lobes[i].position.set(
        ASM_X + ls.dx * (1 - s),
        0.5,
        ASM_Z + ls.dz * (1 - s)
      );
      // Bright pulse as they meet
      _lobeMats[i].emissiveIntensity = 0.55 + s * 1.0;
    }

    if (frac >= 1) {
      _finishAnimation();
    }
  }

  function _finishAnimation() {
    // Remove temp meshes
    const geo = _lobes[0] ? _lobes[0].geometry : null;
    for (const m of _lobes) {
      if (m.parent) m.parent.remove(m);
    }
    if (geo) geo.dispose();
    for (const mat of _lobeMats) mat.dispose();
    _lobes     = [];
    _lobeMats  = [];
    _animating = false;

    // Spawn new polymerase
    P4Polymerases.spawnPolymerase(ASM_X, ASM_Z);

    _showToast();

    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: { type: 'RDRP_ASSEMBLED' },
    }));

    // Refresh HUD to update polymerase count
    P4Resources.updateHUD();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene     = scene;
    _animating = false;
    _animT     = 0;
  }

  function tick(dt) {
    _tickToast(dt);

    if (_animating) {
      _tickAnimation(dt);
      return;
    }

    // Check if assembly is possible
    const subs = P4ProteinProduction.getSubunits();
    if (subs.pb2 >= 1 && subs.pb1 >= 1 && subs.pa >= 1) {
      if (P4ProteinProduction.consumeSubunits()) {
        _startAnimation();
      }
    }
  }

  function destroy() {
    const geo = _lobes[0] ? _lobes[0].geometry : null;
    for (const m of _lobes) {
      if (m.parent) m.parent.remove(m);
    }
    if (geo) geo.dispose();
    for (const mat of _lobeMats) mat.dispose();
    _lobes     = [];
    _lobeMats  = [];
    _animating = false;

    if (_toastEl && _toastEl.parentNode) _toastEl.parentNode.removeChild(_toastEl);
    _toastEl = null;
    _scene   = null;
  }

  return { init, tick, destroy };

})();
