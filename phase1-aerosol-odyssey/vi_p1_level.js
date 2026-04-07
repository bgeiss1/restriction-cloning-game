/**
 * vi_p1_level.js — Phase 1 2D side-scroller level geometry.
 *
 * Builds the 2D level: floor, ceiling, platform obstacles, and Cam the Ram face.
 * Also manages breathing cycle particles and inhale/exhale forces.
 *
 * API:
 *   P1Level.init(scene, aspect)
 *   P1Level.tick(dt)
 *   P1Level.destroy()
 *   P1Level.getBreathState()     → {phase, force, zoneName}
 *   P1Level.checkPlatformHit(x, y, radius) → bool
 */

/* global THREE, P1_CFG */

const P1Level = (() => {

  let _scene = null;
  let _aspect = 1;

  // World geometry
  let _levelGroup = null;
  let _platforms = [];

  // Cam the Ram face parts
  let _camGroup = null;
  let _breathParticles = null;
  let _breathVels = null;

  // Breathing cycle
  let _breathT = 0;
  let _breathPhase = 'rest';  // 'rest' | 'inhale' | 'exhale'

  // Hazard zones
  let _hazardGroup = null;
  let _hazardZones = [];
  let _dryAirParticles = [];
  let _dryAirVels = [];

  // Companion droplets
  let _companionGroup = null;
  let _companions = [];
  let _companionTime = 0;

  // Advanced level design (Chunk E)
  let _movingObstacles = [];
  let _movingObstacleGroup = null;
  let _levelTime = 0;
  let _combinedHazardGroup = null;
  let _advancedCurrents = [];
  let _currentScrollX = 0;

  // Polish & effects (Chunk F)
  let _effectsGroup = null;
  let _fusionParticles = [];
  let _trailParticles = null;
  let _performanceMode = false;
  let _lastFrameTime = 0;

  // Dispose tracking
  const _geos = [];
  const _mats = [];
  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Build Level ────────────────────────────────────────────────────────────

  function init(scene, aspect) {
    _scene = scene;
    _aspect = aspect;
    _breathT = 0;
    _breathPhase = 'rest';

    _buildLevel();
    _buildCamTheRam();
    _buildBreathParticles();
    _buildHazardZones();
    _buildCompanionDroplets();
    _buildMovingObstacles();
    _buildCombinedHazards();
    _buildAdvancedCurrents();
    _buildPolishEffects();
  }

  function _buildLevel() {
    _levelGroup = new THREE.Group();
    _scene.add(_levelGroup);

    // Floor
    const floorGeo = _geo(new THREE.PlaneGeometry(P1_CFG.WORLD_WIDTH_2D, 0.4));
    const floorMat = _mat(new THREE.MeshPhongMaterial({ color: 0x2a2520 }));
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(P1_CFG.WORLD_WIDTH_2D / 2, P1_CFG.FLOOR_Y_2D - 0.2, 1.4);
    floorMesh.rotation.x = -Math.PI / 2;
    _levelGroup.add(floorMesh);

    // Ceiling
    const ceilGeo = _geo(new THREE.PlaneGeometry(P1_CFG.WORLD_WIDTH_2D, 0.4));
    const ceilMat = _mat(new THREE.MeshPhongMaterial({ color: 0x1a1510 }));
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.position.set(P1_CFG.WORLD_WIDTH_2D / 2, P1_CFG.CEIL_Y_2D + 0.2, 1.4);
    ceilMesh.rotation.x = Math.PI / 2;
    _levelGroup.add(ceilMesh);

    // Platform obstacles
    const platformMat = _mat(new THREE.MeshPhongMaterial({ color: 0x4a3828 }));
    _platforms = [];

    P1_CFG.PLATFORMS_2D.forEach(p => {
      const geo = _geo(new THREE.BoxGeometry(p.w, p.h, 0.6));
      const mesh = new THREE.Mesh(geo, platformMat);
      mesh.position.set(p.x + p.w/2, p.y + p.h/2, 1.5);
      _levelGroup.add(mesh);
      _platforms.push({ ...p });
    });
  }

  function _buildCamTheRam() {
    _camGroup = new THREE.Group();
    _scene.add(_camGroup);

    const worldX = 93;
    const worldY = 6;
    const z = 1.5;

    // Head (cream-colored sphere, flattened)
    const headGeo = _geo(new THREE.SphereGeometry(2.2, 16, 12));
    const headMat = _mat(new THREE.MeshPhongMaterial({ color: 0xe8d8b8 }));
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(worldX, worldY, z);
    headMesh.scale.z = 0.22;  // flatten to side view
    _camGroup.add(headMesh);

    // Horn (curved golden tube)
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(92, 8, z),
      new THREE.Vector3(90.5, 11.5, z),
      new THREE.Vector3(88, 11, z),
      new THREE.Vector3(87.5, 8.2, z)
    ]);
    const hornGeo = _geo(new THREE.TubeGeometry(hornCurve, 16, 0.22, 8));
    const hornMat = _mat(new THREE.MeshPhongMaterial({ color: 0xC8A951 })); // CSU gold
    const hornMesh = new THREE.Mesh(hornGeo, hornMat);
    _camGroup.add(hornMesh);

    // Muzzle (cream box extending left from head)
    const muzzleGeo = _geo(new THREE.BoxGeometry(4, 2, 0.4));
    const muzzleMat = _mat(new THREE.MeshPhongMaterial({ color: 0xe8d8b8 }));
    const muzzleMesh = new THREE.Mesh(muzzleGeo, muzzleMat);
    muzzleMesh.position.set(90.5, 4.8, z);
    _camGroup.add(muzzleMesh);

    // Nostril (dark circle on muzzle)
    const nostrilGeo = _geo(new THREE.CircleGeometry(0.22, 8));
    const nostrilMat = _mat(new THREE.MeshBasicMaterial({ color: 0x220011 }));
    const nostrilMesh = new THREE.Mesh(nostrilGeo, nostrilMat);
    nostrilMesh.position.set(88.7, 4.9, z + 0.25);
    _camGroup.add(nostrilMesh);

    // Eye white
    const eyeWhiteGeo = _geo(new THREE.CircleGeometry(0.38, 12));
    const eyeWhiteMat = _mat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const eyeWhiteMesh = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWhiteMesh.position.set(91.8, 7.0, z + 0.25);
    _camGroup.add(eyeWhiteMesh);

    // Pupil
    const pupilGeo = _geo(new THREE.CircleGeometry(0.18, 8));
    const pupilMat = _mat(new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const pupilMesh = new THREE.Mesh(pupilGeo, pupilMat);
    pupilMesh.position.set(91.6, 7.0, z + 0.3);
    _camGroup.add(pupilMesh);

    // Ear (cone, tilted)
    const earGeo = _geo(new THREE.ConeGeometry(0.5, 1.2, 8));
    const earMat = _mat(new THREE.MeshPhongMaterial({ color: 0xe8d8b8 }));
    const earMesh = new THREE.Mesh(earGeo, earMat);
    earMesh.position.set(94.2, 8.2, z);
    earMesh.rotation.z = 0.3;
    _camGroup.add(earMesh);

    // Mouth opening (dark circle - WIN TARGET)
    const mouthGeo = _geo(new THREE.CircleGeometry(0.5, 12));
    const mouthMat = _mat(new THREE.MeshBasicMaterial({ color: 0x331100 }));
    const mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
    mouthMesh.position.set(P1_CFG.MOUTH_WORLD_X_2D, P1_CFG.MOUTH_WORLD_Y_2D, z + 0.25);
    _camGroup.add(mouthMesh);
  }

  function _buildBreathParticles() {
    const N = 24;
    const positions = new Float32Array(N * 3);
    _breathVels = new Float32Array(N * 3);

    // Start particles near mouth
    for (let i = 0; i < N; i++) {
      positions[i*3  ] = P1_CFG.MOUTH_WORLD_X_2D + (Math.random() - 0.5) * 0.8;
      positions[i*3+1] = P1_CFG.MOUTH_WORLD_Y_2D + (Math.random() - 0.5) * 0.8;
      positions[i*3+2] = 1.8 + Math.random() * 0.4;

      _breathVels[i*3  ] = 0;
      _breathVels[i*3+1] = 0;
      _breathVels[i*3+2] = 0;
    }

    const geo = _geo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = _mat(new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.15,
      transparent: true,
      opacity: 0.0,  // start invisible
      depthWrite: false,
    }));

    _breathParticles = new THREE.Points(geo, mat);
    _scene.add(_breathParticles);
  }

  function _buildHazardZones() {
    _hazardGroup = new THREE.Group();
    _scene.add(_hazardGroup);
    _hazardZones = [];

    P1_CFG.HAZARD_ZONES_2D.forEach(zone => {
      _hazardZones.push({ ...zone });

      // Visual representation based on zone type
      const centerX = zone.x + zone.w / 2;
      const centerY = zone.y + zone.h / 2;
      const z = 0.8; // behind most geometry

      if (zone.type === 'UV') {
        // Bright yellow/white beam
        const uvGeo = _geo(new THREE.PlaneGeometry(zone.w, zone.h));
        const uvMat = _mat(new THREE.MeshBasicMaterial({
          color: 0xffff88,
          transparent: true,
          opacity: 0.15 + zone.intensity * 0.1,
          depthWrite: false,
        }));
        const uvMesh = new THREE.Mesh(uvGeo, uvMat);
        uvMesh.position.set(centerX, centerY, z);
        _hazardGroup.add(uvMesh);

        // Animated edge particles
        const edgeParticles = _createZoneEdgeParticles(zone, 0xffffaa, 16);
        if (edgeParticles) _hazardGroup.add(edgeParticles);

      } else if (zone.type === 'HEAT') {
        // Orange/red heat zone
        const heatGeo = _geo(new THREE.PlaneGeometry(zone.w, zone.h));
        const heatMat = _mat(new THREE.MeshBasicMaterial({
          color: 0xff6644,
          transparent: true,
          opacity: 0.12 + zone.intensity * 0.08,
          depthWrite: false,
        }));
        const heatMesh = new THREE.Mesh(heatGeo, heatMat);
        heatMesh.position.set(centerX, centerY, z);
        _hazardGroup.add(heatMesh);

        // Heat shimmer particles
        const shimmerParticles = _createZoneEdgeParticles(zone, 0xff8866, 12);
        if (shimmerParticles) _hazardGroup.add(shimmerParticles);

      } else if (zone.type === 'DRY_AIR') {
        // Moving air particles
        const dryParticles = _createDryAirParticles(zone);
        if (dryParticles) {
          _hazardGroup.add(dryParticles);
          _dryAirParticles.push(dryParticles);
        }

      } else if (zone.type === 'HUMID') {
        // Beneficial misty blue zone
        const humidGeo = _geo(new THREE.PlaneGeometry(zone.w, zone.h));
        const humidMat = _mat(new THREE.MeshBasicMaterial({
          color: 0x4488cc,
          transparent: true,
          opacity: 0.08 + zone.intensity * 0.06,
          depthWrite: false,
        }));
        const humidMesh = new THREE.Mesh(humidGeo, humidMat);
        humidMesh.position.set(centerX, centerY, z);
        _hazardGroup.add(humidMesh);

        // Gentle mist particles
        const mistParticles = _createZoneEdgeParticles(zone, 0x88bbff, 8);
        if (mistParticles) _hazardGroup.add(mistParticles);
      }
    });
  }

  function _createZoneEdgeParticles(zone, color, count) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random positions around zone perimeter
      const t = Math.random();
      let x, y;
      if (t < 0.25) { // bottom edge
        x = zone.x + Math.random() * zone.w;
        y = zone.y;
      } else if (t < 0.5) { // right edge
        x = zone.x + zone.w;
        y = zone.y + Math.random() * zone.h;
      } else if (t < 0.75) { // top edge
        x = zone.x + Math.random() * zone.w;
        y = zone.y + zone.h;
      } else { // left edge
        x = zone.x;
        y = zone.y + Math.random() * zone.h;
      }

      positions[i*3  ] = x;
      positions[i*3+1] = y;
      positions[i*3+2] = 0.9 + Math.random() * 0.3;
    }

    const geo = _geo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = _mat(new THREE.PointsMaterial({
      color,
      size: 0.08 + Math.random() * 0.04,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }));

    return new THREE.Points(geo, mat);
  }

  function _createDryAirParticles(zone) {
    const count = Math.floor(zone.w * zone.h * 0.8);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i*3  ] = zone.x + Math.random() * zone.w;
      positions[i*3+1] = zone.y + Math.random() * zone.h;
      positions[i*3+2] = 1.0 + Math.random() * 0.2;

      velocities[i*3  ] = (zone.windX || 0) * (0.8 + Math.random() * 0.4);
      velocities[i*3+1] = (Math.random() - 0.5) * 0.5;
      velocities[i*3+2] = 0;
    }

    const geo = _geo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = _mat(new THREE.PointsMaterial({
      color: 0xccaa88,
      size: 0.06,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }));

    const particles = new THREE.Points(geo, mat);
    _dryAirVels.push(velocities);
    return particles;
  }

  function _buildCompanionDroplets() {
    _companionGroup = new THREE.Group();
    _scene.add(_companionGroup);
    _companions = [];

    P1_CFG.COMPANION_DROPLETS_2D.forEach((data, index) => {
      const companion = { ...data };
      companion.id = index;
      companion.active = true;
      companion.driftOffset = Math.random() * Math.PI * 2; // Random phase for bobbing
      companion.driftDirection = (Math.random() - 0.5) * 2; // Random drift direction

      // Create visual mesh
      const group = new THREE.Group();
      group.position.set(data.x, data.y, 1.8);

      // Outer water droplet (slightly smaller than player)
      const outerGeo = _geo(new THREE.SphereGeometry(data.size, 12, 10));
      const outerMat = _mat(new THREE.MeshPhongMaterial({
        color: 0x66bbff,
        transparent: true,
        opacity: 0.45,
        shininess: 80,
        depthWrite: false,
      }));
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      outerMesh.scale.z = 0.25; // flatten for side view
      group.add(outerMesh);

      // Inner viral content (smaller, orange)
      const virusSize = data.size * 0.25;
      const virusGeo = _geo(new THREE.IcosahedronGeometry(virusSize, 1));
      const virusMat = _mat(new THREE.MeshPhongMaterial({
        color: 0xff7744,
        emissive: new THREE.Color(0x441100),
        emissiveIntensity: 0.3,
        shininess: 15,
      }));
      const virusMesh = new THREE.Mesh(virusGeo, virusMat);
      group.add(virusMesh);

      // Sparkle effect based on viral content
      const sparkleCount = Math.floor(data.viralContent * 0.3);
      for (let i = 0; i < sparkleCount; i++) {
        const sparkleGeo = _geo(new THREE.SphereGeometry(0.02, 4, 4));
        const sparkleMat = _mat(new THREE.MeshBasicMaterial({
          color: 0xffaa44,
          transparent: true,
          opacity: 0.6
        }));
        const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);

        const angle = (i / sparkleCount) * Math.PI * 2;
        const radius = data.size * 0.8;
        sparkle.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          (Math.random() - 0.5) * 0.2
        );
        group.add(sparkle);
      }

      _companionGroup.add(group);
      companion.mesh = group;
      companion.outerMesh = outerMesh;
      companion.virusMesh = virusMesh;
      _companions.push(companion);
    });
  }

  function _buildMovingObstacles() {
    _movingObstacleGroup = new THREE.Group();
    _scene.add(_movingObstacleGroup);
    _movingObstacles = [];

    const obstacleMat = _mat(new THREE.MeshPhongMaterial({ color: 0x5a4838 }));

    P1_CFG.MOVING_OBSTACLES_2D.forEach(data => {
      const obstacle = { ...data };
      obstacle.currentY = data.startY;

      // Create visual mesh
      const geo = _geo(new THREE.BoxGeometry(data.w, data.h, 0.6));
      const mesh = new THREE.Mesh(geo, obstacleMat);
      mesh.position.set(data.x + data.w/2, data.startY + data.h/2, 1.5);

      _movingObstacleGroup.add(mesh);
      obstacle.mesh = mesh;
      _movingObstacles.push(obstacle);
    });
  }

  function _buildCombinedHazards() {
    _combinedHazardGroup = new THREE.Group();
    _scene.add(_combinedHazardGroup);

    P1_CFG.COMBINED_HAZARDS_2D.forEach(zone => {
      const centerX = zone.x + zone.w / 2;
      const centerY = zone.y + zone.h / 2;
      const z = 0.6; // in front of regular hazards

      // Visual overlay combining multiple hazard types
      let overlayColor = 0xff4444; // default danger red
      if (zone.types.includes('UV') && zone.types.includes('HEAT')) {
        overlayColor = 0xffaa44; // orange-yellow (UV+Heat)
      } else if (zone.types.includes('DRY_AIR') && zone.types.includes('HEAT')) {
        overlayColor = 0xdd6644; // reddish-orange (DryAir+Heat)
      }

      const hazardGeo = _geo(new THREE.PlaneGeometry(zone.w, zone.h));
      const hazardMat = _mat(new THREE.MeshBasicMaterial({
        color: overlayColor,
        transparent: true,
        opacity: 0.25 + zone.intensity * 0.1,
        depthWrite: false,
      }));
      const hazardMesh = new THREE.Mesh(hazardGeo, hazardMat);
      hazardMesh.position.set(centerX, centerY, z);
      _combinedHazardGroup.add(hazardMesh);

      // Danger warning particles
      const warningCount = Math.floor(zone.w * zone.h * 0.5);
      const warningPositions = new Float32Array(warningCount * 3);
      for (let i = 0; i < warningCount; i++) {
        warningPositions[i*3  ] = zone.x + Math.random() * zone.w;
        warningPositions[i*3+1] = zone.y + Math.random() * zone.h;
        warningPositions[i*3+2] = z + 0.1 + Math.random() * 0.2;
      }

      const warningGeo = _geo(new THREE.BufferGeometry());
      warningGeo.setAttribute('position', new THREE.BufferAttribute(warningPositions, 3));

      const warningMat = _mat(new THREE.PointsMaterial({
        color: 0xff2222,
        size: 0.12,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }));

      const warningParticles = new THREE.Points(warningGeo, warningMat);
      _combinedHazardGroup.add(warningParticles);
    });
  }

  function _buildAdvancedCurrents() {
    _advancedCurrents = [];

    P1_CFG.ADVANCED_AIR_CURRENTS_2D.forEach(current => {
      const particles = _createAdvancedCurrentParticles(current);
      if (particles) {
        _hazardGroup.add(particles);
        _advancedCurrents.push({
          ...current,
          particles,
          time: Math.random() * Math.PI * 2 // random phase
        });
      }
    });
  }

  function _createAdvancedCurrentParticles(current) {
    let count = Math.floor(current.w * current.h * 0.6);
    if (current.type === 'TURBULENCE') count *= 1.5;

    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i*3  ] = current.x + Math.random() * current.w;
      positions[i*3+1] = current.y + Math.random() * current.h;
      positions[i*3+2] = 1.1 + Math.random() * 0.3;

      // Different velocity patterns based on type
      if (current.type === 'VORTEX') {
        const cx = current.x + current.w/2;
        const cy = current.y + current.h/2;
        const dx = positions[i*3] - cx;
        const dy = positions[i*3+1] - cy;
        const angle = Math.atan2(dy, dx) + Math.PI/2;
        velocities[i*3  ] = Math.cos(angle) * current.strength;
        velocities[i*3+1] = Math.sin(angle) * current.strength;
      } else if (current.type === 'DOWNDRAFT') {
        velocities[i*3  ] = (Math.random() - 0.5) * 0.3;
        velocities[i*3+1] = -current.strength;
      } else if (current.type === 'TURBULENCE') {
        velocities[i*3  ] = (Math.random() - 0.5) * current.strength * 2;
        velocities[i*3+1] = (Math.random() - 0.5) * current.strength * 2;
      }
      velocities[i*3+2] = 0;
    }

    const geo = _geo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    let particleColor = 0xcccccc;
    if (current.type === 'VORTEX') particleColor = 0x88ccff;
    else if (current.type === 'DOWNDRAFT') particleColor = 0xffcc88;
    else if (current.type === 'TURBULENCE') particleColor = 0xff8888;

    const mat = _mat(new THREE.PointsMaterial({
      color: particleColor,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }));

    const particles = new THREE.Points(geo, mat);

    // Store velocities for animation
    particles.userData = { velocities, current };

    return particles;
  }

  function _buildPolishEffects() {
    _effectsGroup = new THREE.Group();
    _scene.add(_effectsGroup);

    // Enhanced lighting for better visual quality
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    _scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(10, 15, 5);
    keyLight.castShadow = false; // Keep performance reasonable
    _scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 0.3);
    fillLight.position.set(-5, 10, -5);
    _scene.add(fillLight);

    // Build droplet trail particle system
    _buildTrailParticles();

    // Performance monitoring setup
    _lastFrameTime = performance.now();
  }

  function _buildTrailParticles() {
    const trailCount = P1_CFG.TRAIL_PARTICLE_COUNT_2D;
    const positions = new Float32Array(trailCount * 3);
    const alphas = new Float32Array(trailCount);

    // Initialize all particles at origin
    for (let i = 0; i < trailCount; i++) {
      positions[i*3  ] = 0;
      positions[i*3+1] = 0;
      positions[i*3+2] = 1.6;
      alphas[i] = 0;
    }

    const trailGeo = _geo(new THREE.BufferGeometry());
    trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trailGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const trailMat = _mat(new THREE.PointsMaterial({
      color: 0x66bbff,
      size: 0.2,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }));

    _trailParticles = new THREE.Points(trailGeo, trailMat);
    _effectsGroup.add(_trailParticles);
  }

  function createFusionEffect(x, y) {
    const fusionCount = P1_CFG.FUSION_PARTICLE_COUNT_2D;
    const positions = new Float32Array(fusionCount * 3);
    const velocities = new Float32Array(fusionCount * 3);

    for (let i = 0; i < fusionCount; i++) {
      positions[i*3  ] = x + (Math.random() - 0.5) * 0.8;
      positions[i*3+1] = y + (Math.random() - 0.5) * 0.8;
      positions[i*3+2] = 1.7 + Math.random() * 0.4;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      velocities[i*3  ] = Math.cos(angle) * speed;
      velocities[i*3+1] = Math.sin(angle) * speed;
      velocities[i*3+2] = 0;
    }

    const fusionGeo = _geo(new THREE.BufferGeometry());
    fusionGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const fusionMat = _mat(new THREE.PointsMaterial({
      color: 0x44ffaa,
      size: 0.15,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }));

    const fusionParticles = new THREE.Points(fusionGeo, fusionMat);
    _effectsGroup.add(fusionParticles);

    // Store for animation
    _fusionParticles.push({
      particles: fusionParticles,
      velocities,
      life: P1_CFG.FUSION_FLASH_DURATION_2D,
      maxLife: P1_CFG.FUSION_FLASH_DURATION_2D
    });

    // Audio feedback hook
    if (typeof P1Audio !== 'undefined' && P1Audio.playFusion) {
      P1Audio.playFusion(P1_CFG.AUDIO_FUSION_VOLUME_2D);
    }
  }

  // ── Breathing cycle ────────────────────────────────────────────────────────

  function tick(dt, scrollX, dropletPos) {
    _levelTime += dt;
    _currentScrollX = scrollX || 0;

    // Performance monitoring (Chunk F)
    const currentTime = performance.now();
    const frameTime = currentTime - _lastFrameTime;
    _performanceMode = frameTime > 33; // >30fps = performance mode
    _lastFrameTime = currentTime;

    _updateBreathingCycle(dt);
    _updateBreathParticles(dt);
    _updateHazardZones(dt);
    _updateCompanionDroplets(dt);
    _updateMovingObstacles(dt);
    _updateAdvancedCurrents(dt);
    _updatePolishEffects(dt, dropletPos);
  }

  function _updateBreathingCycle(dt) {
    _breathT += dt;
    const cycleFrac = (_breathT % P1_CFG.BREATH_CYCLE_2D) / P1_CFG.BREATH_CYCLE_2D;

    if (cycleFrac < P1_CFG.INHALE_FRAC_2D) {
      _breathPhase = 'inhale';
    } else if (cycleFrac < P1_CFG.INHALE_FRAC_2D + P1_CFG.EXHALE_FRAC_2D) {
      _breathPhase = 'exhale';
    } else {
      _breathPhase = 'rest';
    }
  }

  function _updateBreathParticles(dt) {
    if (!_breathParticles) return;

    const pos = _breathParticles.geometry.attributes.position.array;
    const N = pos.length / 3;
    const mouthX = P1_CFG.MOUTH_WORLD_X_2D;
    const mouthY = P1_CFG.MOUTH_WORLD_Y_2D;

    for (let i = 0; i < N; i++) {
      const px = pos[i*3  ];
      const py = pos[i*3+1];

      // Distance to mouth
      const dx = px - mouthX;
      const dy = py - mouthY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const ndx = dist > 0.01 ? dx / dist : 0;
      const ndy = dist > 0.01 ? dy / dist : 0;

      if (_breathPhase === 'inhale' && dist < P1_CFG.INHALE_PULL_RANGE_2D) {
        // Pull particles toward mouth
        const force = P1_CFG.INHALE_PULL_FORCE_2D * (1 - dist / P1_CFG.INHALE_PULL_RANGE_2D);
        _breathVels[i*3  ] -= ndx * force * dt;
        _breathVels[i*3+1] -= ndy * force * dt;
      } else if (_breathPhase === 'exhale' && dist < 3.0) {
        // Push particles away from mouth
        const force = P1_CFG.EXHALE_PUSH_FORCE_2D;
        _breathVels[i*3  ] += ndx * force * dt;
        _breathVels[i*3+1] += ndy * force * dt;
      }

      // Apply velocity with drag
      _breathVels[i*3  ] *= Math.pow(0.92, dt * 60);
      _breathVels[i*3+1] *= Math.pow(0.92, dt * 60);

      pos[i*3  ] += _breathVels[i*3  ] * dt;
      pos[i*3+1] += _breathVels[i*3+1] * dt;

      // Reset particles that drift too far
      if (dist > 15.0) {
        pos[i*3  ] = mouthX + (Math.random() - 0.5) * 0.8;
        pos[i*3+1] = mouthY + (Math.random() - 0.5) * 0.8;
        _breathVels[i*3  ] = 0;
        _breathVels[i*3+1] = 0;
      }
    }

    _breathParticles.geometry.attributes.position.needsUpdate = true;

    // Particle visibility based on breath phase
    let targetOpacity = 0;
    if (_breathPhase === 'inhale') targetOpacity = 0.4;
    if (_breathPhase === 'exhale') targetOpacity = 0.6;

    const currentOpacity = _breathParticles.material.opacity;
    _breathParticles.material.opacity += (targetOpacity - currentOpacity) * Math.min(1, dt * 3.0);
  }

  function _updateHazardZones(dt) {
    // Animate dry air particles
    _dryAirParticles.forEach((particles, index) => {
      if (!particles || index >= _dryAirVels.length) return;

      const pos = particles.geometry.attributes.position.array;
      const vels = _dryAirVels[index];
      const N = pos.length / 3;
      const zone = _hazardZones.find(z => z.type === 'DRY_AIR');
      if (!zone) return;

      for (let i = 0; i < N; i++) {
        // Apply velocity
        pos[i*3  ] += vels[i*3  ] * dt;
        pos[i*3+1] += vels[i*3+1] * dt;

        // Wrap particles that exit the zone
        if (pos[i*3] > zone.x + zone.w) {
          pos[i*3] = zone.x;
        } else if (pos[i*3] < zone.x) {
          pos[i*3] = zone.x + zone.w;
        }

        // Keep particles within zone bounds vertically
        if (pos[i*3+1] > zone.y + zone.h) {
          pos[i*3+1] = zone.y + zone.h;
          vels[i*3+1] = -Math.abs(vels[i*3+1]);
        } else if (pos[i*3+1] < zone.y) {
          pos[i*3+1] = zone.y;
          vels[i*3+1] = Math.abs(vels[i*3+1]);
        }
      }

      particles.geometry.attributes.position.needsUpdate = true;
    });
  }

  function _updateCompanionDroplets(dt) {
    _companionTime += dt;

    _companions.forEach(companion => {
      if (!companion.active || !companion.mesh) return;

      // Gentle vertical bobbing
      const bobOffset = Math.sin(_companionTime * P1_CFG.COMPANION_BOB_FREQUENCY_2D + companion.driftOffset)
                       * P1_CFG.COMPANION_BOB_AMPLITUDE_2D;
      companion.mesh.position.y = companion.y + bobOffset;

      // Slow horizontal drift
      const driftOffset = Math.sin(_companionTime * 0.3 + companion.driftOffset)
                         * companion.driftDirection * P1_CFG.COMPANION_DRIFT_SPEED_2D * dt;
      companion.mesh.position.x += driftOffset;

      // Gentle rotation
      if (companion.virusMesh) {
        companion.virusMesh.rotation.y += dt * 0.6;
      }

      // Subtle pulsing opacity
      if (companion.outerMesh) {
        const pulseFactor = 1 + Math.sin(_companionTime * 2.5 + companion.driftOffset) * 0.15;
        companion.outerMesh.material.opacity = 0.45 * pulseFactor;
      }
    });
  }

  function _updateMovingObstacles(dt) {
    _movingObstacles.forEach(obstacle => {
      if (!obstacle.mesh) return;

      // Sinusoidal movement between startY and endY
      const range = obstacle.endY - obstacle.startY;
      const center = (obstacle.startY + obstacle.endY) / 2;
      const oscillation = Math.sin(_levelTime * obstacle.speed + obstacle.phase) * (range / 2);
      obstacle.currentY = center + oscillation;

      obstacle.mesh.position.y = obstacle.currentY + obstacle.h / 2;
    });
  }

  function _updateAdvancedCurrents(dt) {
    _advancedCurrents.forEach(current => {
      if (!current.particles) return;

      current.time += dt;
      const pos = current.particles.geometry.attributes.position.array;
      const vels = current.particles.userData.velocities;
      const N = pos.length / 3;

      for (let i = 0; i < N; i++) {
        if (current.type === 'VORTEX') {
          // Update vortex pattern dynamically
          const cx = current.x + current.w/2;
          const cy = current.y + current.h/2;
          const dx = pos[i*3] - cx;
          const dy = pos[i*3+1] - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist > 0.1) {
            const angle = Math.atan2(dy, dx) + Math.PI/2;
            const strength = current.strength * (1 - Math.min(dist / current.radius, 1));
            vels[i*3  ] = Math.cos(angle) * strength;
            vels[i*3+1] = Math.sin(angle) * strength;
          }
        } else if (current.type === 'TURBULENCE') {
          // Chaotic turbulence with time variation
          const chaos = Math.sin(current.time * 3 + i * 0.1) * 0.5;
          vels[i*3  ] += (Math.random() - 0.5) * current.strength * chaos * dt;
          vels[i*3+1] += (Math.random() - 0.5) * current.strength * chaos * dt;

          // Damping to prevent runaway velocities
          vels[i*3  ] *= Math.pow(0.95, dt * 60);
          vels[i*3+1] *= Math.pow(0.95, dt * 60);
        }

        // Apply velocity
        pos[i*3  ] += vels[i*3  ] * dt;
        pos[i*3+1] += vels[i*3+1] * dt;

        // Keep particles within current bounds
        if (pos[i*3] < current.x) {
          pos[i*3] = current.x;
          vels[i*3  ] = Math.abs(vels[i*3  ]);
        } else if (pos[i*3] > current.x + current.w) {
          pos[i*3] = current.x + current.w;
          vels[i*3  ] = -Math.abs(vels[i*3  ]);
        }

        if (pos[i*3+1] < current.y) {
          pos[i*3+1] = current.y;
          vels[i*3+1] = Math.abs(vels[i*3+1]);
        } else if (pos[i*3+1] > current.y + current.h) {
          pos[i*3+1] = current.y + current.h;
          vels[i*3+1] = -Math.abs(vels[i*3+1]);
        }
      }

      current.particles.geometry.attributes.position.needsUpdate = true;
    });
  }

  function _updatePolishEffects(dt, dropletPos) {
    // Update droplet trail particles
    if (_trailParticles && dropletPos) {
      const pos = _trailParticles.geometry.attributes.position.array;
      const alphas = _trailParticles.geometry.attributes.alpha.array;
      const count = P1_CFG.TRAIL_PARTICLE_COUNT_2D;

      // Shift all particles back one position
      for (let i = count - 1; i > 0; i--) {
        pos[i*3  ] = pos[(i-1)*3  ];
        pos[i*3+1] = pos[(i-1)*3+1];
        pos[i*3+2] = pos[(i-1)*3+2];
        alphas[i] = alphas[i-1] * P1_CFG.PARTICLE_ALPHA_FADE_2D;
      }

      // Set newest particle to droplet position
      pos[0] = dropletPos.x;
      pos[1] = dropletPos.y;
      pos[2] = 1.6;
      alphas[0] = 1.0;

      _trailParticles.geometry.attributes.position.needsUpdate = true;
      _trailParticles.geometry.attributes.alpha.needsUpdate = true;
    }

    // Update fusion effect particles
    _fusionParticles = _fusionParticles.filter(effect => {
      effect.life -= dt;

      if (effect.life <= 0) {
        // Remove expired effect
        if (effect.particles.parent) effect.particles.parent.remove(effect.particles);
        effect.particles.geometry.dispose();
        effect.particles.material.dispose();
        return false;
      }

      // Update particle positions
      const pos = effect.particles.geometry.attributes.position.array;
      const count = pos.length / 3;
      const lifeFrac = effect.life / effect.maxLife;

      for (let i = 0; i < count; i++) {
        pos[i*3  ] += effect.velocities[i*3  ] * dt;
        pos[i*3+1] += effect.velocities[i*3+1] * dt;

        // Apply gravity and drag
        effect.velocities[i*3+1] -= 3.0 * dt;
        effect.velocities[i*3  ] *= Math.pow(0.95, dt * 60);
        effect.velocities[i*3+1] *= Math.pow(0.95, dt * 60);
      }

      effect.particles.material.opacity = lifeFrac * 0.9;
      effect.particles.geometry.attributes.position.needsUpdate = true;

      return true;
    });

    // Performance optimizations
    if (_performanceMode) {
      _applyPerformanceOptimizations();
    }
  }

  function _applyPerformanceOptimizations() {
    // Reduce particle counts for zones far from current view
    _hazardZones.forEach(zone => {
      const zoneCenter = zone.x + zone.w / 2;
      const distFromView = Math.abs(zoneCenter - _currentScrollX);

      if (distFromView > P1_CFG.PARTICLE_LOD_DISTANCE_2D) {
        // Reduce particle density for distant zones
        // This would be implemented in particle system updates
      }
    });

    // Reduce update frequency for distant companion droplets
    _companions.forEach(companion => {
      if (!companion.active) return;
      const distFromView = Math.abs(companion.x - _currentScrollX);

      if (distFromView > P1_CFG.PARTICLE_LOD_DISTANCE_2D && companion.mesh) {
        // Reduce animation update frequency
        companion.mesh.visible = distFromView < 25; // Cull very distant companions
      }
    });
  }

  // ── Collision detection ────────────────────────────────────────────────────

  function checkPlatformHit(worldX, worldY, radius) {
    // Check static platforms
    for (const p of _platforms) {
      // Circle-AABB collision
      const closestX = Math.max(p.x, Math.min(p.x + p.w, worldX));
      const closestY = Math.max(p.y, Math.min(p.y + p.h, worldY));
      const distSq = (worldX - closestX) ** 2 + (worldY - closestY) ** 2;
      if (distSq < radius ** 2) {
        return true;
      }
    }

    // Check moving obstacles
    for (const obstacle of _movingObstacles) {
      const closestX = Math.max(obstacle.x, Math.min(obstacle.x + obstacle.w, worldX));
      const closestY = Math.max(obstacle.currentY, Math.min(obstacle.currentY + obstacle.h, worldY));
      const distSq = (worldX - closestX) ** 2 + (worldY - closestY) ** 2;
      if (distSq < radius ** 2) {
        return true;
      }
    }

    return false;
  }

  function checkCompanionFusion(dropletX, dropletY, dropletRadius) {
    const fusedCompanions = [];

    _companions.forEach(companion => {
      if (!companion.active) return;

      const dx = dropletX - companion.x;
      const dy = dropletY - companion.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const fuseRange = P1_CFG.COMPANION_FUSION_RANGE_2D + dropletRadius + companion.size;

      if (dist < fuseRange) {
        // Mark for fusion
        companion.active = false;

        // Hide the mesh
        if (companion.mesh) {
          companion.mesh.visible = false;
        }

        fusedCompanions.push({
          size: companion.size,
          viralContent: companion.viralContent,
          benefit: companion.benefit,
          x: companion.x,
          y: companion.y
        });
      }
    });

    return fusedCompanions;
  }

  // ── Breathing forces ───────────────────────────────────────────────────────

  function getBreathState(dropletX, dropletY) {
    const dx = dropletX - P1_CFG.MOUTH_WORLD_X_2D;
    const dy = dropletY - P1_CFG.MOUTH_WORLD_Y_2D;
    const dist = Math.sqrt(dx*dx + dy*dy);

    let force = { fx: 0, fy: 0 };
    let zoneName = null;

    // Breathing forces
    if (_breathPhase === 'inhale' && dist < P1_CFG.INHALE_PULL_RANGE_2D) {
      const strength = P1_CFG.INHALE_PULL_FORCE_2D * (1 - dist / P1_CFG.INHALE_PULL_RANGE_2D);
      const ndx = dist > 0.01 ? dx / dist : 0;
      const ndy = dist > 0.01 ? dy / dist : 0;
      force.fx = -ndx * strength;
      force.fy = -ndy * strength;
      zoneName = 'INHALING';
    } else if (_breathPhase === 'exhale' && dist < 6.0) {
      const strength = P1_CFG.EXHALE_PUSH_FORCE_2D * (1 - dist / 6.0);
      const ndx = dist > 0.01 ? dx / dist : 0;
      const ndy = dist > 0.01 ? dy / dist : 0;
      force.fx = ndx * strength;
      force.fy = ndy * strength;
      zoneName = 'EXHALING';
    }

    // Check hazard zones
    const zoneEffects = getHazardZoneEffects(dropletX, dropletY);

    // Add dry air wind forces
    if (zoneEffects.windForce) {
      force.fx += zoneEffects.windForce.fx;
      force.fy += zoneEffects.windForce.fy;
    }

    // Override zone name if in a hazard zone
    if (zoneEffects.zoneName) {
      zoneName = zoneEffects.zoneName;
    }

    return {
      phase: _breathPhase,
      force,
      zoneName,
      distToMouth: dist,
      hazardEffects: zoneEffects
    };
  }

  // ── Hazard zone detection ──────────────────────────────────────────────────

  function getHazardZoneEffects(dropletX, dropletY) {
    let evapMult = 1.0;
    let viabMult = 1.0;
    let windForce = null;
    let zoneName = null;
    let zoneIntensity = 0;

    // Difficulty progression based on x position
    const progressFrac = Math.min(1, dropletX / P1_CFG.WORLD_WIDTH_2D);
    const difficultyMult = P1_CFG.DIFFICULTY_PROGRESSION_2D.hazardIntensityStart +
      progressFrac * (P1_CFG.DIFFICULTY_PROGRESSION_2D.hazardIntensityEnd -
                      P1_CFG.DIFFICULTY_PROGRESSION_2D.hazardIntensityStart);

    const evapProgression = P1_CFG.DIFFICULTY_PROGRESSION_2D.evaporationStart +
      progressFrac * (P1_CFG.DIFFICULTY_PROGRESSION_2D.evaporationEnd -
                      P1_CFG.DIFFICULTY_PROGRESSION_2D.evaporationStart);

    // Apply base evaporation progression
    evapMult *= evapProgression;

    // Check combined hazard zones first (higher priority)
    for (const zone of P1_CFG.COMBINED_HAZARDS_2D) {
      if (dropletX >= zone.x && dropletX <= zone.x + zone.w &&
          dropletY >= zone.y && dropletY <= zone.y + zone.h) {

        const intensity = (zone.intensity || 1.0) * difficultyMult;

        if (zone.types.includes('UV') && zone.types.includes('HEAT')) {
          viabMult *= P1_CFG.ZONE_UV_VIAB_MULT_2D * intensity;
          evapMult *= P1_CFG.ZONE_HEAT_EVAP_MULT_2D * intensity;
          zoneName = 'EXTREME DANGER';
          zoneIntensity = Math.max(zoneIntensity, intensity);

        } else if (zone.types.includes('DRY_AIR') && zone.types.includes('HEAT')) {
          evapMult *= P1_CFG.ZONE_DRY_EVAP_MULT_2D * P1_CFG.ZONE_HEAT_EVAP_MULT_2D * intensity;
          if (zone.windX) {
            windForce = windForce || { fx: 0, fy: 0 };
            windForce.fx += zone.windX * P1_CFG.DRY_AIR_WIND_SCALE_2D * intensity;
          }
          zoneName = 'SCORCHING WINDS';
          zoneIntensity = Math.max(zoneIntensity, intensity);
        }
      }
    }

    // Check regular hazard zones if not in combined zone
    if (!zoneName) {
      for (const zone of _hazardZones) {
        if (dropletX >= zone.x && dropletX <= zone.x + zone.w &&
            dropletY >= zone.y && dropletY <= zone.y + zone.h) {

          const intensity = (zone.intensity || 1.0) * difficultyMult;

          if (zone.type === 'UV') {
            viabMult *= P1_CFG.ZONE_UV_VIAB_MULT_2D * intensity;
            zoneName = 'UV EXPOSURE';
            zoneIntensity = Math.max(zoneIntensity, intensity);

          } else if (zone.type === 'HEAT') {
            evapMult *= P1_CFG.ZONE_HEAT_EVAP_MULT_2D * intensity;
            zoneName = 'HEAT ZONE';
            zoneIntensity = Math.max(zoneIntensity, intensity);

          } else if (zone.type === 'DRY_AIR') {
            evapMult *= P1_CFG.ZONE_DRY_EVAP_MULT_2D * intensity;
            // Add wind force
            if (zone.windX) {
              windForce = windForce || { fx: 0, fy: 0 };
              windForce.fx += zone.windX * P1_CFG.DRY_AIR_WIND_SCALE_2D * intensity;
            }
            zoneName = 'DRY AIR';
            zoneIntensity = Math.max(zoneIntensity, intensity);

          } else if (zone.type === 'HUMID') {
            evapMult *= P1_CFG.ZONE_HUMID_EVAP_MULT_2D / intensity; // beneficial
            zoneName = 'HUMID AIR';
            zoneIntensity = Math.max(zoneIntensity, intensity);
          }
        }
      }
    }

    // Check advanced air currents for additional forces
    for (const current of _advancedCurrents) {
      if (dropletX >= current.x && dropletX <= current.x + current.w &&
          dropletY >= current.y && dropletY <= current.y + current.h) {

        windForce = windForce || { fx: 0, fy: 0 };

        if (current.type === 'VORTEX') {
          const cx = current.x + current.w/2;
          const cy = current.y + current.h/2;
          const dx = dropletX - cx;
          const dy = dropletY - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist < current.radius && dist > 0.1) {
            const angle = Math.atan2(dy, dx) + Math.PI/2;
            const strength = current.strength * (1 - dist / current.radius);
            windForce.fx += Math.cos(angle) * strength;
            windForce.fy += Math.sin(angle) * strength;
          }
          if (!zoneName) zoneName = 'VORTEX';

        } else if (current.type === 'DOWNDRAFT') {
          windForce.fy -= current.strength;
          if (!zoneName) zoneName = 'DOWNDRAFT';

        } else if (current.type === 'TURBULENCE') {
          const chaos = Math.sin(_levelTime * 5 + dropletX * 0.1) * 0.7;
          windForce.fx += chaos * current.strength;
          windForce.fy += (Math.sin(_levelTime * 3 + dropletY * 0.1) - 0.5) * current.strength;
          if (!zoneName) zoneName = 'TURBULENCE';
        }
      }
    }

    return {
      evapMult,
      viabMult,
      windForce,
      zoneName,
      intensity: zoneIntensity,
      difficultyMult
    };
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  function destroy() {
    if (_levelGroup && _levelGroup.parent) _levelGroup.parent.remove(_levelGroup);
    if (_camGroup && _camGroup.parent) _camGroup.parent.remove(_camGroup);
    if (_breathParticles && _breathParticles.parent) _breathParticles.parent.remove(_breathParticles);
    if (_hazardGroup && _hazardGroup.parent) _hazardGroup.parent.remove(_hazardGroup);
    if (_companionGroup && _companionGroup.parent) _companionGroup.parent.remove(_companionGroup);
    if (_movingObstacleGroup && _movingObstacleGroup.parent) _movingObstacleGroup.parent.remove(_movingObstacleGroup);
    if (_combinedHazardGroup && _combinedHazardGroup.parent) _combinedHazardGroup.parent.remove(_combinedHazardGroup);
    if (_effectsGroup && _effectsGroup.parent) _effectsGroup.parent.remove(_effectsGroup);

    // Clean up fusion particles
    _fusionParticles.forEach(effect => {
      if (effect.particles && effect.particles.parent) {
        effect.particles.parent.remove(effect.particles);
        effect.particles.geometry.dispose();
        effect.particles.material.dispose();
      }
    });

    _levelGroup = null;
    _camGroup = null;
    _breathParticles = null;
    _breathVels = null;
    _platforms = [];
    _hazardGroup = null;
    _hazardZones = [];
    _dryAirParticles = [];
    _dryAirVels = [];
    _companionGroup = null;
    _companions = [];
    _companionTime = 0;
    _movingObstacles = [];
    _movingObstacleGroup = null;
    _levelTime = 0;
    _combinedHazardGroup = null;
    _advancedCurrents = [];
    _currentScrollX = 0;
    _effectsGroup = null;
    _fusionParticles = [];
    _trailParticles = null;
    _performanceMode = false;
    _lastFrameTime = 0;

    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos.length = 0;
    _mats.length = 0;

    _scene = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  return {
    init,
    tick,
    destroy,
    checkPlatformHit,
    getBreathState,
    checkCompanionFusion,
    createFusionEffect
  };

})();