// vi_p2_fx.js — Phase 2 Attachment: particles, sound, education
// Depends on: three.js r128, vi_p2_config.js, vi_p2_main.js
'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// P2ParticleSystem — burst pool + ambient cytoplasm drift
// ═══════════════════════════════════════════════════════════════════════════════

class P2ParticleSystem {

  constructor(scene) {
    this._scene = scene;
    this._bursts = [];   // pool of 80 sprite-based burst particles
    this._ambient = null; // THREE.Points — 60 drifting cytoplasm specks

    this._buildBurstPool();
    this._buildAmbient();
  }

  // ── Build ────────────────────────────────────────────────────────────────

  _buildBurstPool() {
    // Shared canvas texture (white radial gradient → additive blending)
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0,   'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    this._burstTex = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < 80; i++) {
      const mat = new THREE.SpriteMaterial({
        map:       this._burstTex,
        blending:  THREE.AdditiveBlending,
        depthWrite:false,
        transparent:true,
        opacity:   0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.4, 0.4, 1);
      sprite.visible = false;
      this._scene.add(sprite);
      this._bursts.push({ sprite, mat, active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.5 });
    }
  }

  _buildAmbient() {
    const N = 60;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random() - 0.5) * P2_CFG.CHUNK_WIDTH;
      pos[i*3+1] = Math.random() * 3;
      pos[i*3+2] = Math.random() * P2_CFG.CHUNK_LENGTH;
      // Dim cyan with slight variation
      col[i*3]   = 0.0 + Math.random() * 0.1;
      col[i*3+1] = 0.5 + Math.random() * 0.3;
      col[i*3+2] = 0.7 + Math.random() * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size:         0.12,
      vertexColors: true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
      transparent:  true,
      opacity:      0.55,
    });
    this._ambient = new THREE.Points(geo, mat);
    this._scene.add(this._ambient);
    this._ambientN = N;
  }

  // ── Public emit ──────────────────────────────────────────────────────────

  /**
   * Emit a burst of particles.
   * @param {number} x,y,z   - origin in world space
   * @param {number} count    - how many particles (clamped to pool)
   * @param {number} hexColor - e.g. 0x00ff88
   * @param {object} opts     - { speed:4, duration:0.5, gravity:3 }
   */
  emit(x, y, z, count, hexColor, opts = {}) {
    const speed    = opts.speed    || 4;
    const duration = opts.duration || 0.5;
    const gravity  = opts.gravity  !== undefined ? opts.gravity : 3;
    const r = ((hexColor >> 16) & 0xff) / 255;
    const g = ((hexColor >>  8) & 0xff) / 255;
    const b = ( hexColor        & 0xff) / 255;

    let spawned = 0;
    for (let i = 0; i < this._bursts.length && spawned < count; i++) {
      const p = this._bursts[i];
      if (p.active) continue;

      // Random spherical direction, biased upward
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI * 0.8; // upper hemisphere-ish
      p.vx = Math.sin(phi) * Math.cos(theta) * speed * (0.6 + Math.random() * 0.8);
      p.vy = Math.cos(phi) * speed * (0.6 + Math.random() * 0.8);
      p.vz = Math.sin(phi) * Math.sin(theta) * speed * (0.6 + Math.random() * 0.8);

      p.life    = duration * (0.7 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.active  = true;

      p.sprite.position.set(x, y, z);
      p.sprite.visible = true;
      p.mat.color.setRGB(r, g, b);
      p.mat.opacity = 1;
      spawned++;
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt) {
    // Burst particles
    for (let i = 0; i < this._bursts.length; i++) {
      const p = this._bursts[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.vx *= 0.92;
      p.vz *= 0.92;
      p.vy -= p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const ratio = p.life / p.maxLife;
      p.mat.opacity = ratio * ratio;  // quadratic fade-out
    }

    // Ambient speck drift (scroll with terrain)
    if (this._ambient) {
      const scrollDt = dt * (window.P2Attachment ? P2Attachment.speed * 8 : 8);
      const pos = this._ambient.geometry.attributes.position.array;
      for (let i = 0; i < this._ambientN; i++) {
        pos[i*3+2] -= scrollDt;
        // Twinkle: random lateral drift
        pos[i*3]   += (Math.random() - 0.5) * 0.015;
        pos[i*3+1] += (Math.random() - 0.5) * 0.010;
        // Wrap when behind camera
        if (pos[i*3+2] < -10) {
          pos[i*3]   = (Math.random() - 0.5) * P2_CFG.CHUNK_WIDTH;
          pos[i*3+1] = Math.random() * 3;
          pos[i*3+2] += P2_CFG.CHUNK_LENGTH;
        }
      }
      this._ambient.geometry.attributes.position.needsUpdate = true;
    }
  }

  reset() {
    this._bursts.forEach(p => {
      p.active = false;
      p.sprite.visible = false;
    });
  }

  destroy() {
    this._bursts.forEach(p => this._scene.remove(p.sprite));
    this._bursts = [];
    if (this._ambient) { this._scene.remove(this._ambient); this._ambient = null; }
    if (this._burstTex) { this._burstTex.dispose(); this._burstTex = null; }
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// P2SoundManager — Web Audio procedural SFX + background drone
// ═══════════════════════════════════════════════════════════════════════════════

class P2SoundManager {

  constructor() {
    this._ctx    = null;
    this._master = null;
    this._drone  = [];   // oscillator nodes (kept as fallback, unused when MP3 loads)
    this._ready  = false;

    // MP3 background music
    this._musicAudio = null;   // <audio> element
    this._musicSrc   = null;   // MediaElementAudioSourceNode
    this._musicGain  = null;   // GainNode for volume control

    // Lazy init: create AudioContext on first user gesture
    this._initHandler = () => { this._init(); };
    window.addEventListener('keydown',    this._initHandler, { once: true });
    window.addEventListener('touchstart', this._initHandler, { once: true });
  }

  _init() {
    if (this._ready) return;
    try {
      this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this._master = this._ctx.createGain();
      this._master.gain.value = 0.7;
      this._master.connect(this._ctx.destination);
      this._ready = true;
    } catch(e) {
      // Web Audio unavailable — fail silently
    }
  }

  // ── Background music (MP3) ───────────────────────────────────────────────

  startBgMusic() {
    if (!this._ready) return;
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();

    if (!this._musicAudio) {
      // First call: create <audio> element and route through Web Audio.
      // MediaElementSource can only be created once per element, so we
      // cache it and reuse on subsequent calls (retry / new game).
      const audio       = document.createElement('audio');
      audio.src         = 'p2/audio/Drip_to_the_Cell_Membrane.mp3';
      audio.loop        = true;
      audio.crossOrigin = 'anonymous';
      audio.preload     = 'auto';
      this._musicAudio  = audio;

      try {
        const src  = this._ctx.createMediaElementSource(audio);
        const gain = this._ctx.createGain();
        gain.gain.value = 0.55;
        src.connect(gain);
        gain.connect(this._master);
        this._musicSrc  = src;
        this._musicGain = gain;
      } catch(e) {
        // Web Audio routing failed — audio plays at system volume
      }
    }

    this._musicAudio.currentTime = 0;
    this._musicAudio.play().catch(() => {});
  }

  stopBgMusic() {
    if (!this._musicAudio) return;
    this._musicAudio.pause();
    this._musicAudio.currentTime = 0;
  }

  // ── Background drone (fallback, kept for reference) ───────────────────────

  startBgDrone() {
    if (!this._ready) return;
    this.stopBgDrone();
    const freqs = [60, 90];
    freqs.forEach(freq => {
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(this._master);
      osc.start();
      this._drone.push({ osc, gain });
    });
  }

  stopBgDrone() {
    this._drone.forEach(d => {
      try { d.osc.stop(); } catch(e) {}
      d.gain.disconnect();
    });
    this._drone = [];
  }

  // ── One-shot sounds ──────────────────────────────────────────────────────

  play(id) {
    if (!this._ready) return;
    const t = this._ctx.currentTime;
    switch (id) {
      case 'collect': this._playCollect(t);  break;
      case 'hit':     this._playHit(t);      break;
      case 'powerup': this._playPowerup(t);  break;
      case 'complete':this._playComplete(t); break;
      case 'dead':    this._playDead(t);     break;
    }
  }

  _playCollect(t) {
    // Ascending chime 440→660 Hz
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.linearRampToValueAtTime(660, t + 0.12);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(this._master);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  _playHit(t) {
    // Sawtooth burst 200 Hz + low sine 80 Hz
    [{ type: 'sawtooth', freq: 200, gain: 0.10 },
     { type: 'sine',     freq: 80,  gain: 0.14 }].forEach(({ type, freq, gain: gv }) => {
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gv, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this._master);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  _playPowerup(t) {
    // 4-note arpeggio 330/440/550/660 Hz
    [330, 440, 550, 660].forEach((freq, i) => {
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      const st   = t + i * 0.07;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.14, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
      osc.connect(gain);
      gain.connect(this._master);
      osc.start(st);
      osc.stop(st + 0.15);
    });
  }

  _playComplete(t) {
    // Major triad 440/554/660 Hz sustained 1s
    [440, 554, 660].forEach(freq => {
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.setValueAtTime(0.12, t + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      osc.connect(gain);
      gain.connect(this._master);
      osc.start(t);
      osc.stop(t + 1.15);
    });
  }

  _playDead(t) {
    // Descending 400→80 Hz
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.9);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(gain);
    gain.connect(this._master);
    osc.start(t);
    osc.stop(t + 1.05);
  }

  reset() {
    this.startBgDrone();
  }

  destroy() {
    this.stopBgMusic();
    this.stopBgDrone();
    window.removeEventListener('keydown',    this._initHandler);
    window.removeEventListener('touchstart', this._initHandler);
    if (this._musicSrc)  { try { this._musicSrc.disconnect();  } catch(e) {} this._musicSrc  = null; }
    if (this._musicGain) { try { this._musicGain.disconnect(); } catch(e) {} this._musicGain = null; }
    this._musicAudio = null;
    if (this._ctx) {
      try { this._ctx.close(); } catch(e) {}
      this._ctx = null;
    }
    this._master = null;
    this._ready  = false;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// P2EducationSystem — first-encounter facts + time-based tutorial hints
// ═══════════════════════════════════════════════════════════════════════════════

class P2EducationSystem {

  constructor() {
    this._seen    = {};   // id → true, deduplication
    this._factLog = [];   // { id, text } in order seen

    // Time-based hints: [ { t, id, text, fired } ]
    this._hints = [
      { t:  2.0, id: 'HINT_LANES',    text: '← → to switch lanes,  ↑ to jump,  ↓ to slide', fired: false },
      { t:  5.0, id: 'HINT_SIALIC',   text: 'Green 3-pronged receptors are sialic acid — collect them!', fired: false },
      { t:  9.0, id: 'HINT_OTHER',    text: 'Other receptor shapes are wrong-target — avoid or jump', fired: false },
      { t: 15.5, id: 'HINT_IMMUNE',   text: 'Immune defenses incoming — stay alert', fired: false },
    ];
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Record a first-encounter educational fact and show it as a ticker.
   * Subsequent calls with the same id are silently ignored.
   */
  // trigger(id, text)                               — ticker only
  // trigger(id, title, text)                        — modal card on first encounter
  // trigger(id, title, text, img, meshType, pdbId)  — full card with 3D preview + structure
  trigger(id, title, text, imgSrc, meshType, pdbId) {
    if (text === undefined) { text = title; title = null; }
    if (this._seen[id]) return;
    this._seen[id]  = true;
    this._factLog.push({ id, text });
    if (!window.P2Attachment) return;
    if (title) P2Attachment.showInfoCard(title, text, imgSrc, meshType, pdbId);
    else P2Attachment.showTicker(text, 3.5);
  }

  /** Called every frame from P2Attachment._updateGame(dt). */
  update(dt) {
    if (!window.P2Attachment || P2Attachment.state !== 'PLAYING') return;
    const elapsed = P2Attachment.elapsed;
    for (let i = 0; i < this._hints.length; i++) {
      const h = this._hints[i];
      if (!h.fired && elapsed >= h.t) {
        h.fired = true;
        this.trigger(h.id, h.text);
      }
    }
  }

  /** Returns a copy of the fact log for the complete screen. */
  getFactLog() { return this._factLog.slice(); }

  /** Returns how many unique facts have been triggered. */
  getSeenCount() { return this._factLog.length; }

  /** Returns true if id has been triggered at least once. */
  hasSeen(id) { return !!this._seen[id]; }

  reset() {
    this._seen    = {};
    this._factLog = [];
    this._hints.forEach(h => { h.fired = false; });
  }

  destroy() { this.reset(); }
}


// ═══════════════════════════════════════════════════════════════════════════════
// P2FX factory
// ═══════════════════════════════════════════════════════════════════════════════

const P2FX = {
  createParticles(scene)  { return new P2ParticleSystem(scene); },
  createSounds()          { return new P2SoundManager(); },
  createEducation()       { return new P2EducationSystem(); },
};
window.P2FX = P2FX;
