'use strict';
class P3DSoundManager {
  constructor() {
    this._ctx        = null;
    this._master     = null;
    this._drones     = [];  // {osc, gain}
    this._droneNoise = null;
    this._whooshSrc  = null;
    this._whooshGain = null;
    this._beatTimer  = 0;
    this._beatRate   = P3D_CFG.A1_BEAT_RATE_S;
    this._beatActive = false;
    this._paused     = false;

    // Act 1 background music
    this._a1Audio    = null;
    this._a1Gain     = null;
    this._a1Src      = null;   // MediaElementAudioSourceNode
  }

  // ── Context ──────────────────────────────────────────────────────────
  _getCtx() {
    if (this._ctx && this._ctx.state === 'running') return this._ctx;
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._master = this._ctx.createGain();
        this._master.gain.value = P3D_CFG.AUD_MASTER;
        this._master.connect(this._ctx.destination);
      } catch(e) { return null; }
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  // ── Act 1 ambient ─────────────────────────────────────────────────────
  startAmbient() {
    const ctx = this._getCtx(); if (!ctx) return;
    if (this._drones.length) return; // already started

    // Sine drone oscillators
    P3D_CFG.AUD_DRONE_FREQS.forEach(freq => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.value = P3D_CFG.AUD_DRONE_GAIN;
      osc.connect(gain); gain.connect(this._master); osc.start();
      this._drones.push({ osc, gain });
    });

    // Band-pass filtered noise for wet texture
    const buf  = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src  = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bpf  = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 600; bpf.Q.value = 1.0;
    const ng   = ctx.createGain(); ng.gain.value = P3D_CFG.AUD_NOISE_GAIN;
    src.connect(bpf); bpf.connect(ng); ng.connect(this._master); src.start();
    this._droneNoise = src;
  }

  startDescendWhoosh() {
    const ctx = this._getCtx(); if (!ctx || this._whooshSrc) return;
    const buf  = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src  = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bpf  = ctx.createBiquadFilter();
    bpf.type = 'bandpass'; bpf.frequency.value = 2000; bpf.Q.value = 0.8;
    this._whooshGain = ctx.createGain();
    this._whooshGain.gain.value = P3D_CFG.AUD_WHOOSH_GAIN_LO;
    src.connect(bpf); bpf.connect(this._whooshGain);
    this._whooshGain.connect(this._master); src.start();
    this._whooshSrc = src;
  }

  setDescendSpeed(frac) {
    if (!this._whooshGain || !this._ctx) return;
    const lo = P3D_CFG.AUD_WHOOSH_GAIN_LO, hi = P3D_CFG.AUD_WHOOSH_GAIN_HI;
    this._whooshGain.gain.setTargetAtTime(lo + frac * (hi - lo), this._ctx.currentTime, 0.1);
  }

  // Called each frame during Act 1 to manage heartbeat
  tickHeartbeat(dt, pH) {
    if (pH > P3D_CFG.A1_BEAT_PH_START) { this._beatActive = false; return; }
    this._beatActive = true;
    const frac  = Math.min(1, (P3D_CFG.A1_BEAT_PH_START - pH) / (P3D_CFG.A1_BEAT_PH_START - P3D_CFG.PH_ACT1_END));
    this._beatRate = P3D_CFG.A1_BEAT_RATE_S + frac * (P3D_CFG.A1_BEAT_RATE_E - P3D_CFG.A1_BEAT_RATE_S);
    this._beatTimer -= dt;
    if (this._beatTimer <= 0) {
      this._beatTimer = 1 / this._beatRate;
      this._playBeat(frac);
    }
  }

  _playBeat(frac) {
    const ctx = this._getCtx(); if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    const g    = P3D_CFG.AUD_BEAT_GAIN_S + frac * (P3D_CFG.AUD_BEAT_GAIN_E - P3D_CFG.AUD_BEAT_GAIN_S);
    osc.type = 'sine'; osc.frequency.value = P3D_CFG.AUD_BEAT_FREQ;
    gain.gain.setValueAtTime(g, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(gain); gain.connect(this._master);
    osc.start(); osc.stop(ctx.currentTime + 0.22);
  }

  // ── Act 1 SFX stubs (implemented in Chunk 3) ─────────────────────────
  playLysosomeHit()    { this._playImpact(60, 0.06); }
  playNearMiss()       { this._playSweep(3000, 1000, 0.15); }
  playCollectM2()      { this._playArp([440, 660], 0.04); }
  playCollectNS1()     { this._playArp([330, 550], 0.04); }
  playCollectHealth()  { this._playArp([550, 880], 0.04); }
  playMitoHit()        { this._playImpact(80, 0.04); }
  playPHCross(pH)      { this._playPHCross(pH); }

  _playImpact(freq, gain) {
    const ctx = this._getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = freq; osc.type = 'sine';
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(g); g.connect(this._master); osc.start(); osc.stop(ctx.currentTime + 0.17);
  }

  _playSweep(f1, f2, dur) {
    const ctx = this._getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f1, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(f2, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.015, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g); g.connect(this._master); osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
  }

  _playArp(freqs, gain) {
    const ctx = this._getCtx(); if (!ctx) return;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      g.gain.setValueAtTime(gain, ctx.currentTime + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.08 + 0.1);
      osc.connect(g); g.connect(this._master); osc.start(ctx.currentTime + i * 0.08); osc.stop(ctx.currentTime + i * 0.08 + 0.12);
    });
  }

  _playPHCross(pH) {
    const ctx = this._getCtx(); if (!ctx) return;
    [300, 400, 500].forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      g.gain.setValueAtTime(0.03, ctx.currentTime + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.1 + 0.12);
      osc.connect(g); g.connect(this._master); osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.14);
    });
  }

  // ── Act 2 SFX stubs ───────────────────────────────────────────────────
  playHit(lane, quality) {
    const ctx = this._getCtx(); if (!ctx) return;
    const freq = P3D_CFG.AUD_LANE_FREQS[lane] || 440;
    const gain = quality === 'perfect' ? P3D_CFG.AUD_HIT_P_GAIN : P3D_CFG.AUD_HIT_G_GAIN;
    this._playPing(freq, gain, quality === 'perfect' ? 0.08 : 0.04);
  }
  playMiss() { this._playImpact(100, P3D_CFG.AUD_MISS_GAIN); }
  playSync() {
    const ctx = this._getCtx(); if (!ctx) return;
    P3D_CFG.AUD_LANE_FREQS.forEach((f, i) => {
      setTimeout(() => this._playPing(f, P3D_CFG.AUD_SYNC_GAIN / 3, 0.15), i * 10);
    });
  }
  playABBuzz() {
    const ctx = this._getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 200;
    g.gain.setValueAtTime(P3D_CFG.AUD_BUZZ_GAIN, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(g); g.connect(this._master); osc.start(); osc.stop(ctx.currentTime + 0.14);
  }
  playHATransition() { this._playImpact(80, 0.04); }

  // ── Act 1 background music ────────────────────────────────────────────

  startA1Music() {
    const ctx = this._getCtx(); if (!ctx) return;
    if (this._a1Audio) return;   // already started

    const audio = document.createElement('audio');
    audio.src     = 'p3/act2/audio/Endosomal_Descent.mp3';
    audio.preload = 'auto';
    audio.loop    = false;
    this._a1Audio = audio;

    try {
      this._a1Src  = ctx.createMediaElementSource(audio);
      this._a1Gain = ctx.createGain();
      this._a1Gain.gain.value = 0.75;
      this._a1Src.connect(this._a1Gain);
      this._a1Gain.connect(this._master);
    } catch(e) {
      console.warn('[A1Music] Web Audio routing failed:', e);
      this._a1Gain = null;
      this._a1Src  = null;
    }

    audio.play().catch(e => console.warn('[A1Music] play() blocked:', e));
  }

  fadeA1Music(fadeDur = 1.5) {
    if (!this._a1Audio) return;
    if (this._a1Gain && this._ctx) {
      const now = this._ctx.currentTime;
      this._a1Gain.gain.cancelScheduledValues(now);
      this._a1Gain.gain.setValueAtTime(this._a1Gain.gain.value, now);
      this._a1Gain.gain.linearRampToValueAtTime(0.0001, now + fadeDur);
    }
  }

  stopA1Music() {
    if (!this._a1Audio) return;
    this._a1Audio.pause();
    this._a1Audio = null;
    if (this._a1Src) { try { this._a1Src.disconnect(); } catch(e) {} this._a1Src = null; }
    this._a1Gain = null;
  }

  _playPing(freq, gain, dur) {
    const ctx = this._getCtx(); if (!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g); g.connect(this._master); osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
  }

  // ── Act 3 SFX stubs ───────────────────────────────────────────────────
  playVRNPExit(idx) {
    const f = P3D_CFG.AUD_VRNP_FREQS[idx] || 440;
    this._playPing(f, P3D_CFG.AUD_VRNP_GAIN, 0.2);
  }
  playNPCTransit(idx) {
    const f = P3D_CFG.AUD_VRNP_FREQS[idx] || 440;
    this._playPing(f, P3D_CFG.AUD_VRNP_GAIN, 0.25);
  }
  playFinalChord() {
    const ctx = this._getCtx(); if (!ctx) return;
    P3D_CFG.AUD_VRNP_FREQS.forEach((f, i) => {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      g.gain.setValueAtTime(0.03, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      osc.connect(g); g.connect(this._master); osc.start(); osc.stop(ctx.currentTime + 1.6);
    });
  }
  playPhaseComplete() { this._playArp([261, 330, 392, 523], 0.035); }

  // ── Fusion cinematic SFX (stubs filled in Chunk 6) ────────────────────
  playFusionPeptideInsert() { this._playImpact(100, 0.04); }
  playJackknife()           { /* low bass groan — Chunk 6 */ }
  playHemifusion()          { this._playPing(440, 0.04, 0.3); }
  playPoreOpen()            { this._playImpact(35, 0.08); }

  // ── Shared context access (for A2SMBSynth) ───────────────────────────
  get audioCtx() { return this._getCtx(); }

  // Fade the master gain to targetGain over rampSec seconds.
  // Used by A2SMBSynth to avoid audible clicks on card pause/resume.
  fadeMasterGain(targetGain, rampSec) {
    const ctx = this._getCtx(); if (!ctx || !this._master) return;
    const now = ctx.currentTime;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setValueAtTime(this._master.gain.value, now);
    this._master.gain.linearRampToValueAtTime(targetGain, now + rampSec);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  pause() {
    if (this._ctx && this._ctx.state === 'running') this._ctx.suspend();
    if (this._a1Audio) this._a1Audio.pause();
    this._paused = true;
  }
  resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
    if (this._a1Audio) this._a1Audio.play().catch(() => {});
    this._paused = false;
  }
  stopAmbient() {
    this._drones.forEach(d => { try { d.osc.stop(); } catch(e) {} });
    this._drones = [];
    if (this._droneNoise) { try { this._droneNoise.stop(); } catch(e) {} this._droneNoise = null; }
    if (this._whooshSrc)  { try { this._whooshSrc.stop();  } catch(e) {} this._whooshSrc  = null; }
    this._whooshGain = null;
    this.stopA1Music();
  }
  destroy() {
    this.stopAmbient();
    if (this._ctx) { this._ctx.close(); this._ctx = null; this._master = null; }
  }
}
