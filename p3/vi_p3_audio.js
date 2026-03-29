// vi_p3_audio.js — P3Audio: synthesized sound effects via Web Audio API
// No external audio files — all sounds are generated programmatically.
// Depends on: vi_p3_config.js, vi_p3_main.js
'use strict';

class P3Audio {

  constructor(cfg) {
    this._cfg    = cfg;
    this._ctx    = null;   // AudioContext — created lazily on first play call
    this._paused = false;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  pause()  { this._paused = true; }
  resume() { this._paused = false; }

  // Brief notification tone when the endosomal pH crosses a threshold.
  // Frequency drops as pH falls — acidification sounds progressively harsher.
  playPHCrossing(pH) {
    if (this._paused) return;
    const ctx = this._ctx_();
    if (!ctx) return;

    const t = ctx.currentTime;
    const freqMap = { 6.5: 540, 6.0: 360, 5.5: 250, 5.0: 170 };
    const freq = freqMap[pH] || 300;

    // Sine + triangle blend for organic, non-digital texture
    this._osc(ctx, 'sine',     freq,       0.13, t,        0.06, 0.50);
    this._osc(ctx, 'triangle', freq * 1.5, 0.06, t + 0.01, 0.05, 0.65);
  }

  // Game-over sound — three descending dissonant sawtooth tones.
  playGameOver(/* reason */) {
    if (this._paused) return;
    const ctx = this._ctx_();
    if (!ctx) return;

    const t = ctx.currentTime;
    this._osc(ctx, 'sawtooth', 185, 0.18, t,        0.04, 1.10);
    this._osc(ctx, 'sawtooth', 147, 0.16, t + 0.22, 0.04, 0.95);
    this._osc(ctx, 'sawtooth', 116, 0.20, t + 0.48, 0.04, 1.30);
  }

  // Phase-complete sound — ascending major arpeggio (C4 E4 G4 C5).
  playPhaseComplete() {
    if (this._paused) return;
    const ctx = this._ctx_();
    if (!ctx) return;

    const t     = ctx.currentTime;
    const notes = [262, 330, 392, 523];
    notes.forEach((freq, i) => {
      this._osc(ctx, 'sine',     freq,      0.16, t + i * 0.13, 0.04, 0.45);
      this._osc(ctx, 'triangle', freq * 2,  0.05, t + i * 0.13, 0.03, 0.30);
    });
    // Low sustain pad underneath
    this._osc(ctx, 'triangle', 131, 0.09, t, 0.12, 0.85);
  }

  destroy() {
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {});
    }
    this._ctx = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Lazy AudioContext creation with autoplay-policy resume.
  _ctx_() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx.state === 'running' ? this._ctx : null;
  }

  // Schedule a short enveloped oscillator burst.
  // type, freq, gain, startTime, attack (s), decay (s)
  _osc(ctx, type, freq, gain, startTime, attack, decay) {
    try {
      const osc  = ctx.createOscillator();
      const env  = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      env.gain.setValueAtTime(0, startTime);
      env.gain.linearRampToValueAtTime(gain, startTime + attack);
      env.gain.exponentialRampToValueAtTime(1e-4, startTime + attack + decay);

      osc.connect(env);
      env.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + attack + decay + 0.05);
    } catch (e) { /* ignore — audio is non-critical */ }
  }
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.audio) {
  P3Escape.audio = new P3Audio(P3_CFG);
}
