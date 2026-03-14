/**
 * ab_game.js — Input, HUD wiring, and state machine for Antibody Rush
 *
 * Depends on: ab_sprites.js, ab_engine.js
 * Exports global: ABGame
 *
 * Handles:
 *  - Touch/mouse input: swipe up/down to cycle epitope, tap to fire
 *  - Keyboard input: ArrowUp/Down to cycle, Space to fire
 *  - HUD updates: score, wave, IgG count, health bar
 *  - Overlay management: start → game → pause → game-over
 *  - Wave banner and IgG flash notifications
 *  - Toast messages
 */

const ABGame = (() => {

  /* ── DOM refs (resolved on first use via el()) ───────────────────── */
  const el = id => document.getElementById(id);

  /* ── State ───────────────────────────────────────────────────────── */
  let _state = 'start';   // 'start' | 'playing' | 'paused' | 'over'

  /* ── Touch tracking ──────────────────────────────────────────────── */
  let _touchStartY  = null;
  let _touchStartX  = null;
  let _touchStartT  = null;
  const SWIPE_THRESHOLD = 28;   // px of vertical movement = swipe
  const TAP_MAX_MOVE    = 14;   // px max movement = tap
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
    const cls = visible ? 'hidden' : 'hidden';  // just toggle via classList
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
  /*  WAVE BANNER                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  function showWaveBanner(waveNum) {
    const banner = el('waveBanner');
    banner.textContent = waveNum === 1 ? '— Wave 1 —' : `⚡ Wave ${waveNum}`;
    banner.classList.remove('active');
    // Force reflow to restart animation
    void banner.offsetWidth;
    banner.classList.add('active');
    banner.addEventListener('animationend', () => banner.classList.remove('active'), { once: true });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  IgG FLASH                                                           */
  /* ─────────────────────────────────────────────────────────────────── */

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
  /*  ENGINE CALLBACKS                                                    */
  /* ─────────────────────────────────────────────────────────────────── */

  const engineCallbacks = {
    onScoreChange:  n => setScore(n),
    onHealthChange: n => setHealth(n),
    onWaveChange:   n => setWave(n),
    onIgGChange:    n => {
      setIgG(n);
      // If IgG count just reached 0, update label in selector
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
    onIgGPickup:  (x, y) => {
      showIgGFlash();
      toast('✦ IgG Power-Up collected!', 'igg');
    },
  };

  /* ─────────────────────────────────────────────────────────────────── */
  /*  AB LABEL UPDATE                                                     */
  /* ─────────────────────────────────────────────────────────────────── */

  function updateAbLabel() {
    const lbl = el('abTypeLabel');
    if (!lbl) return;
    const type = ABEngine.currentEpitopeType();
    const ep   = ABSprites.EPITOPE[type];
    const isIgG = ABEngine.isIgGActive();
    lbl.textContent = (isIgG ? 'IgG ✦' : 'IgM') + ' · ' + (ep?.label ?? type);
    lbl.style.color = isIgG ? 'var(--igg-color)' : 'var(--igm-color)';
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  INPUT — TOUCH                                                       */
  /* ─────────────────────────────────────────────────────────────────── */

  function onTouchStart(e) {
    if (_state !== 'playing') return;
    // Ignore taps on HUD/selector overlays
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || e.target.closest('#hud') || e.target.closest('#abSelector')) return;

    const t = e.touches[0];
    _touchStartY = t.clientY;
    _touchStartX = t.clientX;
    _touchStartT = Date.now();
    e.preventDefault();
  }

  function onTouchEnd(e) {
    if (_state !== 'playing') return;
    if (_touchStartY === null) return;
    const tag = e.target.tagName;
    if (tag === 'BUTTON' || e.target.closest('#hud') || e.target.closest('#abSelector')) return;

    const t   = e.changedTouches[0];
    const dy  = t.clientY - _touchStartY;
    const dx  = t.clientX - _touchStartX;
    const dt  = Date.now() - _touchStartT;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (ady > SWIPE_THRESHOLD && ady > adx * 1.2) {
      // Vertical swipe — cycle epitope
      ABEngine.cycleEpitope(dy < 0 ? -1 : 1);
      updateAbLabel();
    } else if (adx < TAP_MAX_MOVE && ady < TAP_MAX_MOVE && dt < TAP_MAX_MS) {
      // Tap — fire
      handleFire();
    }

    _touchStartY = null;
    _touchStartX = null;
    e.preventDefault();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  INPUT — KEYBOARD (desktop testing)                                  */
  /* ─────────────────────────────────────────────────────────────────── */

  function onKeyDown(e) {
    if (_state !== 'playing') return;
    switch (e.key) {
      case 'ArrowUp':
        ABEngine.cycleEpitope(-1);
        updateAbLabel();
        break;
      case 'ArrowDown':
        ABEngine.cycleEpitope(1);
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
    // Visual feedback — brief ab label flash
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
    _state = 'playing';
    hideAllOverlays();
    showHUD(true);
    setScore(0);
    setWave(1);
    setIgG(0);
    setHealth(100);
    updateAbLabel();

    ABEngine.init(document.getElementById('gameCanvas'));
    ABEngine.start(engineCallbacks);
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
    _state = 'playing';
    hideAllOverlays();
    showHUD(true);
    setScore(0);
    setWave(1);
    setIgG(0);
    setHealth(100);
    updateAbLabel();

    ABEngine.stop();
    ABEngine.start(engineCallbacks);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  BOOTSTRAP                                                           */
  /* ─────────────────────────────────────────────────────────────────── */

  function bootstrap() {
    // Touch events on canvas
    const cvs = document.getElementById('gameCanvas');
    cvs.addEventListener('touchstart', onTouchStart, { passive: false });
    cvs.addEventListener('touchend',   onTouchEnd,   { passive: false });

    // Keyboard
    window.addEventListener('keydown', onKeyDown);

    // Pause button is wired via onclick in HTML
    // Start/Resume/Restart are wired via onclick in HTML
  }

  // Run bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PUBLIC API                                                          */
  /* ─────────────────────────────────────────────────────────────────── */

  return { start, pause, resume, restart };

})();
