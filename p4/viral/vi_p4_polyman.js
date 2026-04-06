/**
 * vi_p4_polyman.js — Phase 4 Polymerase Manager.
 *
 * Handles polymerase selection, target assignment, and movement dispatch.
 *
 * ── Input controls ─────────────────────────────────────────────────────────
 *   Left-click poly       — select (Shift/Ctrl = add to selection)
 *   Left-drag empty space — box-select polymerases in the drawn rectangle
 *   Left-click Pol II site (poly selected) — send selected poly to that site
 *   Left-click template   (poly selected) — send selected poly to that template
 *   Right-click / Escape  — deselect all / cancel
 *   T                     — transcription mode (default)
 *   R                     — replication mode (Chunk 7)
 *   Tab                   — cycle selection through idle polymerases
 *   1–8                   — pan camera to template N and select its docked poly
 *
 * ── Arrival hooks (for later chunks) ───────────────────────────────────────
 *   P4PolymeraseManager.setPolIIArrivalHandler(fn)   fn(poly, siteIdx)
 *   P4PolymeraseManager.setTemplateArrivalHandler(fn) fn(poly, templateIdx)
 *
 * API:
 *   P4PolymeraseManager.init(scene)
 *   P4PolymeraseManager.tick(dt)
 *   P4PolymeraseManager.destroy()
 *   P4PolymeraseManager.hasSelection()   → bool
 *   P4PolymeraseManager.getMode()        → 'transcription' | 'replication'
 *   P4PolymeraseManager.setPolIIArrivalHandler(fn)
 *   P4PolymeraseManager.setTemplateArrivalHandler(fn)
 */

/* global THREE, P4_CFG, P4Polymerases, P4Templates, P4PolIISites,
          P4SteeringBehavior, P4Camera, P4NuclearFactory */

const P4PolymeraseManager = (() => {

  let _scene = null;
  let _canvas = null;

  // ── Selection state ───────────────────────────────────────────────────────
  const _selected = new Set();   // Set<polyIdx>
  const _rings    = new Map();   // polyIdx → {line, geo, mat}
  let   _mode     = 'transcription';
  let   _tabIdx   = 0;

  // ── Box-select state ──────────────────────────────────────────────────────
  let _boxActive = false;
  const _boxStart = { x: 0, y: 0 };
  const _mouseNow  = { x: 0, y: 0 };
  let _boxEl = null;

  // ── Modifier keys ─────────────────────────────────────────────────────────
  let _shiftDown = false;
  let _ctrlDown  = false;

  // ── Arrival hooks (Chunks 4, 5, 7) ──────────────────────────────────────
  let _polIIArrivalFn    = null;
  let _templateArrivalFn = null;

  // ── Replication lock toast ────────────────────────────────────────────────
  let _repLockToast = null;
  let _repLockT     = 0;
  const REP_LOCK_TOAST_DUR = 2.2;

  // ── Raycaster for box-select empty-space detection ─────────────────────
  const _rc  = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();

  let _t = 0;

  // ── HUD ───────────────────────────────────────────────────────────────────
  let _hudEl = null;

  function _createHUD() {
    _hudEl = document.createElement('div');
    _hudEl.id = 'p4PolymanHUD';
    _hudEl.style.cssText = [
      'position:fixed;bottom:18px;left:50%;transform:translateX(-50%)',
      'pointer-events:none;z-index:310',
      'display:flex;flex-direction:column;align-items:center;gap:5px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    const hintsRow = document.createElement('div');
    hintsRow.id = 'p4HintsRow';
    hintsRow.style.cssText = [
      'background:rgba(10,8,24,0.80)',
      'border:1px solid rgba(100,80,200,0.30)',
      'border-radius:5px;padding:4px 14px',
      'color:#8888bb;font-size:0.68rem;letter-spacing:0.06em',
    ].join(';');
    hintsRow.innerHTML =
      '<span style="color:#ccbbee">[T]</span> TRANSCRIPTION &nbsp;·&nbsp; '
    + '<span style="color:#ccbbee">[R]</span> REPLICATION &nbsp;·&nbsp; '
    + '<span style="color:#ccbbee">[TAB]</span> CYCLE IDLE &nbsp;·&nbsp; '
    + '<span style="color:#ccbbee">[1–8]</span> JUMP TO SEGMENT &nbsp;·&nbsp; '
    + '<span style="color:#ccbbee">[ESC]</span> DESELECT';

    const statusRow = document.createElement('div');
    statusRow.id = 'p4StatusRow';
    statusRow.style.cssText = [
      'background:rgba(10,8,24,0.88)',
      'border:1px solid rgba(140,120,220,0.40)',
      'border-radius:5px;padding:4px 18px',
      'color:#ccbbee;font-size:0.75rem;letter-spacing:0.06em',
      'display:none',
    ].join(';');

    _hudEl.appendChild(hintsRow);
    _hudEl.appendChild(statusRow);
    document.body.appendChild(_hudEl);
  }

  function _updateHUD() {
    const statusRow = document.getElementById('p4StatusRow');
    if (!statusRow) return;

    const modeLabel = _mode === 'transcription'
      ? '<span style="color:#ffdd88">T · TRANSCRIPTION</span>'
      : '<span style="color:#88ccff">R · REPLICATION</span>';

    if (_selected.size === 0) {
      statusRow.style.display = 'none';
    } else {
      statusRow.style.display = 'block';
      const names = [..._selected].map(i => `RdRp ${i + 1}`).join(', ');
      const arrow = _mode === 'transcription'
        ? '→ click <span style="color:#ffdd88">Pol II site</span> to transcribe'
        : '→ click <span style="color:#88ccff">template</span> to replicate';
      statusRow.innerHTML = `${modeLabel} &nbsp;|&nbsp; <strong>${names}</strong> selected &nbsp; ${arrow}`;
    }
  }

  function _destroyHUD() {
    if (_hudEl && _hudEl.parentNode) _hudEl.parentNode.removeChild(_hudEl);
    _hudEl = null;
  }

  // ── Selection rings ───────────────────────────────────────────────────────

  function _createRing(polyIdx) {
    const N   = 28;
    const r   = 0.55;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color:       0x99aaff,
      transparent: true,
      opacity:     0.85,
    });
    const line = new THREE.Line(geo, mat);
    line.name = `selring_${polyIdx}`;
    _scene.add(line);
    _rings.set(polyIdx, { line, geo, mat });
  }

  function _removeRing(polyIdx) {
    const entry = _rings.get(polyIdx);
    if (!entry) return;
    if (entry.line.parent) entry.line.parent.remove(entry.line);
    entry.geo.dispose();
    entry.mat.dispose();
    _rings.delete(polyIdx);
  }

  // ── Selection helpers ─────────────────────────────────────────────────────

  function _selectPoly(polyIdx, additive) {
    if (!additive) _clearSelection();
    if (_selected.has(polyIdx)) return;   // already selected
    _selected.add(polyIdx);
    const poly = P4Polymerases.getByIndex(polyIdx);
    if (poly) {
      for (const m of poly.lobeMats) m.emissiveIntensity = 0.85;
      poly.state = 'selected';
    }
    _createRing(polyIdx);
    _updateHUD();
  }

  function _deselectPoly(polyIdx) {
    _selected.delete(polyIdx);
    _removeRing(polyIdx);
    const poly = P4Polymerases.getByIndex(polyIdx);
    if (poly && poly.state === 'selected') {
      for (const m of poly.lobeMats) m.emissiveIntensity = 0.22;
      poly.state = 'idle';
    }
  }

  function _clearSelection() {
    for (const idx of [..._selected]) _deselectPoly(idx);
    _updateHUD();
  }

  // ── Replication lock toast helpers ───────────────────────────────────────

  function _showRepLockToast() {
    if (!_repLockToast) {
      _repLockToast = document.createElement('div');
      _repLockToast.style.cssText = [
        'position:fixed;bottom:110px;left:50%;transform:translateX(-50%)',
        'pointer-events:none;z-index:500',
        'background:rgba(10,8,24,0.92)',
        'border:1px solid #ff888866',
        'border-radius:6px;padding:8px 22px',
        'color:#ff8888;font-weight:600;font-size:0.80rem;letter-spacing:0.10em',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'text-align:center;display:none',
      ].join(';');
      document.body.appendChild(_repLockToast);
    }
    _repLockToast.textContent = `REPLICATION LOCKED — NP < ${P4_CFG.NP_REPLICATION_THRESH}`;
    _repLockToast.style.display = 'block';
    _repLockToast.style.opacity = '1';
    _repLockT = REP_LOCK_TOAST_DUR;
  }

  function _tickRepLockToast(dt) {
    if (_repLockT <= 0 || !_repLockToast) return;
    _repLockT -= dt;
    if (_repLockT <= 0) {
      _repLockToast.style.display = 'none';
    } else if (_repLockT < 0.5) {
      _repLockToast.style.opacity = (_repLockT / 0.5).toFixed(3);
    }
  }

  // ── Sending polys to targets ──────────────────────────────────────────────

  function _sendFirstSelectedTo(tx, tz, type, targetIdx) {
    if (_selected.size === 0) return;
    const polyIdx = [..._selected][0];
    const poly    = P4Polymerases.getByIndex(polyIdx);
    if (!poly || poly.state === 'busy') return;

    // Replication lock: block template dispatch if NP insufficient
    if (type === 'template' && _mode === 'replication') {
      if (typeof P4Resources !== 'undefined' &&
          P4Resources.getNP() < P4_CFG.NP_REPLICATION_THRESH) {
        _showRepLockToast();
        return;
      }
    }

    poly.assignedTarget     = { type, idx: targetIdx };
    poly.taskMode           = _mode;

    P4SteeringBehavior.setTarget(poly, tx, tz, () => {
      // On arrival
      if (type === 'polii') {
        if (_polIIArrivalFn) {
          _polIIArrivalFn(poly, targetIdx);
        } else {
          // Chunk 3 placeholder: auto-reset after 1.5 s
          setTimeout(() => {
            if (poly.state === 'busy') {
              P4PolIISites.startCooldown(targetIdx);
              poly.state = 'idle';
              poly.assignedTarget = null;
            }
          }, 1500);
        }
      } else if (type === 'template') {
        if (_templateArrivalFn) {
          _templateArrivalFn(poly, targetIdx);
        }
        // else: poly stays 'busy' at template until later chunks manage it
      }
    });

    _deselectPoly(polyIdx);
    _updateHUD();
  }

  // ── Click handlers registered on interactive objects ─────────────────────

  function _onPolyClick(polyIdx) {
    _selectPoly(polyIdx, _shiftDown || _ctrlDown);
  }

  function _onSiteClick(siteIdx) {
    if (_selected.size === 0) return;
    const site = P4PolIISites.getByIndex(siteIdx);
    if (!site || site.state !== 'active') return;
    _sendFirstSelectedTo(site.x, site.z, 'polii', siteIdx);
  }

  function _onTemplateClick(tmplIdx) {
    if (_selected.size === 0) {
      // No poly selected: template click falls through to drag (handled by P4Interaction)
      return;
    }
    const tmpl = P4Templates.getByIndex(tmplIdx);
    if (!tmpl) return;
    // Target: the 3′ end of the template (outer end along the radial direction)
    const halfLen = P4_CFG.TEMPLATE_LENGTH * 0.5 + 0.4;
    const tx = tmpl.group.position.x + Math.cos(tmpl.angle) * halfLen;
    const tz = tmpl.group.position.z + Math.sin(tmpl.angle) * halfLen;
    _sendFirstSelectedTo(tx, tz, 'template', tmplIdx);
  }

  // ── Keyboard handlers ─────────────────────────────────────────────────────

  function _onKeyDown(e) {
    _shiftDown = e.shiftKey;
    _ctrlDown  = e.ctrlKey;

    switch (e.code) {
      case 'KeyT':
        _mode = 'transcription';
        _updateHUD();
        break;
      case 'KeyR':
        if (!e.ctrlKey) {   // don't hijack browser refresh
          _mode = 'replication';
          _updateHUD();
          // Warn if NP not yet sufficient
          if (typeof P4Resources !== 'undefined' &&
              P4Resources.getNP() < P4_CFG.NP_REPLICATION_THRESH) {
            _showRepLockToast();
          }
        }
        break;
      case 'Tab':
        e.preventDefault();
        _cycleIdlePoly();
        break;
      case 'Escape':
        _clearSelection();
        break;
      default:
        // 1–8: jump to template and select its poly
        if (e.code >= 'Digit1' && e.code <= 'Digit8') {
          const tmplIdx = parseInt(e.key) - 1;
          const tmpl    = P4Templates.getByIndex(tmplIdx);
          if (tmpl) {
            P4Camera.panTo(tmpl.group.position.x, tmpl.group.position.z, 0.4);
            // Select poly docked at that template if it's idle
            const poly = P4Polymerases.getAll()
              .find(p => p.assignedTemplate === tmplIdx && p.state === 'idle');
            if (poly) _selectPoly(poly.idx, e.shiftKey || e.ctrlKey);
          }
        }
        break;
    }
  }

  function _onKeyUp(e) {
    _shiftDown = e.shiftKey;
    _ctrlDown  = e.ctrlKey;
  }

  function _cycleIdlePoly() {
    const idle = P4Polymerases.getAll().filter(p => p.state === 'idle');
    if (idle.length === 0) return;
    _tabIdx = (_tabIdx + 1) % idle.length;
    _clearSelection();
    _selectPoly(idle[_tabIdx].idx, false);
    // Pan to the selected poly
    const poly = idle[_tabIdx];
    P4Camera.panTo(poly.group.position.x, poly.group.position.z, 0.35);
  }

  // ── Box-select ────────────────────────────────────────────────────────────

  function _createBoxEl() {
    _boxEl = document.createElement('div');
    _boxEl.style.cssText = [
      'position:fixed;pointer-events:none;z-index:305',
      'border:1px solid rgba(110,140,255,0.75)',
      'background:rgba(100,130,255,0.07)',
      'display:none',
    ].join(';');
    document.body.appendChild(_boxEl);
  }

  function _updateBoxEl() {
    if (!_boxEl) return;
    const x1 = Math.min(_boxStart.x, _mouseNow.x);
    const y1 = Math.min(_boxStart.y, _mouseNow.y);
    const x2 = Math.max(_boxStart.x, _mouseNow.x);
    const y2 = Math.max(_boxStart.y, _mouseNow.y);
    _boxEl.style.left   = x1 + 'px';
    _boxEl.style.top    = y1 + 'px';
    _boxEl.style.width  = (x2 - x1) + 'px';
    _boxEl.style.height = (y2 - y1) + 'px';
  }

  function _worldToScreen(worldPos) {
    const cam = P4NuclearFactory.camera;
    if (!cam) return { x: -9999, y: -9999 };
    const ndc = worldPos.clone().project(cam);
    return {
      x: (ndc.x + 1) / 2 * window.innerWidth,
      y: (1 - ndc.y) / 2 * window.innerHeight,
    };
  }

  function _evaluateBoxSelect() {
    const x1 = Math.min(_boxStart.x, _mouseNow.x);
    const y1 = Math.min(_boxStart.y, _mouseNow.y);
    const x2 = Math.max(_boxStart.x, _mouseNow.x);
    const y2 = Math.max(_boxStart.y, _mouseNow.y);
    if (x2 - x1 < 5 || y2 - y1 < 5) return;   // too small to count

    const toSelect = [];
    for (const poly of P4Polymerases.getAll()) {
      if (poly.state === 'busy') continue;
      const sc = _worldToScreen(poly.group.position);
      if (sc.x >= x1 && sc.x <= x2 && sc.y >= y1 && sc.y <= y2) {
        toSelect.push(poly.idx);
      }
    }
    if (toSelect.length === 0) return;
    _clearSelection();
    for (const idx of toSelect) _selectPoly(idx, true);
  }

  // ── Check if cursor is over any selectable object (for box-select gating) ─

  function _overSelectableMesh(cx, cy) {
    const cam = P4NuclearFactory.camera;
    if (!cam) return false;
    _ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    _rc.setFromCamera(_ndc, cam);

    const meshes = [];
    for (const poly of P4Polymerases.getAll())  meshes.push(...poly.lobeMeshes);
    for (const tmpl of P4Templates.getAll())     meshes.push(tmpl.strandMesh);
    for (const site of P4PolIISites.getSites())  meshes.push(site.bodyMesh);

    return _rc.intersectObjects(meshes, false).length > 0;
  }

  // ── Canvas mouse handlers for box-select ──────────────────────────────────

  function _onMouseDown(e) {
    if (e.button !== 0) return;
    _mouseNow.x = e.clientX;
    _mouseNow.y = e.clientY;
    if (_overSelectableMesh(e.clientX, e.clientY)) return;  // let P4Interaction handle
    _boxActive   = true;
    _boxStart.x  = e.clientX;
    _boxStart.y  = e.clientY;
    if (_boxEl) {
      _boxEl.style.display = 'block';
      _updateBoxEl();
    }
  }

  function _onMouseMove(e) {
    _mouseNow.x = e.clientX;
    _mouseNow.y = e.clientY;
    if (_boxActive && _boxEl) _updateBoxEl();
  }

  function _onMouseUp(e) {
    if (e.button !== 0) return;
    if (_boxActive) {
      _boxActive = false;
      if (_boxEl) _boxEl.style.display = 'none';
      _evaluateBoxSelect();
    }
  }

  function _onRightClick(e) {
    // Right-click on empty space → deselect
    if (e.button === 2 && _selected.size > 0) {
      _clearSelection();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene  = scene;
    _canvas = document.getElementById('viCanvas');

    // Register click callbacks on polys, templates, sites
    P4Polymerases.setClickHandler((polyIdx) => _onPolyClick(polyIdx));
    P4Templates.setClickHandler((tmplIdx)   => _onTemplateClick(tmplIdx));
    P4PolIISites.setClickHandler((siteIdx)  => _onSiteClick(siteIdx));

    // Init steering with hetero obstacles from nucleus
    P4SteeringBehavior.init(scene, P4Nucleus.getHeteroObstacles());

    // Keyboard
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup',   _onKeyUp);

    // Mouse (box-select + right-click deselect)
    if (_canvas) {
      _canvas.addEventListener('mousedown', _onMouseDown);
      _canvas.addEventListener('mousemove', _onMouseMove);
      _canvas.addEventListener('mouseup',   _onMouseUp);
      _canvas.addEventListener('mousedown', _onRightClick);
    }

    _createBoxEl();
    _createHUD();
    _updateHUD();
  }

  function tick(dt) {
    _t += dt;
    _tickRepLockToast(dt);

    // Update steering movement
    P4SteeringBehavior.tick(dt, P4Polymerases.getAll());

    // Update selection ring positions + opacity pulse
    for (const [idx, entry] of _rings) {
      const poly = P4Polymerases.getByIndex(idx);
      if (!poly) continue;
      entry.line.position.set(
        poly.group.position.x,
        0.06,
        poly.group.position.z
      );
      entry.mat.opacity = 0.55 + 0.30 * Math.sin(_t * 4.5);
    }
  }

  function destroy() {
    window.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('keyup',   _onKeyUp);
    if (_canvas) {
      _canvas.removeEventListener('mousedown', _onMouseDown);
      _canvas.removeEventListener('mousemove', _onMouseMove);
      _canvas.removeEventListener('mouseup',   _onMouseUp);
      _canvas.removeEventListener('mousedown', _onRightClick);
    }

    _clearSelection();
    P4SteeringBehavior.destroy();

    if (_boxEl && _boxEl.parentNode) _boxEl.parentNode.removeChild(_boxEl);
    _boxEl = null;
    _destroyHUD();

    if (_repLockToast && _repLockToast.parentNode)
      _repLockToast.parentNode.removeChild(_repLockToast);
    _repLockToast = null;

    _selected.clear();
    _scene  = null;
    _canvas = null;
  }

  function hasSelection()       { return _selected.size > 0; }
  function getMode()            { return _mode; }
  function getSelectedIndices() { return [..._selected]; }

  function setPolIIArrivalHandler(fn)    { _polIIArrivalFn    = fn; }
  function setTemplateArrivalHandler(fn) { _templateArrivalFn = fn; }

  return {
    init, tick, destroy,
    hasSelection, getMode, getSelectedIndices,
    setPolIIArrivalHandler,
    setTemplateArrivalHandler,
  };

})();
