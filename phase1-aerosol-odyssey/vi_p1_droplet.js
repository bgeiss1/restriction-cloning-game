/**
 * vi_p1_droplet.js — Phase 1 2D droplet entity.
 *
 * Manages the playable respiratory droplet in 2D side-scroller mode:
 * physics, evaporation, viral viability, platform collision, and breathing forces.
 *
 * API:
 *   P1Droplet.init(scene, scrollX, scrollSpeed, viewW)
 *   P1Droplet.tick(dt, scrollX, scrollSpeed, viewW, keys, breathState)
 *   P1Droplet.destroy()
 *   P1Droplet.getPos()       → {x, y} (world coordinates)
 *   P1Droplet.getState()     → {dropletIntegrity, viralViability, radius}
 *   P1Droplet.isAlive()      → bool
 *   P1Droplet.hasWon()       → bool
 *   P1Droplet.getFailReason()→ string
 */

/* global THREE, P1_CFG, P1Level */

const P1Droplet = (() => {

  let _scene = null;

  // Groups / meshes
  let _group = null;
  let _outerMesh = null;
  let _outerMat = null;
  let _virusMesh = null;

  // 2D Physics (world coordinates)
  let _worldX = 0;   // world x position
  let _worldY = P1_CFG.DROPLET_START_Y_2D;   // world y position
  let _velX = 0;     // lateral nudge velocity
  let _velY = 0;     // vertical velocity

  // Droplet state
  let _dropletIntegrity = 100;
  let _viralViability = 100;
  let _radius = P1_CFG.DROPLET_RADIUS_2D;

  // Result flags
  let _alive = true;
  let _won = false;
  let _failReason = '';

  // Dispose tracking
  const _geos = [];
  const _mats = [];
  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Build droplet mesh ─────────────────────────────────────────────────────

  function _buildDroplet() {
    _group = new THREE.Group();

    // Outer water sphere (unit radius, scaled by _radius)
    const outerGeo = _geo(new THREE.SphereGeometry(1.0, 16, 12));
    _outerMat = _mat(new THREE.MeshPhongMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0.55,
      shininess: 90,
      depthWrite: false,
    }));
    _outerMesh = new THREE.Mesh(outerGeo, _outerMat);
    _outerMesh.scale.z = 0.35;  // flatten for 2D side view
    _group.add(_outerMesh);

    // Inner virus (icosahedron)
    const virusGeo = _geo(new THREE.IcosahedronGeometry(0.32, 1));
    const virusMat = _mat(new THREE.MeshPhongMaterial({
      color: 0xff6644,
      emissive: new THREE.Color(0x441100),
      emissiveIntensity: 0.35,
      shininess: 25,
    }));
    _virusMesh = new THREE.Mesh(virusGeo, virusMat);
    _group.add(_virusMesh);

    // Virus spikes (6 cardinal directions)
    const spikeMat = _mat(new THREE.MeshPhongMaterial({ color: 0xff8866 }));
    const dirs = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];
    dirs.forEach(([dx, dy, dz]) => {
      const spikeGeo = _geo(new THREE.ConeGeometry(0.055, 0.24, 4));
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(dx * 0.40, dy * 0.40, dz * 0.40);
      spike.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx, dy, dz)
      );
      _virusMesh.add(spike);
    });

    _scene.add(_group);
    _updateMeshPosition();
  }

  function _updateMeshPosition() {
    if (!_group) return;

    // Scale group by current radius
    const scale = _radius / P1_CFG.DROPLET_RADIUS_2D;
    _group.scale.setScalar(scale);

    // Position in world coordinates
    _group.position.set(_worldX, _worldY, 1.6);

    // Visual tilt based on lateral velocity
    _group.rotation.z = -_velX * 0.3;

    // Virus slow spin
    if (_virusMesh) _virusMesh.rotation.y += 0.02;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  function init(scene, scrollX, scrollSpeed, viewW) {
    _scene = scene;

    // Start droplet at left side of view
    _worldX = scrollX + viewW * P1_CFG.DROPLET_VIEW_FRAC_2D;
    _worldY = P1_CFG.DROPLET_START_Y_2D;
    _velX = 0;
    _velY = 0;

    _dropletIntegrity = 100;
    _viralViability = 100;
    _radius = P1_CFG.DROPLET_RADIUS_2D;

    _alive = true;
    _won = false;
    _failReason = '';

    _buildDroplet();
  }

  function tick(dt, scrollX, scrollSpeed, viewW, keys, breathState) {
    if (!_alive || _won) return;

    // ── Input forces ──────────────────────────────────────────────────────────
    let thrustX = 0;
    let thrustY = 0;

    if (keys.up)    thrustY += P1_CFG.DROPLET_THRUST_UP_2D;
    if (keys.down)  thrustY -= P1_CFG.DROPLET_THRUST_DOWN_2D;
    if (keys.left)  thrustX -= P1_CFG.DROPLET_THRUST_LR_2D;
    if (keys.right) thrustX += P1_CFG.DROPLET_THRUST_LR_2D;

    // ── Gravity (scaled by droplet size) ─────────────────────────────────────
    const sizeRatio = _radius / P1_CFG.DROPLET_RADIUS_2D;
    const gravityMult = 1 + (sizeRatio * sizeRatio) * P1_CFG.DROPLET_GRAVITY_SIZE_2D;
    const gravity = P1_CFG.DROPLET_GRAVITY_2D * gravityMult;
    thrustY -= gravity;

    // ── Breathing forces ──────────────────────────────────────────────────────
    if (breathState && breathState.force) {
      thrustX += breathState.force.fx;
      thrustY += breathState.force.fy;
    }

    // ── Apply forces to velocity ──────────────────────────────────────────────
    _velX += thrustX * dt;
    _velY += thrustY * dt;

    // Velocity limits
    _velX = Math.max(-P1_CFG.DROPLET_VX_NUDGE_MAX_2D, Math.min(P1_CFG.DROPLET_VX_NUDGE_MAX_2D, _velX));
    _velY = Math.max(-P1_CFG.DROPLET_VY_MAX_2D, Math.min(P1_CFG.DROPLET_VY_MAX_2D, _velY));

    // Drag
    const dragFactor = Math.pow(P1_CFG.DROPLET_DRAG_2D, dt * 60);
    _velX *= dragFactor;
    _velY *= dragFactor;

    // ── Auto-scroll + lateral nudge ──────────────────────────────────────────
    const targetX = scrollX + viewW * P1_CFG.DROPLET_VIEW_FRAC_2D;
    _worldX = targetX + _velX;  // scroll + lateral offset
    _worldY += _velY * dt;

    // ── Boundaries ────────────────────────────────────────────────────────────
    // Floor collision
    if (_worldY - _radius <= P1_CFG.FLOOR_Y_2D) {
      _alive = false;
      _failReason = 'The droplet hit the floor and was absorbed.';
      return;
    }

    // Ceiling soft bounce
    if (_worldY + _radius >= P1_CFG.CEIL_Y_2D) {
      _worldY = P1_CFG.CEIL_Y_2D - _radius;
      _velY = -Math.abs(_velY) * 0.4;  // soft bounce
    }

    // ── Platform collision ────────────────────────────────────────────────────
    if (P1Level.checkPlatformHit(_worldX, _worldY, _radius)) {
      _alive = false;
      _failReason = 'The droplet hit an obstacle and was absorbed.';
      return;
    }

    // ── Evaporation & viral decay ─────────────────────────────────────────────
    // Apply hazard zone effects
    const hazardEffects = (breathState && breathState.hazardEffects) ||
                         { evapMult: 1.0, viabMult: 1.0 };

    // Evaporation with zone multipliers
    const evapRate = P1_CFG.EVAP_RATE_2D * hazardEffects.evapMult;
    _dropletIntegrity -= evapRate * dt * 100;
    _dropletIntegrity = Math.max(0, _dropletIntegrity);

    // Viral decay with zone and desiccation multipliers
    const desiccated = _dropletIntegrity <= 0;
    const viabDecayMult = desiccated ? P1_CFG.VIAB_DESICCATED_MULT_2D : 1;
    const totalViabDecay = P1_CFG.VIAB_DECAY_BASE_2D * viabDecayMult * hazardEffects.viabMult;
    _viralViability -= totalViabDecay * dt * 100;
    _viralViability = Math.max(0, _viralViability);

    if (_viralViability <= 0) {
      _alive = false;
      _failReason = 'The virus became inactive — no viable particles remain.';
      return;
    }

    // ── Update visual radius ──────────────────────────────────────────────────
    const integrityFrac = _dropletIntegrity / 100;
    _radius = P1_CFG.DROPLET_RADIUS_MIN_2D +
              integrityFrac * (P1_CFG.DROPLET_RADIUS_2D - P1_CFG.DROPLET_RADIUS_MIN_2D);

    // Update droplet opacity and color
    if (_outerMat) {
      _outerMat.opacity = 0.25 + integrityFrac * 0.30;
      _outerMat.color.lerpColors(
        new THREE.Color(0x4488aa),  // dry color
        new THREE.Color(0x88ddff),  // full color
        integrityFrac
      );
    }

    // ── Win check ──────────────────────────────────────────────────────────────
    if (breathState && breathState.distToMouth < P1_CFG.WIN_DIST_2D) {
      _won = true;
    }

    // Update mesh position and effects
    _updateMeshPosition();
  }

  function destroy() {
    if (_group && _group.parent) _group.parent.remove(_group);
    _group = null;
    _outerMesh = null;
    _outerMat = null;
    _virusMesh = null;

    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos.length = 0;
    _mats.length = 0;

    _scene = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  function getPos() {
    return { x: _worldX, y: _worldY };
  }

  function getState() {
    return {
      dropletIntegrity: _dropletIntegrity,
      viralViability: _viralViability,
      radius: _radius
    };
  }

  function isAlive() { return _alive; }
  function hasWon() { return _won; }
  function getFailReason() { return _failReason; }

  return {
    init,
    tick,
    destroy,
    getPos,
    getState,
    isAlive,
    hasWon,
    getFailReason
  };

})();