/**
 * vi_p4_ns1.js — Phase 4 NS1 dome deployment (Chunk 8).
 *
 * [N] key enters placement mode; next canvas click drops a translucent purple
 * dome of radius NS1_RADIUS (6 u) at the clicked world position.  The dome
 * lasts NS1_DURATION_S (30 s), then shrinks and disappears.
 *
 * While a dome is active:
 *   - IFIT agents inside it are frozen.
 *   - OAS rings inside it are disabled (no attacks).
 *   - The global ISG timer is paused (handled in P4Antiviral.tick).
 *
 * Costs 1 NS1 charge (P4Resources.useNS1()).
 *
 * API:
 *   P4NS1Deployment.init(scene, canvas)
 *   P4NS1Deployment.tick(dt)
 *   P4NS1Deployment.destroy()
 *   P4NS1Deployment.isInDome(x, z)      → bool
 *   P4NS1Deployment.isAnyDomeActive()   → bool
 *
 * Educational trigger:
 *   SEG8_NS1   — first time NS1 charges become available
 *   NS1_DEPLOY — each deployment
 */

/* global THREE, P4_CFG, P4Resources, P4NuclearFactory */

const P4NS1Deployment = (() => {

  let _scene  = null;
  let _canvas = null;
  let _domes  = [];
  let _placing = false;

  let _geos = [];
  let _mats = [];
  let _geo = g => { _geos.push(g); return g; };
  let _mat = m => { _mats.push(m); return m; };

  // Shared dome geometry
  let _domeGeo  = null;
  let _floorGeo = null;

  // NS1 edu trigger — fire once
  let _seg8Fired = false;

  // Placement hint element
  let _hintEl = null;

  // Raycasting plane (Y=0)
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── Screen → world (Y=0 plane) ─────────────────────────────────────────────

  function _screenToWorld(cx, cy) {
    const cam = P4NuclearFactory.camera;
    if (!cam) return null;
    const ndc = new THREE.Vector2(
      (cx / window.innerWidth)  * 2 - 1,
      -(cy / window.innerHeight) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, cam);
    const target = new THREE.Vector3();
    const hit = rc.ray.intersectPlane(_plane, target);
    return hit ? target : null;
  }

  // ── Placement hint ────────────────────────────────────────────────────────

  function _showHint() {
    if (!_hintEl) {
      _hintEl = document.createElement('div');
      _hintEl.style.cssText = [
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%)',
        'pointer-events:none;z-index:500',
        'background:rgba(10,8,24,0.90)',
        'border:1px solid #8844cc99',
        'border-radius:6px;padding:10px 24px',
        'color:#cc88ff;font-weight:600;font-size:0.82rem;letter-spacing:0.10em',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'text-align:center',
      ].join(';');
      document.body.appendChild(_hintEl);
    }
    const charges = (typeof P4Resources !== 'undefined') ? P4Resources.getNS1() : 0;
    _hintEl.innerHTML = `NS1 DOME PLACEMENT<br>`
      + `<span style="font-size:0.68rem;color:#aa77cc">`
      + `Click to deploy (r=${P4_CFG.NS1_RADIUS}u · ${P4_CFG.NS1_DURATION_S}s) &nbsp;·&nbsp; `
      + `<span style="color:#ccbbee">[Esc]</span> cancel &nbsp;·&nbsp; `
      + `charges: ${charges}</span>`;
    _hintEl.style.display = 'block';
    if (_canvas) _canvas.style.cursor = 'crosshair';
  }

  function _hideHint() {
    if (_hintEl) _hintEl.style.display = 'none';
    if (_canvas) _canvas.style.cursor = '';
  }

  // ── Build dome mesh ───────────────────────────────────────────────────────

  function _buildDome(x, z) {
    if (!_domeGeo) {
      _domeGeo = _geo(new THREE.SphereGeometry(P4_CFG.NS1_RADIUS, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5));
    }
    if (!_floorGeo) {
      _floorGeo = _geo(new THREE.CircleGeometry(P4_CFG.NS1_RADIUS, 32));
    }

    // Dome shell
    const shellMat = _mat(new THREE.MeshLambertMaterial({
      color:       P4_CFG.COL_NS1,
      emissive:    new THREE.Color(P4_CFG.COL_NS1),
      emissiveIntensity: 0.18,
      transparent: true,
      opacity:     0.14,
      side:        THREE.BackSide,
      depthWrite:  false,
    }));
    const shell = new THREE.Mesh(_domeGeo, shellMat);

    // Floor disc
    const floorMat = _mat(new THREE.MeshBasicMaterial({
      color:       P4_CFG.COL_NS1,
      transparent: true,
      opacity:     0.08,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    }));
    const floor = new THREE.Mesh(_floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = 0.02;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(shell);
    group.add(floor);
    _scene.add(group);

    // Purple point light inside
    const light = new THREE.PointLight(P4_CFG.COL_NS1, 0.35, P4_CFG.NS1_RADIUS * 1.2);
    light.position.set(x, 2, z);
    _scene.add(light);

    return { x, z, group, shell, shellMat, floorMat, light, t: 0, _remove: false };
  }

  // ── Deploy dome ───────────────────────────────────────────────────────────

  function _deploy(wx, wz) {
    // Clamp to nucleus interior
    const maxR = P4_CFG.NUCLEUS_RADIUS - P4_CFG.NS1_RADIUS - 1;
    const dist = Math.hypot(wx, wz);
    if (dist > maxR) {
      const a = Math.atan2(wz, wx);
      wx = Math.cos(a) * maxR;
      wz = Math.sin(a) * maxR;
    }

    const dome = _buildDome(wx, wz);
    _domes.push(dome);
    _dispatchEdu('NS1_DEPLOY', { x: wx, z: wz, charges: P4Resources.getNS1() });
  }

  // ── Canvas event handlers ─────────────────────────────────────────────────

  function _onCanvasClick(e) {
    if (!_placing) return;
    e.stopPropagation();
    e.preventDefault();

    if (typeof P4Resources === 'undefined' || !P4Resources.useNS1()) {
      // No charges — cancel
      _placing = false;
      _hideHint();
      return;
    }

    const world = _screenToWorld(e.clientX, e.clientY);
    if (world) _deploy(world.x, world.z);

    _placing = false;
    _hideHint();
  }

  function _onKeyDown(e) {
    if (e.code === 'KeyN') {
      if (_placing) {
        // Toggle off
        _placing = false;
        _hideHint();
        return;
      }
      if (typeof P4Resources === 'undefined' || P4Resources.getNS1() <= 0) {
        // No charges
        _showNoChargesMsg();
        return;
      }
      _placing = true;
      _showHint();
    }
    if (e.code === 'Escape' && _placing) {
      _placing = false;
      _hideHint();
    }
  }

  // No-charges flash message
  let _noChargeMsgEl  = null;
  let _noChargeMsgT   = 0;
  function _showNoChargesMsg() {
    if (!_noChargeMsgEl) {
      _noChargeMsgEl = document.createElement('div');
      _noChargeMsgEl.style.cssText = [
        'position:fixed;bottom:110px;left:50%;transform:translateX(-50%)',
        'pointer-events:none;z-index:500',
        'background:rgba(10,8,24,0.92)',
        'border:1px solid #8844cc66',
        'border-radius:6px;padding:8px 22px',
        'color:#cc88ff;font-weight:600;font-size:0.80rem;letter-spacing:0.08em',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'text-align:center;display:none',
      ].join(';');
      document.body.appendChild(_noChargeMsgEl);
    }
    _noChargeMsgEl.textContent = 'NO NS1 CHARGES — export Seg 8 mRNA to produce';
    _noChargeMsgEl.style.display = 'block';
    _noChargeMsgEl.style.opacity = '1';
    _noChargeMsgT = 2.0;
  }

  function _tickNoChargeMsg(dt) {
    if (_noChargeMsgT <= 0 || !_noChargeMsgEl) return;
    _noChargeMsgT -= dt;
    if (_noChargeMsgT <= 0) {
      _noChargeMsgEl.style.display = 'none';
    } else if (_noChargeMsgT < 0.5) {
      _noChargeMsgEl.style.opacity = (_noChargeMsgT / 0.5).toFixed(3);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, canvas) {
    _scene  = scene;
    _canvas = canvas;
    _seg8Fired = false;

    if (_canvas) _canvas.addEventListener('click', _onCanvasClick, true);
    window.addEventListener('keydown', _onKeyDown);
  }

  function tick(dt) {
    _tickNoChargeMsg(dt);

    // SEG8_NS1 trigger: fire once when first charge appears
    if (!_seg8Fired && typeof P4Resources !== 'undefined' && P4Resources.getNS1() > 0) {
      _seg8Fired = true;
      _dispatchEdu('SEG8_NS1', {});
    }

    // Tick dome timers
    for (const dome of _domes) {
      if (dome._remove) continue;
      dome.t += dt;
      const remaining = P4_CFG.NS1_DURATION_S - dome.t;

      if (remaining <= 0) {
        dome._remove = true;
        // Immediate removal
        if (dome.group.parent) dome.group.parent.remove(dome.group);
        if (dome.light.parent) dome.light.parent.remove(dome.light);
      } else if (remaining < 2.0) {
        // Fade out in final 2s
        const alpha = (remaining / 2.0);
        dome.shellMat.opacity = 0.14 * alpha;
        dome.floorMat.opacity = 0.08 * alpha;
        dome.light.intensity  = 0.35 * alpha;
        // Slow shrink
        const s = Math.max(0.01, remaining / 2.0);
        dome.group.scale.setScalar(s);
      } else {
        // Gentle pulse
        dome.light.intensity = 0.30 + 0.10 * Math.sin(dome.t * 1.5);
      }
    }

    // Prune removed domes
    for (let i = _domes.length - 1; i >= 0; i--) {
      if (_domes[i]._remove) _domes.splice(i, 1);
    }
  }

  function destroy() {
    if (_canvas) _canvas.removeEventListener('click', _onCanvasClick, true);
    window.removeEventListener('keydown', _onKeyDown);

    for (const dome of _domes) {
      if (dome.group.parent) dome.group.parent.remove(dome.group);
      if (dome.light.parent) dome.light.parent.remove(dome.light);
    }
    _domes = [];

    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos    = [];
    _mats    = [];
    _domeGeo  = null;
    _floorGeo = null;

    if (_hintEl && _hintEl.parentNode) _hintEl.parentNode.removeChild(_hintEl);
    if (_noChargeMsgEl && _noChargeMsgEl.parentNode)
      _noChargeMsgEl.parentNode.removeChild(_noChargeMsgEl);
    _hintEl       = null;
    _noChargeMsgEl = null;

    _placing = false;
    _scene   = null;
    _canvas  = null;
  }

  function isInDome(x, z) {
    for (const d of _domes) {
      if (d._remove) continue;
      if (Math.hypot(x - d.x, z - d.z) < P4_CFG.NS1_RADIUS) return true;
    }
    return false;
  }

  function isAnyDomeActive() {
    return _domes.some(d => !d._remove);
  }

  return { init, tick, destroy, isInDome, isAnyDomeActive };

})();
