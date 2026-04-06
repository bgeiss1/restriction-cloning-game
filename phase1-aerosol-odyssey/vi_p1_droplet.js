/**
 * vi_p1_droplet.js — Phase 1 player droplet entity.
 *
 * Manages the playable respiratory droplet: mesh, physics, evaporation,
 * viral viability, and camera-follow.  Environmental zone effects (UV, warm,
 * dry, humid) are stubbed for Chunk 3; only base rates apply here.
 *
 * API:
 *   P1Droplet.init(scene, camera, startPos)
 *   P1Droplet.tick(dt)
 *   P1Droplet.destroy()
 *   P1Droplet.getPos()       → {x,y,z}
 *   P1Droplet.getState()     → {dropletIntegrity, viralViability, radius}
 *   P1Droplet.setKeys(keys)  — live key state {left,right,up,down}
 *   P1Droplet.isAlive()      → bool  (false after floor hit or VV=0)
 *   P1Droplet.hasWon()       → bool  (reached inhalation zone)
 *   P1Droplet.getFailReason()→ string
 */

/* global THREE, P1_CFG, P1Students, P1Zones, P1Furniture */

const P1Droplet = (() => {

  let _scene  = null;
  let _camera = null;

  // Groups / meshes
  let _group     = null;
  let _outerMesh = null;
  let _outerMat  = null;
  let _virusMesh = null;

  // Physics
  let _pos   = { x: 0, y: 0, z: 0 };
  let _velX  = 0;
  let _velY  = 0;

  // Droplet state
  let _dropletIntegrity = 100;
  let _viralViability   = 100;
  let _currentRadius    = P1_CFG.DROPLET_START_RADIUS;

  // Keys
  let _keys = { left: false, right: false, up: false, down: false };

  // Zone state
  let _zoneName = null;

  // Breathing cycle (active near target student)
  let _breathT       = 0;   // time within current cycle, modulo BREATH_CYCLE_S
  let _breathActive  = false;
  let _breathPhase   = null;   // 'inhale' | 'exhale' | null

  // Collision cooldown — prevents multi-frame damage from one hit
  let _hitCooldown  = 0;
  let _maskCooldown = 0;

  // Hit type flag — consumed by main each frame to trigger SFX
  let _hitType = null;   // 'furniture' | 'mask' | null

  // Pre-allocated vectors for collision (avoids per-frame GC)
  const _posV    = new THREE.Vector3();
  const _closest = new THREE.Vector3();
  const _normalV = new THREE.Vector3();

  // Result
  let _alive      = true;
  let _won        = false;
  let _failReason = '';

  // Dispose tracking
  const _geos = [];
  const _mats = [];
  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Build ──────────────────────────────────────────────────────────────────

  function _build() {
    _group = new THREE.Group();

    // Outer water sphere
    _outerMat = _mat(new THREE.MeshPhongMaterial({
      color:      P1_CFG.DROPLET_COLOR_FULL,
      transparent: true,
      opacity:    P1_CFG.DROPLET_OPACITY_FULL,
      shininess:  90,
      depthWrite: false,
    }));
    const outerGeo = _geo(new THREE.SphereGeometry(P1_CFG.DROPLET_START_RADIUS, 16, 12));
    _outerMesh = new THREE.Mesh(outerGeo, _outerMat);
    _group.add(_outerMesh);

    // Inner virus sphere
    const virusMat = _mat(new THREE.MeshPhongMaterial({
      color:    P1_CFG.VIRUS_COLOR,
      emissive: new THREE.Color(P1_CFG.VIRUS_COLOR).multiplyScalar(0.25),
      shininess: 25,
    }));
    const virusGeo = _geo(new THREE.SphereGeometry(P1_CFG.VIRUS_RADIUS, 8, 6));
    _virusMesh = new THREE.Mesh(virusGeo, virusMat);
    _group.add(_virusMesh);

    // HA spikes (golden-ratio distribution)
    const spikeMat = _mat(new THREE.MeshPhongMaterial({ color: 0xff9966, shininess: 8 }));
    const spikeGeo = _geo(new THREE.ConeGeometry(0.004, 0.020, 4));
    const N = P1_CFG.VIRUS_SPIKE_COUNT;
    const r = P1_CFG.VIRUS_RADIUS;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const phi   = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      const sp = new THREE.Mesh(spikeGeo, spikeMat);
      sp.position.set(nx * (r + 0.010), ny * (r + 0.010), nz * (r + 0.010));
      sp.quaternion.setFromUnitVectors(up, new THREE.Vector3(nx, ny, nz));
      _virusMesh.add(sp);
    }

    _group.position.set(_pos.x, _pos.y, _pos.z);
    _scene.add(_group);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init(scene, camera, startPos) {
    _scene  = scene;
    _camera = camera;
    _pos    = { x: startPos.x, y: startPos.y, z: startPos.z };
    _velX   = 0;
    _velY   = 0;
    _dropletIntegrity = 100;
    _viralViability   = 100;
    _currentRadius    = P1_CFG.DROPLET_START_RADIUS;
    _zoneName     = null;
    _breathT      = 0;
    _breathActive = false;
    _breathPhase  = null;
    _hitCooldown  = 0;
    _maskCooldown = 0;
    _alive      = true;
    _won        = false;
    _failReason = '';

    _build();

    // Snap camera
    const co = P1_CFG.CAM_OFFSET;
    _camera.position.set(_pos.x + co.x, _pos.y + co.y, _pos.z + co.z);
    _camera.lookAt(_pos.x, _pos.y + 0.1, _pos.z + 1.0);
  }

  function tick(dt) {
    if (!_alive || _won) return;

    // ── Zone detection (uses position at frame start) ─────────────────────────
    const zone = P1Zones.getZoneState(_pos);
    _zoneName = zone.zoneName;
    _hitType  = null;   // reset each frame; set below if hit occurs
    const airF = P1Zones.getAirForce(_pos);

    // ── Input → velocity ─────────────────────────────────────────────────────
    if (_keys.left)  _velX -= P1_CFG.LATERAL_ACCEL  * dt;
    if (_keys.right) _velX += P1_CFG.LATERAL_ACCEL  * dt;
    if (_keys.up)    _velY += P1_CFG.ALTITUDE_ACCEL * dt;
    if (_keys.down)  _velY -= P1_CFG.ALTITUDE_ACCEL * dt;

    _velX = Math.max(-P1_CFG.MAX_LATERAL_SPEED,  Math.min(P1_CFG.MAX_LATERAL_SPEED,  _velX));
    _velY = Math.max(-P1_CFG.MAX_ALTITUDE_SPEED * 1.5, Math.min(P1_CFG.MAX_ALTITUDE_SPEED, _velY));

    // Lateral drag (frame-rate independent)
    _velX *= Math.pow(P1_CFG.LATERAL_DRAG, dt * 60);

    // Gravity
    _velY -= P1_CFG.GRAVITY * dt;

    // Air currents
    _velX += airF.fx * dt;
    _velY += airF.fy * dt;

    // ── Position update ──────────────────────────────────────────────────────
    _pos.x += _velX * dt;
    _pos.y += _velY * dt;
    _pos.z += P1_CFG.BASE_FORWARD_SPEED * dt;

    // ── Boundaries ───────────────────────────────────────────────────────────
    _pos.x = Math.max(P1_CFG.X_MIN, Math.min(P1_CFG.X_MAX, _pos.x));

    if (_pos.y >= P1_CFG.Y_MAX) {
      _pos.y = P1_CFG.Y_MAX;
      _velY  = -Math.abs(_velY) * 0.35;   // ceiling bounce
    }

    if (_pos.y <= P1_CFG.Y_MIN) {
      _alive      = false;
      _failReason = 'The droplet fell — gravity won.';
      return;
    }

    // ── Evaporation (zone-aware rate) ─────────────────────────────────────────
    // zone.evapRate is %/sec; negative in humid zone = DI recovery.
    _dropletIntegrity -= zone.evapRate * dt;
    _dropletIntegrity  = Math.max(0, Math.min(100, _dropletIntegrity));

    // ── Viral viability (base decay + zone extra) ─────────────────────────────
    const desiccated   = _dropletIntegrity <= 0;
    const totalViabDecay = P1_CFG.VIAB_BASE_DECAY
                         * (desiccated ? P1_CFG.VIAB_DESICCATED_MULT : 1)
                         + zone.viabExtraDecay;
    _viralViability -= totalViabDecay * dt;
    _viralViability  = Math.max(0, _viralViability);

    if (_viralViability <= 0) {
      _alive      = false;
      _failReason = 'The virus desiccated — no viable particles remain.';
      return;
    }

    // ── Furniture collision ───────────────────────────────────────────────────
    if (_hitCooldown > 0) _hitCooldown -= dt;
    _checkFurnitureCollision();

    // ── Masked student ────────────────────────────────────────────────────────
    if (_maskCooldown > 0) _maskCooldown -= dt;
    _checkMaskedStudent();

    // ── Breathing cycle (approach zone) ──────────────────────────────────────
    _updateBreathing(dt);

    // ── Visuals: shrink + recolor outer sphere ───────────────────────────────
    const t = _dropletIntegrity / 100;
    _currentRadius = P1_CFG.DROPLET_MIN_RADIUS
                   + t * (P1_CFG.DROPLET_START_RADIUS - P1_CFG.DROPLET_MIN_RADIUS);
    const s = _currentRadius / P1_CFG.DROPLET_START_RADIUS;
    _outerMesh.scale.setScalar(s);
    _outerMat.opacity = P1_CFG.DROPLET_OPACITY_DRY
                      + t * (P1_CFG.DROPLET_OPACITY_FULL - P1_CFG.DROPLET_OPACITY_DRY);
    _outerMat.color.lerpColors(
      new THREE.Color(P1_CFG.DROPLET_COLOR_DRY),
      new THREE.Color(P1_CFG.DROPLET_COLOR_FULL),
      t
    );
    _outerMesh.visible = s > 0.28;   // hide fully desiccated shell

    // Virus slow spin
    _virusMesh.rotation.y += dt * 0.45;

    // Visual tilt when steering
    _group.rotation.z = -_velX * (P1_CFG.MAX_TILT_DEG * Math.PI / 180)
                        / P1_CFG.MAX_LATERAL_SPEED;

    _group.position.set(_pos.x, _pos.y, _pos.z);

    // ── Camera follow ─────────────────────────────────────────────────────────
    const target = P1Students.getTargetHead();
    const inApproach = target && (_pos.z > target.z - P1_CFG.APPROACH_Z_THRESHOLD);
    const co = inApproach ? P1_CFG.CAM_OFFSET_APPROACH : P1_CFG.CAM_OFFSET;

    const l = P1_CFG.CAM_LERP;
    _camera.position.x += (_pos.x + co.x - _camera.position.x) * l;
    _camera.position.y += (_pos.y + co.y - _camera.position.y) * l;
    _camera.position.z += (_pos.z + co.z - _camera.position.z) * l;
    _camera.lookAt(_pos.x, _pos.y, _pos.z + 0.6);

    // ── Win check — must reach inhalation zone during inhale phase ───────────
    if (target) {
      const dx = _pos.x - target.x;
      const dy = _pos.y - target.y;
      const dz = _pos.z - target.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // Win on inhale (or within 20% of cycle start for leniency).
      // If breathing not yet active (far away), plain proximity wins.
      const inInhale = !_breathActive || _breathPhase === 'inhale';
      if (dist < P1_CFG.INHALATION_ZONE_RADIUS && inInhale) {
        _won = true;
      }
    } else if (_pos.z >= P1_CFG.Z_END) {
      _won = true;
    }
  }

  // ── Furniture collision ────────────────────────────────────────────────────
  // Treats each desk/chair AABB as a solid box. On penetration: push droplet
  // out along the shortest axis, partially reflect velocity, and apply damage.

  function _checkFurnitureCollision() {
    const colliders = P1Furniture.getColliders();
    _posV.set(_pos.x, _pos.y, _pos.z);
    const r = _currentRadius + 0.01;   // small skin

    for (const box of colliders) {
      box.clampPoint(_posV, _closest);
      _normalV.subVectors(_posV, _closest);
      const dist = _normalV.length();
      if (dist < r) {
        // Push out
        const pen = r - dist;
        if (dist > 0.001) {
          _normalV.normalize();
        } else {
          _normalV.set(0, 1, 0);   // directly inside — push up
        }
        _pos.x += _normalV.x * pen;
        _pos.y += _normalV.y * pen;
        _pos.z += _normalV.z * pen;

        // Partial velocity reflection off surface normal
        const dot = _velX * _normalV.x + _velY * _normalV.y;
        if (dot < 0) {   // only if moving into surface
          _velX -= 2 * dot * _normalV.x * 0.45;
          _velY -= 2 * dot * _normalV.y * 0.45;
        }

        // Damage — gated by cooldown so one hit = one damage event
        if (_hitCooldown <= 0) {
          _dropletIntegrity -= P1_CFG.DROPLET_COLLISION_DAMAGE;
          _viralViability   -= P1_CFG.VIAB_COLLISION_DAMAGE;
          _dropletIntegrity  = Math.max(0, _dropletIntegrity);
          _viralViability    = Math.max(0, _viralViability);
          _hitCooldown = 0.6;   // 0.6s before next furniture hit can damage
          _hitType = 'furniture';
        }

        break;   // one collision resolved per frame is enough
      }
    }
  }

  // ── Masked student ─────────────────────────────────────────────────────────
  // The surgical mask deflects the droplet with heavy DI damage.

  function _checkMaskedStudent() {
    if (_maskCooldown > 0) return;
    const masked = P1Students.getMaskedStudent();
    if (!masked) return;

    const p = masked.pos;
    const captureR = masked.headRadius + _currentRadius + 0.06;
    const dx = _pos.x - p.x;
    const dy = _pos.y - (P1_CFG.HEAD_Y);
    const dz = _pos.z - p.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < captureR) {
      // Push droplet away from mask head
      const nx = dist > 0.001 ? dx / dist : 0;
      const ny = dist > 0.001 ? dy / dist : 1;
      const nz = dist > 0.001 ? dz / dist : 0;

      _pos.x += nx * (captureR - dist + 0.02);
      _pos.y += ny * (captureR - dist + 0.02);
      _pos.z += nz * (captureR - dist + 0.02);

      // Deflect velocity
      const dot = _velX * nx + _velY * ny;
      if (dot < 0) {
        _velX -= 2 * dot * nx * 0.6;
        _velY -= 2 * dot * ny * 0.6;
      }

      // Damage from mask collision
      _dropletIntegrity -= 12;
      _viralViability   -= 5;
      _dropletIntegrity  = Math.max(0, _dropletIntegrity);
      _viralViability    = Math.max(0, _viralViability);
      _zoneName = 'MASK BLOCKED';
      _maskCooldown = 1.5;
      _hitType = 'mask';
    }
  }

  // ── Breathing cycle ────────────────────────────────────────────────────────
  // Activates when the droplet enters the approach zone near the target student.
  // Inhale phase: suction force scaled by proximity.
  // Exhale phase: push force scaled by proximity.

  function _updateBreathing(dt) {
    const target = P1Students.getTargetHead();
    if (!target) return;

    const dx = _pos.x - target.x;
    const dy = _pos.y - target.y;
    const dz = _pos.z - target.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const inApproach = dist < P1_CFG.APPROACH_Z_THRESHOLD * 1.5;

    if (!inApproach) {
      _breathActive = false;
      _breathPhase  = null;
      return;
    }

    _breathActive = true;
    _breathT = (_breathT + dt) % P1_CFG.BREATH_CYCLE_S;
    const halfCycle = P1_CFG.BREATH_CYCLE_S / 2;
    const isInhale  = _breathT < halfCycle;
    _breathPhase    = isInhale ? 'inhale' : 'exhale';

    // Direction toward target nose
    const invDist = dist > 0.001 ? 1 / dist : 0;
    const ndx = -(dx * invDist);   // toward target
    const ndy = -(dy * invDist);
    const ndz = -(dz * invDist);

    // Force magnitude: ramps linearly, max within INHALATION_ZONE_RADIUS
    const proximity = Math.max(0, 1 - dist / (P1_CFG.APPROACH_Z_THRESHOLD * 1.5));

    if (isInhale) {
      // Suction toward nose
      const force = P1_CFG.INHALE_SUCTION_FORCE
                  + proximity * (P1_CFG.INHALE_SUCTION_MAX - P1_CFG.INHALE_SUCTION_FORCE);
      _velX += ndx * force * dt;
      _velY += ndy * force * dt;
      // Override zone display
      if (_maskCooldown <= 0) _zoneName = 'INHALING';
    } else {
      // Exhale push
      const force = P1_CFG.EXHALE_PUSH_FORCE * proximity;
      _velX -= ndx * force * dt;
      _velY -= ndy * force * dt;
      if (_maskCooldown <= 0) _zoneName = 'EXHALING';
    }
  }

  function destroy() {
    if (_group && _group.parent) _group.parent.remove(_group);
    _group = null;
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos.length = 0;
    _mats.length = 0;
    _scene  = null;
    _camera = null;
  }

  function getPos()       { return { ..._pos }; }
  function getState()     {
    return {
      dropletIntegrity: _dropletIntegrity,
      viralViability:   _viralViability,
      radius:           _currentRadius,
      zoneName:         _zoneName,
      breathPhase:      _breathPhase,
    };
  }
  function setKeys(k)     { _keys = k; }
  function isAlive()      { return _alive; }
  function hasWon()       { return _won; }
  function getFailReason(){ return _failReason; }
  function consumeHit()   { const h = _hitType; _hitType = null; return h; }

  return { init, tick, destroy, getPos, getState, setKeys, isAlive, hasWon, getFailReason, consumeHit };

})();
