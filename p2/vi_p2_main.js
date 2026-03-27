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
  state:            'IDLE',  // IDLE|INTRO|PLAYING|PAUSED|COMPLETE|DEAD
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

  // Camera follow state
  _camX:    0,   // lerped camera X
  _camShake:{ x: 0, y: 0, timer: 0 },

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
    this.camera = null;
    this.state  = 'IDLE';
    const mainHud = document.getElementById('hud');
    if (mainHud) mainHud.classList.remove('hidden');
  },

  pause()  { if (this.state === 'PLAYING') this._setState('PAUSED'); },
  resume() { if (this.state === 'PAUSED')  this._setState('PLAYING'); },

  // ── _tick — called from viral_infiltration.html's gameLoop ────────────
  _tick(dt) {
    if (this.state === 'PLAYING') this._updateGame(dt);
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
    this._keys             = {};
  },

  // ── Scene ─────────────────────────────────────────────────────────────
  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(P2_CFG.COL_FOG, 0.015);
    this.scene.background = new THREE.Color(P2_CFG.COL_BG);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
    this.camera.position.set(0, P2_CFG.CAMERA_Y_OFFSET, P2_CFG.CAMERA_Z_OFFSET);
    this.camera.lookAt(0, 0, 15);

    // Ambient — warm dim, bronchial tissue
    this.scene.add(new THREE.AmbientLight(0x1a0906, 0.75));

    // Directional — warm tissue light from above-forward
    const dir = new THREE.DirectionalLight(0xffaa88, 0.45);
    dir.position.set(0, 10, -5);
    this.scene.add(dir);

    // Player point light (warm glow)
    this._playerLight = new THREE.PointLight(P2_CFG.COL_PLAYER_LIGHT, 1.2, 8);
    this._playerLight.position.set(0, 1.5, 0);
    this.scene.add(this._playerLight);

    // Initialise world sub-systems if vi_p2_world.js is loaded
    if (typeof P2World !== 'undefined') {
      this.terrain = P2World.createTerrain(this.scene);
      this.player  = P2World.createPlayer(this.scene);
      this.walls   = P2World.createBronchialWalls(this.scene);
      // RBCs disabled for influenza (bronchial context) — see memory/rbc_pattern.md
    }

    // Initialise gameplay sub-systems if vi_p2_gameplay.js is loaded
    if (typeof P2Gameplay !== 'undefined') {
      this.receptors = P2Gameplay.createReceptors(this.scene, this.terrain);
      this.obstacles = P2Gameplay.createObstacles(this.scene);
      this.powerups  = P2Gameplay.createPowerups(this.scene, this.terrain);
    }

    // Initialise FX sub-systems if vi_p2_fx.js is loaded
    if (typeof P2FX !== 'undefined') {
      this.particles = P2FX.createParticles(this.scene);
      this.sounds    = P2FX.createSounds();
      this.education = P2FX.createEducation();
    }
  },

  // ── Camera ────────────────────────────────────────────────────────────
  _updateCamera(dt) {
    if (!this.camera) return;
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

    this.camera.position.set(
      this._camX + this._camShake.x + sway,
      P2_CFG.CAMERA_Y_OFFSET + this._camShake.y,
      P2_CFG.CAMERA_Z_OFFSET
    );
    this.camera.lookAt(this._camX, 0, 15);

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

    // Power-up timer
    if (this.activePowerup) {
      this.activePowerup.timeLeft -= dt;
      if (this.activePowerup.timeLeft <= 0) this._endPowerup();
    }

    // Sub-systems (guarded: files loaded in later chunks)
    if (this.terrain)   this.terrain.update(dt, this.speed);
    if (this.player)    this.player.update(dt, this._keys, this.speed);
    if (this.walls)     this.walls.update(dt, this.speed);
    if (this.rbcs)      this.rbcs.update(dt, this.speed);
    if (this.receptors) this.receptors.update(dt, this.speed);
    if (this.obstacles) this.obstacles.update(dt, this.speed);
    if (this.powerups)  this.powerups.update(dt, this.speed);
    if (this.particles) this.particles.update(dt);
    if (this.education) this.education.update(dt);

    // Win / lose
    if (this.binding >= P2_CFG.BINDING_WIN) { this._triggerComplete(); return; }
    if (this.hp <= 0)                        { this._triggerDead('VIRUS NEUTRALIZED', 'The immune system destroyed the virus before it could attach to a host cell receptor.'); return; }
    if (this.alert >= 100)                   { this._triggerDead('IMMUNE ALERT', 'The adaptive immune response was fully activated. An antibody swarm was deployed.'); return; }

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
    this.hp    = Math.max(0, this.hp - amount);
    this.alert = Math.min(100, this.alert + alertGain);
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
    this._setState('COMPLETE');
    if (this.sounds) this.sounds.play('complete');
    const acc  = this.totalCollisions > 0 ? Math.round(this.correctCollected / this.totalCollisions * 100) : 100;
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
        if (this.state === 'INTRO')    this._startPlaying();
        if (this.state === 'COMPLETE') this._completeAndAdvance();
        if (this.state === 'DEAD')     this._retryRun();
        if (this.state === 'PAUSED')   this.resume();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') {
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
        if (this.state === 'INTRO')    { this._startPlaying(); return; }
        if (this.state === 'COMPLETE') { this._completeAndAdvance(); return; }
        if (this.state === 'DEAD')     { this._retryRun(); return; }
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
