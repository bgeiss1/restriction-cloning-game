/**
 * vi_p4_resources.js — Phase 4 resource pools: NP, NS1, score (Chunk 6).
 *
 * Owns:
 *   - NP (nucleoprotein) pool — starts 0, grows via Seg5 translation
 *   - NS1 charge inventory  — starts 0, grows via Seg7 translation
 *   - Running score accumulator
 *   - NP visual spheres: InstancedMesh of 50 gold spheres drifting near the
 *     nucleolus, with visible count proportional to current NP pool
 *   - Left resource panel HUD (position:fixed, left side)
 *   - Updates the existing top-bar p4NpVal / p4PolyVal spans
 *
 * API:
 *   P4Resources.init(scene, carryover)
 *   P4Resources.tick(dt)
 *   P4Resources.destroy()
 *   P4Resources.getNP()           → number
 *   P4Resources.addNP(n)
 *   P4Resources.consumeNP(n)      → bool  (false if insufficient)
 *   P4Resources.getNS1()          → number
 *   P4Resources.addNS1(n)
 *   P4Resources.useNS1()          → bool
 *   P4Resources.addScore(n)
 *   P4Resources.getScore()        → number
 *   P4Resources.updateHUD()       — call after any pool change
 */

/* global THREE, P4_CFG, P4Polymerases, P4Transcription, P4ProteinProduction */

const P4Resources = (() => {

  let _scene = null;
  let _np    = 0;
  let _ns1   = 0;
  let _score = 0;
  let _t     = 0;
  let _geos  = [];
  let _mats  = [];

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── NP sphere InstancedMesh ───────────────────────────────────────────────

  const NUC_X    = P4_CFG.NUCLEOLUS_POS[0];
  const NUC_Z    = P4_CFG.NUCLEOLUS_POS[2];
  const NP_MAX_SPHERES = P4_CFG.NP_SPHERE_MAX_VISIBLE;   // 50
  const NP_SCALE_FACTOR = 2;   // 1 sphere per NP_SCALE_FACTOR NP
  const _dummy   = new THREE.Object3D();

  let _npMesh = null;

  // Precomputed drift orbits (one per instance)
  const _drifts = (() => {
    const arr = [];
    const rng = (() => { let s = 0x1a2b3c4d; return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();
    for (let i = 0; i < NP_MAX_SPHERES; i++) {
      arr.push({
        ax: 1.2 + rng() * 2.4,
        az: 1.2 + rng() * 2.4,
        ay: 0.25 + rng() * 0.35,
        fx: 0.18 + rng() * 0.28,
        fz: 0.22 + rng() * 0.28,
        fy: 0.12 + rng() * 0.18,
        px: rng() * Math.PI * 2,
        pz: rng() * Math.PI * 2,
        py: rng() * Math.PI * 2,
      });
    }
    return arr;
  })();

  function _buildNPMesh() {
    const geo = _geo(new THREE.SphereGeometry(0.09, 5, 4));
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_NP,
      emissive:          new THREE.Color(P4_CFG.COL_NP),
      emissiveIntensity: 0.20,
    }));
    _npMesh = new THREE.InstancedMesh(geo, mat, NP_MAX_SPHERES);
    _npMesh.count = 0;
    _npMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _npMesh.name  = 'np_spheres';
    _scene.add(_npMesh);
  }

  function _tickNPMesh() {
    if (!_npMesh) return;
    const visible = Math.min(NP_MAX_SPHERES, Math.floor(_np / NP_SCALE_FACTOR));
    for (let i = 0; i < visible; i++) {
      const d = _drifts[i];
      _dummy.position.set(
        NUC_X + Math.cos(_t * d.fx + d.px) * d.ax,
        0.35  + Math.sin(_t * d.fy + d.py) * d.ay,
        NUC_Z + Math.cos(_t * d.fz + d.pz) * d.az
      );
      _dummy.updateMatrix();
      _npMesh.setMatrixAt(i, _dummy.matrix);
    }
    _npMesh.count = visible;
    _npMesh.instanceMatrix.needsUpdate = true;
  }

  // ── Left resource panel HUD ───────────────────────────────────────────────

  let _panelEl = null;

  function _createPanel() {
    _panelEl = document.createElement('div');
    _panelEl.id = 'p4ResourcePanel';
    _panelEl.style.cssText = [
      'position:fixed;top:54px;left:14px',
      'pointer-events:none;z-index:310',
      'background:rgba(10,8,24,0.88)',
      'border:1px solid rgba(100,80,200,0.30)',
      'border-radius:6px;padding:8px 14px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:0.70rem;letter-spacing:0.05em',
      'color:#aaaacc;min-width:170px',
      'display:flex;flex-direction:column;gap:5px',
    ].join(';');
    document.body.appendChild(_panelEl);
    updateHUD();
  }

  function _destroyPanel() {
    if (_panelEl && _panelEl.parentNode) _panelEl.parentNode.removeChild(_panelEl);
    _panelEl = null;
  }

  function _barHTML(value, maxVal, color) {
    const pct = Math.min(100, Math.round((value / maxVal) * 100));
    return `<div style="
      width:100%;height:5px;background:rgba(255,255,255,0.08);
      border-radius:3px;overflow:hidden;margin-top:1px">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div>
    </div>`;
  }

  function updateHUD() {
    // ── Left panel ────────────────────────────────────────────────────────
    if (_panelEl) {
      const ntp  = (typeof P4Transcription !== 'undefined') ? P4Transcription.getNTP() : 0;
      const subs = (typeof P4ProteinProduction !== 'undefined')
        ? P4ProteinProduction.getSubunits() : { pb2: 0, pb1: 0, pa: 0 };
      const allReady = subs.pb2 >= 1 && subs.pb1 >= 1 && subs.pa >= 1;

      const subColor = allReady ? '#88ee88' : '#ccbbee';
      const pb2Dot = subs.pb2 > 0 ? `<span style="color:#cc9966">●×${subs.pb2}</span>` : '<span style="color:#443322">○</span>';
      const pb1Dot = subs.pb1 > 0 ? `<span style="color:#6688cc">●×${subs.pb1}</span>` : '<span style="color:#222244">○</span>';
      const paDot  = subs.pa  > 0 ? `<span style="color:#55bb77">●×${subs.pa}</span>`  : '<span style="color:#223322">○</span>';

      const ns1Dots = Array.from({length: Math.max(_ns1, 4)}, (_, i) =>
        i < _ns1 ? '●' : '○'
      ).join('');

      _panelEl.innerHTML = `
        <div style="color:#ccbbee;font-weight:600;font-size:0.72rem;margin-bottom:2px">RESOURCES</div>
        <div>NP &nbsp;<span style="color:#ffcc44;font-weight:700">${Math.floor(_np)}</span>
          ${_barHTML(_np, 100, '#ffcc44')}</div>
        <div>NTP <span style="color:#8888ff;font-weight:700">${Math.round(ntp)}</span>
          ${_barHTML(ntp, P4_CFG.NTP_START, '#6666ee')}</div>
        <div style="border-top:1px solid rgba(100,80,200,0.20);padding-top:4px;margin-top:1px">
          <span style="color:#888899">Subunits</span>
          ${allReady ? '<span style="color:#88ee88;font-size:0.62rem"> ★ READY</span>' : ''}
          <br>${pb2Dot} &nbsp;${pb1Dot} &nbsp;${paDot}
        </div>
        <div>NS1 <span style="color:#aa66ee">${ns1Dots}</span></div>
        <div style="border-top:1px solid rgba(100,80,200,0.20);padding-top:4px;margin-top:1px">
          Score <span style="color:#ffdd88;font-weight:700">${_score}</span>
        </div>`;
    }

    // ── Top bar existing elements ─────────────────────────────────────────
    const npEl   = document.getElementById('p4NpVal');
    const polyEl = document.getElementById('p4PolyVal');
    if (npEl)   npEl.textContent   = Math.floor(_np);
    if (polyEl) {
      const cnt = (typeof P4Polymerases !== 'undefined') ? P4Polymerases.getAll().length : '—';
      polyEl.textContent = cnt;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, carryover) {
    _scene = scene;
    _np    = 0;
    _ns1   = 0;
    _score = (carryover && carryover.act3 && carryover.act3.score) || 0;
    _buildNPMesh();
    _createPanel();
  }

  function tick(dt) {
    _t += dt;
    _tickNPMesh();
    // Refresh HUD every ~0.5s (driven by caller; full refresh is cheap)
  }

  function destroy() {
    _destroyPanel();
    if (_npMesh && _npMesh.parent) _npMesh.parent.remove(_npMesh);
    _npMesh = null;
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos  = [];
    _mats  = [];
    _scene = null;
  }

  function getNP()    { return _np; }
  function addNP(n)   { _np += n; updateHUD(); }
  function consumeNP(n) {
    if (_np < n) return false;
    _np -= n;
    updateHUD();
    return true;
  }

  function getNS1()   { return _ns1; }
  function addNS1(n)  { _ns1 += n; updateHUD(); }
  function useNS1()   {
    if (_ns1 <= 0) return false;
    _ns1--;
    updateHUD();
    return true;
  }

  function addScore(n) { _score += n; updateHUD(); }
  function getScore()  { return _score; }

  return {
    init, tick, destroy,
    getNP, addNP, consumeNP,
    getNS1, addNS1, useNS1,
    addScore, getScore,
    updateHUD,
  };

})();
