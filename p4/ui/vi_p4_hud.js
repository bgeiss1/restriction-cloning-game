/**
 * vi_p4_hud.js — Phase 4 full HUD (Chunk 9).
 *
 * Enhances the minimal HUD created in vi_p4_main.js:
 *   - Adds ISG threshold pip markers (25/50/75/90%) to the antiviral bar
 *   - Adds a game clock (MM:SS) to the top bar
 *   - Adds a score display to the top bar
 *   - Creates a screen-flash overlay for threshold events
 *   - Creates a selection info panel (selected poly details)
 *
 * Overlays:
 *   showIntro(onComplete)                  — intro briefing, SPACE to skip
 *   showPhaseComplete(stats, onContinue)   — win overlay with stats
 *   showGameOver(reason, stats, onExit)    — fail overlay (3 variants)
 *
 * API:
 *   P4HUD.init()
 *   P4HUD.tick(dt)
 *   P4HUD.destroy()
 *   P4HUD.showIntro(onComplete)
 *   P4HUD.showPhaseComplete(stats, onContinue)
 *   P4HUD.showGameOver(reason, stats, onExit)
 *   P4HUD.flash(rgba, dur)                — trigger a screen flash
 */

/* global P4_CFG, P4Resources, P4Polymerases, P4PolymeraseManager, P4Antiviral */

const P4HUD = (() => {

  const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

  let _clockEl     = null;
  let _scoreEl     = null;
  let _selPanel    = null;
  let _flashEl     = null;
  let _flashT      = 0;
  let _flashDur    = 0;
  let _flashColor  = 'rgba(255,255,255,0)';
  let _elapsed     = 0;

  // Threshold flash state (to fire once each)
  let _flashedPct  = [false, false, false, false];   // 25/50/75/90

  // ── Enhance antiviral bar ─────────────────────────────────────────────────

  function _enhanceAntiviralBar() {
    const bar = document.getElementById('p4AntiviralBar');
    if (!bar) return;

    // Find the track div (parent of p4AntiviralFill)
    const fill = document.getElementById('p4AntiviralFill');
    if (!fill) return;
    const track = fill.parentElement;
    if (!track) return;

    // Position track relatively so pips can be absolute within it
    track.style.position = 'relative';

    // Add pip markers at 25/50/75/90%
    const thresholds = [
      { pct: 25, col: '#ffcc44' },
      { pct: 50, col: '#ff8833' },
      { pct: 75, col: '#ff4422' },
      { pct: 90, col: '#ff2222' },
    ];
    for (const th of thresholds) {
      const pip = document.createElement('div');
      pip.style.cssText = [
        `position:absolute;left:${th.pct}%;top:0;bottom:0`,
        `width:2px;background:${th.col};opacity:0.6`,
        'pointer-events:none',
      ].join(';');
      track.appendChild(pip);
    }
  }

  // ── Clock + score ─────────────────────────────────────────────────────────

  function _addClockScore() {
    // Inject into right side of the top bar — after the existing NP display
    const npDisplay = document.getElementById('p4NpDisplay');
    if (!npDisplay) return;

    // Clock element
    _clockEl = document.createElement('div');
    _clockEl.style.cssText = [
      'background:rgba(10,8,24,0.82)',
      'border:1px solid rgba(100,80,200,0.28)',
      'border-radius:6px;padding:6px 14px',
      'color:#aaaacc;font-size:0.75rem;letter-spacing:0.06em',
      'font-family:' + FONT,
    ].join(';');
    _clockEl.innerHTML = '⏱ 00:00';

    // Score element
    _scoreEl = document.createElement('div');
    _scoreEl.style.cssText = [
      'background:rgba(10,8,24,0.82)',
      'border:1px solid rgba(200,169,50,0.28)',
      'border-radius:6px;padding:6px 14px',
      'color:#ffdd88;font-size:0.75rem;letter-spacing:0.06em',
      'font-family:' + FONT,
    ].join(';');
    _scoreEl.innerHTML = 'SCORE <strong>0</strong>';

    // M key hint
    const mHint = document.createElement('div');
    mHint.style.cssText = [
      'color:#665588;font-size:0.62rem;letter-spacing:0.05em',
      'font-family:' + FONT,
      'padding:6px 8px',
    ].join(';');
    mHint.textContent = '[M] mute';

    const bar = document.getElementById('p4Hud');
    if (bar) {
      bar.appendChild(_clockEl);
      bar.appendChild(_scoreEl);
      bar.appendChild(mHint);
    }
  }

  // ── Selection info panel ──────────────────────────────────────────────────

  function _createSelPanel() {
    _selPanel = document.createElement('div');
    _selPanel.id = 'p4SelPanel';
    _selPanel.style.cssText = [
      'position:fixed;top:54px;left:50%;transform:translateX(-50%)',
      'pointer-events:none;z-index:310',
      'background:rgba(10,8,24,0.85)',
      'border:1px solid rgba(140,120,220,0.35)',
      'border-radius:6px;padding:5px 16px',
      'font-family:' + FONT,
      'font-size:0.68rem;letter-spacing:0.05em',
      'color:#bbaadd;display:none;text-align:center',
    ].join(';');
    document.body.appendChild(_selPanel);
  }

  function _updateSelPanel() {
    if (!_selPanel) return;
    if (typeof P4PolymeraseManager === 'undefined') return;

    const idxs = P4PolymeraseManager.getSelectedIndices();
    if (idxs.length === 0) {
      _selPanel.style.display = 'none';
      return;
    }

    const poly = P4Polymerases.getByIndex(idxs[0]);
    if (!poly) { _selPanel.style.display = 'none'; return; }

    const dur = (poly.durability !== undefined) ? Math.round(poly.durability) : 100;
    const durCol = dur > 60 ? '#88ee88' : dur > 30 ? '#ffaa44' : '#ff4444';
    const modeLabel = poly.taskMode === 'replication'
      ? '<span style="color:#88ccff">R</span>'
      : '<span style="color:#ffdd88">T</span>';
    const stateLabel = poly.destroyed ? '<span style="color:#ff4422">DISABLED</span>'
      : poly.state === 'busy'    ? '<span style="color:#66aaff">ACTIVE</span>'
      : poly.state === 'selected'? '<span style="color:#ccbbee">SELECTED</span>'
      :                            '<span style="color:#aaaaaa">IDLE</span>';

    let extra = '';
    if (idxs.length > 1) extra = ` <span style="color:#665588">+${idxs.length - 1} more</span>`;

    _selPanel.innerHTML =
      `RdRp ${poly.idx + 1}${extra} &nbsp;·&nbsp; `
      + `Mode: ${modeLabel} &nbsp;·&nbsp; `
      + `${stateLabel} &nbsp;·&nbsp; `
      + `Durability: <span style="color:${durCol};font-weight:700">${dur}%</span>`;
    _selPanel.style.display = 'block';
  }

  // ── Screen flash ──────────────────────────────────────────────────────────

  function _createFlash() {
    _flashEl = document.createElement('div');
    _flashEl.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0',
      'pointer-events:none;z-index:397',
      'background:transparent',
    ].join(';');
    document.body.appendChild(_flashEl);
  }

  function flash(rgba, dur) {
    if (!_flashEl) return;
    _flashEl.style.background = rgba;
    _flashColor = rgba;
    _flashT     = dur || 0.6;
    _flashDur   = dur || 0.6;
  }

  function _tickFlash(dt) {
    if (_flashT <= 0 || !_flashEl) return;
    _flashT -= dt;
    const alpha = Math.max(0, _flashT / _flashDur);
    // Reconstruct rgba with fading alpha
    const base = _flashColor.replace(/,[^,)]*\)$/, '');
    _flashEl.style.background = `${base},${(alpha * 0.30).toFixed(3)})`;
    if (_flashT <= 0) _flashEl.style.background = 'transparent';
  }

  // ── Antiviral threshold flashes ───────────────────────────────────────────

  function _checkThresholdFlashes() {
    if (typeof P4Antiviral === 'undefined') return;
    const f = P4Antiviral.getISGFraction();
    if (!_flashedPct[0] && f >= 0.25) { _flashedPct[0] = true; flash('rgba(255,200,0', 1.0); }
    if (!_flashedPct[1] && f >= 0.50) { _flashedPct[1] = true; flash('rgba(255,120,0', 1.2); }
    if (!_flashedPct[2] && f >= 0.75) { _flashedPct[2] = true; flash('rgba(255,50,0',  1.5); }
    if (!_flashedPct[3] && f >= 0.90) { _flashedPct[3] = true; flash('rgba(255,0,0',   2.0); }
  }

  // ── Clock / score update ──────────────────────────────────────────────────

  function _updateClock() {
    if (!_clockEl) return;
    const m = Math.floor(_elapsed / 60);
    const s = Math.floor(_elapsed % 60);
    _clockEl.innerHTML = `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function _updateScore() {
    if (!_scoreEl) return;
    const sc = (typeof P4Resources !== 'undefined') ? P4Resources.getScore() : 0;
    _scoreEl.innerHTML = `SCORE <strong>${sc}</strong>`;
  }

  // ── Intro briefing ────────────────────────────────────────────────────────

  function showIntro(onComplete) {
    const overlay = document.createElement('div');
    overlay.id = 'p4Intro';
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0',
      'background:rgba(5,3,15,0.95)',
      'z-index:600;display:flex;flex-direction:column',
      'align-items:center;justify-content:center',
      'font-family:' + FONT,
      'transition:opacity 0.5s',
      'opacity:0',
    ].join(';');

    overlay.innerHTML = `
      <div style="max-width:560px;text-align:center;padding:0 24px">
        <div style="color:#ccbbee;font-size:1.6rem;font-weight:700;
          letter-spacing:0.20em;margin-bottom:8px">NUCLEAR FACTORY</div>
        <div style="color:#554477;font-size:0.75rem;letter-spacing:0.14em;
          margin-bottom:32px">PHASE 4 — INFLUENZA GENOME REPLICATION</div>

        <div class="p4intro-line" style="color:#aaaacc;font-size:0.88rem;
          line-height:1.7;margin-bottom:12px;opacity:0;transition:opacity 0.6s">
          Eight viral RNA segments have entered the nucleus.<br>
          Each segment is a template for transcription and replication.
        </div>

        <div class="p4intro-line" style="color:#aaaacc;font-size:0.88rem;
          line-height:1.7;margin-bottom:12px;opacity:0;transition:opacity 0.6s">
          <span style="color:#ffdd88">T mode</span> — Send an RdRp to a <span style="color:#ffdd88">Pol II site</span>
          to cap-snatch, then transcribe viral mRNA.<br>
          Export mRNA through <span style="color:#ffaa44">nuclear pore complexes</span>
          to produce NP and new polymerases.
        </div>

        <div class="p4intro-line" style="color:#aaaacc;font-size:0.88rem;
          line-height:1.7;margin-bottom:12px;opacity:0;transition:opacity 0.6s">
          <span style="color:#88ccff">R mode</span> — Once NP ≥ 30, send an RdRp to a
          <span style="color:#ccaa33">template</span> to begin genome replication.<br>
          Two steps: vRNA → cRNA → new vRNA. Both consume NP.
        </div>

        <div class="p4intro-line" style="color:#aaaacc;font-size:0.88rem;
          line-height:1.7;margin-bottom:28px;opacity:0;transition:opacity 0.6s">
          Assemble <span style="color:#88ee88">8 complete sets</span> of all 8 vRNP segments to win.<br>
          Watch the <span style="color:#ff8888">antiviral response</span> bar —
          deploy <span style="color:#cc88ff">NS1 domes</span> [N] to slow it.
        </div>

        <div id="p4IntroSpace" style="color:#7766aa;font-size:0.80rem;
          letter-spacing:0.14em;opacity:0;transition:opacity 0.5s">
          PRESS <span style="color:#ccbbee;font-weight:700">SPACE</span> TO BEGIN
          &nbsp;·&nbsp; <span style="color:#554477">[ESC] skip</span>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Fade in overlay
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    const lines = overlay.querySelectorAll('.p4intro-line');
    const spaceEl = overlay.querySelector('#p4IntroSpace');

    // Stagger line appearances
    const timers = [];
    lines.forEach((ln, i) => {
      timers.push(setTimeout(() => { ln.style.opacity = '1'; }, 600 + i * 900));
    });
    timers.push(setTimeout(() => {
      if (spaceEl) {
        spaceEl.style.opacity = '1';
        // Blink
        let vis = true;
        const blink = setInterval(() => {
          spaceEl.style.opacity = (vis = !vis) ? '1' : '0.2';
        }, 550);
        timers.push(blink);
        overlay._blinkInterval = blink;
      }
    }, 600 + lines.length * 900));

    function _finish() {
      timers.forEach(t => clearTimeout(t));
      if (overlay._blinkInterval) clearInterval(overlay._blinkInterval);
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 520);
      if (onComplete) onComplete();
    }

    function _onKey(e) {
      if (e.code === 'Space' || e.code === 'Escape') {
        window.removeEventListener('keydown', _onKey);
        _finish();
      }
    }
    window.addEventListener('keydown', _onKey);
    // Also click-to-skip
    overlay.addEventListener('click', () => {
      window.removeEventListener('keydown', _onKey);
      _finish();
    });
  }

  // ── Phase complete overlay ────────────────────────────────────────────────

  function showPhaseComplete(stats, onContinue) {
    const mm = Math.floor((stats.time || 0) / 60);
    const ss = Math.floor((stats.time || 0) % 60);
    const timeStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0',
      'background:rgba(0,10,0,0.88)',
      'z-index:610;display:flex;flex-direction:column',
      'align-items:center;justify-content:center',
      'font-family:' + FONT,
      'opacity:0;transition:opacity 0.8s',
    ].join(';');

    overlay.innerHTML = `
      <div style="text-align:center;max-width:460px;padding:0 24px">
        <div style="color:#88ee88;font-size:1.5rem;font-weight:700;
          letter-spacing:0.18em;margin-bottom:6px">REPLICATION COMPLETE</div>
        <div style="color:#44aa44;font-size:0.72rem;letter-spacing:0.12em;
          margin-bottom:32px">All 8 vRNP sets assembled — virion budding can begin</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;
          margin-bottom:32px">
          ${_statBox('Score',         stats.score || 0, '#ffdd88')}
          ${_statBox('Time',          timeStr,          '#aaaacc')}
          ${_statBox('Complete Sets', `${stats.sets || 0} / 8`, '#88ee88')}
          ${_statBox('Phase',         '4 — Nuclear Factory', '#ccbbee')}
        </div>

        <button id="p4ContinueBtn" style="
          background:rgba(60,160,60,0.25);
          border:1px solid rgba(80,200,80,0.55);
          border-radius:6px;padding:10px 36px;
          color:#88ee88;font-size:0.88rem;font-weight:600;
          letter-spacing:0.12em;cursor:pointer;
          font-family:${FONT}">
          CONTINUE →
        </button>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    overlay.querySelector('#p4ContinueBtn').addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onContinue) onContinue();
      }, 500);
    });
  }

  // ── Game over overlay ─────────────────────────────────────────────────────

  function showGameOver(reason, stats, onExit) {
    const variants = {
      antiviral: {
        title:    'ISG RESPONSE OVERWHELMING',
        subtitle: 'The cellular immune defenses have neutralized the viral infection.',
        color:    '#ff4444',
        bg:       'rgba(30,0,0,0.90)',
        border:   'rgba(200,40,40,0.55)',
      },
      all_templates_destroyed: {
        title:    'vRNP TEMPLATES DESTROYED',
        subtitle: 'All RNA templates were degraded before replication could complete.',
        color:    '#cc44ff',
        bg:       'rgba(15,0,25,0.90)',
        border:   'rgba(150,40,220,0.55)',
      },
      all_polys_destroyed: {
        title:    'POLYMERASES ELIMINATED',
        subtitle: 'All RdRp complexes were disabled by OAS attacks.',
        color:    '#ff8833',
        bg:       'rgba(20,8,0,0.90)',
        border:   'rgba(200,100,30,0.55)',
      },
    };
    const v = variants[reason] || variants.antiviral;

    const mm = Math.floor((stats.time || 0) / 60);
    const ss = Math.floor((stats.time || 0) % 60);
    const timeStr = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      `position:fixed;top:0;left:0;right:0;bottom:0;background:${v.bg}`,
      'z-index:610;display:flex;flex-direction:column',
      'align-items:center;justify-content:center',
      'font-family:' + FONT,
      'opacity:0;transition:opacity 0.8s',
    ].join(';');

    overlay.innerHTML = `
      <div style="text-align:center;max-width:440px;padding:0 24px">
        <div style="color:${v.color};font-size:1.4rem;font-weight:700;
          letter-spacing:0.14em;margin-bottom:8px">${v.title}</div>
        <div style="color:${v.color}99;font-size:0.78rem;line-height:1.6;
          margin-bottom:28px">${v.subtitle}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;
          margin-bottom:28px">
          ${_statBox('Score', stats.score || 0, '#ffdd88')}
          ${_statBox('Time',  timeStr,           '#aaaacc')}
        </div>

        <button id="p4RetryBtn" style="
          background:rgba(80,20,20,0.35);
          border:1px solid ${v.border};
          border-radius:6px;padding:10px 36px;
          color:${v.color};font-size:0.85rem;font-weight:600;
          letter-spacing:0.12em;cursor:pointer;
          font-family:${FONT}">
          TRY AGAIN
        </button>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    overlay.querySelector('#p4RetryBtn').addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (onExit) onExit();
      }, 500);
    });
  }

  function _statBox(label, value, color) {
    return `<div style="
      background:rgba(255,255,255,0.05);
      border:1px solid rgba(255,255,255,0.10);
      border-radius:6px;padding:10px 14px">
      <div style="color:#666688;font-size:0.62rem;letter-spacing:0.10em;
        margin-bottom:4px">${label.toUpperCase()}</div>
      <div style="color:${color};font-size:1.0rem;font-weight:700">${value}</div>
    </div>`;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    _enhanceAntiviralBar();
    _addClockScore();
    _createSelPanel();
    _createFlash();
    _elapsed = 0;
    _flashedPct = [false, false, false, false];
  }

  function tick(dt) {
    _elapsed += dt;
    _updateClock();
    _updateScore();
    _updateSelPanel();
    _tickFlash(dt);
    _checkThresholdFlashes();
  }

  function destroy() {
    if (_clockEl && _clockEl.parentNode)  _clockEl.parentNode.removeChild(_clockEl);
    if (_scoreEl && _scoreEl.parentNode)  _scoreEl.parentNode.removeChild(_scoreEl);
    if (_selPanel && _selPanel.parentNode) _selPanel.parentNode.removeChild(_selPanel);
    if (_flashEl && _flashEl.parentNode)  _flashEl.parentNode.removeChild(_flashEl);
    _clockEl = _scoreEl = _selPanel = _flashEl = null;
    _elapsed = 0;
  }

  return {
    init, tick, destroy,
    showIntro, showPhaseComplete, showGameOver,
    flash,
  };

})();
