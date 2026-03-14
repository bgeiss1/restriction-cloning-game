/**
 * ab_game.js — Input, HUD wiring, and state machine for Antibody Rush
 *
 * Depends on: ab_sprites.js, ab_engine.js
 * Exports global: ABGame
 *
 * States: 'start' | 'tutorial' | 'playing' | 'paused' | 'over'
 *
 * Tutorial flow (auto on first play, stored in localStorage):
 *   Step 0 — what are epitopes?  (pathogen is visible, frozen at right)
 *   Step 1 — swipe to select     (selector panel glows)
 *   Step 2 — tap to fire + IgG   (→ "Let's go!" unfreezes game)
 */

const ABGame = (() => {

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  const el = id => document.getElementById(id);

  /* ── State ───────────────────────────────────────────────────────── */
  let _state   = 'start';
  let _tutStep = 0;

  /* ── Tutorial epitope shown on the tutorial pathogen ─────────────── */
  const TUT_EPITOPE = 'tri';   // ▲ red triangle

  /* ── Tutorial step definitions ──────────────────────────────────────
   *  title    : card heading
   *  body     : HTML string for card body (use <strong>, .igm, .igg)
   *  diagram  : SVG string or '' for no diagram
   *  highlight: element id to add tut-glow class (or null)
   *  btn      : button label
   * ─────────────────────────────────────────────────────────────────── */
  const TUT_STEPS = [
    {
      title: '🦠 Neutralize pathogens!',
      body:  'Pathogens display <strong>epitopes</strong> — colored shapes on their surface — '
           + 'that your antibodies bind to. Fire antibodies at pathogens before they reach the host. '
           + 'The selector panel (left) shows your active antibody.',
      diagram: `
        <svg viewBox="0 0 200 64" width="200" height="64" xmlns="http://www.w3.org/2000/svg">
          <!-- Pathogen body -->
          <circle cx="32" cy="32" r="22" fill="#3B1054" stroke="#9B59B6" stroke-width="1.5"/>
          <!-- Spikes -->
          <line x1="32" y1="10" x2="32" y2="4"  stroke="#9B59B6" stroke-width="2" stroke-linecap="round"/>
          <line x1="32" y1="54" x2="32" y2="60" stroke="#9B59B6" stroke-width="2" stroke-linecap="round"/>
          <line x1="10" y1="32" x2="4"  y2="32" stroke="#9B59B6" stroke-width="2" stroke-linecap="round"/>
          <line x1="54" y1="32" x2="60" y2="32" stroke="#9B59B6" stroke-width="2" stroke-linecap="round"/>
          <!-- Triangle epitope on pathogen -->
          <polygon points="32,20 40,36 24,36" fill="#FF6B6B" stroke="#fff" stroke-width="0.8"/>
          <!-- Arrow -->
          <text x="76" y="38" font-size="22" fill="#a8c5a0" font-family="sans-serif">→</text>
          <!-- Antibody Y shape -->
          <line x1="168" y1="32" x2="190" y2="32" stroke="#4D96FF" stroke-width="5" stroke-linecap="round"/>
          <line x1="168" y1="32" x2="148" y2="16" stroke="#4D96FF" stroke-width="4.5" stroke-linecap="round"/>
          <line x1="168" y1="32" x2="148" y2="48" stroke="#4D96FF" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="168" cy="32" r="4" fill="#4D96FF"/>
          <!-- Matching triangle tips on antibody -->
          <polygon points="148,16 155,23 141,23" fill="#FF6B6B" stroke="#fff" stroke-width="0.8"/>
          <polygon points="148,48 155,55 141,55" fill="#FF6B6B" stroke="#fff" stroke-width="0.8"/>
          <!-- "=" label -->
          <text x="104" y="37" font-size="18" fill="#66BB6A" font-weight="bold" font-family="sans-serif">=</text>
        </svg>`,
      highlight: null,
      btn: 'Next →',
    },
    {
      title: '↕ Switch antibody isotype',
      body:  'The <strong>selector panel</strong> (left) shows your active antibody. '
           + '<strong>Swipe up or down</strong> (mobile) or press <strong>↑ ↓</strong> (keyboard) '
           + 'to toggle between <span class="igm">IgM</span> (pentamer) and <span class="igg">IgG</span> (monomer). '
           + 'Try it now — switching is live!',
      diagram: `
        <div style="display:flex;align-items:center;gap:18px;justify-content:center;">
          <div class="tut-swipe-arrows"><span>▲</span><span>▼</span></div>
          <div style="text-align:center;font-size:0.78rem;">
            <svg viewBox="0 0 52 52" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
              <!-- IgM pentamer schematic (5 Y-shapes in ring) -->
              <g stroke="#4D96FF" stroke-linecap="round" fill="none">
                <line x1="26" y1="26" x2="26" y2="11" stroke-width="1.2" opacity="0.3"/>
                <line x1="26" y1="26" x2="40" y2="19" stroke-width="1.2" opacity="0.3"/>
                <line x1="26" y1="26" x2="37" y2="36" stroke-width="1.2" opacity="0.3"/>
                <line x1="26" y1="26" x2="15" y2="36" stroke-width="1.2" opacity="0.3"/>
                <line x1="26" y1="26" x2="12" y2="19" stroke-width="1.2" opacity="0.3"/>
              </g>
              <circle cx="26" cy="11" r="4" fill="#4D96FF" opacity="0.9"/>
              <circle cx="40" cy="19" r="4" fill="#4D96FF" opacity="0.9"/>
              <circle cx="37" cy="36" r="4" fill="#4D96FF" opacity="0.9"/>
              <circle cx="15" cy="36" r="4" fill="#4D96FF" opacity="0.9"/>
              <circle cx="12" cy="19" r="4" fill="#4D96FF" opacity="0.9"/>
              <circle cx="26" cy="26" r="3" fill="#4D96FF" opacity="0.5"/>
            </svg>
            <div style="color:var(--igm-color);font-weight:700;font-size:0.8rem;">IgM</div>
          </div>
          <div style="font-size:1.2rem;color:var(--text-muted);">⇄</div>
          <div style="text-align:center;font-size:0.78rem;">
            <svg viewBox="0 0 52 52" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
              <line x1="26" y1="26" x2="44" y2="26" stroke="#C8A951" stroke-width="4" stroke-linecap="round"/>
              <line x1="26" y1="26" x2="12" y2="14" stroke="#C8A951" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="26" y1="26" x2="12" y2="38" stroke="#C8A951" stroke-width="3.5" stroke-linecap="round"/>
              <circle cx="26" cy="26" r="3" fill="#C8A951"/>
            </svg>
            <div style="color:var(--igg-color);font-weight:700;font-size:0.8rem;">IgG ✦</div>
          </div>
        </div>`,
      highlight: 'abSelector',
      btn: 'Got it →',
    },
    {
      title: '👆 Tap to fire!',
      body:  '<strong>Tap</strong> anywhere on the screen to shoot. '
           + 'A matching hit deals 1 damage — '
           + '<span class="igm">IgM</span> antibodies need <strong>3 hits</strong> to neutralize a pathogen. '
           + 'Neutralized pathogens sometimes drop <span class="igg">✦ IgG</span> power-ups: '
           + 'high-affinity, <strong>1-shot</strong> neutralize!',
      diagram: `
        <div style="display:flex;gap:20px;align-items:center;justify-content:center;">
          <div style="text-align:center;font-size:0.78rem;color:var(--text-muted);">
            <svg viewBox="0 0 48 48" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
              <line x1="24" y1="24" x2="40" y2="24" stroke="#4D96FF" stroke-width="4" stroke-linecap="round"/>
              <line x1="24" y1="24" x2="11" y2="13" stroke="#4D96FF" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="24" y1="24" x2="11" y2="35" stroke="#4D96FF" stroke-width="3.5" stroke-linecap="round"/>
              <circle cx="24" cy="24" r="3" fill="#4D96FF"/>
            </svg>
            <div style="color:var(--igm-color);font-weight:700;">IgM</div>
            <div>3 hits</div>
          </div>
          <div style="font-size:1.5rem;color:var(--text-muted);">→</div>
          <div style="text-align:center;font-size:0.78rem;color:var(--text-muted);">
            <svg viewBox="0 0 48 48" width="44" height="44" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(200,169,81,0.25)" stroke-width="12"/>
              <line x1="24" y1="24" x2="40" y2="24" stroke="#C8A951" stroke-width="4" stroke-linecap="round"/>
              <line x1="24" y1="24" x2="11" y2="13" stroke="#C8A951" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="24" y1="24" x2="11" y2="35" stroke="#C8A951" stroke-width="3.5" stroke-linecap="round"/>
              <circle cx="24" cy="24" r="3" fill="#C8A951"/>
            </svg>
            <div style="color:var(--igg-color);font-weight:700;">✦ IgG</div>
            <div>1-shot KO</div>
          </div>
        </div>`,
      highlight: null,
      btn: "Let's go!",
    },
  ];

  /* ── Touch tracking ──────────────────────────────────────────────── */
  let _touchStartY = null;
  let _touchStartX = null;
  let _touchStartT = null;
  const SWIPE_THRESHOLD = 28;
  const TAP_MAX_MOVE    = 14;
  const TAP_MAX_MS      = 350;

  /* ─────────────────────────────────────────────────────────────────── */
  /*  HUD UPDATES                                                        */
  /* ─────────────────────────────────────────────────────────────────── */

  function setScore(n)  { el('hudScore').textContent = n; }
  function setWave(n)   { el('hudWave').textContent  = n; }
  function setIgG(n)    { el('hudIgG').textContent   = n; }

  function setHealth(n) {
    const fill = el('healthFill');
    const pct  = Math.max(0, Math.min(100, n));
    fill.style.width = pct + '%';
    if (pct > 60)      fill.style.background = 'var(--success)';
    else if (pct > 30) fill.style.background = 'var(--warn)';
    else               fill.style.background = 'var(--danger)';
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  OVERLAYS                                                            */
  /* ─────────────────────────────────────────────────────────────────── */

  function showHUD(visible) {
    if (visible) {
      el('hud').classList.remove('hidden');
      el('abSelector').classList.remove('hidden');
      el('healthBar').classList.remove('hidden');
    } else {
      el('hud').classList.add('hidden');
      el('abSelector').classList.add('hidden');
      el('healthBar').classList.add('hidden');
    }
  }

  function showOverlay(id) {
    ['startScreen', 'pauseScreen', 'gameOverScreen'].forEach(oid => {
      el(oid).classList.toggle('hidden', oid !== id);
    });
  }

  function hideAllOverlays() {
    ['startScreen', 'pauseScreen', 'gameOverScreen'].forEach(oid => {
      el(oid).classList.add('hidden');
    });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  WAVE BANNER + IgG FLASH                                            */
  /* ─────────────────────────────────────────────────────────────────── */

  function showWaveBanner(waveNum) {
    const banner = el('waveBanner');
    banner.textContent = waveNum === 1 ? '— Wave 1 —' : `⚡ Wave ${waveNum}`;
    banner.classList.remove('active');
    void banner.offsetWidth;
    banner.classList.add('active');
    banner.addEventListener('animationend', () => banner.classList.remove('active'), { once: true });
  }

  function showIgGFlash() {
    const flash = el('iggFlash');
    flash.style.display = 'block';
    flash.style.animation = 'none';
    void flash.offsetWidth;
    flash.style.animation = '';
    flash.style.display = 'block';
    flash.addEventListener('animationend', () => { flash.style.display = 'none'; }, { once: true });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  TOAST                                                               */
  /* ─────────────────────────────────────────────────────────────────── */

  function toast(msg, type = '') {
    const area = el('toastArea');
    const t    = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    area.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  AB LABEL UPDATE                                                     */
  /* ─────────────────────────────────────────────────────────────────── */

  function updateAbLabel() {
    const lbl = el('abTypeLabel');
    if (!lbl) return;
    const isIgG = ABEngine.isIgGActive();
    const { iggCount } = ABEngine.getState();
    if (isIgG) {
      lbl.textContent = `IgG ✦ ×${iggCount}`;
      lbl.style.color = 'var(--igg-color)';
    } else {
      lbl.textContent = iggCount > 0 ? `IgM  (✦ ×${iggCount} ready)` : 'IgM';
      lbl.style.color = 'var(--igm-color)';
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  TUTORIAL                                                            */
  /* ─────────────────────────────────────────────────────────────────── */

  function showTutStep(n) {
    const step = TUT_STEPS[n];
    if (!step) return;

    // Update step dots
    for (let i = 0; i < TUT_STEPS.length; i++) {
      el(`tutDot${i}`).classList.toggle('active', i === n);
    }

    el('tutTitle').textContent  = step.title;
    el('tutBody').innerHTML     = step.body;
    el('tutDiagram').innerHTML  = step.diagram || '';
    el('tutNextBtn').textContent = step.btn;

    // Highlight relevant element
    clearTutHighlights();
    if (step.highlight) {
      el(step.highlight)?.classList.add('tut-glow');
    }

    el('tutOverlay').classList.remove('hidden');
  }

  function clearTutHighlights() {
    document.querySelectorAll('.tut-glow').forEach(e => e.classList.remove('tut-glow'));
  }

  function tutNext() {
    _tutStep++;
    if (_tutStep >= TUT_STEPS.length) {
      endTutorial();
    } else {
      showTutStep(_tutStep);
    }
  }

  function tutSkip() {
    endTutorial();
  }

  function endTutorial() {
    clearTutHighlights();
    el('tutOverlay').classList.add('hidden');
    localStorage.setItem('ab_tutorial_done', '1');
    _state = 'playing';
    ABEngine.setTutorialMode(false);  // unfreeze pathogen, start spawning
    showWaveBanner(1);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  ENGINE CALLBACKS                                                    */
  /* ─────────────────────────────────────────────────────────────────── */

  let _firstKillToasted = false;

  const engineCallbacks = {
    onScoreChange: n => {
      setScore(n);
      // First kill toast during tutorial / early game
      if (!_firstKillToasted && n > 0) {
        _firstKillToasted = true;
        toast('Pathogen neutralized! Keep firing.', 'success');
      }
    },
    onHealthChange: n => setHealth(n),
    onWaveChange:   n => setWave(n),
    onIgGChange: n => {
      setIgG(n);
      updateAbLabel();
    },
    onGameOver: ({ score, wave, kills }) => {
      _state = 'over';
      showHUD(false);
      el('goFinalScore').textContent = score;
      el('goWave').textContent       = wave;
      el('goKills').textContent      = kills;
      showOverlay('gameOverScreen');
    },
    onWaveBanner: n => showWaveBanner(n),
    onIgGPickup: (x, y) => {
      showIgGFlash();
      toast('✦ IgG Power-Up! One-shot neutralize.', 'igg');
    },
  };

  /* ─────────────────────────────────────────────────────────────────── */
  /*  INPUT — TOUCH                                                       */
  /* ─────────────────────────────────────────────────────────────────── */

  function onTouchStart(e) {
    if (_state !== 'playing' && _state !== 'tutorial') return;
    if (e.target.tagName === 'BUTTON' ||
        e.target.closest('#hud') ||
        e.target.closest('#abSelector') ||
        e.target.closest('#tutOverlay')) return;

    const t = e.touches[0];
    _touchStartY = t.clientY;
    _touchStartX = t.clientX;
    _touchStartT = Date.now();
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (_state !== 'playing' && _state !== 'tutorial') return;
    if (_touchStartY === null) return;
    if (e.target.tagName === 'BUTTON' ||
        e.target.closest('#hud') ||
        e.target.closest('#abSelector') ||
        e.target.closest('#tutOverlay')) return;

    const t   = e.changedTouches[0];
    const dy  = t.clientY - _touchStartY;
    const dx  = t.clientX - _touchStartX;
    const dt  = Date.now() - _touchStartT;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (ady > SWIPE_THRESHOLD && ady > adx * 1.2) {
      // Vertical swipe — toggle IgM ↔ IgG
      ABEngine.toggleIsotype();
      updateAbLabel();
    } else if (adx < TAP_MAX_MOVE && ady < TAP_MAX_MOVE && dt < TAP_MAX_MS) {
      // Tap — only fire when playing (not during tutorial card)
      if (_state === 'playing') handleFire();
    }

    _touchStartY = null;
    _touchStartX = null;
    e.preventDefault();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  INPUT — KEYBOARD                                                    */
  /* ─────────────────────────────────────────────────────────────────── */

  function onKeyDown(e) {
    if (_state === 'tutorial') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        ABEngine.toggleIsotype();
        updateAbLabel();
      }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tutNext(); }
      if (e.key === 'Escape') tutSkip();
      return;
    }
    if (_state !== 'playing') return;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        ABEngine.toggleIsotype();
        updateAbLabel();
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        handleFire();
        break;
      case 'Escape':
        pause();
        break;
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  FIRE                                                                */
  /* ─────────────────────────────────────────────────────────────────── */

  function handleFire() {
    if (!ABEngine.fire()) return;
    const lbl = el('abTypeLabel');
    if (lbl) {
      lbl.style.transition = 'opacity 0.05s';
      lbl.style.opacity = '0.4';
      setTimeout(() => { lbl.style.opacity = '1'; }, 80);
    }
    updateAbLabel();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  STATE MACHINE                                                       */
  /* ─────────────────────────────────────────────────────────────────── */

  function start() {
    hideAllOverlays();
    showHUD(true);
    setScore(0); setWave(1); setIgG(0); setHealth(100);
    _firstKillToasted = false;

    ABEngine.init(document.getElementById('gameCanvas'));
    ABEngine.start(engineCallbacks);

    if (localStorage.getItem('ab_tutorial_done')) {
      // Skip tutorial for returning players
      _state = 'playing';
      showWaveBanner(1);
    } else {
      // First time: start in tutorial mode
      _state   = 'tutorial';
      _tutStep = 0;
      ABEngine.setTutorialMode(true, TUT_EPITOPE);
      updateAbLabel();
      showTutStep(0);
    }
  }

  function pause() {
    if (_state !== 'playing') return;
    _state = 'paused';
    ABEngine.pause();
    showOverlay('pauseScreen');
  }

  function resume() {
    if (_state !== 'paused') return;
    _state = 'playing';
    hideAllOverlays();
    ABEngine.resume();
  }

  function restart() {
    clearTutHighlights();
    el('tutOverlay').classList.add('hidden');
    hideAllOverlays();
    showHUD(true);
    setScore(0); setWave(1); setIgG(0); setHealth(100);
    _firstKillToasted = false;
    _tutStep = 0;

    ABEngine.stop();
    ABEngine.start(engineCallbacks);

    // Returning players never see tutorial again
    _state = 'playing';
    showWaveBanner(1);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  BOOTSTRAP                                                           */
  /* ─────────────────────────────────────────────────────────────────── */

  function bootstrap() {
    const cvs = document.getElementById('gameCanvas');
    cvs.addEventListener('touchstart', onTouchStart, { passive: false });
    cvs.addEventListener('touchend',   onTouchEnd,   { passive: false });
    window.addEventListener('keydown', onKeyDown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PUBLIC API                                                          */
  /* ─────────────────────────────────────────────────────────────────── */

  return { start, pause, resume, restart, tutNext, tutSkip };

})();
