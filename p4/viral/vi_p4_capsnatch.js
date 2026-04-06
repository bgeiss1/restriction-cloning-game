/**
 * vi_p4_capsnatch.js — Phase 4 Cap-Snatch Minigame (Chunk 4).
 *
 * Triggered when an RdRp polymerase arrives at a Pol II transcription site.
 * Implements a two-phase minigame:
 *   1. PB2 Grab  — click a reticle centered on the 5′ cap sphere
 *   2. PA Cleave — stop a bouncing slider in the optimal zone
 *
 * Cleavage outcomes:
 *   10–13 nt → OPTIMAL  (+50 pts, full transcription efficiency)
 *    8–9 nt  → SHORT    (30 % slower transcription, no score change)
 *   14–15 nt → LONG     (−25 pts, full efficiency)
 *   <8 or >15 nt → FAIL (cap lost, no transcription)
 *
 * API:
 *   P4CapSnatch.init(scene, camera, canvas)
 *   P4CapSnatch.start(poly, siteIdx, onSuccess, onFail)
 *     onSuccess(poly, siteIdx, outcome)  outcome = { efficiency, score }
 *     onFail(poly, siteIdx)
 *   P4CapSnatch.tick(dt)
 *   P4CapSnatch.destroy()
 *   P4CapSnatch.isActive()          → bool
 *   P4CapSnatch.getAutoSnatch()     → bool
 *
 * Educational triggers dispatched as CustomEvent('p4EduTrigger') on window:
 *   CAP_SNATCH_START  — minigame begins
 *   PB2_GRAB          — cap grabbed (or auto-grabbed)
 *   PA_CLEAVE_GOOD    — optimal or short result
 *   PA_CLEAVE_BAD     — long or fail result
 *
 * Integration (in vi_p4_main.js launch):
 *   P4PolymeraseManager.setPolIIArrivalHandler((poly, siteIdx) => {
 *     P4CapSnatch.start(poly, siteIdx, _onCapSuccess, _onCapFail);
 *   });
 */

/* global THREE, P4_CFG, P4Camera, P4PolIISites */

const P4CapSnatch = (() => {

  // ── Module state ──────────────────────────────────────────────────────────

  let _scene  = null;
  let _camera = null;
  let _canvas = null;

  let _active     = false;
  let _phase      = null;   // 'zoom'|'grab'|'retry'|'cleave'|'result'|null
  let _autoSnatch = false;

  let _poly      = null;
  let _siteIdx   = -1;
  let _site      = null;
  let _onSuccess = null;
  let _onFail    = null;

  let _pendingOutcome = null;   // { zone, outcome } set before result phase

  // ── Camera zoom constants / state ─────────────────────────────────────────

  const FOV_NORMAL    = 50;     // matches P4_CFG.CAM_FOV
  const FOV_CLOSE     = 40;
  const ZOOM_CLOSER   = 5;      // units pulled closer during minigame
  const ZOOM_IN_DUR   = 0.4;    // seconds for zoom tween

  let _origZoomDist = 0;
  let _fovFrom      = FOV_NORMAL;
  let _fovTo        = FOV_NORMAL;
  let _fovT         = 0;
  let _fovDur       = ZOOM_IN_DUR;
  let _fovTweening  = false;
  let _zoomPhaseT   = 0;   // counts up; grab starts when >= ZOOM_IN_DUR

  // ── Grab phase ────────────────────────────────────────────────────────────

  const RETRY_DURATION  = 2.0;
  const MISS_FLASH_DUR  = 0.8;
  const GRAB_CLICK_DIST = 1.5;   // hit radius in world units

  let _reticleEl   = null;
  let _grabLabelEl = null;
  let _missEl      = null;
  let _missT       = 0;
  let _retryTimer  = 0;

  // ── Cleave phase ──────────────────────────────────────────────────────────

  const SLIDER_NT_MIN      = 6;
  const SLIDER_NT_MAX      = 17;    // pos 0..1 maps to nt 6..17
  const SLIDER_HALF_PERIOD = 2.0;   // 0→1 sweep in 2 s, then bounces

  let _sliderEl  = null;
  let _cleaveT   = 0;
  let _sliderPos = 0;   // 0..1

  // ── Result phase ──────────────────────────────────────────────────────────

  const RESULT_SHOW_DUR = 1.2;

  let _resultEl    = null;
  let _resultTimer = 0;

  // ── Cap sphere attached to poly ───────────────────────────────────────────

  let _attachedCapMesh = null;

  // ── Input capture handlers ────────────────────────────────────────────────

  let _captureDown  = null;
  let _captureClick = null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _worldToScreen(v3) {
    const ndc = v3.clone().project(_camera);
    return {
      x: (ndc.x + 1) * 0.5 * window.innerWidth,
      y: (1 - ndc.y) * 0.5 * window.innerHeight,
    };
  }

  /** Screen-pixel length of 1 world unit at the cap's position. */
  function _screenPxPer1u() {
    const base = _site.capMesh.position.clone();
    const off  = base.clone().add(new THREE.Vector3(1, 0, 0));
    const s0   = _worldToScreen(base);
    const s1   = _worldToScreen(off);
    return Math.hypot(s1.x - s0.x, s1.y - s0.y);
  }

  function _ntFromPos(pos) {
    return SLIDER_NT_MIN + pos * (SLIDER_NT_MAX - SLIDER_NT_MIN);
  }

  /** Classify continuous nt value into outcome zone. */
  function _classifyNt(nt) {
    if (nt >= 9.5  && nt <= 13.5) return 'optimal';
    if (nt >= 7.5  && nt <  9.5)  return 'short';
    if (nt >  13.5 && nt <= 15.5) return 'long';
    return 'fail';
  }

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── Easing ────────────────────────────────────────────────────────────────

  function _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
  }

  // ── UI: reticle ───────────────────────────────────────────────────────────

  function _createReticle() {
    _reticleEl = document.createElement('div');
    _reticleEl.style.cssText = [
      'position:fixed;pointer-events:none;z-index:400',
      'border-radius:50%',
      'border:2px solid rgba(255,204,0,0.9)',
      'box-shadow:0 0 12px 2px rgba(255,204,0,0.5),inset 0 0 6px rgba(255,204,0,0.12)',
      'transform:translate(-50%,-50%)',
    ].join(';');
    document.body.appendChild(_reticleEl);
  }

  function _updateReticle() {
    if (!_reticleEl || !_site || !_camera) return;
    const sc  = _worldToScreen(_site.capMesh.position);
    const px  = _screenPxPer1u() * GRAB_CLICK_DIST;
    const d   = px * 2;
    _reticleEl.style.left   = sc.x + 'px';
    _reticleEl.style.top    = sc.y + 'px';
    _reticleEl.style.width  = d + 'px';
    _reticleEl.style.height = d + 'px';
    if (_grabLabelEl) {
      _grabLabelEl.style.left = sc.x + 'px';
      _grabLabelEl.style.top  = (sc.y + px + 14) + 'px';
    }
  }

  function _destroyReticle() {
    if (_reticleEl && _reticleEl.parentNode) _reticleEl.parentNode.removeChild(_reticleEl);
    _reticleEl = null;
  }

  // ── UI: grab instruction label ────────────────────────────────────────────

  function _createGrabLabel() {
    _grabLabelEl = document.createElement('div');
    _grabLabelEl.style.cssText = [
      'position:fixed;pointer-events:none;z-index:400',
      'transform:translate(-50%,0)',
      'text-align:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'color:#ffdd88;font-size:0.72rem;letter-spacing:0.10em;font-weight:600',
      'text-shadow:0 1px 6px rgba(0,0,0,0.95),0 0 12px rgba(0,0,0,0.8)',
      'white-space:nowrap',
    ].join(';');
    _grabLabelEl.innerHTML =
      '<span style="color:#cc9966">PB2</span> GRAB — CLICK THE 5\u2032 CAP'
      + '<br><span style="color:#554466;font-size:0.62rem">'
      + '[A] Auto-snatch: '
      + (_autoSnatch
          ? '<span style="color:#88ee88">ON</span>'
          : '<span style="color:#776688">OFF</span>')
      + '</span>';
    document.body.appendChild(_grabLabelEl);
  }

  function _destroyGrabLabel() {
    if (_grabLabelEl && _grabLabelEl.parentNode) _grabLabelEl.parentNode.removeChild(_grabLabelEl);
    _grabLabelEl = null;
  }

  // ── UI: miss flash ────────────────────────────────────────────────────────

  function _showMissFlash() {
    _destroyMissFlash();
    _missEl = document.createElement('div');
    _missEl.style.cssText = [
      'position:fixed;top:42%;left:50%;transform:translate(-50%,-50%)',
      'pointer-events:none;z-index:401',
      'color:#ff4444;font-size:1.1rem;font-weight:700;letter-spacing:0.14em',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'text-shadow:0 0 18px rgba(255,60,60,0.85)',
    ].join(';');
    _missEl.textContent = 'MISS';
    document.body.appendChild(_missEl);
    _missT = MISS_FLASH_DUR;
  }

  function _destroyMissFlash() {
    if (_missEl && _missEl.parentNode) _missEl.parentNode.removeChild(_missEl);
    _missEl = null;
    _missT  = 0;
  }

  // ── UI: cleave slider overlay ─────────────────────────────────────────────

  function _createSliderOverlay() {
    _sliderEl = document.createElement('div');
    _sliderEl.id = 'p4CapSnatchOverlay';
    _sliderEl.style.cssText = [
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)',
      'z-index:400;pointer-events:none',
      'display:flex;flex-direction:column;align-items:center;gap:10px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    // Title row
    const title = document.createElement('div');
    title.style.cssText = [
      'background:rgba(10,8,24,0.90)',
      'border:1px solid rgba(200,170,50,0.40)',
      'border-radius:5px;padding:5px 20px',
      'color:#ffdd88;font-size:0.80rem;letter-spacing:0.10em;font-weight:600',
    ].join(';');
    title.innerHTML =
      '<span style="color:#55bb77">PA</span> CLEAVAGE — '
      + '<span style="color:#ccbbee">CLICK TO STOP</span>';

    // Zone bar (480 px wide × 28 px tall)
    // nt 6–7 = FAIL, 8–9 = SHORT, 10–13 = OPTIMAL, 14–15 = LONG, 16–17 = FAIL
    // flex widths proportional to zone width in nt: 2, 2, 4, 2, 2
    const barWrap = document.createElement('div');
    barWrap.style.cssText = [
      'width:480px;height:28px;border-radius:5px;overflow:hidden',
      'position:relative',
      'border:1px solid rgba(200,200,100,0.30)',
      'display:flex',
      'background:rgba(5,4,14,0.92)',
    ].join(';');

    const zones = [
      { flex: 2, bg: 'rgba(140,20,20,0.80)',  label: 'FAIL',    fg: '#ff7777' },
      { flex: 2, bg: 'rgba(130,100,0,0.80)',  label: 'SHORT',   fg: '#ffee44' },
      { flex: 4, bg: 'rgba(15,100,40,0.80)',  label: 'OPTIMAL', fg: '#44ff88' },
      { flex: 2, bg: 'rgba(130,100,0,0.80)',  label: 'LONG',    fg: '#ffee44' },
      { flex: 2, bg: 'rgba(140,20,20,0.80)',  label: 'FAIL',    fg: '#ff7777' },
    ];
    for (const z of zones) {
      const zd = document.createElement('div');
      zd.style.cssText =
        `flex:${z.flex};background:${z.bg};`
        + 'display:flex;align-items:center;justify-content:center;';
      const zt = document.createElement('span');
      zt.style.cssText =
        `color:${z.fg};font-size:0.54rem;letter-spacing:0.08em;font-weight:700;`;
      zt.textContent = z.label;
      zd.appendChild(zt);
      barWrap.appendChild(zd);
    }

    // Moving indicator
    const indicator = document.createElement('div');
    indicator.id = 'p4CsIndicator';
    indicator.style.cssText = [
      'position:absolute;top:0;bottom:0;width:3px',
      'background:#ffffff;border-radius:2px',
      'box-shadow:0 0 8px 2px rgba(255,255,255,0.9)',
      'left:0%;transform:translateX(-50%)',
      'pointer-events:none',
    ].join(';');
    barWrap.appendChild(indicator);

    // NT readout
    const ntLbl = document.createElement('div');
    ntLbl.id = 'p4CsNtLbl';
    ntLbl.style.cssText = [
      'background:rgba(10,8,24,0.80)',
      'border:1px solid rgba(130,110,200,0.30)',
      'border-radius:4px;padding:3px 14px',
      'color:#ccbbee;font-size:0.70rem;letter-spacing:0.06em',
    ].join(';');
    ntLbl.textContent = '— nt';

    // Auto-snatch hint
    const autoHint = document.createElement('div');
    autoHint.style.cssText = 'color:#443355;font-size:0.62rem;letter-spacing:0.05em';
    autoHint.innerHTML =
      '[A] Auto-snatch: '
      + (_autoSnatch
          ? '<span style="color:#88ee88">ON</span>'
          : '<span style="color:#776688">OFF</span>');

    _sliderEl.appendChild(title);
    _sliderEl.appendChild(barWrap);
    _sliderEl.appendChild(ntLbl);
    _sliderEl.appendChild(autoHint);
    document.body.appendChild(_sliderEl);
  }

  function _updateSliderIndicator() {
    const ind = document.getElementById('p4CsIndicator');
    if (ind) ind.style.left = (_sliderPos * 100).toFixed(2) + '%';
    const ntLbl = document.getElementById('p4CsNtLbl');
    if (ntLbl) {
      const nt = _ntFromPos(_sliderPos);
      ntLbl.textContent = Math.round(nt) + ' nt';
    }
  }

  function _destroySlider() {
    if (_sliderEl && _sliderEl.parentNode) _sliderEl.parentNode.removeChild(_sliderEl);
    _sliderEl = null;
  }

  // ── UI: result flash ──────────────────────────────────────────────────────

  function _showResultOverlay(outcome) {
    _resultEl = document.createElement('div');
    _resultEl.style.cssText = [
      'position:fixed;top:46%;left:50%;transform:translate(-50%,-50%)',
      'pointer-events:none;z-index:401',
      `color:${outcome.color}`,
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:1.5rem;font-weight:700;letter-spacing:0.15em;text-align:center',
      'text-shadow:0 0 28px currentColor,0 2px 8px rgba(0,0,0,0.9)',
    ].join(';');
    _resultEl.textContent = outcome.label;
    if (outcome.score !== 0) {
      const sd = document.createElement('div');
      sd.style.cssText = 'font-size:0.95rem;margin-top:6px;opacity:0.85;text-align:center';
      sd.textContent = (outcome.score > 0 ? '+' : '') + outcome.score + ' pts';
      _resultEl.appendChild(sd);
    }
    document.body.appendChild(_resultEl);
  }

  function _destroyResultOverlay() {
    if (_resultEl && _resultEl.parentNode) _resultEl.parentNode.removeChild(_resultEl);
    _resultEl = null;
  }

  // ── Three.js: cap sphere on poly ──────────────────────────────────────────

  function _attachCapToPoly() {
    if (!_poly || _attachedCapMesh) return;
    const geo = new THREE.SphereGeometry(P4_CFG.MRNA_CAP_RADIUS * 1.3, 8, 6);
    const mat = new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_MRNA_CAP,
      emissive:          new THREE.Color(P4_CFG.COL_MRNA_CAP),
      emissiveIntensity: 0.75,
    });
    _attachedCapMesh = new THREE.Mesh(geo, mat);
    _attachedCapMesh.name = `poly_cap_${_poly.idx}`;
    _attachedCapMesh.position.set(0, 0.52, 0);   // floats above the tri-lobe complex
    _poly.group.add(_attachedCapMesh);
    _poly.capMesh = _attachedCapMesh;   // store ref on poly for Chunk 5
  }

  // ── Phase transitions ─────────────────────────────────────────────────────

  function _startZoom() {
    _phase        = 'zoom';
    _zoomPhaseT   = 0;
    _origZoomDist = P4Camera.getZoomDist();
    P4Camera.zoomTo(_origZoomDist - ZOOM_CLOSER);
    P4Camera.panTo(_site.x, _site.z, ZOOM_IN_DUR);

    _fovFrom     = _camera.fov;
    _fovTo       = FOV_CLOSE;
    _fovT        = 0;
    _fovDur      = ZOOM_IN_DUR;
    _fovTweening = true;
  }

  function _startGrab() {
    _phase = 'grab';
    // Ensure cap is visible (site may not have grown its mRNA fully yet)
    if (_site.capMesh) _site.capMesh.visible = true;
    _createReticle();
    _createGrabLabel();
    // Capture-phase input already registered by start()
  }

  function _onGrabClick(cx, cy) {
    if (!_site || !_camera) return;
    const capSc   = _worldToScreen(_site.capMesh.position);
    const pxRadius = _screenPxPer1u() * GRAB_CLICK_DIST;
    const pxDist   = Math.hypot(cx - capSc.x, cy - capSc.y);

    if (pxDist <= pxRadius) {
      _destroyReticle();
      _destroyGrabLabel();
      _site.capMesh.visible = false;   // cap leaves Pol II site
      _dispatchEdu('PB2_GRAB', { siteIdx: _siteIdx, polyIdx: _poly.idx });
      _startCleave();
    } else {
      _showMissFlash();
      _phase      = 'retry';
      _retryTimer = RETRY_DURATION;
    }
  }

  function _startCleave() {
    _phase   = 'cleave';
    _cleaveT = 0;
    _createSliderOverlay();
  }

  function _onCleaveClick() {
    _destroySlider();
    const nt   = _ntFromPos(_sliderPos);
    const zone = _classifyNt(nt);
    _resolveOutcome(zone, nt);
  }

  function _resolveOutcome(zone, nt) {
    const OUTCOMES = {
      optimal: { label: 'OPTIMAL CAP!', color: '#44ff88', score: +50, efficiency: 'optimal' },
      short:   { label: 'SHORT CAP',    color: '#ffcc44', score:   0, efficiency: 'short'   },
      long:    { label: 'TOO LONG',     color: '#ffaa22', score: -25, efficiency: 'long'    },
      fail:    { label: 'CAP LOST!',    color: '#ff4444', score:   0, efficiency: 'fail'    },
    };
    const outcome = OUTCOMES[zone];
    _pendingOutcome = { zone, outcome };

    _phase       = 'result';
    _resultTimer = RESULT_SHOW_DUR;
    _showResultOverlay(outcome);

    if (zone !== 'fail') _attachCapToPoly();

    if (zone === 'optimal' || zone === 'short') {
      _dispatchEdu('PA_CLEAVE_GOOD', { zone, nt: Math.round(nt), score: outcome.score });
    } else {
      _dispatchEdu('PA_CLEAVE_BAD',  { zone, nt: Math.round(nt), score: outcome.score });
    }
  }

  function _runAutoSnatch() {
    _phase = 'result';
    if (_site.capMesh) _site.capMesh.visible = false;
    _attachCapToPoly();
    const outcome = { label: 'AUTO-SNATCH', color: '#ffcc44', score: 0, efficiency: 'short' };
    _pendingOutcome = { zone: 'short', outcome };
    _resultTimer = RESULT_SHOW_DUR;
    _showResultOverlay(outcome);
    _dispatchEdu('PB2_GRAB',       { siteIdx: _siteIdx, polyIdx: _poly.idx, auto: true });
    _dispatchEdu('PA_CLEAVE_GOOD', { zone: 'short', nt: 9, score: 0, auto: true });
  }

  function _finishMinigame() {
    _unregisterCapture();
    _destroyResultOverlay();

    // Restore camera (tween back; continues after _active = false)
    P4Camera.zoomTo(_origZoomDist);
    _fovFrom     = _camera.fov;
    _fovTo       = FOV_NORMAL;
    _fovT        = 0;
    _fovDur      = ZOOM_IN_DUR;
    _fovTweening = true;

    P4PolIISites.startCooldown(_siteIdx);

    // Capture state before clearing
    const po        = _pendingOutcome;
    const zone      = po ? po.zone : 'fail';
    const poly      = _poly;
    const sidx      = _siteIdx;
    const successCb = _onSuccess;
    const failCb    = _onFail;

    // Clear state (allows start() to be called again immediately)
    _active          = false;
    _phase           = null;
    _pendingOutcome  = null;
    _poly            = null;
    _siteIdx         = -1;
    _site            = null;
    _onSuccess       = null;
    _onFail          = null;
    _attachedCapMesh = null;

    poly.state          = 'idle';
    poly.assignedTarget = null;

    if (zone === 'fail') {
      if (failCb) failCb(poly, sidx);
    } else {
      if (successCb) successCb(poly, sidx, po.outcome);
    }
  }

  // ── Input capture ─────────────────────────────────────────────────────────

  function _registerCapture() {
    _captureDown = (e) => {
      if (!_active || e.button !== 0) return;
      e.stopPropagation();   // block polyman box-select + P4Interaction
    };
    _captureClick = (e) => {
      if (!_active) return;
      e.stopPropagation();
      e.preventDefault();
      if      (_phase === 'grab')   _onGrabClick(e.clientX, e.clientY);
      else if (_phase === 'cleave') _onCleaveClick();
      // 'zoom' | 'retry' | 'result': block clicks but take no action
    };
    _canvas.addEventListener('mousedown', _captureDown,  true);
    _canvas.addEventListener('click',     _captureClick, true);
  }

  function _unregisterCapture() {
    if (_canvas && _captureDown) {
      _canvas.removeEventListener('mousedown', _captureDown,  true);
      _canvas.removeEventListener('click',     _captureClick, true);
    }
    _captureDown  = null;
    _captureClick = null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  let _keyHandler = null;

  function _bindKeys() {
    _keyHandler = (e) => {
      if (e.code !== 'KeyA') return;
      _autoSnatch = !_autoSnatch;
      // If currently in grab phase, refresh the instruction label
      if (_active && _phase === 'grab') {
        _destroyGrabLabel();
        _createGrabLabel();
        _updateReticle();
      }
    };
    window.addEventListener('keydown', _keyHandler);
  }

  function _unbindKeys() {
    if (_keyHandler) window.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, camera, canvas) {
    _scene  = scene;
    _camera = camera;
    _canvas = canvas;
    _bindKeys();
  }

  /**
   * Start the cap-snatch minigame for the given polymerase arriving at siteIdx.
   * If a minigame is already running, the incoming poly is immediately released
   * with a fail callback (only one minigame runs at a time).
   */
  function start(poly, siteIdx, onSuccess, onFail) {
    if (_active) {
      // Reject quietly; free the poly
      poly.state          = 'idle';
      poly.assignedTarget = null;
      P4PolIISites.startCooldown(siteIdx);
      if (onFail) onFail(poly, siteIdx);
      return;
    }

    _active    = true;
    _poly      = poly;
    _siteIdx   = siteIdx;
    _site      = P4PolIISites.getByIndex(siteIdx);
    _onSuccess = onSuccess;
    _onFail    = onFail;

    poly.state = 'busy';

    _dispatchEdu('CAP_SNATCH_START', { siteIdx, polyIdx: poly.idx });

    _registerCapture();

    if (_autoSnatch) {
      _runAutoSnatch();
    } else {
      _startZoom();
    }
  }

  function tick(dt) {
    // FOV tween runs even after _active is cleared (camera restore on finish)
    if (!_fovTweening && !_active) return;

    if (_fovTweening) {
      _fovT += dt;
      const frac = Math.min(1, _fovT / _fovDur);
      _camera.fov = _fovFrom + (_fovTo - _fovFrom) * _easeInOutQuad(frac);
      _camera.updateProjectionMatrix();
      if (frac >= 1) _fovTweening = false;
    }

    if (!_active) return;

    if (_phase === 'zoom') {
      _zoomPhaseT += dt;
      if (_zoomPhaseT >= ZOOM_IN_DUR) {
        _startGrab();
      }

    } else if (_phase === 'grab') {
      _updateReticle();
      // Pulse reticle opacity
      if (_reticleEl) {
        const op = 0.65 + 0.35 * Math.sin(performance.now() * 0.0038);
        _reticleEl.style.opacity = op.toFixed(3);
      }
      // Fade miss flash
      if (_missT > 0) {
        _missT -= dt;
        if (_missEl) _missEl.style.opacity = Math.max(0, _missT / MISS_FLASH_DUR).toFixed(3);
        if (_missT <= 0) _destroyMissFlash();
      }

    } else if (_phase === 'retry') {
      _retryTimer -= dt;
      if (_retryTimer <= 0) {
        _destroyMissFlash();
        _phase = 'grab';
        _createReticle();
        _createGrabLabel();
        _updateReticle();
      }

    } else if (_phase === 'cleave') {
      _cleaveT += dt;
      // Triangle wave: 0→1 in SLIDER_HALF_PERIOD seconds, then 1→0, repeating
      const cycle = (_cleaveT / SLIDER_HALF_PERIOD) % 2;
      _sliderPos  = cycle <= 1 ? cycle : 2 - cycle;
      _updateSliderIndicator();

    } else if (_phase === 'result') {
      _resultTimer -= dt;
      // Fade out in final 0.4 s
      if (_resultEl) {
        const alpha = _resultTimer < 0.4 ? Math.max(0, _resultTimer / 0.4) : 1;
        _resultEl.style.opacity = alpha.toFixed(3);
      }
      if (_resultTimer <= 0) {
        _finishMinigame();
      }
    }
  }

  function destroy() {
    _unregisterCapture();
    _unbindKeys();
    _destroyReticle();
    _destroyGrabLabel();
    _destroyMissFlash();
    _destroySlider();
    _destroyResultOverlay();

    // Snap camera FOV back immediately
    if (_camera && _camera.fov !== FOV_NORMAL) {
      _camera.fov = FOV_NORMAL;
      _camera.updateProjectionMatrix();
    }
    if (_origZoomDist > 0 && _active) {
      P4Camera.zoomTo(_origZoomDist);
    }

    _active          = false;
    _phase           = null;
    _fovTweening     = false;
    _pendingOutcome  = null;
    _poly            = null;
    _siteIdx         = -1;
    _site            = null;
    _onSuccess       = null;
    _onFail          = null;
    _attachedCapMesh = null;
    _scene           = null;
    _camera          = null;
    _canvas          = null;
  }

  function isActive()     { return _active; }
  function getAutoSnatch() { return _autoSnatch; }

  return { init, start, tick, destroy, isActive, getAutoSnatch };

})();
