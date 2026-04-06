/**
 * vi_p1_audio.js — Phase 1 "Aerosol Odyssey" synthesized audio.
 *
 * All sounds are generated with Web Audio API — no external files.
 * AudioContext is created on the first init() call, which must happen
 * inside a user-gesture handler (the "CLICK TO BEGIN" button).
 *
 * API:
 *   P1Audio.init()              — create context (call on user click)
 *   P1Audio.startAmbient()      — begin looping classroom background
 *   P1Audio.stopAmbient()       — fade out + stop ambient
 *   P1Audio.playCough()         — cough burst SFX
 *   P1Audio.playHit()           — furniture collision thud
 *   P1Audio.playMaskHit()       — masked-student deflection (different tone)
 *   P1Audio.playWin()           — ascending arpeggio sting
 *   P1Audio.playFail()          — descending minor fall sting
 *   P1Audio.setBreathPhase(phase, proximity)
 *                               — 'inhale'|'exhale'|null, 0-1 proximity
 *   P1Audio.destroy()           — stop all, close context
 */

const P1Audio = (() => {

  let _ctx         = null;
  let _masterGain  = null;

  // Ambient nodes (kept for stop/cleanup)
  let _ambNodes    = [];
  let _ambRunning  = false;

  // Breath sound nodes (continuously adjusted)
  let _breathNoise = null;
  let _breathGain  = null;
  let _breathFilter = null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Create a mono white-noise AudioBuffer of the given duration.
  function _noiseBuffer(sec) {
    const n   = Math.ceil(_ctx.sampleRate * sec);
    const buf = _ctx.createBuffer(1, n, _ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // One-shot: noise → filter → envelope gain → master.
  // Returns nothing; nodes self-clean after `dur` seconds.
  function _noiseShot(dur, filterType, filterFreq, filterQ, peakGain, attackSec, decaySec) {
    if (!_ctx) return;
    const src = _ctx.createBufferSource();
    src.buffer = _noiseBuffer(dur + 0.05);

    const flt = _ctx.createBiquadFilter();
    flt.type            = filterType;
    flt.frequency.value = filterFreq;
    flt.Q.value         = filterQ;

    const env = _ctx.createGain();
    const t0  = _ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(peakGain, t0 + attackSec);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + attackSec + decaySec);

    src.connect(flt);
    flt.connect(env);
    env.connect(_masterGain);
    src.start(t0);
    src.stop(t0 + dur);
  }

  // One-shot sine tone with ADSR.
  function _toneShot(freq, startTime, dur, peakGain) {
    if (!_ctx) return;
    const osc = _ctx.createOscillator();
    osc.type            = 'sine';
    osc.frequency.value = freq;

    const env = _ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.025);
    env.gain.setValueAtTime(peakGain, startTime + dur - 0.06);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    osc.connect(env);
    env.connect(_masterGain);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.01);
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  function init() {
    if (_ctx) return;
    _ctx = new (window.AudioContext || window.webkitAudioContext)();

    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.75;
    _masterGain.connect(_ctx.destination);
  }

  // ── Ambient ────────────────────────────────────────────────────────────────
  // Three-layer classroom background:
  //   1. HVAC low-frequency hum   (60 Hz oscillator, very quiet)
  //   2. Ventilation air noise    (lowpass-filtered white noise, 400 Hz)
  //   3. Fluorescent fixture buzz (narrow band around 120 Hz)

  function startAmbient() {
    if (!_ctx || _ambRunning) return;
    _ambRunning = true;

    // 1. HVAC fundamental hum
    const hvacOsc = _ctx.createOscillator();
    hvacOsc.type = 'sawtooth';
    hvacOsc.frequency.setValueAtTime(58, _ctx.currentTime);
    // Slight slow wobble for naturalness
    hvacOsc.frequency.linearRampToValueAtTime(62, _ctx.currentTime + 4);
    hvacOsc.frequency.linearRampToValueAtTime(58, _ctx.currentTime + 8);

    const hvacLP = _ctx.createBiquadFilter();
    hvacLP.type = 'lowpass';
    hvacLP.frequency.value = 180;
    hvacLP.Q.value = 0.5;

    const hvacGain = _ctx.createGain();
    hvacGain.gain.value = 0.012;

    hvacOsc.connect(hvacLP);
    hvacLP.connect(hvacGain);
    hvacGain.connect(_masterGain);
    hvacOsc.start();
    _ambNodes.push(hvacOsc, hvacLP, hvacGain);

    // 2. Ventilation air (long noise buffer looped)
    const airSrc  = _ctx.createBufferSource();
    airSrc.buffer = _noiseBuffer(4.0);
    airSrc.loop   = true;

    const airLP = _ctx.createBiquadFilter();
    airLP.type = 'lowpass';
    airLP.frequency.value = 500;

    const airHP = _ctx.createBiquadFilter();
    airHP.type = 'highpass';
    airHP.frequency.value = 80;

    const airGain = _ctx.createGain();
    airGain.gain.value = 0;
    // Fade in gently
    airGain.gain.linearRampToValueAtTime(0.022, _ctx.currentTime + 1.5);

    airSrc.connect(airLP);
    airLP.connect(airHP);
    airHP.connect(airGain);
    airGain.connect(_masterGain);
    airSrc.start();
    _ambNodes.push(airSrc, airLP, airHP, airGain);

    // 3. Fluorescent buzz (120 Hz narrow band)
    const fluoOsc = _ctx.createOscillator();
    fluoOsc.type = 'square';
    fluoOsc.frequency.value = 120;

    const fluoBP = _ctx.createBiquadFilter();
    fluoBP.type = 'bandpass';
    fluoBP.frequency.value = 120;
    fluoBP.Q.value = 8;

    const fluoGain = _ctx.createGain();
    fluoGain.gain.value = 0.006;

    fluoOsc.connect(fluoBP);
    fluoBP.connect(fluoGain);
    fluoGain.connect(_masterGain);
    fluoOsc.start();
    _ambNodes.push(fluoOsc, fluoBP, fluoGain);

    // 4. Breath sound node (persistent, gain set to 0 until approach zone)
    const breathSrc  = _ctx.createBufferSource();
    breathSrc.buffer = _noiseBuffer(3.0);
    breathSrc.loop   = true;

    _breathFilter = _ctx.createBiquadFilter();
    _breathFilter.type = 'bandpass';
    _breathFilter.frequency.value = 900;
    _breathFilter.Q.value = 1.2;

    _breathGain = _ctx.createGain();
    _breathGain.gain.value = 0;

    breathSrc.connect(_breathFilter);
    _breathFilter.connect(_breathGain);
    _breathGain.connect(_masterGain);
    breathSrc.start();
    _breathNoise = breathSrc;
    _ambNodes.push(breathSrc, _breathFilter, _breathGain);
  }

  function stopAmbient() {
    if (!_ctx || !_ambRunning) return;
    _ambRunning = false;

    // Fade out master over 0.4s, then stop nodes
    const t = _ctx.currentTime;
    _masterGain.gain.setValueAtTime(_masterGain.gain.value, t);
    _masterGain.gain.linearRampToValueAtTime(0.0001, t + 0.4);

    setTimeout(() => {
      _ambNodes.forEach(n => { try { n.stop && n.stop(); n.disconnect && n.disconnect(); } catch(_) {} });
      _ambNodes = [];
      _breathNoise = null;
      _breathGain  = null;
      _breathFilter = null;
      if (_ctx) _masterGain.gain.value = 0.75;  // reset for next run
    }, 500);
  }

  // ── Sound effects ──────────────────────────────────────────────────────────

  // Cough: chest-thump low burst + expulsive bandpass airflow.
  function playCough() {
    if (!_ctx) return;
    // Chest thump (low, short)
    _noiseShot(0.30, 'lowpass',  260, 0.8, 0.40, 0.015, 0.28);
    // Airflow (bandpass, slightly longer)
    _noiseShot(0.45, 'bandpass', 1800, 0.7, 0.28, 0.025, 0.40);
    // High crack (simulates glottal stop)
    _noiseShot(0.08, 'highpass', 3500, 1.0, 0.15, 0.005, 0.07);
  }

  // Furniture hit: short low thud.
  function playHit() {
    if (!_ctx) return;
    _noiseShot(0.18, 'lowpass',  320, 1.2, 0.22, 0.008, 0.16);
    _noiseShot(0.10, 'bandpass', 700, 1.0, 0.10, 0.005, 0.09);
  }

  // Mask hit: sharper, higher thud (cloth + hard deflection).
  function playMaskHit() {
    if (!_ctx) return;
    _noiseShot(0.14, 'bandpass', 1200, 1.5, 0.28, 0.005, 0.12);
    _noiseShot(0.20, 'lowpass',  400,  0.8, 0.18, 0.010, 0.18);
  }

  // Win: A major arpeggio (A4 → C#5 → E5), bright and short.
  function playWin() {
    if (!_ctx) return;
    const t = _ctx.currentTime;
    _toneShot(440.0, t + 0.00, 0.22, 0.22);   // A4
    _toneShot(554.4, t + 0.18, 0.22, 0.22);   // C#5
    _toneShot(659.3, t + 0.36, 0.35, 0.28);   // E5  (held a bit longer)
    // Shimmer: high overtone
    _toneShot(1318.5, t + 0.38, 0.25, 0.10);  // E6
  }

  // Fail: descending A4→E4 with minor quality (sad but gentle).
  function playFail() {
    if (!_ctx) return;
    const t = _ctx.currentTime;
    _toneShot(440.0, t + 0.00, 0.30, 0.18);   // A4
    _toneShot(329.6, t + 0.22, 0.40, 0.18);   // E4 (down a fifth)
    // Low resonant thud for weight
    _noiseShot(0.35, 'lowpass', 200, 0.8, 0.12, 0.02, 0.30);
  }

  // Adjust breath sound based on proximity to target and breath phase.
  // phase: 'inhale' | 'exhale' | null
  // proximity: 0 (far) → 1 (right at target)
  function setBreathPhase(phase, proximity) {
    if (!_ctx || !_breathGain) return;
    const t = _ctx.currentTime;
    let targetGain = 0;

    if (phase === 'inhale' && proximity > 0) {
      targetGain = 0.06 * proximity;
      _breathFilter.frequency.setTargetAtTime(700, t, 0.1);
    } else if (phase === 'exhale' && proximity > 0) {
      targetGain = 0.04 * proximity;
      _breathFilter.frequency.setTargetAtTime(1200, t, 0.1);
    }

    _breathGain.gain.setTargetAtTime(targetGain, t, 0.15);
  }

  function setVolume(v) {
    if (!_ctx || !_masterGain) return;
    _masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), _ctx.currentTime, 0.05);
  }

  function destroy() {
    stopAmbient();
    setTimeout(() => {
      if (_ctx) {
        _ctx.close();
        _ctx = null;
        _masterGain = null;
      }
    }, 600);
  }

  return {
    init, startAmbient, stopAmbient,
    playCough, playHit, playMaskHit,
    playWin, playFail, setBreathPhase,
    setVolume, destroy,
  };

})();
