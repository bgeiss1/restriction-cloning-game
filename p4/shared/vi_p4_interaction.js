/**
 * vi_p4_interaction.js — Phase 4 interaction system.
 *
 * Manages raycasting, hover, click, drag, and tooltip for all
 * registered interactive scene objects.
 *
 * Callbacks object (all fields optional):
 *   onHover(mesh, screenX, screenY)
 *   onHoverMove(mesh, screenX, screenY)
 *   onHoverEnd(mesh)
 *   onClick(mesh, worldPos)
 *   onDragStart(mesh, worldPos)
 *   onDrag(mesh, worldPos)
 *   onDragEnd(mesh, worldPos)
 *   dragPlaneY: number   — world Y of the drag projection plane (default 0)
 *
 * API:
 *   P4Interaction.init(canvas, camera)
 *   P4Interaction.setCamera(camera)
 *   P4Interaction.register(mesh, callbacks)
 *   P4Interaction.unregister(mesh)
 *   P4Interaction.tick()
 *   P4Interaction.showTooltip(html, screenX, screenY)
 *   P4Interaction.hideTooltip()
 *   P4Interaction.destroy()
 */

/* global THREE */

const P4Interaction = (() => {

  let _camera = null;
  let _canvas = null;

  const _registry  = new Map();   // mesh → callbacks
  const _raycaster = new THREE.Raycaster();
  const _mouseNDC  = new THREE.Vector2();

  let _hovered      = null;
  let _lmbDown      = false;
  let _dragMesh     = null;
  let _isDragging   = false;
  const _mouseDownPos = { x: 0, y: 0 };
  const _mouseNow     = { x: 0, y: 0 };
  const DRAG_THRESH   = 6;   // pixels of movement before drag starts

  const _dragPlane = new THREE.Plane();
  const _hitPt     = new THREE.Vector3();

  let _tooltipEl = null;

  // ── Tooltip ───────────────────────────────────────────────────────────────

  function _createTooltip() {
    _tooltipEl = document.createElement('div');
    _tooltipEl.id = 'p4Tooltip';
    _tooltipEl.style.cssText = [
      'position:fixed;pointer-events:none;z-index:600',
      'background:rgba(10,8,24,0.92)',
      'border:1px solid rgba(200,160,50,0.40)',
      'border-radius:5px;padding:5px 11px',
      'color:#ffdd88;font-size:0.72rem;letter-spacing:0.05em',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'display:none;max-width:280px;line-height:1.5',
    ].join(';');
    document.body.appendChild(_tooltipEl);
  }

  function showTooltip(html, screenX, screenY) {
    if (!_tooltipEl) return;
    _tooltipEl.innerHTML = html;
    _tooltipEl.style.display = 'block';
    const tx = Math.min(screenX + 15, window.innerWidth  - 295);
    const ty = Math.max(screenY - 40, 4);
    _tooltipEl.style.left = tx + 'px';
    _tooltipEl.style.top  = ty + 'px';
  }

  function hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }

  // ── NDC / plane helpers ───────────────────────────────────────────────────

  function _updateNDC(cx, cy) {
    _mouseNDC.x = (cx / window.innerWidth)  *  2 - 1;
    _mouseNDC.y = (cy / window.innerHeight) * -2 + 1;
  }

  function _getGroundHit(yPlane) {
    const y = (yPlane !== undefined) ? yPlane : 0;
    // THREE.Plane: normal·point + constant = 0  →  constant = -y
    _dragPlane.set(new THREE.Vector3(0, 1, 0), -y);
    _raycaster.setFromCamera(_mouseNDC, _camera);
    _raycaster.ray.intersectPlane(_dragPlane, _hitPt);
  }

  // Walk up from a hit object to find the first registered ancestor (or self)
  function _findRegistered(obj) {
    while (obj) {
      if (_registry.has(obj)) return obj;
      obj = obj.parent;
    }
    return null;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function _onMouseDown(e) {
    if (e.button !== 0) return;
    _lmbDown = true;
    _mouseDownPos.x = e.clientX;
    _mouseDownPos.y = e.clientY;
    _mouseNow.x = e.clientX;
    _mouseNow.y = e.clientY;
    _isDragging = false;

    if (!_camera) return;
    _updateNDC(e.clientX, e.clientY);
    _raycaster.setFromCamera(_mouseNDC, _camera);
    const hits = _raycaster.intersectObjects([..._registry.keys()], true);
    _dragMesh = hits.length ? _findRegistered(hits[0].object) : null;
  }

  function _onMouseUp(e) {
    if (e.button !== 0) return;
    if (!_camera) { _lmbDown = false; _isDragging = false; _dragMesh = null; return; }

    _updateNDC(e.clientX, e.clientY);

    if (_isDragging && _dragMesh) {
      const cb = _registry.get(_dragMesh);
      if (cb) {
        const planeY = cb.dragPlaneY !== undefined ? cb.dragPlaneY : 0;
        _getGroundHit(planeY);
        if (cb.onDragEnd) cb.onDragEnd(_dragMesh, _hitPt.clone());
      }
    } else if (_dragMesh && !_isDragging) {
      const cb = _registry.get(_dragMesh);
      if (cb) {
        _getGroundHit(0);
        if (cb.onClick) cb.onClick(_dragMesh, _hitPt.clone());
      }
    }

    _lmbDown    = false;
    _isDragging = false;
    _dragMesh   = null;
  }

  function _onMouseMove(e) {
    _mouseNow.x = e.clientX;
    _mouseNow.y = e.clientY;

    if (!_lmbDown || !_dragMesh || !_camera) return;

    const dx = e.clientX - _mouseDownPos.x;
    const dy = e.clientY - _mouseDownPos.y;

    if (!_isDragging && Math.hypot(dx, dy) > DRAG_THRESH) {
      _isDragging = true;
      const cb    = _registry.get(_dragMesh);
      if (cb) {
        const planeY = cb.dragPlaneY !== undefined ? cb.dragPlaneY : 0;
        _updateNDC(e.clientX, e.clientY);
        _getGroundHit(planeY);
        if (cb.onDragStart) cb.onDragStart(_dragMesh, _hitPt.clone());
      }
      hideTooltip();
    }

    if (_isDragging) {
      const cb = _registry.get(_dragMesh);
      if (cb) {
        const planeY = cb.dragPlaneY !== undefined ? cb.dragPlaneY : 0;
        _updateNDC(e.clientX, e.clientY);
        _getGroundHit(planeY);
        if (cb.onDrag) cb.onDrag(_dragMesh, _hitPt.clone());
      }
    }
  }

  // ── Hover (called each tick) ──────────────────────────────────────────────

  function _updateHover() {
    if (!_camera || _isDragging) return;

    _updateNDC(_mouseNow.x, _mouseNow.y);
    _raycaster.setFromCamera(_mouseNDC, _camera);
    const hits       = _raycaster.intersectObjects([..._registry.keys()], true);
    const newHovered = hits.length ? _findRegistered(hits[0].object) : null;

    if (newHovered !== _hovered) {
      if (_hovered) {
        const cb = _registry.get(_hovered);
        if (cb && cb.onHoverEnd) cb.onHoverEnd(_hovered);
        hideTooltip();
      }
      _hovered = newHovered;
      if (_hovered) {
        const cb = _registry.get(_hovered);
        if (cb && cb.onHover) cb.onHover(_hovered, _mouseNow.x, _mouseNow.y);
      }
    } else if (_hovered) {
      // Update tooltip position as mouse moves over same object
      const cb = _registry.get(_hovered);
      if (cb && cb.onHoverMove) cb.onHoverMove(_hovered, _mouseNow.x, _mouseNow.y);
    }
  }

  // ── Bind / unbind ─────────────────────────────────────────────────────────

  function _bind() {
    if (!_canvas) return;
    _canvas.addEventListener('mousedown', _onMouseDown);
    _canvas.addEventListener('mouseup',   _onMouseUp);
    _canvas.addEventListener('mousemove', _onMouseMove);
  }

  function _unbind() {
    if (!_canvas) return;
    _canvas.removeEventListener('mousedown', _onMouseDown);
    _canvas.removeEventListener('mouseup',   _onMouseUp);
    _canvas.removeEventListener('mousemove', _onMouseMove);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(canvas, camera) {
    _canvas  = canvas;
    _camera  = camera;
    _createTooltip();
    _bind();
  }

  function setCamera(camera) { _camera = camera; }

  function register(mesh, callbacks) {
    _registry.set(mesh, callbacks || {});
  }

  function unregister(mesh) {
    if (_hovered  === mesh) { hideTooltip(); _hovered  = null; }
    if (_dragMesh === mesh) { _dragMesh = null; _isDragging = false; }
    _registry.delete(mesh);
  }

  function tick() {
    _updateHover();
  }

  function destroy() {
    _unbind();
    if (_tooltipEl && _tooltipEl.parentNode) {
      _tooltipEl.parentNode.removeChild(_tooltipEl);
    }
    _tooltipEl  = null;
    _hovered    = null;
    _dragMesh   = null;
    _isDragging = false;
    _lmbDown    = false;
    _camera     = null;
    _canvas     = null;
    _registry.clear();
  }

  return {
    init, setCamera,
    register, unregister,
    tick,
    showTooltip, hideTooltip,
    destroy,
  };

})();
