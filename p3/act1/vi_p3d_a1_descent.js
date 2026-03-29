'use strict';
/**
 * P3DAct1Descent — Act 1 "Endosomal Descent" game loop.
 *
 * Interface (mirrors P2Attachment pattern):
 *   init(p3)        — receive P3Descent reference, create sub-systems
 *   start()         — begin running, enable input
 *   tick(dt)        — called every frame by P3Descent._tick()
 *   _pause()        — freeze game (not audio — P3Descent handles that)
 *   _resume()       — unfreeze
 *   destroy()       — teardown; called by P3Descent.destroy()
 *   _running        — getter; true while act is active
 *
 * Coordinate convention:
 *   • Descent axis: world -Y (vehicle.y = -descentY)
 *   • Lateral:      world X (A/D) and world Z (W/S)
 *   • Camera sits at vehicle + (0, +OY, +OZ), looking ahead
 *
 * Completes when pH drops to PH_ACT1_END → calls P3Descent._act1Done(stats).
 */
const P3DAct1Descent = (() => {
  // ── Private state ──────────────────────────────────────────────────────
  let _p3      = null;
  let _running = false;
  let _paused  = false;

  // Sub-systems (created in init, destroyed in destroy)
  let _cam     = null;
  let _vehicle = null;
  let _env     = null;
  let _collect = null;

  // Physics
  let _velX = 0, _velZ = 0;   // lateral velocity (world units/sec)
  let _posX = 0, _posZ = 0;   // lateral world position
  let _descentY     = 0;      // accumulated descent depth (positive, world Y = -_descentY)
  let _descentSpeed = 0;      // current descent speed (units/sec)

  // Pre-allocated vectors to avoid per-frame allocation
  const _vPos = new THREE.Vector3();
  const _vVel = new THREE.Vector2();

  // Inventory / scoring
  let _m2Count = 0, _ns1Count = 0;
  let _hp      = 100;
  let _score   = 0;

  // Chunk tracking (for collectible spawning)
  let _chunksSpawned = 0;

  // Educational trigger deduplication
  const _eduFired = {};

  // ── Input ──────────────────────────────────────────────────────────────
  const _keys = {};
  function _onKeyDown(e) { _keys[e.code] = true;  }
  function _onKeyUp(e)   { _keys[e.code] = false; }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function init(p3) {
    _p3 = p3;

    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup',   _onKeyUp);

    _cam     = new P3DDescentCam(_p3.camera);
    _vehicle = new P3DEndosomeVehicle(_p3.scene);
    _env     = new P3DCytoplasmEnv(_p3.scene);
    _collect = new P3DCollectibleMgr(_p3.scene);

    // Reset state
    _velX = 0; _velZ = 0;
    _posX = 0; _posZ = 0;
    _descentY     = 0;
    _descentSpeed = P3D_CFG.A1_DESCENT_BASE;
    _m2Count = 0; _ns1Count = 0;
    _hp      = 100;
    _score   = 0;
    _chunksSpawned = 0;
    for (const k in _eduFired) delete _eduFired[k];

    // Prime initial HUD
    _p3._hud.updateHP(_hp, 100);
    _p3._hud.updateInventory(_m2Count, _ns1Count);
    _p3._hud.updateScore(_score);
    _p3._hud.updateSpeed(P3D_CFG.A1_DESCENT_BASE.toFixed(1));

    // First collectible cluster (placed ahead of start position)
    _collect.spawnGroup(0);
    _chunksSpawned = 1;
  }

  function start() {
    _running = true;
    _paused  = false;
    _p3._snd.startDescendWhoosh?.();
  }

  // ── Main tick ──────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_running || _paused) return;

    const pH = _p3._ph.pH;

    // ── Descent ───────────────────────────────────────────────────────
    _descentSpeed = Math.min(
      P3D_CFG.A1_DESCENT_CAP,
      _descentSpeed + P3D_CFG.A1_DESCENT_ACCEL * dt
    );
    _descentY += _descentSpeed * dt;

    // ── Lateral input & physics ───────────────────────────────────────
    const accel = P3D_CFG.A1_MOVE_ACCEL;
    if (_keys['KeyA'] || _keys['ArrowLeft'])  _velX -= accel * dt;
    if (_keys['KeyD'] || _keys['ArrowRight']) _velX += accel * dt;
    if (_keys['KeyW'] || _keys['ArrowUp'])    _velZ += accel * dt;
    if (_keys['KeyS'] || _keys['ArrowDown'])  _velZ -= accel * dt;

    // Frame-rate-independent drag: v *= drag^dt
    const drag = Math.pow(P3D_CFG.A1_MOVE_DRAG, dt);
    _velX *= drag;
    _velZ *= drag;

    // Speed cap
    const spd = Math.sqrt(_velX*_velX + _velZ*_velZ);
    if (spd > P3D_CFG.A1_MOVE_MAX) {
      _velX = (_velX / spd) * P3D_CFG.A1_MOVE_MAX;
      _velZ = (_velZ / spd) * P3D_CFG.A1_MOVE_MAX;
    }

    // Integrate position
    _posX += _velX * dt;
    _posZ += _velZ * dt;

    // Boundary: elastic push-back if outside radius
    const distSq = _posX*_posX + _posZ*_posZ;
    const R      = P3D_CFG.A1_BOUNDARY_R;
    if (distSq > R * R) {
      const dist = Math.sqrt(distSq);
      const over = dist - R;
      const nx   = _posX / dist, nz = _posZ / dist;
      _posX -= nx * over;
      _posZ -= nz * over;
      // Reflect velocity component toward centre
      const vDotN = _velX * nx + _velZ * nz;
      _velX -= nx * vDotN * (1 + 0.3);   // 0.3 restitution
      _velZ -= nz * vDotN * (1 + 0.3);
    }

    // ── World positions ───────────────────────────────────────────────
    _vPos.set(_posX, -_descentY, _posZ);
    _vVel.set(_velX, _velZ);

    // ── Sub-system updates ────────────────────────────────────────────
    _vehicle.update(dt, _vPos, _vVel, pH);

    const speedFrac = Math.max(0, Math.min(1,
      (_descentSpeed - P3D_CFG.A1_DESCENT_BASE) /
      (P3D_CFG.A1_DESCENT_CAP  - P3D_CFG.A1_DESCENT_BASE)
    ));
    _cam.update(dt, _vPos, speedFrac);

    _p3._snd.setDescendSpeed?.(speedFrac);

    _env.update(dt, _descentY, _descentSpeed);

    // ── Collectibles ──────────────────────────────────────────────────
    const picked = _collect.update(dt, _vPos, P3D_CFG.A1_ENDO_RADIUS);
    for (const item of picked) {
      _onCollect(item.type);
    }
    _collect.cullAbove(-_descentY);

    // Spawn next chunk of collectibles when vehicle crosses chunk boundary
    const chunkIdx = Math.floor(_descentY / P3D_CFG.A1_CHUNK_H);
    if (chunkIdx >= _chunksSpawned) {
      _collect.spawnGroup(_descentY);
      _chunksSpawned = chunkIdx + 1;
    }

    // ── HUD ───────────────────────────────────────────────────────────
    _p3._hud.updateHP(_hp, 100);
    _p3._hud.updateInventory(_m2Count, _ns1Count);
    _p3._hud.updateScore(_score);
    _p3._hud.updateSpeed(_descentSpeed.toFixed(1));

    // ── Educational triggers ──────────────────────────────────────────
    _checkEduTriggers(pH);

    // ── Exit condition ────────────────────────────────────────────────
    if (pH <= P3D_CFG.PH_ACT1_END) {
      _complete();
    }
  }

  // ── Collect handler ────────────────────────────────────────────────────

  function _onCollect(type) {
    if (type === 'M2') {
      _m2Count++;
      _score += P3D_CFG.A1_COLLECT_PTS;
      _p3._snd.playCollectM2?.();
      _p3._edu.trigger('M2_PREP');
    } else if (type === 'NS1') {
      _ns1Count++;
      _score += P3D_CFG.A1_COLLECT_PTS;
      _p3._snd.playCollectNS1?.();
      _p3._edu.trigger('NS1_STOCKPILE');
    } else {
      // HEALTH
      _hp = Math.min(100, _hp + P3D_CFG.A1_HEALTH_RESTORE);
      _p3._snd.playCollectHealth?.();
    }
  }

  // ── Educational triggers ───────────────────────────────────────────────

  function _checkEduTriggers(pH) {
    const fire = (id, cond) => {
      if (cond && !_eduFired[id]) { _eduFired[id] = true; _p3._edu.trigger(id); }
    };
    fire('CLATHRIN_SHED', pH <= 6.5);
    fire('RAB5_EARLY',    pH <= P3D_CFG.A1_RAB5_PH);
    fire('RAB7_LATE',     pH <= P3D_CFG.A1_RAB7_PH);
    fire('VATPASE',       pH <= 6.3);
    fire('HA_LOOSEN',     pH <= 5.8);
  }

  // ── Complete ───────────────────────────────────────────────────────────

  function _complete() {
    _running = false;
    _removeInput();

    const stats = {
      m2:    _m2Count,
      ns1:   _ns1Count,
      hp:    _hp,
      score: _score,
      depth: Math.round(_descentY),
    };
    _p3._act1Done(stats);
  }

  // ── Pause / resume ─────────────────────────────────────────────────────

  function _pause()  { _paused = true;  }
  function _resume() { _paused = false; }

  // ── Destroy ────────────────────────────────────────────────────────────

  function destroy() {
    _running = false;
    _paused  = false;
    _removeInput();

    if (_vehicle) { _vehicle.destroy(); _vehicle = null; }
    if (_env)     { _env.destroy();     _env     = null; }
    if (_collect) { _collect.destroy(); _collect = null; }

    if (_cam) { _cam.reset(); _cam = null; }
    _p3 = null;
  }

  function _removeInput() {
    window.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('keyup',   _onKeyUp);
    for (const k in _keys) delete _keys[k];
  }

  // ── Public interface ───────────────────────────────────────────────────

  const pub = {
    get _running() { return _running; },
    init,
    start,
    tick,
    _pause,
    _resume,
    destroy,
  };

  window.P3DAct1Descent = pub;
  return pub;
})();
