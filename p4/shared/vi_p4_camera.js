/**
 * vi_p4_camera.js — Phase 4 isometric camera controller.
 *
 * Isometric top-down camera with:
 *   - WASD / arrow-key pan
 *   - Right-click drag pan
 *   - Mouse-wheel zoom (lerped, min 20 / max 55)
 *   - Double-click quick-focus (0.5 s smoothstep tween)
 *   - Edge-of-screen pan (disabled during right-click drag)
 *   - Programmatic zoomTo / panTo for Chunk 4 cap-snatch
 *
 * API:
 *   P4Camera.init(camera, canvas)
 *   P4Camera.tick(dt)
 *   P4Camera.destroy()
 *   P4Camera.zoomTo(targetDist)          — immediate zoom target (lerped)
 *   P4Camera.panTo(x, z [, duration])    — smooth pan to world position
 *   P4Camera.getZoomDist()               → number
 */

/* global THREE, P4_CFG */

const P4Camera = (() => {

  let _camera = null;
  let _canvas = null;

  const _camTarget  = new THREE.Vector3();
  const _camOffset  = new THREE.Vector3();
  let   _zoomDist   = 0;
  let   _zoomTarget = 0;
  let   _focusTween = null;  // {fromX, fromZ, toX, toZ, t, dur}

  const _keys      = {};
  let   _rmbDown   = false;
  const _rmbStart  = { x: 0, z: 0 };
  const _mousePage = { x: 0, y: 0 };

  // ── Event handlers ────────────────────────────────────────────────────────

  function _onKeyDown(e) { _keys[e.code] = true; }
  function _onKeyUp(e)   { _keys[e.code] = false; }

  function _onWheel(e) {
    const delta = e.deltaY * 0.02;
    _zoomTarget = Math.max(P4_CFG.CAM_ZOOM_MIN,
                  Math.min(P4_CFG.CAM_ZOOM_MAX, _zoomTarget + delta));
    e.preventDefault();
  }

  function _onMouseDown(e) {
    if (e.button === 2) {
      _rmbDown = true;
      _rmbStart.x = e.clientX;
      _rmbStart.z = e.clientY;
      e.preventDefault();
    }
  }

  function _onMouseUp(e) {
    if (e.button === 2) _rmbDown = false;
  }

  function _onMouseMove(e) {
    _mousePage.x = e.clientX;
    _mousePage.y = e.clientY;

    if (_rmbDown) {
      const dx = e.clientX - _rmbStart.x;
      const dy = e.clientY - _rmbStart.z;
      _rmbStart.x = e.clientX;
      _rmbStart.z = e.clientY;

      const scale = _zoomDist / 500;
      _camTarget.x -= dx * scale;
      _camTarget.z -= dy * scale * 0.8;
      _clamp();
    }
  }

  function _onContextMenu(e) { e.preventDefault(); }

  function _onDblClick(e) {
    const w = window.innerWidth, h = window.innerHeight;
    const nx =  (e.clientX / w - 0.5) * 2;
    const ny = -(e.clientY / h - 0.5) * 2;
    const fovRad = P4_CFG.CAM_FOV * Math.PI / 180;
    const halfH  = Math.tan(fovRad * 0.5) * _zoomDist;
    const halfW  = halfH * (w / h);
    const wx = _camTarget.x + nx * halfW;
    const wz = _camTarget.z + ny * halfH * 0.6;
    panTo(wx, wz, P4_CFG.CAM_FOCUS_DURATION);
  }

  function _clamp() {
    const c = P4_CFG.CAM_PAN_CLAMP;
    _camTarget.x = Math.max(-c, Math.min(c, _camTarget.x));
    _camTarget.z = Math.max(-c, Math.min(c, _camTarget.z));
  }

  // ── Bind / unbind ─────────────────────────────────────────────────────────

  function _bind() {
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup',   _onKeyUp);
    if (_canvas) {
      _canvas.addEventListener('wheel',       _onWheel,       { passive: false });
      _canvas.addEventListener('mousedown',   _onMouseDown);
      _canvas.addEventListener('mouseup',     _onMouseUp);
      _canvas.addEventListener('mousemove',   _onMouseMove);
      _canvas.addEventListener('contextmenu', _onContextMenu);
      _canvas.addEventListener('dblclick',    _onDblClick);
    }
  }

  function _unbind() {
    window.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('keyup',   _onKeyUp);
    if (_canvas) {
      _canvas.removeEventListener('wheel',       _onWheel);
      _canvas.removeEventListener('mousedown',   _onMouseDown);
      _canvas.removeEventListener('mouseup',     _onMouseUp);
      _canvas.removeEventListener('mousemove',   _onMouseMove);
      _canvas.removeEventListener('contextmenu', _onContextMenu);
      _canvas.removeEventListener('dblclick',    _onDblClick);
    }
  }

  // ── Camera update (called each tick) ─────────────────────────────────────

  function _update(dt) {
    // Focus / pan tween
    if (_focusTween) {
      _focusTween.t += dt;
      const frac = Math.min(1, _focusTween.t / _focusTween.dur);
      const s    = frac < 0.5
        ? 2 * frac * frac
        : 1 - Math.pow(-2 * frac + 2, 2) / 2;
      _camTarget.x = _focusTween.fromX + (_focusTween.toX - _focusTween.fromX) * s;
      _camTarget.z = _focusTween.fromZ + (_focusTween.toZ - _focusTween.fromZ) * s;
      if (frac >= 1) _focusTween = null;
    }

    // WASD / arrow pan (suppressed during focus tween)
    if (!_focusTween) {
      const spd = P4_CFG.CAM_PAN_SPEED_KB * dt;
      if (_keys['KeyW'] || _keys['ArrowUp'])    _camTarget.z -= spd;
      if (_keys['KeyS'] || _keys['ArrowDown'])  _camTarget.z += spd;
      if (_keys['KeyA'] || _keys['ArrowLeft'])  _camTarget.x -= spd;
      if (_keys['KeyD'] || _keys['ArrowRight']) _camTarget.x += spd;
      _clamp();
    }

    // Edge pan (suppressed during RMB drag and focus tween)
    if (!_rmbDown && !_focusTween) {
      const m  = P4_CFG.CAM_EDGE_MARGIN_PX;
      const sp = P4_CFG.CAM_PAN_SPEED_EDGE * dt;
      const w  = window.innerWidth, h = window.innerHeight;
      if (_mousePage.x < m)     _camTarget.x -= sp;
      if (_mousePage.x > w - m) _camTarget.x += sp;
      if (_mousePage.y < m)     _camTarget.z -= sp;
      if (_mousePage.y > h - m) _camTarget.z += sp;
      _clamp();
    }

    // Zoom lerp
    _zoomDist += (_zoomTarget - _zoomDist) * Math.min(1, P4_CFG.CAM_ZOOM_LERP * dt * 60);

    // Apply: camera = target + normalised_offset * zoomDist
    const normOffset = _camOffset.clone().normalize();
    _camera.position.copy(_camTarget).addScaledVector(normOffset, _zoomDist);
    _camera.lookAt(_camTarget);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(camera, canvas) {
    _camera = camera;
    _canvas = canvas;

    const lt = P4_CFG.CAM_LOOK_TARGET;
    _camTarget.set(lt[0], lt[1], lt[2]);
    _camOffset.copy(camera.position).sub(_camTarget);
    _zoomDist   = _camOffset.length();
    _zoomTarget = _zoomDist;

    _bind();
  }

  function tick(dt) {
    if (_camera) _update(dt);
  }

  function destroy() {
    _unbind();
    _camera     = null;
    _canvas     = null;
    _focusTween = null;
    _rmbDown    = false;
    Object.keys(_keys).forEach(k => delete _keys[k]);
  }

  function zoomTo(targetDist) {
    _zoomTarget = Math.max(P4_CFG.CAM_ZOOM_MIN, Math.min(P4_CFG.CAM_ZOOM_MAX, targetDist));
  }

  function panTo(x, z, duration) {
    const c = P4_CFG.CAM_PAN_CLAMP;
    _focusTween = {
      fromX: _camTarget.x, fromZ: _camTarget.z,
      toX: Math.max(-c, Math.min(c, x)),
      toZ: Math.max(-c, Math.min(c, z)),
      t: 0, dur: duration || P4_CFG.CAM_FOCUS_DURATION,
    };
  }

  function getZoomDist()    { return _zoomDist; }
  function getLookTarget()  { return { x: _camTarget.x, z: _camTarget.z }; }

  return { init, tick, destroy, zoomTo, panTo, getZoomDist, getLookTarget };

})();
