'use strict';
class P3DHUD {
  constructor() {
    this._el       = {};   // keyed DOM elements
    this._eduQueue = [];
    this._eduTimer = 0;
    this._eduShowing = false;
    this._spaceListener = null;
  }

  init() {
    // Inject styles
    const style = document.createElement('style');
    style.id = 'p3dStyles';
    style.textContent = `
      #p3dHUD { position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:20;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',monospace; }
      #p3dHUD * { box-sizing:border-box; }
      .p3d-tl { position:absolute;top:14px;left:16px; }
      .p3d-tc { position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center; }
      .p3d-tr { position:absolute;top:14px;right:16px;text-align:right; }
      .p3d-bl { position:absolute;bottom:18px;left:16px; }
      .p3d-br { position:absolute;bottom:18px;right:16px;text-align:right; }
      .p3d-act-label { font-size:0.7rem;font-weight:700;letter-spacing:0.12em;color:#00ff88;text-transform:uppercase;opacity:0.85; }
      .p3d-obj { font-size:0.72rem;color:#a8c5a0;margin-top:3px;max-width:220px; }
      .p3d-ph-val { font-size:2.0rem;font-weight:700;color:#e8f5e9;letter-spacing:0.04em; }
      .p3d-depth { font-size:0.62rem;color:#a8c5a0;letter-spacing:0.10em;margin-top:2px; }
      .p3d-ph-bar { position:relative;width:160px;height:8px;border-radius:4px;background:linear-gradient(to right,#4488ff,#ff2222);margin:5px auto 0;border:1px solid rgba(255,255,255,0.15); }
      .p3d-ph-marker { position:absolute;top:-3px;width:4px;height:14px;background:#fff;border-radius:2px;transform:translateX(-50%); }
      .p3d-bar-wrap { margin-top:6px; }
      .p3d-bar-label { font-size:0.65rem;color:#a8c5a0;letter-spacing:0.08em; }
      .p3d-bar { width:140px;height:7px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-top:2px; }
      .p3d-bar-fill { height:100%;border-radius:3px;transition:width 0.2s; }
      .p3d-bar-fill.hp   { background:linear-gradient(to right,#ef5350,#66bb6a); }
      .p3d-bar-fill.alert { background:linear-gradient(to right,#66bb6a,#ffa726,#ef5350); }
      .p3d-bar-fill.ir   { background:#ef5350; }
      .p3d-bar-fill.prog { background:#00cc88; }
      .p3d-score { font-size:0.9rem;color:#C8A951;font-weight:700; }
      .p3d-inv { font-size:0.72rem;color:#e8f5e9; }
      .p3d-inv span { margin-right:10px; }
      /* Edu ticker */
      #p3dEdu { position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.72);border:1px solid rgba(200,169,81,0.28);border-radius:8px;
        padding:8px 16px;font-size:0.75rem;color:#e8f5e9;max-width:480px;text-align:center;
        transition:opacity 0.5s;pointer-events:none;line-height:1.5; }
      /* Damage vignette */
      #p3dVignette { position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;
        background:radial-gradient(ellipse at center,transparent 50%,rgba(239,83,80,0.55) 100%);
        opacity:0;transition:opacity 0.1s; }
      /* Near-miss flash */
      #p3dGoldFlash { position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;
        background:radial-gradient(ellipse at center,transparent 60%,rgba(200,169,81,0.4) 100%);
        opacity:0;transition:opacity 0.15s; }
      /* pH crossing wash */
      #p3dPHWash { position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 0.45s; }
      /* Game over / complete overlays */
      #p3dGameOver,#p3dComplete { position:absolute;top:0;left:0;width:100%;height:100%;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.82);padding:20px;pointer-events:auto;display:none; }
      .p3d-over-title { font-size:1.6rem;font-weight:700;color:#ef5350;margin-bottom:12px; }
      .p3d-comp-title { font-size:1.4rem;font-weight:700;color:#C8A951;margin-bottom:16px;letter-spacing:0.08em; }
      .p3d-stat-grid { display:grid;grid-template-columns:auto auto;gap:4px 24px;font-size:0.78rem;color:#e8f5e9;margin-bottom:16px; }
      .p3d-stat-grid dt { color:#a8c5a0; }
      .p3d-stat-grid dd { color:#e8f5e9;font-weight:600; }
      .p3d-section { font-size:0.65rem;font-weight:700;letter-spacing:0.12em;color:#00ff88;
        text-transform:uppercase;margin:8px 0 4px;border-top:1px solid rgba(200,169,81,0.18);padding-top:6px;width:100%;max-width:520px; }
      .p3d-continue { margin-top:18px;padding:12px 32px;background:#C8A951;color:#1a1a00;
        font-size:1.0rem;font-weight:700;border:none;border-radius:8px;cursor:pointer;pointer-events:auto; }
      .p3d-debrief { font-size:0.70rem;color:#a8c5a0;line-height:1.7;max-width:520px;text-align:left;max-height:200px;overflow-y:auto; }
    `;
    document.head.appendChild(style);

    // Build root
    const root = document.createElement('div');
    root.id = 'p3dHUD';
    document.body.appendChild(root);
    this._root = root;

    // ── Act 1 elements ────────────────────────────────────────────────
    const a1 = this._div(root, 'p3dA1');

    const tl1 = this._div(a1, null, 'p3d-tl');
    this._el.a1Label = this._el_(tl1, '<div class="p3d-act-label">ACT 1 · THE DESCENT</div>');
    this._el.a1Obj   = this._el_(tl1, '<div class="p3d-obj">Survive the descent — avoid lysosomes as the endosome acidifies</div>');

    const tc1 = this._div(a1, null, 'p3d-tc');
    this._el.a1PHVal  = this._el_(tc1, '<div class="p3d-ph-val">pH 7.4</div>');
    this._el.a1PHBarW = this._el_(tc1, '<div class="p3d-ph-bar"><div id="p3dPHMarker" class="p3d-ph-marker" style="left:0%"></div></div>');
    this._el.a1Depth  = this._el_(tc1, '<div class="p3d-depth">EARLY ENDOSOME</div>');

    const tr1 = this._div(a1, null, 'p3d-tr');
    tr1.innerHTML = `
      <div class="p3d-bar-wrap"><div class="p3d-bar-label">HP</div>
        <div class="p3d-bar"><div id="p3dHPFill" class="p3d-bar-fill hp" style="width:100%"></div></div></div>
      <div class="p3d-bar-wrap" style="margin-top:6px"><div class="p3d-bar-label">ALERT</div>
        <div class="p3d-bar"><div id="p3dAlertFill" class="p3d-bar-fill alert" style="width:0%"></div></div></div>`;
    this._el.hpFill    = document.getElementById('p3dHPFill');
    this._el.alertFill = document.getElementById('p3dAlertFill');

    const bl1 = this._div(a1, null, 'p3d-bl');
    this._el.a1Inv   = this._el_(bl1, '<div class="p3d-inv"><span id="p3dM2Ct">M2 ×0</span><span id="p3dNS1Ct">NS1 ×0</span></div>');
    this._el.m2Ct    = document.getElementById('p3dM2Ct');
    this._el.ns1Ct   = document.getElementById('p3dNS1Ct');

    const br1 = this._div(a1, null, 'p3d-br');
    this._el.a1Score = this._el_(br1, '<div class="p3d-score" id="p3dScore1">0</div>');
    this._el.a1Speed = this._el_(br1, '<div style="font-size:0.65rem;color:#a8c5a0;margin-top:2px" id="p3dSpeed">SPD ×1.0</div>');
    this._el.score1  = document.getElementById('p3dScore1');
    this._el.speed   = document.getElementById('p3dSpeed');

    // ── Act 2 elements ────────────────────────────────────────────────
    const a2 = this._div(root, 'p3dA2');
    a2.style.display = 'none';

    const tl2 = this._div(a2, null, 'p3d-tl');
    this._el.a2Label = this._el_(tl2, '<div class="p3d-act-label">ACT 2 · CONFORMATIONAL CHANGE</div>');
    this._el.a2Phase = this._el_(tl2, '<div class="p3d-obj" id="p3dA2Phase">PHASE A: HEAD LOOSENING</div>');
    this._el.a2PhaseEl = document.getElementById('p3dA2Phase');

    const tc2 = this._div(a2, null, 'p3d-tc');
    this._el.a2PHVal  = this._el_(tc2, '<div class="p3d-ph-val" id="p3dPH2">pH 5.3</div>');
    this._el.a2PHEl   = document.getElementById('p3dPH2');
    tc2.innerHTML += `<div class="p3d-bar-wrap" style="margin-top:6px">
      <div class="p3d-bar-label">PROGRESS</div>
      <div class="p3d-bar" style="width:160px"><div id="p3dProgFill" class="p3d-bar-fill prog" style="width:0%"></div></div></div>`;
    this._el.progFill = document.getElementById('p3dProgFill');

    const tr2 = this._div(a2, null, 'p3d-tr');
    tr2.innerHTML = `
      <div class="p3d-bar-label">RESISTANCE <span id="p3dIRVal">0/16</span></div>
      <div class="p3d-bar" style="width:140px"><div id="p3dIRFill" class="p3d-bar-fill ir" style="width:0%"></div></div>
      <div class="p3d-score" id="p3dScore2" style="margin-top:6px">0</div>`;
    this._el.irVal   = document.getElementById('p3dIRVal');
    this._el.irFill  = document.getElementById('p3dIRFill');
    this._el.score2  = document.getElementById('p3dScore2');

    const br2 = this._div(a2, null, 'p3d-br');
    br2.innerHTML = `<div class="p3d-inv" style="opacity:0.45"><span id="p3dM2Ct2">M2 ×0</span><span id="p3dNS1Ct2">NS1 ×0</span></div>`;
    this._el.m2Ct2  = document.getElementById('p3dM2Ct2');
    this._el.ns1Ct2 = document.getElementById('p3dNS1Ct2');

    // Combo counter (center, hidden by default)
    this._el.combo = this._el_(a2, '<div id="p3dCombo" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1.5rem;font-weight:700;color:#C8A951;text-shadow:0 0 8px rgba(200,169,81,0.7);display:none"></div>');
    this._el.comboEl = document.getElementById('p3dCombo');

    // ── Act 3 elements ────────────────────────────────────────────────
    const a3 = this._div(root, 'p3dA3');
    a3.style.display = 'none';
    const tl3 = this._div(a3, null, 'p3d-tl');
    this._el.a3Label = this._el_(tl3, '<div class="p3d-act-label">ACT 3 · THE ESCAPE</div>');
    const br3 = this._div(a3, null, 'p3d-br');
    this._el.a3Score = this._el_(br3, '<div class="p3d-score" id="p3dScore3">0</div>');
    this._el.score3 = document.getElementById('p3dScore3');

    // ── Shared elements ───────────────────────────────────────────────
    // Educational ticker
    const edu = document.createElement('div'); edu.id = 'p3dEdu'; edu.style.opacity = '0';
    root.appendChild(edu); this._el.edu = edu;

    // Screen effects
    ['p3dVignette','p3dGoldFlash','p3dPHWash'].forEach(id => {
      const d = document.createElement('div'); d.id = id; root.appendChild(d); this._el[id] = d;
    });

    // Game over / Complete screens
    const go = document.createElement('div'); go.id = 'p3dGameOver'; root.appendChild(go); this._el.gameOver = go;
    const cp = document.createElement('div'); cp.id = 'p3dComplete'; root.appendChild(cp); this._el.complete = cp;

    this._a1El = a1; this._a2El = a2; this._a3El = a3;
  }

  // ── Act switching ─────────────────────────────────────────────────────
  setAct(n) {
    this._a1El.style.display = n === 1 ? '' : 'none';
    this._a2El.style.display = n === 2 ? '' : 'none';
    this._a3El.style.display = n === 3 ? '' : 'none';
  }

  // ── Per-frame update helpers ──────────────────────────────────────────
  updatePH(pH) {
    const fmt = pH.toFixed(1);
    if (this._el.a1PHVal) this._el.a1PHVal.textContent = `pH ${fmt}`;
    if (this._el.a2PHEl)  this._el.a2PHEl.textContent  = `pH ${fmt}`;
    // Move pH bar marker (7.4 = left=0%, 4.8 = left=100%)
    const pct = Math.max(0, Math.min(100, ((7.4 - pH) / (7.4 - 4.8)) * 100)).toFixed(1);
    const marker = document.getElementById('p3dPHMarker');
    if (marker) marker.style.left = pct + '%';
    if (this._el.a1Depth) this._el.a1Depth.textContent = P3Descent._ph ? P3Descent._ph.getDepthLabel() : '';
  }

  updateHP(hp, max) {
    if (this._el.hpFill) this._el.hpFill.style.width = Math.max(0, hp / max * 100).toFixed(1) + '%';
  }

  updateAlert(pct) {
    if (this._el.alertFill) this._el.alertFill.style.width = Math.min(100, pct).toFixed(1) + '%';
  }

  updateIR(ir, max) {
    if (this._el.irVal)  this._el.irVal.textContent  = `${ir}/${max}`;
    if (this._el.irFill) this._el.irFill.style.width = Math.min(100, ir / max * 100).toFixed(1) + '%';
    if (ir >= 10 && this._el.irFill) this._el.irFill.style.animation = 'none';
  }

  updateScore(score) {
    const s = Math.floor(score).toLocaleString();
    if (this._el.score1) this._el.score1.textContent = s;
    if (this._el.score2) this._el.score2.textContent = s;
    if (this._el.score3) this._el.score3.textContent = s;
  }

  updateSpeed(frac) {
    if (this._el.speed) this._el.speed.textContent = `SPD ×${(frac).toFixed(1)}`;
  }

  updateInventory(m2, ns1) {
    if (this._el.m2Ct)   this._el.m2Ct.textContent   = `M2 ×${m2}`;
    if (this._el.ns1Ct)  this._el.ns1Ct.textContent  = `NS1 ×${ns1}`;
    if (this._el.m2Ct2)  this._el.m2Ct2.textContent  = `M2 ×${m2}`;
    if (this._el.ns1Ct2) this._el.ns1Ct2.textContent = `NS1 ×${ns1}`;
  }

  updateProgress(pct) {
    if (this._el.progFill) this._el.progFill.style.width = Math.min(100, pct).toFixed(1) + '%';
  }

  updateA2Phase(label) {
    if (this._el.a2PhaseEl) this._el.a2PhaseEl.textContent = label;
  }

  updateCombo(n) {
    const el = this._el.comboEl; if (!el) return;
    if (n >= 10) { el.textContent = `COMBO ×${n}`; el.style.display = ''; }
    else         { el.style.display = 'none'; }
  }

  // ── Screen effects ────────────────────────────────────────────────────
  showDamageFlash() {
    const v = this._el.p3dVignette; if (!v) return;
    v.style.opacity = '1';
    clearTimeout(this._vigTO);
    this._vigTO = setTimeout(() => { v.style.opacity = '0'; }, 120);
  }

  showNearMissFlash() {
    const g = this._el.p3dGoldFlash; if (!g) return;
    g.style.opacity = '1';
    clearTimeout(this._goldTO);
    this._goldTO = setTimeout(() => { g.style.opacity = '0'; }, 200);
  }

  showPHWash(hexColor) {
    const w = this._el.p3dPHWash; if (!w) return;
    w.style.background = '#' + hexColor.toString(16).padStart(6,'0');
    w.style.opacity = '0.35';
    clearTimeout(this._washTO);
    this._washTO = setTimeout(() => { w.style.opacity = '0'; }, 500);
  }

  // ── Educational ticker ────────────────────────────────────────────────
  showEduTicker(text) {
    const el = this._el.edu; if (!el) return;
    if (this._eduShowing) { this._eduQueue.push(text); return; }
    this._showEduNow(text);
  }

  _showEduNow(text) {
    const el = this._el.edu; if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    this._eduShowing = true;
    clearTimeout(this._eduTO);
    this._eduTO = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        this._eduShowing = false;
        if (this._eduQueue.length) this._showEduNow(this._eduQueue.shift());
      }, 500);
    }, P3D_CFG.EDU_SHOW_DUR * 1000);
  }

  // ── Game Over ─────────────────────────────────────────────────────────
  showGameOver(reason, stats) {
    const el = this._el.gameOver; if (!el) return;
    el.innerHTML = `
      <div class="p3d-over-title">ENDOSOMAL DESCENT FAILED</div>
      <div style="color:#e8f5e9;font-size:0.9rem;margin-bottom:20px">${reason}</div>
      <button class="p3d-continue" id="p3dRetryBtn">↩ Retry Phase 3</button>`;
    el.style.display = 'flex';
    const btn = document.getElementById('p3dRetryBtn');
    if (btn) btn.addEventListener('click', () => { if (window.P3Descent) P3Descent._retryFromGameOver(); });
  }

  // ── Phase Complete ────────────────────────────────────────────────────
  showComplete(score, allStats) {
    const el = this._el.complete; if (!el) return;
    const a1 = allStats.act1 || {}, a2 = allStats.act2 || {}, a3 = allStats.act3 || {};
    const tier = (P3D_CFG.A2_SCORE_TIERS.find(t => (a2.ir||0) <= t.irMax) || P3D_CFG.A2_SCORE_TIERS[P3D_CFG.A2_SCORE_TIERS.length-1]);
    const debriefFacts = (allStats.eduLog || []).map(id => `• ${P3D_FACTS[id] || id}`).join('<br>');
    el.innerHTML = `
      <div class="p3d-comp-title">PHASE 3: ENDOSOMAL DESCENT — COMPLETE</div>
      <div style="overflow-y:auto;max-height:60vh;width:100%;max-width:560px">
        <div class="p3d-section">ACT 1 — THE DESCENT</div>
        <dl class="p3d-stat-grid">
          <dt>Lysosomes dodged</dt><dd>${a1.lysoDodged||0}</dd>
          <dt>Near misses</dt><dd>${a1.nearMisses||0}</dd>
          <dt>M2 tokens</dt><dd>${a1.m2Tokens||0}</dd>
          <dt>NS1 charges</dt><dd>${a1.ns1Charges||0}</dd>
          <dt>Peak alert</dt><dd>${(a1.peakAlert||0).toFixed(0)}%</dd>
          <dt>Descent time</dt><dd>${(a1.time||0).toFixed(0)}s</dd>
        </dl>
        <div class="p3d-section">ACT 2 — CONFORMATIONAL CHANGE</div>
        <dl class="p3d-stat-grid">
          <dt>Perfect hits</dt><dd>${a2.perfect||0}</dd>
          <dt>Good hits</dt><dd>${a2.good||0}</dd>
          <dt>Misses</dt><dd>${a2.misses||0}</dd>
          <dt>Max combo</dt><dd>${a2.maxCombo||0}</dd>
          <dt>Sync hits</dt><dd>${a2.syncHits||0}/${a2.syncTotal||0}</dd>
          <dt>Immune resistance</dt><dd>${a2.ir||0}/16</dd>
          <dt>Fusion quality</dt><dd>${tier.label}</dd>
        </dl>
        <div class="p3d-section">ACT 3 — THE ESCAPE</div>
        <dl class="p3d-stat-grid">
          <dt>vRNP segments delivered</dt><dd>${a3.vrnpDelivered||0}/8</dd>
          <dt>Sensors avoided</dt><dd>${a3.sensorsAvoided||0}</dd>
        </dl>
        <div class="p3d-section">OVERALL</div>
        <dl class="p3d-stat-grid">
          <dt>Score</dt><dd>${Math.floor(score).toLocaleString()}</dd>
          <dt>Multiplier</dt><dd>×${tier.mult}</dd>
        </dl>
        <div class="p3d-section">DEBRIEF</div>
        <div class="p3d-debrief">${debriefFacts || 'No facts triggered.'}</div>
      </div>
      <button class="p3d-continue" id="p3dContBtn">CONTINUE →</button>`;
    el.style.display = 'flex';
    const btn = document.getElementById('p3dContBtn');
    if (btn) btn.addEventListener('click', () => { if (window.P3Descent) P3Descent._fireComplete(); }, { once: true });
    // Space bar also continues
    const spaceH = e => { if (e.code === 'Space') { document.removeEventListener('keydown', spaceH); P3Descent._fireComplete(); } };
    document.addEventListener('keydown', spaceH);
    this._spaceListener = spaceH;
  }

  hideAllOverlays() {
    if (this._el.gameOver) this._el.gameOver.style.display = 'none';
    if (this._el.complete) this._el.complete.style.display = 'none';
  }

  destroy() {
    if (this._spaceListener) document.removeEventListener('keydown', this._spaceListener);
    const style = document.getElementById('p3dStyles');
    if (style) style.remove();
    if (this._root) this._root.remove();
    clearTimeout(this._vigTO); clearTimeout(this._goldTO);
    clearTimeout(this._washTO); clearTimeout(this._eduTO);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  _div(parent, id, cls) {
    const d = document.createElement('div');
    if (id) d.id = id;
    if (cls) d.className = cls;
    parent.appendChild(d);
    return d;
  }
  _el_(parent, html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    const child = d.firstElementChild;
    parent.appendChild(child);
    return child;
  }
}
