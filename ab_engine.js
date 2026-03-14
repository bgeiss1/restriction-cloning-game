/**
 * ab_engine.js — Game loop, spawning, physics, collision, wave management
 *
 * Depends on: ab_sprites.js (ABSprites)
 * Exports global: ABEngine
 *
 * Coordinate system:
 *   (0,0) = top-left of canvas.  +x = right, +y = down.
 *   Pathogens spawn at x = W + margin, travel left toward x = 0.
 *   Player fires from the left side.  AB_FIRE_X is the x-position of the fire zone.
 */

const ABEngine = (() => {

  /* ── Canvas & context ─────────────────────────────────────────────── */
  let canvas, ctx, W, H;

  /* ── Game state ───────────────────────────────────────────────────── */
  let _running      = false;
  let _rafId        = null;
  let _tick         = 0;       // frame counter for background animation
  let _tutorialMode = false;   // true while tutorial is active
  let _tutStopX     = 0;       // x where tutorial pathogen freezes

  /* ── Entities ─────────────────────────────────────────────────────── */
  let pathogens  = [];      // active pathogens
  let projectiles = [];     // flying antibodies
  let particles  = [];      // hit/burst particles
  let bursts     = [];      // neutralize burst rings { x, y, progress, color }
  let missMarks  = [];      // { x, y, alpha } — red X on miss

  /* ── Wave state ───────────────────────────────────────────────────── */
  let wave           = 1;
  let spawnTimer     = 0;   // frames until next spawn
  let spawnInterval  = 180; // frames between spawns (decreases each wave)
  let waveKillTarget = 5;   // kills to advance the wave
  let waveKills      = 0;
  let waveLock       = false; // true while between-wave pause
  let waveLockTimer  = 0;

  /* ── Player / score ───────────────────────────────────────────────── */
  let score      = 0;
  let kills      = 0;
  let health     = 100;     // 0–100
  let iggCount   = 0;
  let _isIgG     = false;   // active antibody type
  let _epitopeIdx = 0;      // index into EPITOPE_KEYS (current target)

  /* ── Fire cooldown ───────────────────────────────────────────────── */
  let fireCooldown = 0;     // frames remaining before player can fire again
  const FIRE_COOLDOWN_FRAMES = 22;

  /* ── External callback hooks ──────────────────────────────────────── */
  let onScoreChange  = () => {};
  let onHealthChange = () => {};
  let onWaveChange   = () => {};
  let onIgGChange    = () => {};
  let onGameOver     = () => {};
  let onWaveBanner   = () => {};
  let onIgGPickup    = () => {};

  /* ─────────────────────────────────────────────────────────────────── */
  /*  WAVE CONFIG                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  function waveConfig(w) {
    const epitopeCount = Math.min(1 + Math.floor((w - 1) / 2), ABSprites.EPITOPE_KEYS.length);
    const decoyChance  = w >= 4 ? Math.min(0.55, (w - 3) * 0.15) : 0;
    const speed        = 0.65 + (w - 1) * 0.15;
    const hp           = 3 + Math.floor((w - 1) * 0.8);       // IgM hits to kill
    const spawnDelay   = Math.max(55, 180 - (w - 1) * 18);    // frames between spawns
    const killTarget   = 5 + (w - 1) * 2;
    const iggChance    = 0.12 + (w - 1) * 0.025;              // chance of IgG power-up drop

    return { epitopeCount, decoyChance, speed, hp, spawnDelay, killTarget, iggChance };
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  INIT / RESIZE                                                       */
  /* ─────────────────────────────────────────────────────────────────── */

  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  RESET                                                               */
  /* ─────────────────────────────────────────────────────────────────── */

  function reset() {
    pathogens   = [];
    projectiles = [];
    particles   = [];
    bursts      = [];
    missMarks   = [];

    wave           = 1;
    score          = 0;
    kills          = 0;
    health         = 100;
    iggCount       = 0;
    _isIgG         = false;
    _epitopeIdx    = 0;
    fireCooldown   = 0;
    waveKills      = 0;
    waveLock       = false;
    waveLockTimer  = 0;
    _tick          = 0;

    const cfg      = waveConfig(wave);
    spawnInterval  = cfg.spawnDelay;
    spawnTimer     = 60;  // short initial delay
    waveKillTarget = cfg.killTarget;
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  TUTORIAL MODE                                                       */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Enable or disable tutorial mode.
   * When enabled: spawns one slow pathogen that freezes at center-right.
   * When disabled: unfreezes it and resumes normal spawning.
   * @param {boolean} on
   * @param {string}  epitopeType  epitope shown on the tutorial pathogen
   */
  function setTutorialMode(on, epitopeType = 'tri') {
    _tutorialMode = on;
    if (on) {
      spawnTimer = 999999;       // block normal spawning while tutorial runs
      _tutStopX  = W * 0.58;
      const r    = 30;
      pathogens.push({
        x:         W + r + 20,
        y:         H * 0.48,
        r,
        vx:        -0.55,
        vy:        0,
        colorIdx:  0,
        spikes:    Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2),
        epitopes:  [{ type: epitopeType, angle: -0.5, isDecoy: false }],
        realType:  epitopeType,
        hp:        3,
        maxHp:     3,
        hitFlash:  0,
        scale:     1,
        iggDrop:   true,         // guarantee IgG drop to teach that mechanic
        isTutorial: true,
        id:        'tutorial',
      });
    } else {
      // Unfreeze tutorial pathogen, resume spawning
      for (const p of pathogens) {
        if (p.isTutorial) { p.isTutorial = false; p.vx = -0.65; }
      }
      if (spawnTimer > 999) spawnTimer = 80;
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PATHOGEN FACTORY                                                    */
  /* ─────────────────────────────────────────────────────────────────── */

  function spawnPathogen() {
    const cfg  = waveConfig(wave);
    const r    = 22 + Math.random() * 14;
    const y    = 62 + r + Math.random() * (H - 62 - r * 2 - 40);

    // Choose epitope types for this pathogen
    const availKeys = ABSprites.EPITOPE_KEYS.slice(0, cfg.epitopeCount);
    const realType  = availKeys[Math.floor(Math.random() * availKeys.length)];

    // Build epitope list: 1 real + 0–2 decoys based on wave
    const epitopes = [];
    const realAngle = Math.random() * Math.PI * 2;
    epitopes.push({ type: realType, angle: realAngle, isDecoy: false });

    if (cfg.decoyChance > 0) {
      const decoyCount = Math.random() < cfg.decoyChance ? (Math.random() < 0.4 ? 2 : 1) : 0;
      const takenAngles = [realAngle];
      for (let d = 0; d < decoyCount; d++) {
        let decoyType;
        do { decoyType = availKeys[Math.floor(Math.random() * availKeys.length)]; }
        while (decoyType === realType);

        let decoyAngle;
        let tries = 0;
        do {
          decoyAngle = Math.random() * Math.PI * 2;
          tries++;
        } while (tries < 20 && takenAngles.some(a => Math.abs(angDiff(a, decoyAngle)) < 0.9));
        takenAngles.push(decoyAngle);
        epitopes.push({ type: decoyType, angle: decoyAngle, isDecoy: true });
      }
    }

    // Spike positions
    const spikeCount = 7 + Math.floor(Math.random() * 5);
    const spikes = Array.from({ length: spikeCount }, (_, i) =>
      (i / spikeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
    );

    pathogens.push({
      x:         W + r + 20,
      y,
      r,
      vx:        -(cfg.speed * (0.85 + Math.random() * 0.3)),
      vy:        (Math.random() - 0.5) * 0.4,
      colorIdx:  Math.floor(Math.random() * ABSprites.PATHOGEN_COLORS.length),
      spikes,
      epitopes,
      realType,
      hp:        cfg.hp,
      maxHp:     cfg.hp,
      hitFlash:  0,
      scale:     1,
      iggDrop:   Math.random() < cfg.iggChance,
      id:        _tick + Math.random(),
    });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PARTICLE FACTORIES                                                  */
  /* ─────────────────────────────────────────────────────────────────── */

  function spawnHitParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 2.5;
      particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 2 + Math.random() * 3,
        color,
        alpha: 0.9,
        decay: 0.035 + Math.random() * 0.02,
        shape: 'circle',
      });
    }
  }

  function spawnNeutralizeParticles(x, y, color) {
    // Big burst of stars + circles
    for (let i = 0; i < 22; i++) {
      const a   = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 2.5 + Math.random() * 4;
      const shape = Math.random() < 0.4 ? 'star' : 'circle';
      particles.push({
        x, y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        r: 3 + Math.random() * 4,
        color: Math.random() < 0.5 ? color : '#fff',
        alpha: 1,
        decay: 0.025 + Math.random() * 0.015,
        shape,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.15,
      });
    }
    // Ring burst
    bursts.push({ x, y, progress: 0, color });
  }

  function spawnMissParticles(x, y) {
    missMarks.push({ x, y, alpha: 1 });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x, y,
        vx: Math.cos(a) * (1 + Math.random()),
        vy: Math.sin(a) * (1 + Math.random()),
        r: 2 + Math.random() * 2,
        color: '#EF5350',
        alpha: 0.8,
        decay: 0.055,
        shape: 'ring',
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  FIRE                                                                */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Fire the current antibody toward the nearest valid pathogen.
   * Called by ab_game.js on tap.
   * Returns true if a shot was fired.
   */
  function fire() {
    if (!_running || fireCooldown > 0) return false;

    const currentEpitope = ABSprites.EPITOPE_KEYS[_epitopeIdx];
    const isIgG = _isIgG;

    // Find nearest pathogen in front of the fire zone
    const fireX = getFireX();
    const fireY = H / 2;

    let target = null;
    let best = Infinity;
    for (const p of pathogens) {
      if (p.x < fireX - p.r) continue;  // already past player
      const dx = p.x - fireX;
      const dy = p.y - fireY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { best = d; target = p; }
    }

    if (!target) return false;

    const dx = target.x - fireX;
    const dy = target.y - fireY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 9;

    projectiles.push({
      x: fireX,
      y: fireY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      type: isIgG ? 'igg' : 'igm',
      epitopeType: currentEpitope,
      targetId: target.id,
      alpha: 1,
      trail: [],
      spin: 0,        // IgM rotates slowly while in flight
    });

    if (isIgG) {
      iggCount--;
      if (iggCount <= 0) { iggCount = 0; _isIgG = false; }
      onIgGChange(iggCount);
    }

    fireCooldown = FIRE_COOLDOWN_FRAMES;
    return true;
  }

  function getFireX() {
    // Fire zone: right edge of the antibody selector panel (72px) + some padding
    return 88;
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  INPUT HELPERS (called by ab_game.js)                               */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Toggle between IgM (pentamer, 3 hits) and IgG (monomer, 1-shot).
   * Switch to IgG only when charges are available; auto-reverts to IgM at 0.
   * Returns the new isotype string: 'igm' | 'igg'
   */
  function toggleIsotype() {
    if (_isIgG) {
      _isIgG = false;
    } else if (iggCount > 0) {
      _isIgG = true;
    }
    onIgGChange(iggCount);  // trigger label refresh
    return _isIgG ? 'igg' : 'igm';
  }

  function currentEpitopeType() {
    return ABSprites.EPITOPE_KEYS[_epitopeIdx];
  }

  function isIgGActive() { return _isIgG; }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  COLLISION DETECTION                                                 */
  /* ─────────────────────────────────────────────────────────────────── */

  function checkCollisions() {
    for (let pi = projectiles.length - 1; pi >= 0; pi--) {
      const proj = projectiles[pi];
      let hit = false;

      for (let ei = pathogens.length - 1; ei >= 0; ei--) {
        const p = pathogens[ei];
        const dx = proj.x - p.x;
        const dy = proj.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > p.r + 12) continue;  // no collision

        hit = true;
        const hitColor = proj.type === 'igg' ? '#C8A951' : '#4D96FF';

        // Any antibody damages any pathogen — isotype determines how many hits
        const dmg = proj.type === 'igg' ? p.hp : 1;   // IgG = instant neutralize
        p.hp -= dmg;
        p.hitFlash = 1;

        if (p.hp <= 0) {
          // NEUTRALIZED
          spawnNeutralizeParticles(p.x, p.y, hitColor);
          const baseScore = 10 * wave;
          score += proj.type === 'igg' ? baseScore * 2 : baseScore;
          kills++;
          waveKills++;

          if (p.iggDrop) {
            iggCount++;
            onIgGPickup(p.x, p.y);
            onIgGChange(iggCount);
          }

          pathogens.splice(ei, 1);
        } else {
          spawnHitParticles(p.x, p.y, hitColor);
        }
        onScoreChange(score);
        break;
      }

      if (hit) {
        projectiles.splice(pi, 1);
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  MAIN UPDATE                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  function update() {
    _tick++;

    if (fireCooldown > 0) fireCooldown--;

    // ── Wave lock (between-wave pause) ───────────────────────────────
    if (waveLock) {
      waveLockTimer--;
      if (waveLockTimer <= 0) {
        waveLock = false;
        wave++;
        const cfg = waveConfig(wave);
        spawnInterval  = cfg.spawnDelay;
        waveKills      = 0;
        waveKillTarget = cfg.killTarget;
        onWaveChange(wave);
        onWaveBanner(wave);
        // Expand active epitope pool — but don't reset epitopeIdx
        _epitopeIdx = Math.min(_epitopeIdx, cfg.epitopeCount - 1);
      }
      return; // don't spawn or move during transition
    }

    // ── Spawning ─────────────────────────────────────────────────────
    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnPathogen();
      spawnTimer = spawnInterval + Math.floor(Math.random() * 30) - 15;
    }

    // ── Move pathogens ────────────────────────────────────────────────
    for (let i = pathogens.length - 1; i >= 0; i--) {
      const p = pathogens[i];

      // Tutorial pathogen: freeze at target x, no sinusoidal drift
      if (p.isTutorial) {
        if (p.x > _tutStopX) {
          p.x += p.vx;
        } else {
          p.x = _tutStopX;
          p.vx = 0;
        }
        if (p.hitFlash > 0) p.hitFlash -= 0.1;
        continue;
      }

      // Slight sinusoidal drift
      p.vy += Math.sin(_tick * 0.04 + i) * 0.015;
      p.vy  = clamp(p.vy, -0.8, 0.8);
      p.x  += p.vx;
      p.y  += p.vy;

      // Bounce off top/bottom (below HUD and above health bar)
      if (p.y - p.r < 56)  { p.y = 56  + p.r; p.vy = Math.abs(p.vy); }
      if (p.y + p.r > H - 44) { p.y = H - 44 - p.r; p.vy = -Math.abs(p.vy); }

      // Decay hit flash
      if (p.hitFlash > 0) p.hitFlash -= 0.1;

      // Pathogen reached player — damage host
      if (p.x < -p.r) {
        const dmg = 8 + Math.floor(wave * 2);
        health = Math.max(0, health - dmg);
        onHealthChange(health);
        pathogens.splice(i, 1);
        if (health <= 0) {
          gameOver();
          return;
        }
      }
    }

    // ── Move projectiles ──────────────────────────────────────────────
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i];
      // Save trail point
      proj.trail.push({ x: proj.x, y: proj.y });
      if (proj.trail.length > 7) proj.trail.shift();

      proj.x += proj.vx;
      proj.y += proj.vy;
      if (proj.type === 'igm') proj.spin += 0.06;  // IgM pentamer spins in flight

      // Remove if off-screen
      if (proj.x > W + 30 || proj.x < -30 || proj.y < 0 || proj.y > H) {
        projectiles.splice(i, 1);
      }
    }

    // ── Collisions ────────────────────────────────────────────────────
    checkCollisions();

    // ── Particles ─────────────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x    += p.vx;
      p.y    += p.vy;
      p.vx   *= 0.93;
      p.vy   *= 0.93;
      p.alpha -= p.decay;
      if (p.rot !== undefined) p.rot += p.rotV;
      if (p.alpha <= 0) particles.splice(i, 1);
    }

    // ── Bursts ────────────────────────────────────────────────────────
    for (let i = bursts.length - 1; i >= 0; i--) {
      bursts[i].progress += 0.035;
      if (bursts[i].progress >= 1) bursts.splice(i, 1);
    }

    // ── Miss marks ────────────────────────────────────────────────────
    for (let i = missMarks.length - 1; i >= 0; i--) {
      missMarks[i].alpha -= 0.04;
      if (missMarks[i].alpha <= 0) missMarks.splice(i, 1);
    }

    // ── Wave advancement ──────────────────────────────────────────────
    if (waveKills >= waveKillTarget && !waveLock) {
      waveLock      = true;
      waveLockTimer = 90; // ~1.5s pause between waves
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  RENDER                                                              */
  /* ─────────────────────────────────────────────────────────────────── */

  function render() {
    ABSprites.drawBackground(ctx, W, H, _tick);

    // Pathogens
    for (const p of pathogens) ABSprites.drawPathogen(ctx, p);

    // Neutralize bursts
    for (const b of bursts) ABSprites.drawNeutralizeBurst(ctx, b.x, b.y, b.progress, b.color);

    // Particles
    ABSprites.drawParticles(ctx, particles);

    // Miss marks
    for (const m of missMarks) ABSprites.drawMissX(ctx, m.x, m.y, 10, m.alpha);

    // Projectiles
    for (const proj of projectiles) ABSprites.drawProjectile(ctx, proj);

    // Fire-zone indicator (right edge of selector)
    const pulse = (Math.sin(_tick * 0.08) + 1) / 2;
    const canFire = fireCooldown === 0 && pathogens.length > 0;
    ABSprites.drawFireRing(ctx, getFireX(), H / 2, 28, canFire, pulse);

    // Selector canvas
    const selCanvas = document.getElementById('abSelectorCanvas');
    if (selCanvas) {
      const sCtx = selCanvas.getContext('2d');
      ABSprites.drawSelector(sCtx, _isIgG);
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  GAME LOOP                                                           */
  /* ─────────────────────────────────────────────────────────────────── */

  function loop() {
    if (!_running) return;
    update();
    render();
    _rafId = requestAnimationFrame(loop);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  GAME OVER                                                           */
  /* ─────────────────────────────────────────────────────────────────── */

  function gameOver() {
    _running = false;
    cancelAnimationFrame(_rafId);
    onGameOver({ score, wave, kills });
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PUBLIC API                                                          */
  /* ─────────────────────────────────────────────────────────────────── */

  function start(callbacks) {
    _setCallbacks(callbacks);
    resize();
    reset();
    _running = true;
    loop();
    onWaveBanner(1);
    onWaveChange(1);
    onHealthChange(100);
    onScoreChange(0);
    onIgGChange(0);
  }

  function pause() {
    _running = false;
    cancelAnimationFrame(_rafId);
  }

  function resume() {
    if (_running) return;
    _running = true;
    loop();
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_rafId);
  }

  function _setCallbacks(cb) {
    if (!cb) return;
    if (cb.onScoreChange)  onScoreChange  = cb.onScoreChange;
    if (cb.onHealthChange) onHealthChange = cb.onHealthChange;
    if (cb.onWaveChange)   onWaveChange   = cb.onWaveChange;
    if (cb.onIgGChange)    onIgGChange    = cb.onIgGChange;
    if (cb.onGameOver)     onGameOver     = cb.onGameOver;
    if (cb.onWaveBanner)   onWaveBanner   = cb.onWaveBanner;
    if (cb.onIgGPickup)    onIgGPickup    = cb.onIgGPickup;
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  UTILITY                                                             */
  /* ─────────────────────────────────────────────────────────────────── */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function angDiff(a, b) {
    let d = ((b - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    return d;
  }

  return {
    init,
    start,
    pause,
    resume,
    stop,
    fire,
    toggleIsotype,
    isIgGActive,
    setTutorialMode,
    getState: () => ({ score, wave, kills, health, iggCount }),
  };

})();
