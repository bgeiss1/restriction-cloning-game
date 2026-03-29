// vi_p3_hud.js — P3HUD: full Phase 3 HUD overlay (replaces minimal debug overlay)
// Depends on: vi_p3_config.js, vi_p3_main.js
'use strict';

class P3HUD {

  // cfg    — P3_CFG reference
  // escape — window.P3Escape singleton (for click-to-dismiss callbacks)
  constructor(cfg, escape) {
    this._cfg    = cfg;
    this._escape = escape;

    // Remove any debug HUD that _buildHUD() may have already built
    const dbgRoot  = document.getElementById('p3DebugRoot');
    const dbgStyle = document.getElementById('p3DebugStyle');
    if (dbgRoot)  dbgRoot.remove();
    if (dbgStyle) dbgStyle.remove();

    this._root = null;
    this._els  = {};     // cached DOM element refs

    // Fade-out timers (decremented by approximate 1/60 each update call)
    this._phFlashTimer     = 0;
    this._fusionToastTimer = 0;

    this._injectStyles();
    this._buildDOM();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called every frame during PLAYING from P3Escape._updateSubSystems.
  update(s) {
    this._updateTopBar(s);
    this._updateBottomBar(s);
    this._tickFadeTimers();
  }

  // Called from P3Escape._setState on every state transition.
  onStateChange(state) {
    const e = this._els;
    const hide = el => { if (el) el.style.display = 'none'; };
    const show = el => { if (el) el.style.display = 'flex'; };

    hide(e.intro);
    hide(e.dead);
    hide(e.complete);

    if (state === 'INTRO')    show(e.intro);
    if (state === 'DEAD')     show(e.dead);
    if (state === 'COMPLETE') show(e.complete);

    const duringPlay = ['PLAYING', 'PAUSED', 'FUSION_CINEMATIC', 'VRNP_TARGETING'];
    const barVis = duringPlay.includes(state);
    if (e.topBar)    e.topBar.style.display    = barVis ? 'flex' : 'none';
    if (e.bottomBar) e.bottomBar.style.display = barVis ? 'flex' : 'none';
  }

  // Called from P3Escape._updateObjective when the objective text changes.
  setObjective(text) {
    if (this._els.objective) this._els.objective.textContent = text || '';
  }

  // Brief full-screen color wash when a pH threshold is crossed.
  showPHFlash(pH) {
    const el = this._els.phFlash;
    if (!el) return;
    const t = Math.min(1, Math.max(0, (7.4 - pH) / (7.4 - 4.8)));
    const r = Math.round(t * 200);
    const g = Math.round((1 - t) * 60);
    const b = Math.round((1 - t) * 180);
    el.style.background = `rgba(${r},${g},${b},0.28)`;
    el.style.opacity = '1';
    this._phFlashTimer = 0.55;
  }

  // Toast shown when the player presses SPACE but fusion conditions aren't met.
  showFusionFailure(reasons) {
    const el = this._els.fusionToast;
    if (!el) return;
    el.innerHTML = '<b>Fusion not ready:</b><br>' +
      reasons.map(r => `· ${r}`).join('<br>');
    el.style.opacity = '1';
    this._fusionToastTimer = 3.5;
  }

  // Dead screen — called from P3Escape.triggerFail.
  showGameOver(msg, stats) {
    const e = this._els;
    if (e.deadTitle) e.deadTitle.textContent = 'GAME OVER';
    if (e.deadMsg)   e.deadMsg.textContent   = msg || '';
    if (e.deadStats) e.deadStats.innerHTML   = this._formatStats(stats);
  }

  // Complete screen — called from P3Escape.triggerComplete.
  showComplete(score, stats) {
    const e = this._els;
    if (e.completeTitle) e.completeTitle.textContent = 'ENDOSOMAL ESCAPE COMPLETE';
    if (e.completeScore) e.completeScore.textContent = `Score: ${score}`;
    if (e.completeStats) e.completeStats.innerHTML   = this._formatStats(stats);
  }

  destroy() {
    if (this._root) { this._root.remove(); this._root = null; }
    const st = document.getElementById('p3HUDStyle');
    if (st) st.remove();
  }

  // ── Top bar updates ──────────────────────────────────────────────────────────

  _updateTopBar(s) {
    const e = this._els;

    // Lysosome countdown
    if (e.lysoTimer) {
      const total = Math.max(0, s.lysosomeTimer);
      const mins  = Math.floor(total / 60);
      const secs  = Math.floor(total % 60).toString().padStart(2, '0');
      e.lysoTimer.textContent = `${mins}:${secs}`;
      const urgent = total < 30;
      e.lysoTimer.style.color = urgent ? '#ff3333' : '#ff9944';
      e.lysoTimer.classList.toggle('p3h-urgent', urgent);
    }

    // Endosomal pH value + bar
    if (e.endoPHVal) {
      const pH = s.endosomalPH;
      const t  = Math.min(1, Math.max(0, (7.4 - pH) / (7.4 - 4.8)));
      const r  = Math.round(t * 255);
      const g  = Math.round((1 - t) * 220);
      const bl = Math.round((1 - t) * 170);
      e.endoPHVal.textContent = `pH ${pH.toFixed(2)}`;
      e.endoPHVal.style.color = `rgb(${r},${g},${bl})`;
    }
    if (e.endoPHFill) {
      const pct = Math.min(100, Math.round(
        ((7.4 - s.endosomalPH) / (7.4 - 4.8)) * 100
      ));
      e.endoPHFill.style.width = `${pct}%`;
    }

    // Internal pH
    if (e.intPHVal) {
      e.intPHVal.textContent = `int pH ${s.internalPH.toFixed(2)}`;
      const danger = s.internalPH < this._cfg.INTERNAL_PH_DAMAGE;
      e.intPHVal.style.color = danger ? '#ff6644' : '#557766';
    }

    // Immune alert value + bar
    if (e.alertVal) {
      const al = Math.round(s.immuneAlert);
      e.alertVal.textContent = `Alert ${al}%`;
      e.alertVal.style.color = al >= 75 ? '#ff3333' : al >= 50 ? '#ffaa22' : '#aa77ff';
    }
    if (e.alertFill) {
      e.alertFill.style.width = `${Math.min(100, s.immuneAlert)}%`;
      e.alertFill.style.background =
        s.immuneAlert >= 75 ? '#ff2200' :
        s.immuneAlert >= 50 ? '#ff8800' : '#cc44ff';
    }

    // NS1 charges
    if (e.ns1Val) {
      e.ns1Val.textContent = `NS1 ×${s.ns1Charges}`;
      e.ns1Val.style.color = s.ns1Charges > 0 ? '#8899cc' : '#442222';
    }
  }

  // ── Bottom bar updates ───────────────────────────────────────────────────────

  _updateBottomBar(s) {
    const e = this._els;

    // M2 channel dots
    if (e.m2Dots && s.m2Channels) {
      const dots = e.m2Dots.children;
      s.m2Channels.forEach((ch, i) => {
        const dot = dots[i];
        if (!dot) return;
        dot.className = `p3h-m2dot p3h-m2dot--${ch.state}`;
        // Burnout-warning: override background color cyan→orange in final 30%
        if (ch.state === 'open' && ch.burnoutFrac > 0.70) {
          const f = Math.min(1, (ch.burnoutFrac - 0.70) / 0.30);
          const r = Math.round(f * 255);
          const g = Math.round((1 - f) * 255);
          dot.style.background = `rgb(${r},${g},0)`;
        } else {
          dot.style.background = '';
        }
      });
    }

    // vRNP release bar + value
    if (e.vrnpVal) {
      const v = Math.round(s.vRNPRelease);
      e.vrnpVal.textContent = `vRNP ${v}%`;
      const rdy = v >= this._cfg.FUSION_VRNP_MIN;
      e.vrnpVal.style.color = rdy ? '#ffcc44' : '#776633';
    }
    if (e.vrnpFill) {
      e.vrnpFill.style.width = `${Math.min(100, s.vRNPRelease)}%`;
    }

    // HA aimed
    if (e.haVal) {
      const aimed = s.haAimed;
      const need  = this._cfg.HA_FUSION_MIN_COUNT;
      e.haVal.textContent = `HA ${aimed}/${need}`;
      e.haVal.style.color = aimed >= need ? '#00ffcc' : '#3a5a4a';
    }

    // Fusion-ready pulse banner (above bottom bar)
    if (e.fusionReady) {
      e.fusionReady.style.opacity = s.fusionReady ? '' : '0';
    }
  }

  // ── Fade-out timers ──────────────────────────────────────────────────────────

  _tickFadeTimers() {
    const TICK = 1 / 60;

    if (this._phFlashTimer > 0) {
      this._phFlashTimer -= TICK;
      if (this._phFlashTimer <= 0) {
        this._phFlashTimer = 0;
        if (this._els.phFlash) this._els.phFlash.style.opacity = '0';
      }
    }

    if (this._fusionToastTimer > 0) {
      this._fusionToastTimer -= TICK;
      if (this._fusionToastTimer <= 0) {
        this._fusionToastTimer = 0;
        if (this._els.fusionToast) this._els.fusionToast.style.opacity = '0';
      }
    }
  }

  // ── Stats formatter ──────────────────────────────────────────────────────────

  _formatStats(stats) {
    if (!stats) return '';
    const rows = [
      ['Segments Escaped',  `${stats.segmentsExtracted || 0} / 8`],
      ['Lysosome Remaining', `${Math.round(stats.lysosomeTimer || 0)}s`],
      ['Endo pH at end',    (stats.endosomalPH || 0).toFixed(2)],
      ['Internal pH',       (stats.internalPHAtFusion || 0).toFixed(2)],
      ['vRNP Released',     `${Math.round(stats.vRNPRelease || 0)}%`],
      ['Peak Immune Alert', `${stats.peakAlert || 0}%`],
      ['HA Aimed',          stats.haAimed || 0],
      ['M2 Burned Out',     stats.m2BurnedOut || 0],
      ['NS1 Remaining',     stats.ns1Remaining || 0],
      ['Elapsed',           `${stats.timeTaken || 0}s`],
    ];
    return rows.map(([k, v]) =>
      `<span class="p3h-sk">${k}</span><span class="p3h-sv">${v}</span>`
    ).join('');
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('p3HUDStyle')) return;
    const s = document.createElement('style');
    s.id = 'p3HUDStyle';
    s.textContent = `
      #p3HUDRoot {
        position: fixed; inset: 0; pointer-events: none; z-index: 2000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
        font-size: 12px; user-select: none;
      }

      /* ── Top bar ── */
      #p3TopBar {
        position: absolute; top: 10px; left: 16px; right: 16px;
        display: flex; align-items: center; gap: 10px;
        background: rgba(0,0,0,0.60);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 9px; padding: 7px 14px;
      }
      #p3BottomBar {
        position: absolute; bottom: 10px; left: 16px; right: 16px;
        display: flex; align-items: center; gap: 10px;
        background: rgba(0,0,0,0.60);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 9px; padding: 7px 14px;
      }

      /* ── Shared section utility ── */
      .p3h-sec  { display: flex; flex-direction: column; gap: 3px; }
      .p3h-grow { flex: 1; }
      .p3h-sep  { width: 1px; align-self: stretch; background: rgba(255,255,255,0.11); margin: 0 2px; }
      .p3h-lbl  { font-size: 9px; letter-spacing: .11em; text-transform: uppercase;
                  color: rgba(255,255,255,0.30); }

      /* ── Bar track/fill ── */
      .p3h-track { height: 4px; border-radius: 2px; overflow: hidden;
                   background: rgba(255,255,255,0.09); min-width: 80px; }
      .p3h-fill  { height: 100%; border-radius: 2px; transition: width .25s linear; }
      #p3EndoPHFill { background: linear-gradient(90deg, #4499ff 0%, #ff2200 100%); }
      #p3AlertFill  { background: #cc44ff; transition: width .25s linear, background .4s; }
      #p3VRNPFill   { background: #ffcc44; }

      /* ── Top bar values ── */
      #p3LysoTimer { font-size: 22px; font-weight: 700; color: #ff9944;
                     letter-spacing: .04em; line-height: 1; }
      #p3LysoTimer.p3h-urgent { animation: p3h-pulse 0.65s infinite; }
      @keyframes p3h-pulse { 0%,100%{color:#ff3333} 50%{color:#ff9944} }

      #p3EndoPHVal { font-size: 13px; font-weight: 700; color: #44aaff; }
      #p3IntPHVal  { font-size: 10px; color: #557766; }
      #p3AlertVal  { font-size: 12px; font-weight: 600; color: #aa77ff; }
      #p3NS1Val    { font-size: 11px; color: #8899cc; }

      /* ── Bottom bar values ── */
      #p3M2Dots { display: flex; gap: 5px; align-items: center; padding: 2px 0; }
      .p3h-m2dot {
        width: 13px; height: 13px; border-radius: 2px;
        border: 1px solid rgba(255,255,255,0.18); transition: background .2s;
      }
      .p3h-m2dot--closed  { background: #4488ff; }
      .p3h-m2dot--open    { background: #00ffff; box-shadow: 0 0 6px rgba(0,255,255,0.5); }
      .p3h-m2dot--burnout { background: #3a2a1a; border-color: rgba(100,60,20,0.5); }

      #p3VRNPVal { font-size: 11px; font-weight: 600; }
      #p3HAVal   { font-size: 11px; font-weight: 600; }
      #p3Objective {
        flex: 1; text-align: center; font-size: 11px;
        color: rgba(255,255,255,0.50); letter-spacing: .07em;
      }

      /* ── Fusion ready pulse ── */
      #p3FusionReady {
        position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%);
        background: rgba(0,255,200,0.10); border: 1px solid rgba(0,255,200,0.35);
        border-radius: 7px; padding: 5px 20px;
        font-size: 11px; font-weight: 700; letter-spacing: .15em; color: #00ffcc;
        opacity: 0; transition: opacity .25s;
        animation: p3h-fuse 0.9s infinite;
        white-space: nowrap;
      }
      @keyframes p3h-fuse { 0%,100%{opacity:1} 50%{opacity:.45} }

      /* ── Overlays ── */
      .p3h-overlay {
        position: absolute; inset: 0;
        background: rgba(5,10,14,0.93);
        display: none; flex-direction: column;
        align-items: center; justify-content: center; gap: 14px;
        pointer-events: all;
      }
      .p3h-title {
        font-size: 1.55rem; font-weight: 700;
        letter-spacing: .20em; text-transform: uppercase;
      }
      .p3h-body {
        font-size: .82rem; max-width: 520px; text-align: center;
        line-height: 1.68; color: #9ab8a0;
      }
      .p3h-prompt {
        font-size: .75rem; letter-spacing: .14em;
        animation: p3h-blink 1.2s infinite;
      }
      @keyframes p3h-blink { 0%,100%{opacity:.7} 50%{opacity:.2} }

      /* Intro colours */
      #p3IntroOvl .p3h-title  { color: #00ff88; text-shadow: 0 0 22px rgba(0,255,136,.4); }
      #p3IntroOvl .p3h-prompt { color: #00ff88; }

      /* Key hints */
      #p3IntroKeys {
        display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;
        font-size: .72rem; color: #5a8870; margin-top: -4px;
        max-width: 480px;
      }
      .p3h-key {
        background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.17);
        border-radius: 3px; padding: 1px 6px; font-family: monospace; color: #a0d0b0;
      }

      /* Dead colours */
      #p3DeadOvl .p3h-title  { color: #ff4444; }
      #p3DeadOvl .p3h-prompt { color: #ff4444; }

      /* Complete colours */
      #p3CompleteOvl .p3h-title  { color: #00ff88; text-shadow: 0 0 22px rgba(0,255,136,.4); }
      #p3CompleteOvl .p3h-prompt { color: #00ff88; }

      #p3CompleteScore {
        font-size: 2.0rem; font-weight: 700; color: #ffcc44; letter-spacing: .06em;
      }

      /* Stats grid */
      .p3h-stats {
        display: grid; grid-template-columns: auto auto; gap: 4px 24px;
        font-size: .72rem;
      }
      .p3h-sk { color: rgba(255,255,255,0.38); }
      .p3h-sv { color: rgba(255,255,255,0.82); text-align: right; }

      /* pH flash */
      #p3PHFlash {
        position: absolute; inset: 0; pointer-events: none;
        opacity: 0; transition: opacity 0.45s ease-out;
      }

      /* Fusion failure toast */
      #p3FusionToast {
        position: absolute; top: 68px; left: 50%; transform: translateX(-50%);
        background: rgba(20,5,0,0.90);
        border: 1px solid rgba(255,100,30,0.50);
        border-radius: 8px; padding: 10px 20px;
        font-size: .72rem; color: #ffcc88; line-height: 1.65;
        text-align: center; opacity: 0; transition: opacity .4s;
        min-width: 260px; max-width: 420px; pointer-events: none;
      }
    `;
    document.head.appendChild(s);
  }

  // ── DOM ───────────────────────────────────────────────────────────────────────

  _buildDOM() {
    const root = document.createElement('div');
    root.id = 'p3HUDRoot';
    root.innerHTML = `
      <div id="p3PHFlash"></div>
      <div id="p3FusionToast"></div>

      <!-- TOP BAR -->
      <div id="p3TopBar" style="display:none">
        <div class="p3h-sec">
          <div class="p3h-lbl">Lysosome</div>
          <div id="p3LysoTimer">2:30</div>
        </div>
        <div class="p3h-sep"></div>
        <div class="p3h-sec p3h-grow">
          <div class="p3h-lbl">Endosomal pH</div>
          <div id="p3EndoPHVal">pH 7.40</div>
          <div class="p3h-track">
            <div class="p3h-fill" id="p3EndoPHFill" style="width:0%"></div>
          </div>
        </div>
        <div class="p3h-sec">
          <div class="p3h-lbl">Internal pH</div>
          <div id="p3IntPHVal">int pH 7.00</div>
        </div>
        <div class="p3h-sep"></div>
        <div class="p3h-sec p3h-grow">
          <div class="p3h-lbl">Immune Alert</div>
          <div id="p3AlertVal">Alert 0%</div>
          <div class="p3h-track">
            <div class="p3h-fill" id="p3AlertFill" style="width:0%"></div>
          </div>
        </div>
        <div class="p3h-sec">
          <div class="p3h-lbl">NS1</div>
          <div id="p3NS1Val">NS1 ×8</div>
        </div>
      </div>

      <!-- BOTTOM BAR -->
      <div id="p3BottomBar" style="display:none">
        <div class="p3h-sec">
          <div class="p3h-lbl">M2 Channels</div>
          <div id="p3M2Dots">
            <div class="p3h-m2dot p3h-m2dot--closed"></div>
            <div class="p3h-m2dot p3h-m2dot--closed"></div>
            <div class="p3h-m2dot p3h-m2dot--closed"></div>
            <div class="p3h-m2dot p3h-m2dot--closed"></div>
            <div class="p3h-m2dot p3h-m2dot--closed"></div>
          </div>
        </div>
        <div class="p3h-sep"></div>
        <div class="p3h-sec">
          <div class="p3h-lbl">vRNP Release</div>
          <div id="p3VRNPVal">vRNP 0%</div>
          <div class="p3h-track">
            <div class="p3h-fill" id="p3VRNPFill" style="width:0%"></div>
          </div>
        </div>
        <div class="p3h-sec">
          <div class="p3h-lbl">HA Aimed</div>
          <div id="p3HAVal">HA 0/6</div>
        </div>
        <div class="p3h-sep"></div>
        <div id="p3Objective" class="p3h-grow">
          Open M2 ion channels — acidify the virion interior
        </div>
      </div>

      <!-- Fusion-ready floating prompt -->
      <div id="p3FusionReady" style="opacity:0">▸ FUSION READY — PRESS SPACE</div>

      <!-- INTRO OVERLAY -->
      <div id="p3IntroOvl" class="p3h-overlay">
        <div class="p3h-title">Phase 3 · Endosomal Escape</div>
        <div class="p3h-body">
          The host cell has engulfed you. You are trapped inside an acidifying endosome.<br>
          Manage M2 ion channels, HA fusion proteins, and TLR immune sensors
          to escape before the lysosome arrives.
        </div>
        <div id="p3IntroKeys">
          <span><span class="p3h-key">M</span> Toggle aimed M2</span>
          <span><span class="p3h-key">1–5</span> Direct channel select</span>
          <span><span class="p3h-key">F</span> Aim HA trimer</span>
          <span><span class="p3h-key">Q</span> Jam TLR (NS1)</span>
          <span><span class="p3h-key">SPACE</span> Trigger fusion</span>
          <span><span class="p3h-key">P</span> Pause</span>
        </div>
        <div class="p3h-prompt" style="color:#00ff88">▸ CLICK OR PRESS SPACE TO BEGIN</div>
      </div>

      <!-- DEAD OVERLAY -->
      <div id="p3DeadOvl" class="p3h-overlay">
        <div id="p3DeadTitle" class="p3h-title">GAME OVER</div>
        <div id="p3DeadMsg"   class="p3h-body">—</div>
        <div id="p3DeadStats" class="p3h-stats"></div>
        <div class="p3h-prompt" style="color:#ff4444">▸ PRESS SPACE TO RETRY</div>
      </div>

      <!-- COMPLETE OVERLAY -->
      <div id="p3CompleteOvl" class="p3h-overlay">
        <div id="p3CompleteTitle" class="p3h-title">ENDOSOMAL ESCAPE COMPLETE</div>
        <div id="p3CompleteScore">Score: 0</div>
        <div id="p3CompleteStats" class="p3h-stats"></div>
        <div class="p3h-prompt" style="color:#00ff88">▸ PRESS SPACE TO CONTINUE</div>
      </div>
    `;

    document.body.appendChild(root);
    this._root = root;

    // Cache element refs
    const e = this._els;
    e.topBar      = root.querySelector('#p3TopBar');
    e.bottomBar   = root.querySelector('#p3BottomBar');
    e.lysoTimer   = root.querySelector('#p3LysoTimer');
    e.endoPHVal   = root.querySelector('#p3EndoPHVal');
    e.endoPHFill  = root.querySelector('#p3EndoPHFill');
    e.intPHVal    = root.querySelector('#p3IntPHVal');
    e.alertVal    = root.querySelector('#p3AlertVal');
    e.alertFill   = root.querySelector('#p3AlertFill');
    e.ns1Val      = root.querySelector('#p3NS1Val');
    e.m2Dots      = root.querySelector('#p3M2Dots');
    e.vrnpVal     = root.querySelector('#p3VRNPVal');
    e.vrnpFill    = root.querySelector('#p3VRNPFill');
    e.haVal       = root.querySelector('#p3HAVal');
    e.objective   = root.querySelector('#p3Objective');
    e.fusionReady = root.querySelector('#p3FusionReady');
    e.phFlash     = root.querySelector('#p3PHFlash');
    e.fusionToast = root.querySelector('#p3FusionToast');
    e.intro       = root.querySelector('#p3IntroOvl');
    e.dead        = root.querySelector('#p3DeadOvl');
    e.deadTitle   = root.querySelector('#p3DeadTitle');
    e.deadMsg     = root.querySelector('#p3DeadMsg');
    e.deadStats   = root.querySelector('#p3DeadStats');
    e.complete    = root.querySelector('#p3CompleteOvl');
    e.completeTitle = root.querySelector('#p3CompleteTitle');
    e.completeScore = root.querySelector('#p3CompleteScore');
    e.completeStats = root.querySelector('#p3CompleteStats');

    // Clicking the intro overlay dismisses it
    if (e.intro) {
      e.intro.addEventListener('click', () => {
        if (this._escape && this._escape.state === 'INTRO') {
          this._escape._setState('PLAYING');
        }
      });
    }
  }
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.hud) {
  P3Escape.hud = new P3HUD(P3_CFG, P3Escape);
}
