/**
 * vi_p4_sound.js — Phase 4 procedural Web Audio (Chunk 9).
 *
 * All sounds are synthesised with the Web Audio API — no audio files.
 * The AudioContext is created lazily on first user interaction.
 *
 * Ambient layer:
 *   Nuclear drone  : 65 + 98 + 130 Hz sine oscillators, low gain
 *   Activity hum   : 220 Hz, scales with active transcription count
 *   Antiviral bass : 40 Hz sawtooth (lowpass), ramps in from ISG 50 %
 *
 * Event sounds fire via the p4EduTrigger CustomEvent listener — no edits
 * to other modules needed.
 *
 * [M] key toggles master mute.
 *
 * API:
 *   P4Sound.init()          — call once; safe to call multiple times
 *   P4Sound.tick(dt)        — update ambient layer
 *   P4Sound.destroy()       — stop and disconnect all nodes
 *   P4Sound.play(name)      — play a named one-shot sound
 */

/* global P4_CFG, P4Transcription, P4Antiviral */

const P4Sound = (() => {

  let _ctx    = null;
  let _master = null;
  let _muted  = false;

  // Ambient nodes (created on first init)
  let _droneGain   = null;
  let _actOsc      = null, _actGain   = null;
  let _antiOsc     = null, _antiGain  = null;
  let _droneNodes  = [];   // {osc, g}

  let _t = 0;
  let _eduListener = null;

  // ── AudioContext bootstrap ────────────────────────────────────────────────

  function _boot() {
    if (_ctx) {
      // Resume suspended context (browser auto-suspend policy)
      if (_ctx.state === 'suspended') _ctx.resume();
      return;
    }
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }

    _master = _ctx.createGain();
    _master.gain.value = 0.70;
    _master.connect(_ctx.destination);

    // ── Nuclear drone ─────────────────────────────────────────────────────
    _droneGain = _ctx.createGain();
    _droneGain.gain.value = 0;
    _droneGain.connect(_master);

    const droneFreqs  = [65, 98, 130];
    const droneGains  = [0.30, 0.18, 0.10];
    for (let i = 0; i < droneFreqs.length; i++) {
      const osc = _ctx.createOscillator();
      const g   = _ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = droneFreqs[i];
      g.gain.value = droneGains[i];
      osc.connect(g); g.connect(_droneGain);
      osc.start();
      _droneNodes.push({ osc, g });
    }
    // Fade drone in over 3 s
    _droneGain.gain.setTargetAtTime(0.06, _ctx.currentTime, 1.0);

    // ── Activity hum ──────────────────────────────────────────────────────
    _actGain = _ctx.createGain();
    _actGain.gain.value = 0;
    _actGain.connect(_master);
    _actOsc  = _ctx.createOscillator();
    _actOsc.type = 'sine';
    _actOsc.frequency.value = 220;
    _actOsc.connect(_actGain);
    _actOsc.start();

    // ── Antiviral bass pulse ──────────────────────────────────────────────
    _antiGain = _ctx.createGain();
    _antiGain.gain.value = 0;
    _antiGain.connect(_master);

    const antiFilter = _ctx.createBiquadFilter();
    antiFilter.type = 'lowpass';
    antiFilter.frequency.value = 90;
    antiFilter.connect(_antiGain);

    _antiOsc = _ctx.createOscillator();
    _antiOsc.type = 'sawtooth';
    _antiOsc.frequency.value = 40;
    _antiOsc.connect(antiFilter);
    _antiOsc.start();
  }

  // ── Sound primitives ──────────────────────────────────────────────────────

  /** Single-oscillator envelope */
  function _tone(freq, dur, type, gain, att, rel) {
    if (!_ctx || _muted) return;
    const now = _ctx.currentTime;
    const osc = _ctx.createOscillator();
    const g   = _ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + (att || 0.005));
    g.gain.setTargetAtTime(0, now + (att || 0.005), (rel || dur * 0.5));
    osc.connect(g); g.connect(_master);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  /** Frequency sweep (whoosh/descend) */
  function _sweep(f0, f1, dur, gain) {
    if (!_ctx || _muted) return;
    const now = _ctx.currentTime;
    const osc = _ctx.createOscillator();
    const g   = _ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.linearRampToValueAtTime(f1, now + dur);
    g.gain.setValueAtTime(gain, now);
    g.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(g); g.connect(_master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  /** Multiple sine oscillators → musical chord */
  function _chord(freqs, dur, gain) {
    if (!_ctx || _muted) return;
    const now  = _ctx.currentTime;
    const perG = gain / freqs.length;
    for (const freq of freqs) {
      const osc = _ctx.createOscillator();
      const g   = _ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(perG, now + 0.02);
      g.gain.setTargetAtTime(0, now + dur * 0.5, dur * 0.3);
      osc.connect(g); g.connect(_master);
      osc.start(now);
      osc.stop(now + dur + 0.3);
    }
  }

  /** Staggered arpeggio */
  function _arp(freqs, step, dur, gain) {
    if (!_ctx || _muted) return;
    freqs.forEach((f, i) => {
      const t = _ctx.currentTime + i * step;
      const osc = _ctx.createOscillator();
      const g   = _ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.setTargetAtTime(0, t + 0.05, dur * 0.4);
      osc.connect(g); g.connect(_master);
      osc.start(t);
      osc.stop(t + dur + 0.2);
    });
  }

  // ── Named sounds ──────────────────────────────────────────────────────────

  const _sounds = {
    select:        () => _tone(1100, 0.06, 'sine', 0.055, 0.003, 0.055),
    assign:        () => _sweep(350, 850, 0.14, 0.055),
    cap_snatch:    () => { _tone(1400, 0.05, 'square', 0.04, 0.002, 0.05); _tone(900, 0.08, 'sine', 0.04, 0.005, 0.07); },
    cleave_good:   () => _chord([523, 659, 784], 0.50, 0.07),
    cleave_bad:    () => _sweep(440, 160, 0.35, 0.08),
    transcription: () => _tone(660, 0.10, 'sine', 0.025, 0.003, 0.08),
    mrna_complete: () => _arp([440, 554, 659, 880], 0.06, 0.35, 0.06),
    export:        () => _sweep(280, 750, 0.22, 0.055),
    np_production: () => _tone(550, 0.10, 'triangle', 0.04, 0.006, 0.09),
    replication:   () => { _tone(180, 0.20, 'triangle', 0.06, 0.01, 0.18); _tone(240, 0.15, 'sine', 0.04, 0.01, 0.14); },
    stall_fail:    () => _sweep(380, 90, 0.55, 0.09),
    assembly:      () => { _chord([330, 415, 523, 659], 0.9, 0.09); setTimeout(() => _chord([415, 523, 659, 830], 0.7, 0.07), 350); },
    ifit_alert:    () => { _tone(1100, 0.10, 'square', 0.06, 0.002, 0.08); setTimeout(() => _tone(880, 0.10, 'square', 0.05, 0.002, 0.08), 120); },
    oas_attack:    () => _tone(280, 0.22, 'sawtooth', 0.07, 0.001, 0.20),
    polii_shutdown:() => _sweep(450, 100, 0.70, 0.10),
    unlock:        () => _arp([330, 415, 523, 659], 0.07, 0.55, 0.07),
    crna_produced: () => _arp([220, 277, 330, 440], 0.06, 0.40, 0.06),
    complete_set:  () => { _chord([523, 659, 784, 1047], 1.20, 0.09); setTimeout(() => _tone(1568, 0.6, 'sine', 0.06, 0.01, 0.55), 200); },
    isg_25:        () => { _tone(880, 0.15, 'square', 0.06, 0.002, 0.12); },
    isg_50:        () => { _tone(880, 0.15, 'square', 0.07, 0.002, 0.12); setTimeout(() => _tone(880, 0.15, 'square', 0.07, 0.002, 0.12), 200); },
    isg_75:        () => { for (let i=0; i<3; i++) setTimeout(() => { _tone(988, 0.12, 'square', 0.08, 0.002, 0.10); }, i*180); },
    isg_90:        () => { for (let i=0; i<4; i++) setTimeout(() => { _tone(1047, 0.10, 'square', 0.09, 0.002, 0.08); }, i*150); },
    phase_complete:() => {
      _chord([261, 329, 392, 523], 1.0, 0.08);
      setTimeout(() => _chord([329, 415, 523, 659], 0.8, 0.07), 400);
      setTimeout(() => _chord([392, 494, 587, 784], 0.8, 0.07), 750);
      setTimeout(() => _chord([523, 659, 784, 1047], 2.5, 0.10), 1100);
    },
    game_over:     (r) => {
      if (r === 'antiviral') {
        _sweep(440, 55, 2.2, 0.10);
      } else if (r === 'all_templates_destroyed') {
        _sweep(330, 44, 2.5, 0.10);
      } else {
        _sweep(220, 33, 2.0, 0.10);
      }
    },
  };

  function play(name, arg) {
    _boot();
    if (!_ctx || _muted) return;
    const fn = _sounds[name];
    if (fn) fn(arg);
  }

  // ── Edu trigger listener ──────────────────────────────────────────────────

  const _eduMap = {
    PB2_GRAB:          'cap_snatch',
    PA_CLEAVE_GOOD:    'cleave_good',
    PA_CLEAVE_BAD:     'cleave_bad',
    TRANSCRIPTION_START: 'transcription',
    MRNA_EXPORT:       'export',
    NP_PRODUCTION:     'np_production',
    RDRP_SUBUNIT:      'np_production',
    RDRP_ASSEMBLED:    'assembly',
    CRNA_PRODUCED:     'crna_produced',
    FULL_REPLICATION:  'complete_set',
    REPLICATION_START: 'replication',
    NP_DEPLETED:       'stall_fail',
    IFIT_ENCOUNTER:    'ifit_alert',
    OAS_ATTACK:        'oas_attack',
    POLII_SHUTDOWN:    'polii_shutdown',
    REPLICATION_UNLOCK:'unlock',
    SEG8_NS1:          'unlock',
    NS1_DEPLOY:        'unlock',
  };

  // ISG threshold sounds (fire once each)
  let _isgSoundFired = [false, false, false, false];

  // ── M-key mute ────────────────────────────────────────────────────────────

  function _onKeyDown(e) {
    if (e.code === 'KeyM') {
      _muted = !_muted;
      if (_master) _master.gain.setTargetAtTime(_muted ? 0 : 0.70, _ctx.currentTime, 0.1);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    // Lazy boot on first call — AudioContext needs user interaction
    // (init is called once from main.js; audio context created on first tick/play)

    _eduListener = (e) => {
      const t = e.detail && e.detail.type;
      if (!t) return;
      _boot();
      const snd = _eduMap[t];
      if (snd) play(snd);
    };
    window.addEventListener('p4EduTrigger', _eduListener);
    window.addEventListener('keydown', _onKeyDown);
  }

  function tick(dt) {
    if (!_ctx) return;
    _t += dt;

    // Resume if suspended
    if (_ctx.state === 'suspended') _ctx.resume();

    // Activity hum from active transcription
    const activeCount = (typeof P4Transcription !== 'undefined')
      ? P4Transcription.getActiveCount() : 0;
    const humTarget = Math.min(0.05, activeCount * 0.012);
    _actGain.gain.setTargetAtTime(humTarget, _ctx.currentTime, 0.8);

    // Antiviral bass pulse from ISG 50%
    if (typeof P4Antiviral !== 'undefined') {
      const f = P4Antiviral.getISGFraction();

      if (f >= 0.50) {
        const antiTarget = Math.min(0.08, (f - 0.50) * 0.16);
        _antiGain.gain.setTargetAtTime(antiTarget, _ctx.currentTime, 0.5);
        // Slow throb on frequency
        _antiOsc.frequency.setTargetAtTime(35 + 8 * Math.sin(_t * 0.8), _ctx.currentTime, 0.3);
      } else {
        _antiGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.5);
      }

      // ISG threshold alarm sounds
      if (!_isgSoundFired[0] && f >= 0.25) { _isgSoundFired[0] = true; play('isg_25'); }
      if (!_isgSoundFired[1] && f >= 0.50) { _isgSoundFired[1] = true; play('isg_50'); }
      if (!_isgSoundFired[2] && f >= 0.75) { _isgSoundFired[2] = true; play('isg_75'); }
      if (!_isgSoundFired[3] && f >= 0.90) { _isgSoundFired[3] = true; play('isg_90'); }
    }
  }

  function destroy() {
    if (_eduListener) window.removeEventListener('p4EduTrigger', _eduListener);
    window.removeEventListener('keydown', _onKeyDown);
    _eduListener = null;

    if (_ctx) {
      // Stop all oscillators
      for (const n of _droneNodes) { try { n.osc.stop(); } catch(e) {} }
      if (_actOsc)  { try { _actOsc.stop();  } catch(e) {} }
      if (_antiOsc) { try { _antiOsc.stop(); } catch(e) {} }
      try { _ctx.close(); } catch(e) {}
    }

    _ctx = _master = _droneGain = null;
    _actOsc = _actGain = null;
    _antiOsc = _antiGain = null;
    _droneNodes = [];
    _isgSoundFired = [false, false, false, false];
    _t = 0;
  }

  return { init, tick, destroy, play };

})();
