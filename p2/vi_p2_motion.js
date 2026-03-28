// vi_p2_motion.js — device orientation/motion input for Phase 2 lane runner
// Supports portrait and landscape via axis remapping.
// Persists settings in localStorage.
'use strict';

const P2MotionControls = (() => {

  // ── Persisted settings ──────────────────────────────────────────────────
  const S = {
    enabled:     false,
    jerkJump:    false,
    sensitivity: 1.0,
    baseGamma:   0,   // calibrated lateral baseline
    baseBeta:    0,   // calibrated forward/back baseline
  };

  function _load() {
    try {
      S.enabled     = localStorage.getItem('p2_mot_en')   === 'true';
      S.jerkJump    = localStorage.getItem('p2_mot_jerk') === 'true';
      S.sensitivity = parseFloat(localStorage.getItem('p2_mot_sens') || '1');
      S.baseGamma   = parseFloat(localStorage.getItem('p2_mot_bg')   || '0');
      S.baseBeta    = parseFloat(localStorage.getItem('p2_mot_bb')   || '0');
      if (isNaN(S.sensitivity)) S.sensitivity = 1;
      if (isNaN(S.baseGamma))   S.baseGamma   = 0;
      if (isNaN(S.baseBeta))    S.baseBeta    = 0;
    } catch (e) {}
  }

  function _save() {
    try {
      localStorage.setItem('p2_mot_en',   String(S.enabled));
      localStorage.setItem('p2_mot_jerk', String(S.jerkJump));
      localStorage.setItem('p2_mot_sens', String(S.sensitivity));
      localStorage.setItem('p2_mot_bg',   String(S.baseGamma));
      localStorage.setItem('p2_mot_bb',   String(S.baseBeta));
    } catch (e) {}
  }

  // ── Runtime state ────────────────────────────────────────────────────────
  const _input = { left: false, right: false, jump: false, slide: false };
  let _rawLR        = 0;   // current remapped lateral sensor value (before baseline)
  let _rawFB        = 0;   // current remapped forward/back sensor value
  let _holdLeftAt   = 0;   // performance.now() when left tilt started, 0 if not tilting
  let _holdRightAt  = 0;
  let _jerkCooldown = 0;   // performance.now() deadline for next allowed jerk jump
  let _prevAccelZ   = 0;
  let _listening    = false;

  // ── Thresholds ───────────────────────────────────────────────────────────
  const BASE_TILT   = 15;   // degrees — scaled by 1/sensitivity
  const BASE_SLIDE  = 22;   // degrees
  const HOLD_MS     = 80;   // tilt must be held this long before lane change fires
  const JERK_THRESH = 18;   // m/s² spike magnitude for jerk jump
  const JERK_COOL   = 400;  // ms cooldown after jerk jump

  // ── Screen orientation → axis remapping ─────────────────────────────────
  // DeviceOrientation axes are always relative to device natural orientation,
  // so we remap based on current screen rotation so tilting "left" always means
  // lane-left regardless of portrait/landscape.
  function _screenAngle() {
    if (window.screen && window.screen.orientation)
      return window.screen.orientation.angle || 0;
    return (typeof window.orientation === 'number') ? window.orientation : 0;
  }

  // Returns { lr, fb } — lateral (negative=left) and forward/back (positive=forward lean)
  function _remap(gamma, beta) {
    const g = gamma || 0, b = beta || 0;
    switch (_screenAngle()) {
      case  90:           return { lr: -b,  fb:  g };   // landscape CW
      case -90: case 270: return { lr:  b,  fb: -g };   // landscape CCW
      case  180:          return { lr: -g,  fb: -b };   // portrait upside-down
      default:            return { lr:  g,  fb:  b };   // portrait normal
    }
  }

  // Remap z-axis acceleration for jerk detection
  function _remapAccelZ(accel) {
    switch (_screenAngle()) {
      case  90:           return -(accel.x || 0);
      case -90: case 270: return  (accel.x || 0);
      default:            return  (accel.z || 0);
    }
  }

  // ── Event handlers ───────────────────────────────────────────────────────
  function _onOrientation(e) {
    if (!S.enabled) return;
    const { lr, fb } = _remap(e.gamma, e.beta);
    _rawLR = lr;
    _rawFB = fb;

    const relLR  = lr - S.baseGamma;
    const relFB  = fb - S.baseBeta;
    const thresh = BASE_TILT  / S.sensitivity;
    const slThresh = BASE_SLIDE / S.sensitivity;
    const now = performance.now();

    // Lateral lane input — require HOLD_MS of sustained tilt to avoid jitter
    if (relLR < -thresh) {
      _holdRightAt = 0;
      if (!_holdLeftAt) _holdLeftAt = now;
      _input.left  = (now - _holdLeftAt) >= HOLD_MS;
      _input.right = false;
    } else if (relLR > thresh) {
      _holdLeftAt = 0;
      if (!_holdRightAt) _holdRightAt = now;
      _input.right = (now - _holdRightAt) >= HOLD_MS;
      _input.left  = false;
    } else {
      _holdLeftAt = _holdRightAt = 0;
      _input.left = _input.right = false;
    }

    // Slide: sustained forward lean past threshold
    _input.slide = relFB > slThresh;
  }

  function _onMotion(e) {
    if (!S.enabled || !S.jerkJump) return;
    if (performance.now() < _jerkCooldown) return;
    const raw = e.acceleration || e.accelerationIncludingGravity;
    if (!raw) return;
    const az    = _remapAccelZ(raw);
    const delta = Math.abs(az - _prevAccelZ);
    _prevAccelZ = az;
    if (delta > JERK_THRESH) {
      _input.jump   = true;
      _jerkCooldown = performance.now() + JERK_COOL;
      setTimeout(() => { _input.jump = false; }, 50);
    }
  }

  // ── Listener management ──────────────────────────────────────────────────
  function _attach() {
    if (_listening) return;
    _listening = true;
    window.addEventListener('deviceorientation', _onOrientation, { passive: true });
    window.addEventListener('devicemotion',      _onMotion,      { passive: true });
  }

  function _detach() {
    if (!_listening) return;
    _listening = false;
    window.removeEventListener('deviceorientation', _onOrientation);
    window.removeEventListener('devicemotion',      _onMotion);
    _input.left = _input.right = _input.jump = _input.slide = false;
  }

  // ── iOS 13+ permission ───────────────────────────────────────────────────
  async function _requestPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false;
      } catch (e) { return false; }
    }
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission(); } catch (e) {}
    }
    return true;
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  _load();
  if (S.enabled) _attach();

  // ── Public API ────────────────────────────────────────────────────────────
  return {

    // Live relative tilt values (after baseline subtraction) — used by tilt indicator
    get tiltLR()     { return _rawLR - S.baseGamma; },
    get tiltFB()     { return _rawFB - S.baseBeta; },
    get tiltThresh() { return BASE_TILT  / S.sensitivity; },
    get slideThresh(){ return BASE_SLIDE / S.sensitivity; },

    // Settings getters
    get enabled()     { return S.enabled; },
    get jerkJump()    { return S.jerkJump; },
    get sensitivity() { return S.sensitivity; },

    getInput() { return _input; },

    // Returns a merged keys object: motion input OR'd with existing keyboard keys.
    // Non-destructive — creates a shallow copy only if motion is adding something.
    mergeKeys(keys) {
      if (!S.enabled) return keys;
      const mi = _input;
      if (!mi.left && !mi.right && !mi.slide && !mi.jump) return keys;
      const k = Object.assign({}, keys);
      if (mi.left)  k['ArrowLeft']  = true;
      if (mi.right) k['ArrowRight'] = true;
      if (mi.slide) k['ArrowDown']  = true;
      if (mi.jump)  k['Space']      = true;
      return k;
    },

    // Injects a one-shot jump from a screen tap (tap-to-jump)
    tapJump() {
      if (!S.enabled) return;
      _input.jump = true;
      setTimeout(() => { _input.jump = false; }, 50);
    },

    // Enable / disable — requests iOS permission if needed.
    // Returns true if successfully enabled, false on permission denial.
    async setEnabled(v) {
      if (v) {
        const ok = await _requestPermission();
        if (!ok) return false;
        S.enabled = true;
        _attach();
      } else {
        S.enabled = false;
        _detach();
      }
      _save();
      return true;
    },

    setJerkJump(v) {
      S.jerkJump = !!v;
      _save();
    },

    setSensitivity(v) {
      S.sensitivity = Math.max(0.5, Math.min(2.0, parseFloat(v) || 1));
      _save();
    },

    // Snapshot current sensor position as the neutral/zero baseline.
    calibrate() {
      S.baseGamma = _rawLR;
      S.baseBeta  = _rawFB;
      _save();
    },
  };
})();

window.P2MotionControls = P2MotionControls;
