// vi_p2_main.js — Phase 2 Attachment: main singleton, scene, HUD, state machine
// Depends on: three.js r128, vi_p2_config.js
// Optional deps loaded in later chunks: vi_p2_world.js, vi_p2_gameplay.js, vi_p2_fx.js
'use strict';

(function () {

const P2 = {

  // ── Public API ─────────────────────────────────────────────────────────
  _active: false,
  scene:   null,
  camera:  null,

  // Set by launch()
  _onComplete:     null,
  boundSites:      0,
  totalSites:      4,
  scoreMultiplier: 1.0,

  // Game meters
  state:            'IDLE',  // IDLE|INTRO|PLAYING|PAUSED|ENDOCYTOSIS|COMPLETE|DEAD
  _eoAnim:          null,   // endocytosis animation state, non-null during ENDOCYTOSIS
  _gameScene:       null,   // saved game scene while eoScene is active
  _gameCamera:      null,   // saved game camera while eoCam is active
  elapsed:          0,
  distance:         0,
  speed:            1.0,
  hp:               100,
  alert:            0,
  binding:          0,
  correctCollected: 0,
  totalCollisions:  0,

  // Power-up state
  activePowerup: null,   // { type, timeLeft } or null
  driftActive:   false,
  naActive:      false,
  raftActive:    false,
  mucusSlow:     false,

  // Sub-system handles (populated by world/gameplay/fx files)
  terrain:   null,
  player:    null,
  walls:     null,
  rbcs:      null,
  receptors: null,
  obstacles: null,
  powerups:  null,
  particles: null,
  sounds:    null,
  education: null,

  // Internal Three.js objects
  _playerLight: null,
  _hudRoot:     null,
  _worldGroup:  null,   // parent group for all 3D objects; rotated for airway bends

  // Camera follow state
  _camX:    0,   // lerped camera X
  _camShake:{ x: 0, y: 0, timer: 0 },

  // HP regen — resumes after a brief pause following a hit
  _hpRegenDelay: 0,

  // Info card — freezes update loop while showing first-obstacle educational card
  _infoCardActive: false,
  _infoCardEl:     null,   // dynamically created DOM element, or null

  // Airway bend — periodic lookAt drift giving illusion of navigating curves
  _bendX:      0,    // current lateral look-ahead offset
  _bendTarget: 0,    // target to lerp toward
  _bendTimer:  5,    // seconds until next retarget (starts at 5 for initial straight)

  // Input
  _keys: {},
  _evKD: null,
  _evKU: null,
  _evRZ: null,

  // ── launch ────────────────────────────────────────────────────────────
  launch(carryover, onComplete, onFail) {
    const bs = (carryover && carryover.boundSites) || 0;
    const ts = (carryover && carryover.totalSites) || 4;
    this.boundSites      = bs;
    this.totalSites      = ts;
    this.scoreMultiplier = P2_CFG.CARRYOVER_MULTIPLIER[Math.min(bs, P2_CFG.CARRYOVER_MULTIPLIER.length - 1)];
    this._onComplete     = onComplete;
    this._onFail         = onFail || null;

    this._resetMeters();
    this._buildScene();
    this._buildHUD();
    this._bindInput();
    this._active = true;

    // Hide main game HUD
    const mainHud = document.getElementById('hud');
    if (mainHud) mainHud.classList.add('hidden');

    this._setState('INTRO');
  },

  // ── destroy ───────────────────────────────────────────────────────────
  destroy() {
    this._active = false;
    this._unbindInput();
    this._removeHUD();
    const subs = ['terrain','player','walls','rbcs','receptors','obstacles','powerups','particles','sounds','education'];
    subs.forEach(k => { if (this[k]) { this[k].destroy(); this[k] = null; } });
    if (this.scene) {
      while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
      this.scene = null;
    }
    this._playerLight = null;
    this._worldGroup  = null;
    this.camera = null;
    this.state  = 'IDLE';
    const mainHud = document.getElementById('hud');
    if (mainHud) mainHud.classList.remove('hidden');
  },

  pause()  { if (this.state === 'PLAYING') this._setState('PAUSED'); },
  resume() { if (this.state === 'PAUSED')  this._setState('PLAYING'); },

  // ── _tick — called from viral_infiltration.html's gameLoop ────────────
  _tick(dt) {
    if (this.state === 'PLAYING' && !this._infoCardActive) this._updateGame(dt);
    if (this.state === 'ENDOCYTOSIS') this._updateEndocytosis(dt);
    this._updateCamera(dt);
    if (this.activePowerup) this._updateHUDPowerup();
  },

  // ── Internal reset ────────────────────────────────────────────────────
  _resetMeters() {
    this.elapsed           = 0;
    this.distance          = 0;
    this.speed             = P2_CFG.BASE_SPEED;
    this.hp                = P2_CFG.PLAYER_HP;
    this.alert             = P2_CFG.CARRYOVER_ALERT_START[Math.min(this.boundSites, 4)];
    this.binding           = 0;
    this.correctCollected  = 0;
    this.totalCollisions   = 0;
    this.activePowerup     = null;
    this.driftActive = this.naActive = this.raftActive = this.mucusSlow = false;
    this._camX             = 0;
    this._camShake         = { x: 0, y: 0, timer: 0 };
    this._hpRegenDelay     = 0;
    this._bendX            = 0;
    this._bendTarget       = 0;
    this._bendTimer        = 5;
    this._keys             = {};
    this._infoCardActive   = false;
    this._infoCardEl       = null;
    this._motionSettingsEl = null;
    this._eoAnim           = null;
    this._gameScene        = null;
    this._gameCamera       = null;
  },

  // ── Scene ─────────────────────────────────────────────────────────────
  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(P2_CFG.COL_FOG, P2_CFG.FOG_DENSITY);
    this.scene.background = new THREE.Color(P2_CFG.COL_BG);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
    this.camera.position.set(0, P2_CFG.CAMERA_Y_OFFSET, P2_CFG.CAMERA_Z_OFFSET);
    this.camera.lookAt(0, 0, 15);

    // Lights stay in scene space (not worldGroup) — they illuminate globally
    this.scene.add(new THREE.AmbientLight(0x1a0906, 0.75));
    const dir = new THREE.DirectionalLight(0xffaa88, 0.45);
    dir.position.set(0, 10, -5);
    this.scene.add(dir);

    // World group — all 3D game objects live here so we can rotate the group
    // to simulate airway bends without touching individual object transforms.
    this._worldGroup = new THREE.Group();
    this.scene.add(this._worldGroup);

    // Player point light inside worldGroup so it rotates with the world
    this._playerLight = new THREE.PointLight(P2_CFG.COL_PLAYER_LIGHT, 1.2, 8);
    this._playerLight.position.set(0, 1.5, 0);
    this._worldGroup.add(this._playerLight);

    // Initialise world sub-systems if vi_p2_world.js is loaded
    if (typeof P2World !== 'undefined') {
      this.terrain = P2World.createTerrain(this._worldGroup);
      this.player  = P2World.createPlayer(this._worldGroup);
      this.walls   = P2World.createBronchialWalls(this._worldGroup);
      // RBCs disabled for influenza (bronchial context) — see memory/rbc_pattern.md
    }

    // Initialise gameplay sub-systems if vi_p2_gameplay.js is loaded
    if (typeof P2Gameplay !== 'undefined') {
      this.receptors = P2Gameplay.createReceptors(this._worldGroup, this.terrain);
      this.obstacles = P2Gameplay.createObstacles(this._worldGroup);
      this.powerups  = P2Gameplay.createPowerups(this._worldGroup, this.terrain);
    }

    // Initialise FX sub-systems if vi_p2_fx.js is loaded
    if (typeof P2FX !== 'undefined') {
      this.particles = P2FX.createParticles(this._worldGroup);
      this.sounds    = P2FX.createSounds();
      this.education = P2FX.createEducation();
    }
  },

  // ── Camera ────────────────────────────────────────────────────────────
  _updateCamera(dt) {
    if (!this.camera) return;
    // During endocytosis animation the eo camera is driven inside _updateEndocytosis
    if (this._eoAnim) return;
    const px = this.player ? this.player.x : 0;
    // Lag camera X behind player X
    this._camX += (px - this._camX) * (1 - Math.exp(-dt / 0.3));

    // Camera shake
    if (this._camShake.timer > 0) {
      this._camShake.timer -= dt;
      this._camShake.x = (Math.random() - 0.5) * 0.2;
      this._camShake.y = (Math.random() - 0.5) * 0.2;
    } else {
      this._camShake.x = 0;
      this._camShake.y = 0;
    }

    // Subtle lateral sway
    const sway = Math.sin(this.elapsed * (2 * Math.PI / 8)) * 0.05;

    // Airway bend — periodically shift lookAt target to simulate curved airways
    this._bendTimer -= dt;
    if (this._bendTimer <= 0) {
      this._bendTarget = (Math.random() - 0.5) * 12;   // ±6 units lateral
      this._bendTimer  = 9 + Math.random() * 8;         // retarget every 9–17 s
    }
    this._bendX += (this._bendTarget - this._bendX) * Math.min(1, dt * 0.3);

    this.camera.position.set(
      this._camX + this._camShake.x + sway,
      P2_CFG.CAMERA_Y_OFFSET + this._camShake.y,
      P2_CFG.CAMERA_Z_OFFSET
    );
    this.camera.lookAt(this._camX + this._bendX, 0, 15);

    // Sync player point light to player position
    if (this._playerLight && this.player) {
      this._playerLight.position.set(this.player.x, 1.5, this.player.z);
    }
  },

  triggerCameraShake() { this._camShake.timer = 0.2; },

  // ── Game update ───────────────────────────────────────────────────────
  _updateGame(dt) {
    this.elapsed  += dt;
    this.distance += dt * this.speed * 8;
    this.speed     = Math.min(P2_CFG.SPEED_CAP, P2_CFG.BASE_SPEED + this.elapsed * P2_CFG.SPEED_RAMP);
    this.alert     = Math.max(0, this.alert - P2_CFG.ALERT_DECAY * dt);

    // HP regen — resumes HP_REGEN_DELAY seconds after the last hit
    if (this._hpRegenDelay > 0) {
      this._hpRegenDelay -= dt;
    } else {
      this.hp = Math.min(P2_CFG.PLAYER_HP, this.hp + P2_CFG.HP_REGEN_RATE * dt);
    }

    // Power-up timer
    if (this.activePowerup) {
      this.activePowerup.timeLeft -= dt;
      if (this.activePowerup.timeLeft <= 0) this._endPowerup();
    }

    // Sub-systems (guarded: files loaded in later chunks)
    // curvature drives parabolic X displacement: at z=30 ahead, offset = bendX
    const _curve = this._bendX / 450;
    if (this.terrain)   this.terrain.update(dt, this.speed, _curve);
    if (this.player)    this.player.update(dt, this._getEffectiveKeys(), this.speed);
    if (this.walls)     this.walls.update(dt, this.speed, this.elapsed, _curve);
    if (this.rbcs)      this.rbcs.update(dt, this.speed);
    if (this.receptors) this.receptors.update(dt, this.speed);
    if (this.obstacles) this.obstacles.update(dt, this.speed);
    if (this.powerups)  this.powerups.update(dt, this.speed);
    if (this.particles) this.particles.update(dt);
    if (this.education) this.education.update(dt);

    // Win / lose
    if (this.binding >= P2_CFG.BINDING_WIN) { this._triggerComplete(); return; }
    if (this.alert >= 100)                  { this._triggerDead('IMMUNE ALERT', 'The adaptive immune response was fully activated. An antibody swarm was deployed.'); return; }

    this._updateHUD();
  },

  // ── Collect / damage (called by gameplay sub-systems) ─────────────────
  collectSialic() {
    if (this.state !== 'PLAYING') return;
    const base = P2_CFG.BINDING_PER_RECEPTOR[0]
               + Math.random() * (P2_CFG.BINDING_PER_RECEPTOR[1] - P2_CFG.BINDING_PER_RECEPTOR[0]);
    const eff  = base * this.scoreMultiplier * (this.driftActive ? P2_CFG.DRIFT_BINDING_MULT : 1);
    this.binding = Math.min(100, this.binding + eff);
    this.correctCollected++;
    this.totalCollisions++;
    this._flashVignette('green');
    if (this.sounds)    this.sounds.play('collect');
    if (this.particles && this.player) {
      this.particles.emit(this.player.x, this.player.y + 0.5, this.player.z,
        12, P2_CFG.COL_SIALIC, { speed: 3.5, duration: 0.4 });
    }
  },

  recordWrongCollision() { this.totalCollisions++; },

  takeDamage(amount, alertGain, shake) {
    if (this.state !== 'PLAYING') return;
    this.hp             = Math.max(0, this.hp - amount);
    this.alert          = Math.min(100, this.alert + alertGain);
    this._hpRegenDelay  = P2_CFG.HP_REGEN_DELAY;
    if (shake) this._camShake.timer = 0.2;
    this._flashVignette('red');
    if (this.sounds)    this.sounds.play('hit');
    if (this.particles && this.player) {
      this.particles.emit(this.player.x, this.player.y + 0.3, this.player.z,
        18, 0xff3322, { speed: 5, duration: 0.35, gravity: 4 });
    }
  },

  // ── Power-ups ─────────────────────────────────────────────────────────
  collectPowerup(type) {
    if (this.activePowerup) return;
    const dur = { drift: P2_CFG.DRIFT_DURATION, na: P2_CFG.NA_DURATION, raft: P2_CFG.RAFT_DURATION };
    this.activePowerup = { type, timeLeft: dur[type] || 5 };
    this.driftActive = type === 'drift';
    this.naActive    = type === 'na';
    this.raftActive  = type === 'raft';
    if (this.sounds)    this.sounds.play('powerup');
    if (this.particles && this.player) {
      const cols = { drift: P2_CFG.COL_PU_DRIFT, na: P2_CFG.COL_PU_NA, raft: P2_CFG.COL_PU_RAFT };
      this.particles.emit(this.player.x, this.player.y + 0.5, this.player.z,
        20, cols[type] || 0xffffff, { speed: 5, duration: 0.55 });
    }
    this._updateHUDPowerup();
  },

  // ── Emit particle burst (callable from gameplay sub-systems) ──────────
  emitBurst(x, y, z, count, hexColor, opts) {
    if (this.particles) this.particles.emit(x, y, z, count, hexColor, opts);
  },

  _endPowerup() {
    this.activePowerup = null;
    this.driftActive = this.naActive = this.raftActive = false;
    this._updateHUDPowerup();
  },

  // ── Win / lose ────────────────────────────────────────────────────────
  _triggerComplete() {
    if (this.state !== 'PLAYING') return;
    this._setState('ENDOCYTOSIS');
    if (this.sounds) this.sounds.play('complete');
    this._startEndocytosisAnim();
  },

  // ── Endocytosis animation ─────────────────────────────────────────────
  _smooth(t) { return t * t * (3 - 2 * t); },

  _startEndocytosisAnim() {
    // ── Build a completely isolated scene — no shared geometry touched ────
    const eoScene = new THREE.Scene();
    eoScene.background = new THREE.Color(P2_CFG.COL_BG);
    eoScene.fog = new THREE.FogExp2(P2_CFG.COL_FOG, 0.03);

    eoScene.add(new THREE.AmbientLight(0x1a0906, 0.75));
    const dir = new THREE.DirectionalLight(0xffaa88, 0.55);
    dir.position.set(0, 10, -5);
    eoScene.add(dir);
    const fill = new THREE.PointLight(0x004422, 1.0, 18);
    fill.position.set(0, 4, 4);
    eoScene.add(fill);

    // Sub-membrane backing — simple fresh plane
    const subGeo = new THREE.PlaneGeometry(32, 32, 1, 1);
    subGeo.rotateX(-Math.PI / 2);
    const subMat = new THREE.MeshPhongMaterial({
      color: P2_CFG.COL_SUBMEM, emissive: new THREE.Color(0x000822),
      emissiveIntensity: 0.6, transparent: true, opacity: 0.28,
    });
    const subMesh = new THREE.Mesh(subGeo, subMat);
    subMesh.position.set(0, -2, 4);
    eoScene.add(subMesh);

    // Main membrane — FRESH geometry, NOT from shared cache.
    // PlaneGeometry in XY; after rotateX(-PI/2) verts are in XZ plane.
    // Mesh at (0,0,4) so contact centre is world (0,0,4).
    const mGeo = new THREE.PlaneGeometry(28, 28, 52, 52);
    mGeo.rotateX(-Math.PI / 2);
    const mMat = new THREE.MeshPhongMaterial({
      color: P2_CFG.COL_MEMBRANE,
      emissive: new THREE.Color(P2_CFG.COL_MEM_EMI),
      emissiveIntensity: 0.4, transparent: true, opacity: 0.38,
    });
    const mMesh = new THREE.Mesh(mGeo, mMat);
    mMesh.position.set(0, 0, 4);
    eoScene.add(mMesh);
    // Flat base Y values (all 0 after rotation) — reset each frame before wave+invag
    const mPos   = mGeo.attributes.position;
    const mOrigY = new Float32Array(mPos.count);   // zeros

    // Membrane contact ring
    const ringGeo = new THREE.TorusGeometry(1.0, 0.07, 8, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x44ffaa, transparent: true, opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0.04, 4);
    ring.scale.setScalar(0);
    eoScene.add(ring);

    // Virion — fresh minimal mesh, not from shared cache
    const virion = this._buildEoVirion();
    virion.position.set(0, 1.0, 0);
    eoScene.add(virion);

    // Cinematic camera — behind and slightly above, looking at contact point
    const eoCam = new THREE.PerspectiveCamera(
      52, window.innerWidth / window.innerHeight, 0.1, 200
    );
    eoCam.position.set(0, 4.5, -6);
    eoCam.lookAt(0, 0, 4);

    // Label
    const label = document.createElement('div');
    label.id = 'p2EoLabel';
    label.style.cssText = [
      'position:fixed;bottom:22%;left:50%;transform:translateX(-50%);',
      'font-family:-apple-system,BlinkMacSystemFont,monospace;font-size:.84rem;',
      'letter-spacing:.16em;color:#44ffaa;text-transform:uppercase;',
      'opacity:0;transition:opacity 1.2s;pointer-events:none;z-index:300;',
      'text-shadow:0 0 14px #44ffaa88;',
    ].join('');
    label.textContent = 'Receptor-mediated endocytosis';
    document.body.appendChild(label);
    setTimeout(() => { if (label.parentNode) label.style.opacity = '1'; }, 80);

    // Swap scenes — render loop reads P2Attachment.scene/.camera each frame
    this._gameScene  = this.scene;
    this._gameCamera = this.camera;
    this.scene  = eoScene;
    this.camera = eoCam;

    this._eoAnim = {
      t: 0,
      eoScene, eoCam,
      mMesh, mGeo, mMat, mPos, mOrigY,
      subGeo, subMat,
      ring, ringGeo, ringMat,
      virion,
      label,
      vesicle: null, vesicleMat: null, pinchDone: false,
      burst: [],
      _waveT: 0,
    };
  },

  _updateEndocytosis(dt) {
    const a = this._eoAnim;
    if (!a) return;
    a.t += dt;
    const t = a.t;
    const g = a.virion;

    // ── Virion + ring animation ───────────────────────────────────────────
    if (t < 0.3) {
      g.rotation.y += dt * 0.6;                   // freeze beat

    } else if (t < 1.2) {
      // Approach: glide to membrane contact
      const f = this._smooth(Math.min(1, (t - 0.3) / 0.9));
      g.position.z = f * 4;
      g.position.y = 1.0 - f * 0.15;
      g.rotation.y += dt * 0.6;
      a.ring.position.set(0, 0.05, g.position.z);
      a.ring.scale.setScalar(f * 1.5);

    } else if (t < 2.6) {
      // Engulfment: virion sinks (full size — it's being wrapped, not shrinking)
      const f = this._smooth(Math.min(1, (t - 1.2) / 1.4));
      g.position.z = 4;
      g.position.y = 0.85 - f * 1.95;    // sinks to −1.1
      g.rotation.y += dt * 0.5;
      // Ring stays at membrane surface, scale tracks constricting neck radius
      const neckR = Math.max(0.01, 1.8 - f * 1.55);
      a.ring.position.set(0, 0.06, 4);
      a.ring.scale.setScalar(neckR);
      a.ringMat.opacity = Math.min(0.95, 0.35 + f * 0.6);

    } else if (t < 3.0) {
      // Pinch-off: neck snaps shut, vesicle separates
      const f = (t - 2.6) / 0.4;
      g.position.z = 4;
      g.position.y = -1.1;               // virion stays put — membrane closes over it
      a.ring.scale.setScalar(Math.max(0.001, 0.25 * (1 - f)));
      a.ringMat.opacity = Math.max(0, 0.95 - f * 2.4);
      if (!a.pinchDone && f >= 0.85) {
        a.pinchDone = true;
        this._createEoVesicle(a);        // membrane bubble wrapping virion
        this._spawnEoBurst(a);           // lipid fragments fly off at fission
        // virion stays visible — seen through the translucent vesicle shell
      }

    } else {
      // Drift: vesicle accelerates downward off screen — virion travels with it
      if (a.vesicle) {
        const speed = 0.6 + (t - 3.0) * 5.0;   // accelerates: 0.6 → 5.6+ units/s
        const dy = speed * dt;
        a.vesicle.position.y -= dy;
        g.position.y = a.vesicle.position.y;
        g.rotation.y += dt * 1.2;
      }
      this._updateEoBurst(a, dt);
      this._deformEoMembrane(a, t, dt);  // membrane healing
      if (t > 4.2) { this._finishEndocytosis(); return; }
    }

    // Main phases: update burst and membrane deformation
    if (t < 3.0) {
      this._updateEoBurst(a, dt);
      this._deformEoMembrane(a, t, dt);
    }

    // ── Cinematic camera ──────────────────────────────────────────────────
    if (t < 3.0) {
      const cf = this._smooth(Math.min(1, Math.max(0, (t - 0.2) / 2.0)));
      a.eoCam.position.set(0, 4.5 - cf * 2.0, -6 + cf * 2.5);
      const lookY = g.visible ? Math.max(-1.5, g.position.y - 0.3) : -1.2;
      a.eoCam.lookAt(0, lookY, g.position.z + 7);
    }
    // Drift phase: camera stays fixed — vesicle falls out of frame below
  },

  // Inline particle burst — no dependency on the game particle system
  _spawnEoBurst(a) {
    const bGeo = new THREE.SphereGeometry(0.06, 4, 4);
    for (let i = 0; i < 28; i++) {
      const bMat = new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 1.0 });
      const bm   = new THREE.Mesh(bGeo, bMat);
      const ang  = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.2) * Math.PI * 0.5;
      bm.position.set(0, 0.1, 4);
      bm.userData.vel  = new THREE.Vector3(
        Math.cos(ang) * Math.cos(elev) * (3 + Math.random() * 4),
        Math.sin(elev) * 2 + 1.5,
        Math.sin(ang) * Math.cos(elev) * (3 + Math.random() * 4)
      );
      bm.userData.life = 0.6 + Math.random() * 0.5;
      a.eoScene.add(bm);
      a.burst.push(bm);
    }
  },

  _updateEoBurst(a, dt) {
    for (let i = a.burst.length - 1; i >= 0; i--) {
      const bm = a.burst[i];
      bm.userData.life -= dt;
      if (bm.userData.life <= 0) { a.eoScene.remove(bm); a.burst.splice(i, 1); continue; }
      bm.position.addScaledVector(bm.userData.vel, dt);
      bm.userData.vel.y -= 4 * dt;
      bm.material.opacity = Math.max(0, bm.userData.life * 1.5);
    }
  },

  // Spawns the endosomal membrane vesicle at the moment of fission.
  // The virion is hidden (inside) and the vesicle drifts into the cytoplasm.
  _createEoVesicle(a) {
    // Slightly larger than virion (r=0.5) so virion is visible inside
    const geo = new THREE.SphereGeometry(0.78, 20, 14);
    const mat = new THREE.MeshPhongMaterial({
      color:    0xc84868,                        // saturated warm rose — distinct from flat membrane
      emissive: new THREE.Color(0x7a1828),
      emissiveIntensity: 1.4,
      transparent: true, opacity: 0.72,
      side: THREE.DoubleSide, shininess: 80,
    });
    const vesicle = new THREE.Mesh(geo, mat);
    vesicle.position.set(0, a.virion.position.y, 4);
    a.eoScene.add(vesicle);
    a.vesicle    = vesicle;
    a.vesicleMat = mat;
  },

  // Per-frame membrane deformation — cup with constricting neck, then healing scar.
  //
  // Key design: sigma = neckR * 0.7 (proportional).
  // This ensures the bowl stays contained *inside* the cup opening at all stages.
  // Outside neckR the membrane is nearly flat; inside is deeply depressed.
  // The annular rim (rimH = bowlD * 0.45) rises above membrane level at the neck,
  // creating the raised collar that makes the pinch-off visually convincing.
  _deformEoMembrane(a, t, dt) {
    if (t < 0.3) return;
    a._waveT += dt;
    const wt = a._waveT;

    let bowlD = 0, neckR = 2.0, scarH = 0;
    if (t < 1.2) {
      const f = this._smooth((t - 0.3) / 0.9);
      bowlD = f * 0.8;
      neckR = 2.0 - f * 0.2;
    } else if (t < 2.6) {
      const f = this._smooth((t - 1.2) / 1.4);
      bowlD = 0.8 + f * 1.6;           // 0.8 → 2.4
      neckR = 1.8 - f * 1.55;          // 1.8 → 0.25 (neck constricts)
    } else if (t < 3.0) {
      const f = (t - 2.6) / 0.4;
      bowlD = 2.4;
      neckR = Math.max(0, 0.25 * (1 - f));   // 0.25 → 0 (neck closes)
    } else {
      // Membrane heals: bowl fades, small upward scar pucker fades
      const f = Math.min(1, (t - 3.0) / 1.2);
      bowlD = 2.4 * (1 - this._smooth(f));
      scarH = 0.28 * (1 - f);
    }

    // sigma proportional to neckR → cup is always contained inside the opening
    const sigma  = Math.max(0.08, neckR * 0.7);
    const rimH   = bowlD * 0.45;              // rim height > bowl at neckR → visible collar
    const rimS   = Math.max(0.05, neckR * 0.28);
    const sigma2 = sigma * sigma;
    const rimS2  = rimS * rimS;
    const scarS2 = 0.36;
    const cutR   = neckR * 4.5 + 1.5;
    const cutR2  = Math.max(4, cutR * cutR);

    const pos = a.mPos;
    const mZ  = a.mMesh.position.z;   // 4 — contact centre at world z=4

    for (let v = 0, n = pos.count; v < n; v++) {
      const wx = pos.getX(v);
      const wz = mZ + pos.getZ(v);
      const dx = wx;           // contact at x=0
      const dz = wz - 4;       // contact at z=4
      const r2 = dx * dx + dz * dz;

      let y = Math.sin(wx * 0.3 + wt * 0.5) * 0.13
            + Math.sin(wz * 0.2 + wt * 0.3) * 0.09;

      if (r2 < cutR2) {
        // Bowl depression — uses r2, no sqrt needed
        if (bowlD > 0) y -= bowlD * Math.exp(-r2 / (2 * sigma2));
        // Healing scar — upward pucker at fission site, also r2 based
        if (scarH > 0) y += scarH * Math.exp(-r2 / (2 * scarS2));
        // Annular raised collar at neck — needs r to compute ring distance
        if (rimH > 0 && neckR > 0.02) {
          const r  = Math.sqrt(r2);
          const dr = r - neckR;
          y += rimH * Math.exp(-(dr * dr) / (2 * rimS2));
        }
      }

      pos.setY(v, y);
    }
    pos.needsUpdate = true;
    a.mGeo.computeVertexNormals();
  },

  // Build a minimal virion for the eo scene — fresh materials, no shared cache.
  _buildEoVirion() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshPhongMaterial({
        color: P2_CFG.COL_PLAYER,
        emissive: new THREE.Color(0x003311), emissiveIntensity: 0.5, shininess: 40,
      })
    ));
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 12, 12),
      new THREE.MeshPhongMaterial({ color: 0x44ff88, transparent: true, opacity: 0.18, side: THREE.BackSide })
    ));
    const spikeGeo = new THREE.ConeGeometry(0.07, 0.38, 5);
    const up  = new THREE.Vector3(0, 1, 0);
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 20; i++) {
      const y   = 1 - (i / 19) * 2;
      const r   = Math.sqrt(Math.max(0, 1 - y * y));
      const dir = new THREE.Vector3(Math.cos(phi * i) * r, y, Math.sin(phi * i) * r).normalize();
      const sp  = new THREE.Mesh(spikeGeo,
        new THREE.MeshPhongMaterial({ color: P2_CFG.COL_SPIKE_HA, emissive: new THREE.Color(0x002200), emissiveIntensity: 0.4 })
      );
      sp.position.copy(dir).multiplyScalar(0.52);
      sp.quaternion.setFromUnitVectors(up, dir);
      g.add(sp);
    }
    return g;
  },

  _finishEndocytosis() {
    const a = this._eoAnim;
    if (!a) return;
    this._eoAnim = null;

    // Fade label
    if (a.label && a.label.parentNode) {
      a.label.style.opacity = '0';
      setTimeout(() => { if (a.label && a.label.parentNode) a.label.remove(); }, 1200);
    }

    // Dispose all eo scene resources — geometry + materials
    if (a.eoScene) {
      a.eoScene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose());
        }
      });
    }

    // Restore game scene/camera — render loop picks them up next frame
    this.scene  = this._gameScene;
    this.camera = this._gameCamera;
    this._gameScene = this._gameCamera = null;

    this._setState('COMPLETE');
    const acc  = this.totalCollisions > 0
      ? Math.round(this.correctCollected / this.totalCollisions * 100) : 100;
    const dist = Math.round(this.distance);
    const m    = Math.floor(this.elapsed / 60);
    const s    = Math.floor(this.elapsed % 60).toString().padStart(2, '0');
    this._showCompleteScreen(acc, dist, `${m}:${s}`);
  },

  _triggerDead(title, reason) {
    if (this.state !== 'PLAYING') return;
    this._setState('DEAD');
    if (this.sounds) this.sounds.play('dead');
    this._showDeadScreen(title, reason);
  },

  // ── Retry ─────────────────────────────────────────────────────────────
  _retryRun() {
    this._dismissInfoCard();
    this._resetMeters();
    const subs = ['terrain','player','walls','rbcs','receptors','obstacles','powerups','particles','education'];
    subs.forEach(k => { if (this[k] && this[k].reset) this[k].reset(); });
    if (this.sounds) this.sounds.startBgDrone();
    this._setState('PLAYING');
    this._updateHUD();
  },

  // ── Advance after complete ────────────────────────────────────────────
  _completeAndAdvance() {
    if (this.state !== 'COMPLETE') return;
    // Feed stats into main game G.stats if available
    if (window.G && G.stats) {
      const acc = this.totalCollisions > 0
        ? Math.round(this.correctCollected / this.totalCollisions * 100) : 100;
      G.stats.p2Accuracy     = acc;
      G.stats.p2Receptors    = this.correctCollected;
      G.stats.p2FactsLearned = this.education ? this.education.getSeenCount() : 0;
      G.stats.p2Time         = Math.round(this.elapsed);
    }
    const cb = this._onComplete;
    this.destroy();
    if (cb) cb();
  },

  // ── State machine ─────────────────────────────────────────────────────
  _setState(s) {
    this.state = s;
    ['p2OverIntro','p2OverComplete','p2OverDead'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const hud = document.getElementById('p2HUD');
    // Hide HUD meters during cinematic — ENDOCYTOSIS and COMPLETE are full-screen moments
    if (hud) hud.style.display = (s === 'PLAYING' || s === 'PAUSED') ? '' : 'none';

    if (s === 'INTRO')    { const el = document.getElementById('p2OverIntro');    if (el) el.style.display = 'flex'; }
    if (s === 'COMPLETE') { const el = document.getElementById('p2OverComplete'); if (el) el.style.display = 'flex'; }
    if (s === 'DEAD')     { const el = document.getElementById('p2OverDead');     if (el) el.style.display = 'flex'; }
    if (s === 'PAUSED')   { this.showTicker('PAUSED — press P to resume', 999); }
    if (s === 'PLAYING')  {
      const ticker = document.getElementById('p2Ticker');
      if (ticker) ticker.style.opacity = '0';
    }
  },

  _startPlaying() {
    if (this.state !== 'INTRO') return;
    const subs = ['terrain','player','walls','rbcs','receptors','obstacles','powerups','particles','education'];
    subs.forEach(k => { if (this[k] && this[k].reset) this[k].reset(); });
    if (this.sounds) this.sounds.startBgDrone();
    this._setState('PLAYING');
    this._updateHUD();
  },

  // ── Input ─────────────────────────────────────────────────────────────
  _bindInput() {
    this._evKD = (e) => {
      this._keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        // Space dismisses overlays only — NOT the info card (Space = jump key in gameplay)
        if (this._infoCardActive && e.code === 'Enter') { this._dismissInfoCard(); return; }
        if (this._infoCardActive) return;  // Space blocked while info card is open
        if (this.state === 'INTRO')    this._startPlaying();
        if (this.state === 'COMPLETE') this._completeAndAdvance();
        if (this.state === 'DEAD')     this._retryRun();
        if (this.state === 'PAUSED')   this.resume();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this._infoCardActive) return;  // Esc/P blocked while info card is open
        if (this.state === 'PLAYING') this.pause();
        else if (this.state === 'PAUSED') this.resume();
      }
    };
    this._evKU = (e) => { delete this._keys[e.code]; };
    this._evRZ = ()  => {
      if (this.camera) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      }
    };
    window.addEventListener('keydown', this._evKD);
    window.addEventListener('keyup',   this._evKU);
    window.addEventListener('resize',  this._evRZ);

    // ── Touch / swipe controls ─────────────────────────────────────────
    this._touchStart = null;
    this._evTS = (e) => {
      const t = e.touches[0];
      this._touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    };
    this._evTE = (e) => {
      if (!this._touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this._touchStart.x;
      const dy = t.clientY - this._touchStart.y;
      const dt = Date.now() - this._touchStart.time;
      this._touchStart = null;

      // Tap (< 250ms, < 20px movement) — same as Space/Enter
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 250) {
        if (this._infoCardActive) return;  // taps blocked while info card is open — use button
        if (this.state === 'INTRO')    { this._startPlaying(); return; }
        if (this.state === 'COMPLETE') { this._completeAndAdvance(); return; }
        if (this.state === 'DEAD')     { this._retryRun(); return; }
        // Tap-to-jump when motion controls active (tilt handles lanes)
        if (this.state === 'PLAYING' && window.P2MotionControls && P2MotionControls.enabled) {
          P2MotionControls.tapJump();
          return;
        }
      }

      if (this.state !== 'PLAYING') return;

      // Require minimum swipe distance
      if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe — lane change
        if (dx < 0) this._keys['ArrowLeft']  = true;
        else        this._keys['ArrowRight'] = true;
        // Release on next frame so player doesn't keep drifting
        setTimeout(() => { delete this._keys['ArrowLeft']; delete this._keys['ArrowRight']; }, 80);
      } else {
        if (dy < 0) {
          // Swipe up — jump
          this._keys['ArrowUp'] = true;
          setTimeout(() => { delete this._keys['ArrowUp']; }, 80);
        } else {
          // Swipe down — slide
          this._keys['ArrowDown'] = true;
          setTimeout(() => { delete this._keys['ArrowDown']; }, 500);
        }
      }
    };
    window.addEventListener('touchstart', this._evTS, { passive: true });
    window.addEventListener('touchend',   this._evTE, { passive: true });
  },

  _unbindInput() {
    if (this._evKD) window.removeEventListener('keydown',    this._evKD);
    if (this._evKU) window.removeEventListener('keyup',      this._evKU);
    if (this._evRZ) window.removeEventListener('resize',     this._evRZ);
    if (this._evTS) window.removeEventListener('touchstart', this._evTS);
    if (this._evTE) window.removeEventListener('touchend',   this._evTE);
    this._evKD = this._evKU = this._evRZ = this._evTS = this._evTE = null;
  },

  // ── Screen effects ────────────────────────────────────────────────────
  _flashVignette(color) {
    const el = document.getElementById('p2Vignette');
    if (!el) return;
    el.style.background = color === 'green'
      ? 'radial-gradient(ellipse at center, transparent 40%, rgba(0,255,136,0.18) 100%)'
      : 'radial-gradient(ellipse at center, transparent 40%, rgba(244,67,54,0.32) 100%)';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 300);
  },

  setMucusEffect(active) {
    const el = document.getElementById('p2MucusFilter');
    if (el) el.style.opacity = active ? '1' : '0';
  },

  showTicker(text, duration) {
    const el = document.getElementById('p2Ticker');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._t);
    if (duration < 900) el._t = setTimeout(() => { el.style.opacity = '0'; }, (duration || 3) * 1000);
  },

  showInfoCard(title, text, imgSrc, meshType, pdbId) {
    if (this._infoCardEl) return;   // already showing
    this._infoCardActive = true;

    const card = document.createElement('div');
    Object.assign(card.style, {
      position:       'fixed',
      inset:          '0',
      zIndex:         '9999',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            '16px',
      padding:        '32px 40px',
      textAlign:      'center',
      background:     'rgba(0,5,15,0.94)',
      fontFamily:     "-apple-system,BlinkMacSystemFont,'Segoe UI',monospace",
      boxSizing:      'border-box',
      overflowY:      'auto',
    });

    const titleEl = document.createElement('div');
    Object.assign(titleEl.style, {
      fontSize:      '1.15rem',
      fontWeight:    '700',
      letterSpacing: '.1em',
      color:         '#ffcc44',
      textTransform: 'uppercase',
    });
    titleEl.textContent = title;

    // Side-by-side row: [in-game 3D icon] | [structure image / placeholder]
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:    'flex',
      flexDirection: 'row',
      gap:        '16px',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    });

    // Left pane — mini Three.js spinning preview of the in-game object
    const previewWrap = document.createElement('div');
    Object.assign(previewWrap.style, {
      width:        '160px',
      height:       '160px',
      borderRadius: '10px',
      border:       '1px solid rgba(200,169,81,0.3)',
      background:   'rgba(0,10,5,0.8)',
      overflow:     'hidden',
      flexShrink:   '0',
      position:     'relative',
    });
    const previewLabel = document.createElement('div');
    Object.assign(previewLabel.style, {
      position:  'absolute',
      bottom:    '4px',
      width:     '100%',
      textAlign: 'center',
      fontSize:  '.6rem',
      color:     'rgba(200,169,81,0.4)',
      pointerEvents: 'none',
    });
    previewLabel.textContent = 'in-game model';
    previewWrap.appendChild(previewLabel);

    const previewCanvas = this._makePreviewCanvas(meshType);
    if (previewCanvas) {
      Object.assign(previewCanvas.style, { width: '100%', height: '100%', display: 'block' });
      previewWrap.insertBefore(previewCanvas, previewLabel);
    } else {
      Object.assign(previewLabel.style, { bottom: '50%', transform: 'translateY(50%)', color: 'rgba(200,169,81,0.3)' });
      previewLabel.textContent = 'model preview\nunavailable';
    }

    // Right pane — 3Dmol spinning structure (preferred) or PNG fallback
    const rightPane = this._makeStructurePane(pdbId, imgSrc, title);

    row.appendChild(previewWrap);
    row.appendChild(rightPane);

    const textEl = document.createElement('div');
    Object.assign(textEl.style, {
      fontSize:   '.95rem',
      color:      '#cce8cc',
      maxWidth:   '540px',
      lineHeight: '1.9',
    });
    textEl.textContent = text;

    const btn = document.createElement('button');
    Object.assign(btn.style, {
      padding:      '12px 40px',
      background:   '#00cc44',
      color:        '#001800',
      fontSize:     '.95rem',
      fontWeight:   '700',
      border:       'none',
      borderRadius: '8px',
      cursor:       'pointer',
      marginTop:    '4px',
      flexShrink:   '0',
    });
    btn.textContent = 'Got it!';
    btn.addEventListener('click', () => this._dismissInfoCard());

    const hint = document.createElement('div');
    Object.assign(hint.style, {
      fontSize:      '.75rem',
      color:         '#4a7a5a',
      letterSpacing: '.06em',
    });
    hint.textContent = 'or press Enter to continue';

    card.appendChild(titleEl);
    card.appendChild(row);
    card.appendChild(textEl);
    card.appendChild(btn);
    card.appendChild(hint);
    document.body.appendChild(card);
    this._infoCardEl = card;
  },

  // Creates a 160×160 Three.js canvas with a spinning preview of the given mesh type.
  // Returns null if Three.js or P2MeshPreview is unavailable.
  _makePreviewCanvas(meshType) {
    if (!meshType || !window.THREE || !window.P2MeshPreview) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    canvas.setAttribute('data-preview', '1');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) { return null; }
    renderer.setSize(160, 160);
    renderer.setClearColor(0x000000, 0);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    const cam    = P2MeshPreview.camFor(meshType);
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(1, 2, 2);
    scene.add(dir);

    const group = P2MeshPreview.build(meshType);
    scene.add(group);

    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      group.rotation.y += 0.018;
      renderer.render(scene, camera);
    };
    animate();

    canvas._cleanup = () => {
      cancelAnimationFrame(rafId);
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
    };
    return canvas;
  },

  _dismissInfoCard() {
    this._infoCardActive = false;
    if (this._infoCardEl) {
      // Stop Three.js preview renderer
      const pc = this._infoCardEl.querySelector('canvas[data-preview]');
      if (pc && pc._cleanup) pc._cleanup();
      // Stop 3Dmol spin
      const sp = this._infoCardEl.querySelector('[data-3dmol]');
      if (sp && sp._viewer) { try { sp._viewer.spin(false); } catch (e) {} }
      this._infoCardEl.remove();
      this._infoCardEl = null;
    }
  },

  // Builds the right-pane structure viewer.
  // Uses 3Dmol.js if pdbId + library are available; falls back to static PNG / placeholder.
  _makeStructurePane(pdbId, imgSrc, title) {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      width:      '160px',
      height:     '160px',
      flexShrink: '0',
      borderRadius: '10px',
      border:     pdbId && window.$3Dmol
                    ? '1px solid rgba(200,169,81,0.3)'
                    : '1px dashed rgba(200,169,81,0.4)',
      background: '#000a05',
      position:   'relative',
      overflow:   'hidden',
    });

    // Bottom label (always present)
    const label = document.createElement('div');
    Object.assign(label.style, {
      position:   'absolute',
      bottom:     '4px',
      width:      '100%',
      textAlign:  'center',
      fontSize:   '.6rem',
      color:      'rgba(200,169,81,0.4)',
      pointerEvents: 'none',
      zIndex:     '2',
    });
    wrap.appendChild(label);

    if (pdbId && window.$3Dmol) {
      // ── 3Dmol path ──────────────────────────────────────────────────────
      // pdbId may be a bare PDB code ("6LZG") or a prefixed query ("cid:439197")
      const isSmallMol = pdbId.startsWith('cid:');
      const query      = (pdbId.startsWith('pdb:') || pdbId.startsWith('cid:')) ? pdbId : 'pdb:' + pdbId;
      const displayId  = pdbId.replace(/^(pdb:|cid:)/, '');

      label.textContent = 'loading…';

      // Inner viewer div (3Dmol sizes its canvas to this element)
      const viewerDiv = document.createElement('div');
      Object.assign(viewerDiv.style, {
        position: 'absolute', inset: '0',
      });
      viewerDiv.setAttribute('data-3dmol', '1');
      wrap.insertBefore(viewerDiv, label);

      // 3Dmol must be initialized after the element is in the DOM.
      // We defer via a microtask so the caller can append first.
      Promise.resolve().then(() => {
        if (!this._infoCardEl) return;   // card already dismissed
        let viewer;
        try {
          viewer = $3Dmol.createViewer(viewerDiv, { backgroundColor: '#000a05', antialias: true });
        } catch (e) {
          label.textContent = 'viewer error';
          return;
        }
        viewerDiv._viewer = viewer;

        $3Dmol.download(query, viewer, {}, () => {
          if (!this._infoCardEl) return;   // dismissed while loading
          if (isSmallMol) {
            // Ball-and-stick for small molecules (no secondary structure)
            viewer.setStyle({}, {
              stick:  { colorscheme: 'Jmol', radius: 0.15 },
              sphere: { colorscheme: 'Jmol', scale:  0.25 },
            });
            label.textContent = 'chemical structure · ' + displayId;
          } else {
            // Cartoon + ligand sticks for proteins
            viewer.setStyle({ hetflag: false }, { cartoon: { color: 'spectrum', opacity: 0.88 } });
            viewer.setStyle({ hetflag: true  }, { stick:   { colorscheme: 'default', radius: 0.12 } });
            label.textContent = 'real structure · ' + displayId;
          }
          viewer.zoomTo();
          viewer.render();
          viewer.spin('y', 1);
        });
      });

    } else {
      // ── PNG / placeholder fallback ───────────────────────────────────────
      const img = document.createElement('img');
      img.src = imgSrc || '';
      img.alt = title;
      Object.assign(img.style, {
        width: '100%', height: '100%', objectFit: 'contain',
        display: 'block', position: 'relative', zIndex: '1',
      });
      img.onload  = () => { label.textContent = 'real structure'; };
      img.onerror = () => {
        img.style.display = 'none';
        Object.assign(label.style, { bottom: '50%', transform: 'translateY(50%)', whiteSpace: 'pre' });
        label.textContent = 'structure image\ncoming soon';
      };
      wrap.insertBefore(img, label);
    }

    return wrap;
  },

  // ── Motion controls helpers ───────────────────────────────────────────

  // Returns this._keys merged with any active motion input — non-destructive.
  _getEffectiveKeys() {
    return (window.P2MotionControls && P2MotionControls.enabled)
      ? P2MotionControls.mergeKeys(this._keys)
      : this._keys;
  },

  _showMotionSettings() {
    if (this._motionSettingsEl) return;
    if (this.state === 'PLAYING') this.pause();

    const mc = window.P2MotionControls;
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', inset: '0', zIndex: '9998',
      background: 'rgba(0,5,15,0.96)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'flex-start', overflowY: 'auto',
      padding: '32px 24px 40px',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',monospace",
      color: '#cce8cc', boxSizing: 'border-box', gap: '0',
    });

    const title = document.createElement('div');
    Object.assign(title.style, {
      fontSize: '1rem', fontWeight: '700', letterSpacing: '.12em',
      color: '#ffcc44', textTransform: 'uppercase', marginBottom: '20px',
    });
    title.textContent = 'Motion Controls';
    panel.appendChild(title);

    const _row = (label, control) => {
      const r = document.createElement('div');
      Object.assign(r.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', maxWidth: '360px', marginBottom: '16px',
      });
      const lbl = document.createElement('div');
      Object.assign(lbl.style, { fontSize: '.88rem', color: '#aaccaa' });
      lbl.textContent = label;
      r.appendChild(lbl);
      r.appendChild(control);
      return r;
    };

    const _toggle = (initial, onChange) => {
      const btn = document.createElement('button');
      let on = initial;
      const update = () => {
        btn.textContent = on ? 'ON' : 'OFF';
        Object.assign(btn.style, {
          padding: '5px 14px', borderRadius: '20px', border: 'none',
          fontWeight: '700', fontSize: '.8rem', cursor: 'pointer',
          background: on ? '#00cc44' : 'rgba(255,255,255,0.1)',
          color: on ? '#001800' : '#778877',
        });
      };
      update();
      btn.addEventListener('click', () => { on = !on; update(); onChange(on); });
      return btn;
    };

    // ── Enable toggle ──────────────────────────────────────────────────────
    const enableToggle = _toggle(mc ? mc.enabled : false, async (v) => {
      if (!mc) return;
      const ok = await mc.setEnabled(v);
      if (!ok) {
        enableToggle.textContent = 'OFF';
        enableToggle.style.background = 'rgba(255,255,255,0.1)';
        enableToggle.style.color = '#778877';
        const errEl = document.createElement('div');
        Object.assign(errEl.style, { color: '#ff6666', fontSize: '.75rem', marginBottom: '8px', textAlign: 'center' });
        errEl.textContent = 'Permission denied — check browser settings.';
        panel.insertBefore(errEl, sensRow);
      }
      _refreshTiltCanvas();
    });
    panel.appendChild(_row('Enable', enableToggle));

    // ── Sensitivity slider ─────────────────────────────────────────────────
    const sensVal = document.createElement('div');
    Object.assign(sensVal.style, { fontSize: '.8rem', color: '#ffcc44', minWidth: '36px', textAlign: 'right' });
    sensVal.textContent = (mc ? mc.sensitivity : 1).toFixed(1) + '×';

    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '50'; slider.max = '200'; slider.step = '5';
    slider.value = String(Math.round((mc ? mc.sensitivity : 1) * 100));
    Object.assign(slider.style, { width: '140px', accentColor: '#00cc44', cursor: 'pointer' });
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value) / 100;
      sensVal.textContent = v.toFixed(1) + '×';
      if (mc) mc.setSensitivity(v);
      _refreshTiltCanvas();
    });

    const sensCtrl = document.createElement('div');
    Object.assign(sensCtrl.style, { display: 'flex', alignItems: 'center', gap: '8px' });
    sensCtrl.appendChild(slider);
    sensCtrl.appendChild(sensVal);
    const sensRow = _row('Sensitivity', sensCtrl);
    panel.appendChild(sensRow);

    // ── Jerk-to-jump toggle ────────────────────────────────────────────────
    panel.appendChild(_row('Jerk bonus jump', _toggle(mc ? mc.jerkJump : false, (v) => { if (mc) mc.setJerkJump(v); })));

    // ── Divider ────────────────────────────────────────────────────────────
    const div1 = document.createElement('hr');
    Object.assign(div1.style, { width: '100%', maxWidth: '360px', border: 'none', borderTop: '1px solid rgba(0,255,136,0.12)', margin: '4px 0 16px' });
    panel.appendChild(div1);

    // ── Calibration ────────────────────────────────────────────────────────
    const calInstr = document.createElement('div');
    Object.assign(calInstr.style, { fontSize: '.78rem', color: '#7a9988', maxWidth: '360px', textAlign: 'center', marginBottom: '10px', lineHeight: '1.5' });
    calInstr.textContent = 'Hold device in your natural gaming position, then tap Calibrate.';
    panel.appendChild(calInstr);

    const calFeedback = document.createElement('div');
    Object.assign(calFeedback.style, { fontSize: '.75rem', color: '#00ff88', height: '18px', marginBottom: '8px' });
    panel.appendChild(calFeedback);

    const calBtn = document.createElement('button');
    Object.assign(calBtn.style, {
      padding: '10px 28px', background: 'rgba(0,255,136,0.1)',
      border: '1px solid rgba(0,255,136,0.3)', borderRadius: '8px',
      color: '#00ff88', fontSize: '.88rem', cursor: 'pointer', marginBottom: '20px',
    });
    calBtn.textContent = 'Calibrate';
    calBtn.addEventListener('click', () => {
      if (mc) mc.calibrate();
      calFeedback.textContent = '✓ Calibrated';
      setTimeout(() => { calFeedback.textContent = ''; }, 2000);
      _refreshTiltCanvas();
    });
    panel.appendChild(calBtn);

    // ── Live tilt indicator ────────────────────────────────────────────────
    const tiltLabel = document.createElement('div');
    Object.assign(tiltLabel.style, { fontSize: '.65rem', color: '#447766', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '6px' });
    tiltLabel.textContent = 'Live Tilt';
    panel.appendChild(tiltLabel);

    const tiltCanvas = document.createElement('canvas');
    tiltCanvas.width = 280; tiltCanvas.height = 44;
    Object.assign(tiltCanvas.style, { display: 'block', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.1)' });
    panel.appendChild(tiltCanvas);

    const slideLabel = document.createElement('div');
    Object.assign(slideLabel.style, { fontSize: '.65rem', color: '#447766', marginTop: '6px', marginBottom: '20px' });
    slideLabel.textContent = 'Orange dot = slide active';
    panel.appendChild(slideLabel);

    let _tiltRaf;
    const _refreshTiltCanvas = () => {
      const ctx = tiltCanvas.getContext('2d');
      const W = tiltCanvas.width, H = tiltCanvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!mc) return;
      const tilt   = Math.max(-45, Math.min(45, mc.tiltLR));
      const thresh = mc.tiltThresh;
      const cx = W / 2;

      // Track
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.roundRect(8, H/2 - 5, W - 16, 10, 5); ctx.fill();

      // Labels
      ctx.fillStyle = 'rgba(0,255,136,0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';  ctx.fillText('◀', 10, H/2 + 4);
      ctx.textAlign = 'right'; ctx.fillText('▶', W - 10, H/2 + 4);

      // Threshold markers
      const lx = cx + (-thresh / 45) * (cx - 20);
      const rx = cx + ( thresh / 45) * (cx - 20);
      ctx.fillStyle = 'rgba(0,255,136,0.4)';
      ctx.fillRect(lx - 1, 6, 2, H - 12);
      ctx.fillRect(rx - 1, 6, 2, H - 12);

      // Center
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(cx - 1, 6, 2, H - 12);

      // Needle
      const nx = cx + (tilt / 45) * (cx - 20);
      ctx.fillStyle = Math.abs(tilt) > thresh ? '#44aaff' : '#00ff88';
      ctx.beginPath(); ctx.arc(nx, H / 2, 8, 0, Math.PI * 2); ctx.fill();

      // Slide indicator
      if (mc.tiltFB > mc.slideThresh) {
        ctx.fillStyle = '#ff9800';
        ctx.beginPath(); ctx.arc(W - 14, 10, 6, 0, Math.PI * 2); ctx.fill();
      }
    };

    const _animTilt = () => { _tiltRaf = requestAnimationFrame(_animTilt); _refreshTiltCanvas(); };
    _animTilt();

    // ── Close button ───────────────────────────────────────────────────────
    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      padding: '12px 40px', background: '#00cc44', color: '#001800',
      fontSize: '.95rem', fontWeight: '700', border: 'none',
      borderRadius: '8px', cursor: 'pointer',
    });
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      cancelAnimationFrame(_tiltRaf);
      panel.remove();
      this._motionSettingsEl = null;
    });
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
    this._motionSettingsEl = panel;
  },

  // ── HUD build ─────────────────────────────────────────────────────────
  _buildHUD() {
    if (!document.getElementById('p2Styles')) {
      const st = document.createElement('style');
      st.id = 'p2Styles';
      st.textContent = `
        #p2Root{position:fixed;inset:0;pointer-events:none;z-index:200;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',monospace;}
        #p2Root *{box-sizing:border-box;}
        #p2Vignette{position:absolute;inset:0;opacity:0;transition:opacity 0.3s;pointer-events:none;}
        #p2MucusFilter{position:absolute;inset:0;backdrop-filter:blur(1px);opacity:0;
          transition:opacity 0.5s;pointer-events:none;}
        #p2HUD{position:absolute;inset:0;}

        /* Top-left info panel */
        #p2TL{position:absolute;top:14px;left:14px;background:rgba(0,0,0,0.6);
          border:1px solid rgba(0,255,136,0.2);border-radius:8px;padding:8px 12px;}
        #p2PhLabel{font-size:.62rem;letter-spacing:.12em;color:#00ff88;font-weight:700;text-transform:uppercase;}
        #p2Obj{font-size:.72rem;color:#aaccaa;margin-top:2px;}
        #p2VType{font-size:.62rem;color:#5a8a6a;margin-top:3px;}
        #p2Pen{font-size:.65rem;color:#ff9966;margin-top:4px;}

        /* Top-center bars */
        #p2TC{position:absolute;top:14px;left:50%;transform:translateX(-50%);
          display:flex;flex-direction:column;gap:6px;align-items:center;}
        .p2BW{width:300px;}
        .p2BL{font-size:.58rem;letter-spacing:.08em;color:#aaccaa;
          display:flex;justify-content:space-between;margin-bottom:2px;}
        .p2BO{height:10px;background:rgba(255,255,255,0.1);border-radius:5px;overflow:hidden;}
        #p2AlertFill{height:100%;width:0%;background:#4caf50;border-radius:5px;transition:width .15s,background .3s;}
        #p2BindFill{height:100%;width:0%;background:#00ff88;border-radius:5px;transition:width .15s;}

        /* Top-right stats */
        #p2TR{position:absolute;top:14px;right:14px;text-align:right;
          background:rgba(0,0,0,0.6);border:1px solid rgba(0,255,136,0.2);
          border-radius:8px;padding:8px 12px;min-width:120px;}
        #p2HP{font-size:.78rem;color:#e0f7e0;}
        #p2HPBar{height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-top:3px;}
        #p2HPFill{height:100%;width:100%;background:#4caf50;border-radius:3px;transition:width .2s,background .3s;}
        #p2SpeedStat{font-size:.62rem;color:#5a8a6a;margin-top:4px;}
        #p2DistStat{font-size:.62rem;color:#5a8a6a;margin-top:2px;}

        /* Bottom ticker */
        #p2Ticker{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);
          max-width:520px;background:rgba(0,8,4,0.78);border:1px solid rgba(0,255,136,0.15);
          border-radius:20px;padding:6px 20px;font-size:.78rem;color:#e0ffe0;
          text-align:center;opacity:0;transition:opacity .4s;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* Bottom-left molecule legend */
        #p2Legend{position:absolute;bottom:14px;left:14px;background:rgba(0,0,0,0.45);
          border:1px solid rgba(100,200,180,0.12);border-radius:7px;padding:7px 11px;}
        #p2LegTitle{font-size:.52rem;letter-spacing:.14em;color:#447766;
          text-transform:uppercase;margin-bottom:5px;}
        .p2LRow{display:flex;align-items:center;gap:6px;margin-top:3px;}
        .p2LSwatch{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .p2LName{font-size:.58rem;color:#7a9988;}
        .p2LRole{font-size:.54rem;color:#445544;}

        /* Bottom-right power-up */
        #p2PU{position:absolute;bottom:32px;right:14px;background:rgba(0,0,0,0.6);
          border:1px solid rgba(0,255,136,0.2);border-radius:8px;padding:8px 12px;
          min-width:120px;display:none;}
        #p2PULbl{font-size:.58rem;letter-spacing:.08em;color:#aaccaa;text-transform:uppercase;}
        #p2PUName{font-size:.76rem;color:#fff;margin-top:2px;}
        #p2PUTimer{font-size:.68rem;color:#00ff88;margin-top:2px;}

        /* Tilt indicator bar (motion controls) */
        #p2TiltBar{position:absolute;bottom:68px;left:50%;transform:translateX(-50%);
          display:none;align-items:center;justify-content:center;}
        #p2TiltBar canvas{display:block;}

        /* Settings gear button */
        #p2GearBtn{position:absolute;top:14px;left:50%;transform:translateX(-50%);
          margin-left:175px;width:32px;height:32px;border-radius:50%;
          border:1px solid rgba(0,255,136,0.25);background:rgba(0,0,0,0.55);
          color:#5a8a6a;font-size:1rem;cursor:pointer;pointer-events:auto;
          display:flex;align-items:center;justify-content:center;
          transition:border-color .2s,color .2s;}
        #p2GearBtn:hover{border-color:rgba(0,255,136,0.6);color:#00ff88;}

        /* Debug skip button */
        #p2SkipBtn{position:absolute;bottom:14px;right:14px;
          border:1px solid rgba(255,200,0,0.4);background:rgba(0,0,0,0.65);
          color:#bb8800;font-size:.65rem;letter-spacing:.06em;padding:4px 10px;
          border-radius:5px;cursor:pointer;pointer-events:auto;
          transition:border-color .2s,color .2s;}
        #p2SkipBtn:hover{border-color:rgba(255,200,0,0.8);color:#ffcc00;}

        /* Overlays */
        .p2Ov{position:absolute;inset:0;display:none;flex-direction:column;
          align-items:center;justify-content:center;background:rgba(0,5,15,0.90);
          pointer-events:auto;gap:14px;padding:36px;text-align:center;}
        .p2OvT{font-size:2rem;font-weight:800;letter-spacing:.08em;
          color:#00ff88;text-transform:uppercase;}
        .p2OvS{font-size:.88rem;color:#aaccaa;max-width:500px;line-height:1.7;}
        .p2OvStats{display:flex;gap:28px;flex-wrap:wrap;justify-content:center;margin-top:4px;}
        .p2Stat{display:flex;flex-direction:column;align-items:center;gap:4px;}
        .p2SV{font-size:1.15rem;color:#00ff88;font-weight:700;}
        .p2SL{font-size:.6rem;letter-spacing:.08em;color:#5a8a6a;text-transform:uppercase;}
        .p2Hint{background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.2);
          border-radius:8px;padding:8px 18px;font-size:.78rem;color:#ccffee;max-width:440px;}
        .p2PenBox{background:rgba(255,100,50,0.1);border:1px solid rgba(255,100,50,0.3);
          border-radius:8px;padding:10px 20px;font-size:.8rem;color:#ff9966;max-width:440px;line-height:1.6;}
        .p2Prompt{font-size:.78rem;color:#5a8a6a;letter-spacing:.06em;}
      `;
      document.head.appendChild(st);
    }

    const root = document.createElement('div');
    root.id = 'p2Root';
    root.innerHTML = `
      <div id="p2Vignette"></div>
      <div id="p2MucusFilter"></div>

      <!-- HUD (visible during PLAYING only) -->
      <div id="p2HUD" style="display:none">
        <div id="p2TL">
          <div id="p2PhLabel">Phase 2 · Attachment</div>
          <div id="p2Obj">Find and bind sialic acid receptors</div>
          <div id="p2VType">Influenza A (H1N1)</div>
          <div id="p2Pen"></div>
        </div>
        <div id="p2TC">
          <div class="p2BW">
            <div class="p2BL"><span>Immune Alert</span><span id="p2AlertPct">0%</span></div>
            <div class="p2BO"><div id="p2AlertFill"></div></div>
          </div>
          <div class="p2BW">
            <div class="p2BL"><span>Binding Affinity</span><span id="p2BindPct">0%</span></div>
            <div class="p2BO"><div id="p2BindFill"></div></div>
          </div>
        </div>
        <div id="p2TR">
          <div id="p2HP">HP: 100 / 100</div>
          <div id="p2HPBar"><div id="p2HPFill"></div></div>
          <div id="p2SpeedStat">Speed: 1.00×</div>
          <div id="p2DistStat">Dist: 0 µm</div>
        </div>
        <div id="p2Ticker"></div>
        <div id="p2Legend">
          <div id="p2LegTitle">Cell Surface Molecules</div>
          <div class="p2LRow"><div class="p2LSwatch" style="background:#00ff88"></div><span class="p2LName">Sialic acid</span><span class="p2LRole">&nbsp;— bind!</span></div>
          <div class="p2LRow"><div class="p2LSwatch" style="background:#4488ff"></div><span class="p2LName">ACE2</span><span class="p2LRole">&nbsp;— wrong receptor</span></div>
          <div class="p2LRow"><div class="p2LSwatch" style="background:#aa44ff"></div><span class="p2LName">CD4</span><span class="p2LRole">&nbsp;— wrong receptor</span></div>
          <div class="p2LRow"><div class="p2LSwatch" style="background:#ff8844"></div><span class="p2LName">ICAM-1</span><span class="p2LRole">&nbsp;— wrong receptor</span></div>
          <div class="p2LRow"><div class="p2LSwatch" style="background:#ffdd44"></div><span class="p2LName">IgA antibody</span><span class="p2LRole">&nbsp;— dodge</span></div>
          <div class="p2LRow"><div class="p2LSwatch" style="background:#ff4444"></div><span class="p2LName">C3b complement</span><span class="p2LRole">&nbsp;— escape ring</span></div>
        </div>
        <div id="p2PU">
          <div id="p2PULbl">Power-Up</div>
          <div id="p2PUName">—</div>
          <div id="p2PUTimer">—</div>
        </div>
        <div id="p2TiltBar"><canvas id="p2TiltCanvas" width="180" height="28"></canvas></div>
        <button id="p2GearBtn" title="Motion Settings">⚙</button>
        <button id="p2SkipBtn" title="Debug: skip to win">⏩ skip</button>
      </div>

      <!-- INTRO overlay -->
      <div class="p2Ov" id="p2OverIntro">
        <div class="p2OvT">Phase 2: Attachment</div>
        <div class="p2OvS">Influenza A must bind sialic acid receptors on the respiratory epithelial cell surface. Dodge immune defenses — and avoid the wrong receptor types.</div>
        <div class="p2Hint">← → switch lanes &nbsp;·&nbsp; Space / W jump &nbsp;·&nbsp; S / Shift duck</div>
        <div id="p2IntroPen"></div>
        <div class="p2Prompt">Press Space or Enter to begin</div>
      </div>

      <!-- COMPLETE overlay -->
      <div class="p2Ov" id="p2OverComplete">
        <div class="p2OvT">Attachment Complete</div>
        <div class="p2OvS">Influenza hemagglutinin successfully bound sialic acid receptors on the epithelial cell surface. The cell will now engulf the virus via receptor-mediated endocytosis.</div>
        <div class="p2OvStats" id="p2CompStats"></div>
        <div class="p2Prompt">Press Space or Enter to continue</div>
      </div>

      <!-- DEAD overlay -->
      <div class="p2Ov" id="p2OverDead">
        <div class="p2OvT" id="p2DeadT" style="color:#f44336">Virus Neutralized</div>
        <div class="p2OvS" id="p2DeadR"></div>
        <div class="p2OvStats" id="p2DeadStats"></div>
        <div class="p2Prompt">Press Space or Enter to retry</div>
      </div>

    `;
    document.body.appendChild(root);
    this._hudRoot = root;
    this._refreshIntroPenalty();

    // Gear button → open motion settings (pointer-events:auto override handled by button itself)
    const gearBtn = document.getElementById('p2GearBtn');
    if (gearBtn) gearBtn.addEventListener('click', () => this._showMotionSettings());

    // Debug skip button → force binding to WIN threshold
    const skipBtn = document.getElementById('p2SkipBtn');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      if (this.state === 'PLAYING') this.binding = P2_CFG.BINDING_WIN;
    });
  },

  _removeHUD() {
    if (this._hudRoot) { this._hudRoot.remove(); this._hudRoot = null; }
    const st = document.getElementById('p2Styles');
    if (st) st.remove();
  },

  // ── HUD updates ───────────────────────────────────────────────────────
  _refreshIntroPenalty() {
    const el = document.getElementById('p2IntroPen');
    if (!el) return;
    if (this.boundSites === 0) { el.style.display = 'none'; return; }
    const pct = Math.round(this.scoreMultiplier * 100);
    el.className = 'p2PenBox';
    el.innerHTML = `<strong>${this.boundSites} of ${this.totalSites} binding sites neutralized by IgG in Phase 1.</strong><br>
      Receptor affinity: ${pct}% — each sialic acid receptor contributes ${pct}% of normal binding progress.`;
  },

  _updateHUD() {
    const ap = Math.round(this.alert);
    const af = document.getElementById('p2AlertFill');
    if (af) {
      af.style.width = ap + '%';
      af.style.background = ap < 25 ? '#4caf50' : ap < 50 ? '#ffeb3b' : ap < 75 ? '#ff9800' : '#f44336';
    }
    const apc = document.getElementById('p2AlertPct');
    if (apc) apc.textContent = ap + '%';

    const bp = Math.min(100, Math.round(this.binding));
    const bf = document.getElementById('p2BindFill');
    if (bf) bf.style.width = bp + '%';
    const bpc = document.getElementById('p2BindPct');
    if (bpc) bpc.textContent = bp + '%';

    const hpEl = document.getElementById('p2HP');
    if (hpEl) hpEl.textContent = `HP: ${Math.ceil(this.hp)} / ${P2_CFG.PLAYER_HP}`;
    const hf = document.getElementById('p2HPFill');
    if (hf) {
      const hpPct = this.hp / P2_CFG.PLAYER_HP * 100;
      hf.style.width = hpPct + '%';
      hf.style.background = hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ff9800' : '#f44336';
    }

    const spEl = document.getElementById('p2SpeedStat');
    if (spEl) spEl.textContent = `Speed: ${this.speed.toFixed(2)}×`;
    const dtEl = document.getElementById('p2DistStat');
    if (dtEl) dtEl.textContent = `Dist: ${Math.round(this.distance)} µm`;

    // Affinity penalty reminder in HUD
    if (this.boundSites > 0) {
      const pen = document.getElementById('p2Pen');
      if (pen) pen.textContent = `Affinity: ${Math.round(this.scoreMultiplier * 100)}% (${this.boundSites} site${this.boundSites > 1 ? 's' : ''} neutralized)`;
    }

    // Tilt indicator — only shown when motion controls are active
    const tiltBar = document.getElementById('p2TiltBar');
    if (tiltBar) {
      const mc = window.P2MotionControls;
      const showTilt = mc && mc.enabled && this.state === 'PLAYING';
      tiltBar.style.display = showTilt ? 'flex' : 'none';
      if (showTilt) this._drawTiltBar();
    }
  },

  _drawTiltBar() {
    const canvas = document.getElementById('p2TiltCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const mc = window.P2MotionControls;
    const tilt   = Math.max(-45, Math.min(45, mc.tiltLR));
    const thresh = mc.tiltThresh;
    const cx = W / 2;

    ctx.clearRect(0, 0, W, H);

    // Track
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(0, H/2 - 4, W, 8, 4); ctx.fill();

    // Threshold markers
    ctx.fillStyle = 'rgba(0,255,136,0.35)';
    const lx = cx + (-thresh / 45) * cx;
    const rx = cx + ( thresh / 45) * cx;
    ctx.fillRect(lx - 1, 4, 2, H - 8);
    ctx.fillRect(rx - 1, 4, 2, H - 8);

    // Center tick
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(cx - 1, 4, 2, H - 8);

    // Needle (position dot)
    const nx = cx + (tilt / 45) * cx;
    const inZone = Math.abs(tilt) > thresh;
    ctx.fillStyle = inZone ? (tilt < 0 ? '#44aaff' : '#44aaff') : 'rgba(0,255,136,0.7)';
    ctx.beginPath(); ctx.arc(nx, H / 2, 6, 0, Math.PI * 2); ctx.fill();

    // Slide indicator dot (top-right corner)
    if (mc.tiltFB > mc.slideThresh) {
      ctx.fillStyle = '#ff9800';
      ctx.beginPath(); ctx.arc(W - 8, 8, 5, 0, Math.PI * 2); ctx.fill();
    }
  },

  _updateHUDPowerup() {
    const el = document.getElementById('p2PU');
    if (!el) return;
    if (!this.activePowerup) { el.style.display = 'none'; return; }
    el.style.display = '';
    const names = { drift: 'Antigenic Drift', na: 'Neuraminidase Burst', raft: 'Lipid Raft Magnet' };
    const nm = document.getElementById('p2PUName');
    if (nm) nm.textContent = names[this.activePowerup.type] || '';
    const tm = document.getElementById('p2PUTimer');
    if (tm) tm.textContent = this.activePowerup.timeLeft.toFixed(1) + 's';
  },

  _showCompleteScreen(accuracy, dist, time) {
    const el = document.getElementById('p2CompStats');
    if (!el) return;
    el.innerHTML = `
      <div class="p2Stat"><div class="p2SV">${this.correctCollected}</div><div class="p2SL">Receptors Bound</div></div>
      <div class="p2Stat"><div class="p2SV">${accuracy}%</div><div class="p2SL">Accuracy</div></div>
      <div class="p2Stat"><div class="p2SV">${dist} µm</div><div class="p2SL">Distance</div></div>
      <div class="p2Stat"><div class="p2SV">${time}</div><div class="p2SL">Time</div></div>
      <div class="p2Stat"><div class="p2SV">${Math.round(this.scoreMultiplier * 100)}%</div><div class="p2SL">Affinity</div></div>
      <div class="p2Stat"><div class="p2SV">${this.education ? this.education.getSeenCount() : 0}</div><div class="p2SL">Facts Learned</div></div>
    `;
  },

  _showDeadScreen(title, reason) {
    const t = document.getElementById('p2DeadT');
    if (t) t.textContent = title;
    const r = document.getElementById('p2DeadR');
    if (r) r.textContent = reason;
    const s = document.getElementById('p2DeadStats');
    if (s) s.innerHTML = `
      <div class="p2Stat"><div class="p2SV">${this.correctCollected}</div><div class="p2SL">Receptors Bound</div></div>
      <div class="p2Stat"><div class="p2SV">${Math.round(this.binding)}%</div><div class="p2SL">Affinity Reached</div></div>
    `;
  },
};

window.P2Attachment = P2;

})();
