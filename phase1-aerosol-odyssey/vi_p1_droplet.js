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

  // Polish effects (Chunk F)
  let _damageFlashTime = 0;
  let _lastZoneName = null;
  let _materialEnhanced = false;
  let _localTime = 0;

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
      shininess: P1_CFG.MATERIAL_SHININESS_ENHANCED_2D,
      depthWrite: false,
    }));
    _outerMesh = new THREE.Mesh(outerGeo, _outerMat);
    _outerMesh.scale.z = 0.35;  // flatten for 2D side view
    _group.add(_outerMesh);

    // Inner virus (smooth sphere)
    const virusGeo = _geo(new THREE.SphereGeometry(0.32, 16, 12));
    const virusMat = _mat(new THREE.MeshPhongMaterial({
      color: 0x4488cc,
      emissive: new THREE.Color(0x002244),
      emissiveIntensity: 0.35,
      shininess: 25,
    }));
    _virusMesh = new THREE.Mesh(virusGeo, virusMat);
    _group.add(_virusMesh);

    // Surface proteins - evenly spaced HA trimers and NA enzymes
    const numHA = 8;  // HA trimers
    const numNA = 6;  // Neuraminidase enzymes
    const minDistance = 0.5; // Minimum distance between proteins

    // Generate evenly distributed positions for both protein types
    const proteinPositions = [];
    const maxAttempts = 500;

    // Helper function to generate random sphere surface point
    function randomSpherePoint() {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());
      return new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
    }

    // Helper function to check minimum distance
    function checkMinDistance(newPos, existingPositions, minDist) {
      for (const pos of existingPositions) {
        if (newPos.distanceTo(pos) < minDist) return false;
      }
      return true;
    }

    // Generate HA positions first
    for (let i = 0; i < numHA; i++) {
      let position = null;
      let attempts = 0;

      do {
        position = randomSpherePoint();
        attempts++;
      } while (!checkMinDistance(position, proteinPositions, minDistance) && attempts < maxAttempts);

      if (position) {
        proteinPositions.push(position);

        const trimerGroup = new THREE.Group();
        trimerGroup.position.copy(position.clone().multiplyScalar(0.32));
        trimerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position);

        // HA2 stem (stalk) - shortened
        const stemGeo = _geo(new THREE.CylinderGeometry(0.018, 0.030, 0.08, 6));
        const stemMat = _mat(new THREE.MeshPhongMaterial({
          color: 0x6688dd,
          emissive: 0x001133,
          emissiveIntensity: 0.15
        }));
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0.04; // half height
        trimerGroup.add(stem);

        // Three HA1 head domains (120° apart)
        for (let j = 0; j < 3; j++) {
          const angle = (j / 3) * Math.PI * 2;
          const headGeo = _geo(new THREE.SphereGeometry(0.038, 6, 5));
          const headMat = _mat(new THREE.MeshPhongMaterial({
            color: 0x88aaff,
            emissive: 0x112244,
            emissiveIntensity: 0.12
          }));
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.set(
            Math.cos(angle) * 0.045,
            0.10,
            Math.sin(angle) * 0.045
          );
          trimerGroup.add(head);
        }

        _virusMesh.add(trimerGroup);
      }
    }

    // Generate NA positions with spacing from HA
    for (let i = 0; i < numNA; i++) {
      let position = null;
      let attempts = 0;

      do {
        position = randomSpherePoint();
        attempts++;
      } while (!checkMinDistance(position, proteinPositions, minDistance) && attempts < maxAttempts);

      if (position) {
        proteinPositions.push(position);

        const naGroup = new THREE.Group();
        naGroup.position.copy(position.clone().multiplyScalar(0.32));
        naGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position);

        // NA stalk - thin stem
        const stalkGeo = _geo(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6));
        const stalkMat = _mat(new THREE.MeshPhongMaterial({
          color: 0x44cc66,
          emissive: 0x002200,
          emissiveIntensity: 0.15
        }));
        const stalk = new THREE.Mesh(stalkGeo, stalkMat);
        stalk.position.y = 0.03; // half height
        naGroup.add(stalk);

        // NA head - mushroom cap (wider, flattened)
        const headGeo = _geo(new THREE.SphereGeometry(0.042, 8, 6));
        const headMat = _mat(new THREE.MeshPhongMaterial({
          color: 0x66dd88,
          emissive: 0x003322,
          emissiveIntensity: 0.18
        }));
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.075;
        head.scale.y = 0.6; // flatten to mushroom shape
        naGroup.add(head);

        _virusMesh.add(naGroup);
      }
    }

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

    _localTime += dt;

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

    // ── Companion droplet fusion ──────────────────────────────────────────────
    const fusedCompanions = P1Level.checkCompanionFusion(_worldX, _worldY, _radius);
    if (fusedCompanions.length > 0) {
      fusedCompanions.forEach(companion => {
        // Size increase (visual radius) - Chunk F balanced
        const sizeBoost = P1_CFG.COMPANION_SIZE_BALANCED_2D * companion.size;
        _radius = Math.min(_radius + sizeBoost, P1_CFG.DROPLET_RADIUS_2D * 1.5); // cap at 1.5x max

        // Viability boost - Chunk F balanced
        const viabBoost = P1_CFG.COMPANION_VIAB_BALANCED_2D * companion.viralContent / 20;
        _viralViability = Math.min(100, _viralViability + viabBoost);

        // Integrity boost (beneficial)
        const integrityBoost = P1_CFG.COMPANION_INTEGRITY_BOOST_2D * companion.size;
        _dropletIntegrity = Math.min(100, _dropletIntegrity + integrityBoost);

        // Enhanced visual effects (Chunk F)
        if (_outerMat) {
          // Temporary brightness boost with enhanced duration
          _outerMat.emissive = new THREE.Color(0x0066aa);
          _outerMat.emissiveIntensity = 0.4;

          setTimeout(() => {
            if (_outerMat) {
              _outerMat.emissive = new THREE.Color(0x000000);
              _outerMat.emissiveIntensity = 0;
            }
          }, P1_CFG.FUSION_FLASH_DURATION_2D * 1000);
        }

        // Create fusion particle effect
        if (typeof P1Level !== 'undefined' && P1Level.createFusionEffect) {
          P1Level.createFusionEffect(companion.x, companion.y);
        }

        // Audio feedback (enhanced)
        if (typeof P1Audio !== 'undefined' && P1Audio.playFusion) {
          P1Audio.playFusion(P1_CFG.AUDIO_FUSION_VOLUME_2D);
        }
      });
    }

    // ── Evaporation & viral decay ─────────────────────────────────────────────
    // Apply hazard zone effects
    const hazardEffects = (breathState && breathState.hazardEffects) ||
                         { evapMult: 1.0, viabMult: 1.0 };

    // Evaporation with zone multipliers (Chunk F balanced)
    const evapRate = P1_CFG.EVAP_RATE_BALANCED_2D * hazardEffects.evapMult;
    _dropletIntegrity -= evapRate * dt * 100;
    _dropletIntegrity = Math.max(0, _dropletIntegrity);

    // Viral decay with zone and desiccation multipliers (Chunk F balanced)
    const desiccated = _dropletIntegrity <= 0;
    const viabDecayMult = desiccated ? P1_CFG.VIAB_DESICCATED_MULT_2D : 1;
    const totalViabDecay = P1_CFG.VIAB_DECAY_BALANCED_2D * viabDecayMult * hazardEffects.viabMult;
    _viralViability -= totalViabDecay * dt * 100;
    _viralViability = Math.max(0, _viralViability);

    if (_viralViability <= 0) {
      _alive = false;
      _failReason = 'The virus became inactive — no viable particles remain.';
      return;
    }

    // Enhanced visual feedback (Chunk F)
    _updatePolishEffects(dt, breathState);

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

  function _updatePolishEffects(dt, breathState) {
    // Damage flash effect
    if (_damageFlashTime > 0) {
      _damageFlashTime -= dt;
      if (_outerMat) {
        const flashIntensity = _damageFlashTime / P1_CFG.DAMAGE_FLASH_DURATION_2D;
        _outerMat.emissive = new THREE.Color(0x550000).multiplyScalar(flashIntensity * 0.8);

        if (_damageFlashTime <= 0) {
          _outerMat.emissive = new THREE.Color(0x000000);
        }
      }
    }

    // Zone transition effects
    const currentZone = (breathState && breathState.zoneName) || 'AIRBORNE';
    if (currentZone !== _lastZoneName) {
      _lastZoneName = currentZone;

      // Flash effect for entering dangerous zones
      if (currentZone === 'UV EXPOSURE' || currentZone === 'EXTREME DANGER' ||
          currentZone === 'SCORCHING WINDS') {
        _triggerDamageFlash();

        // Audio feedback for dangerous zone entry
        if (typeof P1Audio !== 'undefined' && P1Audio.playZoneWarning) {
          P1Audio.playZoneWarning(P1_CFG.AUDIO_ZONE_VOLUME_2D);
        }
      }
    }

    // Critical health warning
    if (_dropletIntegrity < P1_CFG.CRITICAL_HEALTH_THRESHOLD_2D ||
        _viralViability < P1_CFG.CRITICAL_HEALTH_THRESHOLD_2D) {

      if (_outerMat && _damageFlashTime <= 0) {
        // Subtle pulsing for critical health
        const pulse = Math.sin(_localTime * P1_CFG.EMISSIVE_PULSE_SPEED_2D * 4) * 0.5 + 0.5;
        _outerMat.emissive = new THREE.Color(0x330000).multiplyScalar(pulse * 0.3);
      }
    }

    // Enhanced material effects based on health
    if (_outerMat && !_materialEnhanced) {
      _materialEnhanced = true;

      // Enhanced reflectivity and visual quality
      _outerMat.shininess = P1_CFG.MATERIAL_SHININESS_ENHANCED_2D;
      _outerMat.reflectivity = 0.2;
    }

    // Enhance virus glow based on viral viability
    if (_virusMesh && _virusMesh.material) {
      const viabFrac = _viralViability / 100;
      const glowIntensity = viabFrac * 0.4 + 0.1;
      _virusMesh.material.emissiveIntensity = glowIntensity;
    }
  }

  function _triggerDamageFlash() {
    _damageFlashTime = P1_CFG.DAMAGE_FLASH_DURATION_2D;

    // Audio feedback for damage
    if (typeof P1Audio !== 'undefined' && P1Audio.playDamage) {
      P1Audio.playDamage(P1_CFG.AUDIO_DAMAGE_VOLUME_2D);
    }
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