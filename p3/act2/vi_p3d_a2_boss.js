'use strict';
/**
 * P3DAct2BossBattle — Act 2 "Conformational Change" rhythm mini-game.
 *
 * Interface: { get _running(), init(p3, act1Stats), start(), tick(dt),
 *              _pause(), _resume(), destroy() }
 *
 * Three lanes — keys A / S / D — map to HA1·Head, HA2·Stem, FP·Peptide.
 * Nodes fall through 5 phases (A–E) modelling HA conformational change.
 *
 * Educational features:
 *  - Phase intro cards (3.2 s, game time frozen) describe each structural step.
 *  - HA trimer diagram drawn to the left of the lane area; its fusion progress
 *    (`_fusionProgress`) is driven by player performance (`_perf`).
 *
 * Players accumulate score to reach each phase threshold. Misses subtract
 * points but never end the game — keep playing until the threshold is met.
 */
const P3DAct2BossBattle = (() => {

  // ── Constants ──────────────────────────────────────────────────────────
  const N_LANES     = 3;
  const LANE_KEYS   = ['KeyA', 'KeyS', 'KeyD'];
  const LANE_LABELS = ['A', 'S', 'D'];
  const LANE_COLS   = ['#00cc88', '#C8A951', '#4488ff'];
  const LANE_BIO    = ['HA1 · Head', 'HA2 · Stem', 'FP · Peptide'];


  const PHASE_KEYS   = ['A', 'B', 'C', 'D', 'E'];
  const PHASE_LABELS = [
    'PHASE A · HEAD LOOSENING',
    'PHASE B · STEM EXPOSURE',
    'PHASE C · COILED-COIL REFOLDING',
    'PHASE D · FUSION PEPTIDE INSERTION',
    'PHASE E · HEMIFUSION STALK',
  ];
  const PHASE_EDU = [
    'HA_LOOSEN', 'FP_EXPOSED', 'CC_EXTEND', 'FP_INSERT', 'HEMIFUSION',
  ];
  const PHASE_DESC = [
    'At endosomal pH ~6.0, electrostatic contacts between\nHA1 subunits break. The globular heads begin to separate.',
    'HA1 heads swing outward, exposing the buried HA2 stem.\nThe spring-loaded coiled-coil mechanism is primed.',
    'The HA2 coiled-coil fires — a ~100 Å extension outward.\nThe fusion peptide is now aimed at the endosomal membrane.',
    'The fusion peptide embeds in the endosomal membrane.\nHA bridges both membranes — the hairpin forms.',
    'Outer lipid leaflets merge in a hemifusion stalk.\nThis step is irreversible — fusion is committed.',
  ];

  // ── Private state ──────────────────────────────────────────────────────
  let _p3      = null;
  let _running = false;
  let _paused  = false;

  // Canvas
  let _canvas = null;
  let _ctx    = null;

  // Game time (frozen during intro cards)
  let _t = 0;

  // Phase
  let _phaseIdx = 0;

  // Audio beat reference — set when synth starts, used for beat-sync countdown
  let _synthStartAt = 0;

  // MP3 path flags
  let _usingMP3       = false;   // true when A2MP3Player is active
  let _phaseEComplete = false;   // true once Phase E threshold is hit (MP3 path)
  let _beatmapSynced  = false;   // true once initial nodes regenerated from A2MP3Beatmap

  // Node pool
  let _nodes       = [];
  let _nodePtr     = 0;
  let _activeNodes = [];
  let _kickedTimes = new Set();   // deduplicates kicks for SYNC pairs

  // Sync
  let _syncTotal  = 0;
  let _syncHits   = 0;
  let _nextSyncId = 0;

  // Scoring
  let _score      = 0;
  let _phaseScore = 0;   // score within current phase (reset on advance; drives progress bar)
  let _phaseThresh = 0;  // score threshold to advance current phase
  let _combo      = 0;
  let _maxCombo   = 0;
  let _perfect    = 0;
  let _good       = 0;
  let _misses     = 0;

  // Node buffer refill tracking
  let _lastNodeT  = 0;   // game-time of end of last generated loop chunk

  // Hold + judgement flash per lane
  let _heldNode  = [null, null, null];
  let _judgFlash = [null, null, null];

  // Educational / visual
  let _fusionProgress = 0;   // 0–1; rendered in HA diagram
  let _perf           = 0.4; // 0–1; drives fusion progress; decays toward 0.4
  let _card           = null; // { phaseIdx, t } | null — intro card state

  // 3-D scene
  let _orbitAngle = 0;
  let _lookY      = 0;
  let _beatFlash  = 0;

  // Input
  const _keys = {};

  // Debug
  let _debugPaused      = false;
  let _debugPauseBtnRect = null;
  let _debugCsvBtnRect   = null;
  let _csvCopiedFlash    = 0;   // countdown seconds for "COPIED" text
  let _hitLog            = [];  // { gameT, hitTime, drift, musicT, lane, type }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function init(p3, act1Stats) {
    _p3 = p3;

    _t               = 0;
    _nodePtr         = 0;
    _activeNodes     = [];
    _kickedTimes     = new Set();
    _heldNode        = [null, null, null];
    _judgFlash       = [null, null, null];
    _score           = 0;
    _phaseScore      = 0;
    _combo           = 0;
    _maxCombo        = 0;
    _perfect         = 0;
    _good            = 0;
    _misses          = 0;
    _syncHits        = 0;
    _syncTotal       = 0;
    _nextSyncId      = 0;
    _beatFlash       = 0;
    _orbitAngle      = 0;
    _phaseIdx        = 0;
    _fusionProgress  = 0;
    _perf            = 0.4;
    _card            = null;
    _usingMP3        = false;
    _debugPaused     = false;
    _debugCsvBtnRect = null;
    _csvCopiedFlash  = 0;
    _hitLog          = [];
    _phaseEComplete  = false;
    _beatmapSynced   = false;
    _lastNodeT      = 2.0;   // 2s game-time lead-in before first note

    _phaseThresh = P3D_CFG.A2_PHASE_SCORE_THRESH[PHASE_KEYS[0]];

    _lookY = -((act1Stats && act1Stats.depth) || 80);

    // Generate first loop of phase 0 (more added dynamically in tick)
    _nodes = [];
    _appendPhaseLoop();

    // Prime HUD
    _p3._hud.updateProgress(0);
    _p3._hud.updateA2Phase(PHASE_LABELS[0]);
    _p3._hud.updateScore(_score);
    _p3._hud.updateCombo(0);

    _createCanvas();

    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup',   _onKeyUp);
  }

  function start() {
    _running = true;
    _paused  = false;

    // ── MP3 player (primary) ───────────────────────────────────────────────
    if (window.A2MP3Player) {
      try {
        window.A2MP3Player.init(
          _p3._snd,
          'p3/act2/audio/Let_me_out_the_endosome.mp3',
          'p3/act2/audio/Let_me_out_the_endosome_beats.json'
        );
        window.A2MP3Player.start();
        window.A2MP3Player.pauseForCard();
        _usingMP3 = true;
      } catch(e) {
        console.error('[A2MP3Player] init failed, falling back to synth:', e);
        _usingMP3 = false;
      }
    }

    // ── Electroswing synth (fallback when MP3 unavailable) ────────────────
    if (!_usingMP3 && window.A2ElectroswingSynth) {
      try {
        window.A2ElectroswingSynth.init(_p3._snd);
        const ctx = _p3._snd.audioCtx;
        if (ctx) {
          _synthStartAt = ctx.currentTime + 0.05;
          window.A2ElectroswingSynth.start(_synthStartAt);
          window.A2ElectroswingSynth.pauseForCard();
        }
      } catch(e) {
        console.error('[A2ElectroswingSynth] start failed:', e);
      }
    }

    // Show intro card for Phase A before any notes fall
    _card = { phaseIdx: 0, t: 0, dismissed: false, countdownT: 0, btnRect: null };
  }

  // ── Main tick ──────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_running || _paused) return;

    // One-time: regenerate initial nodes once A2MP3Beatmap JSON has loaded.
    // init() calls _appendPhaseLoop() before start() triggers the async fetch,
    // so the first batch uses the electroswing fallback.  Fix it here on the
    // first tick after the beatmap arrives (still during the intro card).
    if (_usingMP3 && !_beatmapSynced && window.A2MP3Beatmap) {
      _beatmapSynced = true;
      _nodes    = [];
      _nodePtr  = 0;
      _lastNodeT = Math.max(2.0, _t + 2.0);
      _appendPhaseLoop();
    }

    // Extend electroswing scheduling (no-op for MP3 path)
    if (!_usingMP3 && window.A2ElectroswingSynth) {
      const _ac = _p3._snd && _p3._snd.audioCtx;
      if (_ac) window.A2ElectroswingSynth.extendIfNeeded(_ac.currentTime);
    }

    // ── MP3 song-end check (outside card guard so it fires even mid-card) ──
    if (_usingMP3 && window.A2MP3Player && !_card) {
      const mt  = window.A2MP3Player.musicTime;
      const dur = window.A2MP3Player.duration;
      if (dur > 0 && mt >= dur - 0.5) {
        _complete(_phaseEComplete ? 'done' : 'songfail');
        return;
      }
    }

    // Camera orbit runs even during intro cards
    _orbitAngle += 0.18 * dt;
    if (window.P3Descent && P3Descent.camera) {
      const r = 22;
      P3Descent.camera.position.set(
        Math.sin(_orbitAngle) * r,
        _lookY + 14,
        Math.cos(_orbitAngle) * r
      );
      P3Descent.camera.lookAt(0, _lookY, 0);
    }

    // ── Intro card — freeze game time until player dismisses ────────
    if (_card) {
      _card.t += dt;
      if (_card.dismissed) {
        _card.countdownT += dt;
        if (_usingMP3 && window.A2MP3Player) {
          // MP3 path: advance game clock during countdown so viruses pre-spawn.
          // _t starts at -3 s (Phase A) or current value (later phases); song
          // starts when _t crosses 0.
          _t += dt;
          // Activate any nodes that have entered the lookahead window.
          const _canvasH   = _canvas ? _canvas.height : 600;
          const _lookahead = (_canvasH - P3D_CFG.A2_HIT_Y + 60) / P3D_CFG.A2_NODE_SPD;
          if (_lastNodeT < _t + 12) _appendPhaseLoop();
          while (_nodePtr < _nodes.length &&
                 _nodes[_nodePtr].hitTime <= _t + _lookahead) {
            const _act = _nodes[_nodePtr++];
            _act.state = 'waiting';
            _activeNodes.push(_act);
          }
          if (_t >= 0) {
            if (window.A2MolViewer) A2MolViewer.hide();
            const seekT = _card.resumeSeekT;
            _card = null;
            window.A2MP3Player.resumeFromCard(seekT || 0);
          }
        } else {
          // Synth path: beat-synced countdown via audioCtx clock.
          const audioCtx  = _p3._snd && _p3._snd.audioCtx;
          const resumeNow = (_card.resumeAudioT && audioCtx)
            ? audioCtx.currentTime >= _card.resumeAudioT
            : _card.countdownT >= 3.0;
          if (resumeNow) {
            if (window.A2MolViewer) A2MolViewer.hide();
            const seekT = _card.resumeSeekT;
            _card = null;
            if (window.A2ElectroswingSynth) {
              window.A2ElectroswingSynth.resumeFromCard();
            }
          }
        }
      }
      _render();
      return;
    }

    // ── Debug pause ──────────────────────────────────────────────────────
    if (_debugPaused) { _render(); return; }

    _t += dt;

    // ── Perf drift toward neutral (0.4) at 0.5 u/s ──────────────────
    if (_perf > 0.4) _perf = Math.max(0.4, _perf - 0.5 * dt);
    else             _perf = Math.min(0.4, _perf + 0.5 * dt);

    // ── Fusion progress lerp to perf-driven target ───────────────────
    const phaseMin     = _phaseIdx / 5;
    const phaseMax     = (_phaseIdx + 1) / 5;
    const fusionTarget = phaseMin + _perf * (phaseMax - phaseMin);
    _fusionProgress   += (fusionTarget - _fusionProgress) * Math.min(1, 2.5 * dt);

    // ── Score-threshold phase transition ────────────────────────────
    if (_phaseScore >= _phaseThresh) {
      _phaseIdx++;
      if (_phaseIdx >= PHASE_KEYS.length) {
        if (_usingMP3) {
          // MP3 path: pin at Phase E, wait for song end to succeed
          _phaseEComplete = true;
          _phaseIdx       = PHASE_KEYS.length - 1;
          _phaseScore     = 0;
          _phaseThresh    = Infinity;   // never trigger again
          _nodes.length   = _nodePtr;
          for (let i = _activeNodes.length - 1; i >= 0; i--) {
            if (_activeNodes[i].state === 'waiting') _activeNodes.splice(i, 1);
          }
          _lastNodeT = _t + 2.0;
          _appendPhaseLoop();
          for (let li = 0; li < N_LANES; li++) _heldNode[li] = null;
          _p3._hud.updateA2Phase(PHASE_LABELS[PHASE_KEYS.length - 1] + ' ★');
          _render();
          return;
        }
        _complete('done');
        return;
      }
      _phaseScore  = 0;
      _phaseThresh = P3D_CFG.A2_PHASE_SCORE_THRESH[PHASE_KEYS[_phaseIdx]];
      _p3._hud.updateA2Phase(PHASE_LABELS[_phaseIdx]);
      // Clear queued (unactivated) nodes; keep active lane holds
      _nodes.length = _nodePtr;
      // Also purge 'waiting' nodes already moved to _activeNodes — they'd visually
      // overlap with new-phase lead-in nodes since _t is frozen during card/countdown
      for (let i = _activeNodes.length - 1; i >= 0; i--) {
        if (_activeNodes[i].state === 'waiting') _activeNodes.splice(i, 1);
      }
      _lastNodeT    = _t + 2.0;   // 2s lead-in for new phase
      _appendPhaseLoop();
      for (let li = 0; li < N_LANES; li++) _heldNode[li] = null;
      _card = { phaseIdx: _phaseIdx, t: 0, dismissed: false, countdownT: 0, btnRect: null };
      if (_usingMP3 && window.A2MP3Player) window.A2MP3Player.pauseForCard();
      else if (window.A2ElectroswingSynth) window.A2ElectroswingSynth.pauseForCard();
      _render();
      return;
    }

    // ── Refill node buffer (keep ~12s ahead) ─────────────────────────
    if (_lastNodeT < _t + 12) _appendPhaseLoop();

    // ── Activate pending nodes ───────────────────────────────────────
    const canvasH   = _canvas ? _canvas.height : 600;
    const hitZoneY  = canvasH - P3D_CFG.A2_HIT_Y;
    const lookahead = (hitZoneY + 60) / P3D_CFG.A2_NODE_SPD;

    while (_nodePtr < _nodes.length &&
           _nodes[_nodePtr].hitTime <= _t + lookahead) {
      const activating = _nodes[_nodePtr++];
      _activeNodes.push(activating);

      // Fire beat accent per unique hitTime (deduplicates SYNC pairs)
      {
        const kickKey = Math.round(activating.hitTime * 1000);
        if (!_kickedTimes.has(kickKey)) {
          _kickedTimes.add(kickKey);
          if (_usingMP3) {
            _beatFlash = 1.0;   // visual-only pulse for MP3 path
          } else if (window.A2ElectroswingSynth) {
            const audioCtx = _p3._snd && _p3._snd.audioCtx;
            if (audioCtx) {
              window.A2ElectroswingSynth.kickAt(
                audioCtx.currentTime + Math.max(0, activating.hitTime - _t)
              );
            }
          }
        }
      }
    }

    // ── Process active nodes ─────────────────────────────────────────
    const goodT = P3D_CFG.A2_T_GOOD_MS / 1000;

    for (let i = _activeNodes.length - 1; i >= 0; i--) {
      const n = _activeNodes[i];

      if (n.state === 'holding') {
        n.holdProgress += dt / n.holdDur;
        if (!_keys[LANE_KEYS[n.lane]]) {
          // Key released early
          const frac = Math.min(n.holdProgress, 1.0);
          const holdPts = Math.floor(P3D_CFG.A2_PTS_HOLD * frac);
          _score      += holdPts;
          _phaseScore += holdPts;
          n.state = 'hit'; n.judgement = frac >= 0.75 ? 'GOOD' : null; n.flashT = _t;
          _heldNode[n.lane] = null;
          if (frac >= 0.75) {
            _combo++; if (_combo > _maxCombo) _maxCombo = _combo; _good++;
            _perf = Math.min(1, _perf + 0.10);
            _judgFlash[n.lane] = { text: 'GOOD', t: _t };
          } else {
            _combo = 0;
            _perf = Math.max(0, _perf - 0.25);
            _judgFlash[n.lane] = { text: 'MISS', t: _t };
          }
          _p3._hud.updateScore(_score);
          _p3._hud.updateCombo(_combo);
        } else if (n.holdProgress >= 1.0) {
          // Full hold completed
          _score      += P3D_CFG.A2_PTS_HOLD;
          _phaseScore += P3D_CFG.A2_PTS_HOLD;
          n.state = 'hit'; n.judgement = 'PERFECT'; n.flashT = _t;
          _heldNode[n.lane] = null;
          _combo++; if (_combo > _maxCombo) _maxCombo = _combo; _perfect++;
          _perf = Math.min(1, _perf + 0.18);
          _judgFlash[n.lane] = { text: 'PERFECT', t: _t };
          _beatFlash = 1.0;
          _p3._hud.updateScore(_score);
          _p3._hud.updateCombo(_combo);
        }
        continue;
      }

      // Hit-zone crossing log — fires once per node when its centre reaches hitY
      if (n.state === 'waiting' && !n._logged && _t >= n.hitTime) {
        n._logged = true;
        const musicT = (_usingMP3 && window.A2MP3Player)
          ? window.A2MP3Player.musicTime : null;
        _hitLog.push({
          gameT:   +_t.toFixed(4),
          hitTime: +n.hitTime.toFixed(4),
          drift:   +(_t - n.hitTime).toFixed(4),
          musicT:  musicT !== null ? +musicT.toFixed(4) : null,
          lane:    n.lane,
          type:    n.type,
        });
      }

      // Miss detection
      if (n.state === 'waiting' && _t > n.hitTime + goodT) {
        _applyMiss(n);
      }

      // Cull stale nodes
      const stale = n.state !== 'waiting' && n.state !== 'holding' && _t - n.flashT > 0.5;
      if (stale) { _activeNodes.splice(i, 1); }
    }

    // ── Beat flash decay ─────────────────────────────────────────────
    if (_beatFlash > 0) {
      _beatFlash = Math.max(0, _beatFlash - 5 * dt);
      if (window.P3DMatLib && P3DMatLib.endosome) {
        P3DMatLib.endosome.emissiveIntensity = 0.6 + _beatFlash * 1.8;
      }
    }

    // ── HUD ──────────────────────────────────────────────────────────
    // Progress = how far through the current phase score threshold (0–100%)
    _p3._hud.updateProgress(Math.min(100, (_phaseScore / _phaseThresh) * 100));

    // ── Canvas render ─────────────────────────────────────────────────
    _render();

  }

  // ── Beat-map generation ────────────────────────────────────────────────

  // Append one 8-second loop of the current phase pattern to _nodes.
  function _appendPhaseLoop() {
    // Prefer MP3 beatmap, then Electroswing beatmap, then LCG fallback
    const bm = window.A2MP3Beatmap || window.A2ElectroswingBeatmap;
    if (bm) {
      try {
        const startT = _lastNodeT;
        const {nodes: newNodes, nextSyncId} =
          bm.buildPhaseLoop(_phaseIdx, startT, _nextSyncId);
        for (const n of newNodes) _nodes.push(n);
        _nextSyncId = nextSyncId;
        const newSyncIds = new Set(newNodes
          .filter(n => n.type === 'SYNC' && n.syncId !== null).map(n => n.syncId));
        _syncTotal += newSyncIds.size;
        _lastNodeT  = startT + 8.0;
        return;
      } catch(e) {
        console.error('[A2ElectroswingBeatmap] buildPhaseLoop failed:', e);
      }
    }
    // Fallback: generate a short LCG block for the current phase
    _appendLCGBlock();
  }

  // LCG fallback: generate ~8s of nodes starting at _lastNodeT.
  function _appendLCGBlock() {
    let seed = (0xdeadbeef + _phaseIdx * 0x1337 + Math.round(_lastNodeT * 100)) | 0;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 0) / 0x100000000);
    };
    const k   = PHASE_KEYS[_phaseIdx];
    const bpm = P3D_CFG.A2_BPM[k];
    const bi  = 60 / bpm;
    const nb  = Math.ceil(8 / bi);
    let prevLane = -1;
    for (let b = 0; b < nb; b++) {
      const hitTime = _lastNodeT + b * bi;
      if (rand() < 0.25) continue;
      const r = rand();
      if (r < 0.15 && b > 2) {
        const l1 = Math.floor(rand() * 3), l2 = (l1 + 1) % 3;
        const sid = _nextSyncId++;
        _nodes.push(_mkNode('SYNC', l1, hitTime, {syncId: sid}));
        _nodes.push(_mkNode('SYNC', l2, hitTime, {syncId: sid}));
        _syncTotal++;
      } else {
        const lane = _pickLane(rand, prevLane);
        _nodes.push(_mkNode('TAP', lane, hitTime, {}));
        prevLane = lane;
      }
    }
    _lastNodeT += 8.0;
  }

  // ── Kept for LCG fallback (unused by main path) ───────────────────────────

  function _UNUSED_generateNodes() {
    // Prefer electroswing beatmap, then SMB-derived, then LCG fallback.
    if (window.A2ElectroswingBeatmap) {
      try {
        const nodes = window.A2ElectroswingBeatmap.build([], 75);
        const syncIds = new Set();
        for (const n of nodes) {
          if (n.type === 'SYNC' && n.syncId !== null) syncIds.add(n.syncId);
        }
        _syncTotal += syncIds.size;
        _nextSyncId = syncIds.size;
        return nodes;
      } catch(e) {
        console.error('[A2ElectroswingBeatmap] build() failed:', e);
      }
    }

    if (window.A2SMBBeatmap) {
      try {
        const nodes = window.A2SMBBeatmap.build(_phaseStartT, _totalDur);
        // Count SYNC pairs for stats (each pair = 1 syncTotal entry)
        const syncIds = new Set();
        for (const n of nodes) {
          if (n.type === 'SYNC' && n.syncId !== null) syncIds.add(n.syncId);
        }
        _syncTotal += syncIds.size;
        _nextSyncId = syncIds.size;
        return nodes;
      } catch(e) {
        console.error('[A2SMBBeatmap] build() failed, falling back to LCG:', e);
      }
    }

    // ── LCG fallback ────────────────────────────────────────────────────
    const out = [];

    let seed = 0xdeadbeef;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 0) / 0x100000000);
    };

    for (let pi = 0; pi < PHASE_KEYS.length; pi++) {
      const k     = PHASE_KEYS[pi];
      const bpm   = P3D_CFG.A2_BPM[k];
      const dur   = P3D_CFG.A2_PHASE_DUR[k];
      const bi    = 60 / bpm;
      const nb    = Math.floor(dur / bi);
      const tBase = _phaseStartT[pi];
      const skipP = [0.28, 0.22, 0.16, 0.09, 0.04][pi];

      let prevLane = -1;

      for (let b = 0; b < nb; b++) {
        const hitTime = tBase + b * bi;

        if (b > 1 && rand() < skipP) continue;

        const r = rand();

        if (r < 0.16 && b > 3) {
          // SYNC
          const l1  = Math.floor(rand() * 3);
          const l2  = (l1 + 1 + Math.floor(rand() * 2)) % 3;
          const sid = _nextSyncId++;
          out.push(_mkNode('SYNC', l1, hitTime, { syncId: sid }));
          out.push(_mkNode('SYNC', l2, hitTime, { syncId: sid }));
          _syncTotal++;
          prevLane = -1;
        } else if (r < 0.28 && b > 1) {
          // HOLD
          const lane = _pickLane(rand, prevLane);
          out.push(_mkNode('HOLD', lane, hitTime, {
            holdDur: 0.35 + rand() * 0.40,
          }));
          prevLane = lane;
        } else {
          // TAP
          const lane = _pickLane(rand, prevLane);
          out.push(_mkNode('TAP', lane, hitTime, {}));
          prevLane = lane;
        }
      }
    }

    out.sort((a, b) => a.hitTime - b.hitTime);
    return out;
  }

  function _pickLane(rand, prevLane) {
    if (prevLane < 0) return Math.floor(rand() * 3);
    const r = rand();
    if (r < 0.25) return prevLane;
    const other = [0, 1, 2].filter(l => l !== prevLane);
    return other[Math.floor(rand() * other.length)];
  }

  function _mkNode(type, lane, hitTime, extra) {
    return Object.assign({
      type,
      lane,
      hitTime,
      state:        'waiting',
      judgement:    null,
      flashT:       -1,
      holdProgress: 0,
      holdDur:      0,
      syncId:       null,
    }, extra);
  }

  // ── Hit / miss logic ───────────────────────────────────────────────────

  function _tryHitLane(lane) {
    if (_heldNode[lane]) return;

    const goodT = P3D_CFG.A2_T_GOOD_MS / 1000;
    const perfT = P3D_CFG.A2_T_PERFECT_MS / 1000;

    let best = null, bestDt = Infinity;
    for (const n of _activeNodes) {
      if (n.state !== 'waiting' || n.lane !== lane) continue;
      const dt = Math.abs(_t - n.hitTime);
      if (dt <= goodT && dt < bestDt) { best = n; bestDt = dt; }
    }

    if (!best) return;

    if (best.type === 'HOLD') {
      best.state  = 'holding';
      best.flashT = _t;
      _heldNode[lane] = best;
      _beatFlash = 0.6;
      return;
    }

    const judgement = bestDt <= perfT ? 'PERFECT' : 'GOOD';
    _applyHit(best, judgement);
  }

  function _applyHit(node, judgement) {
    node.state     = 'hit';
    node.judgement = judgement;
    node.flashT    = _t;

    const pts = judgement === 'PERFECT'
      ? P3D_CFG.A2_PTS_PERFECT
      : P3D_CFG.A2_PTS_GOOD;
    _score      += pts;
    _phaseScore += pts;
    _combo++;
    if (_combo > _maxCombo) _maxCombo = _combo;
    if (judgement === 'PERFECT') {
      _perfect++;
      _perf = Math.min(1, _perf + 0.18);
    } else {
      _good++;
      _perf = Math.min(1, _perf + 0.10);
    }

    _judgFlash[node.lane] = { text: judgement, t: _t };
    _beatFlash = judgement === 'PERFECT' ? 1.0 : 0.65;

    if (node.type === 'SYNC') _checkSync(node);

    _p3._hud.updateScore(_score);
    _p3._hud.updateCombo(_combo);
  }

  function _checkSync(node) {
    const syncT   = P3D_CFG.A2_T_SYNC_MS / 1000;
    const partner = _activeNodes.find(n =>
      n !== node &&
      n.syncId === node.syncId &&
      n.state  === 'hit' &&
      Math.abs(n.flashT - node.flashT) <= syncT
    );
    if (partner) {
      _score      += P3D_CFG.A2_PTS_SYNC;
      _phaseScore += P3D_CFG.A2_PTS_SYNC;
      _syncHits++;
      _judgFlash[node.lane] = { text: 'SYNC!', t: _t };
      _beatFlash = 1.0;
      _p3._hud.updateScore(_score);
    }
  }

  function _applyMiss(node) {
    node.state     = 'missed';
    node.judgement = 'MISS';
    node.flashT    = _t;

    _misses++;
    _combo = 0;
    _perf  = Math.max(0, _perf - 0.25);

    // Misses subtract points — bad rhythm sets fusion back
    const ptsSub = P3D_CFG.A2_PTS_GOOD;
    _score      = Math.max(0, _score      - ptsSub);
    _phaseScore = Math.max(0, _phaseScore - ptsSub);

    _judgFlash[node.lane] = { text: 'MISS', t: _t };
    _p3._hud.updateScore(_score);
    _p3._hud.updateCombo(0);
    _p3._hud.showDamageFlash?.();
  }

  // ── Complete / fail ────────────────────────────────────────────────────

  function _complete(reason) {
    _running = false;
    _removeInput();
    _destroyCanvas();
    if (window.A2MolViewer) A2MolViewer.hide();
    if (window.A2MP3Player)        window.A2MP3Player.stop();
    if (window.A2ElectroswingSynth) window.A2ElectroswingSynth.stop();
    if (window.P3DMatLib && P3DMatLib.endosome) {
      P3DMatLib.endosome.emissiveIntensity = 0.6;
    }

    if (reason === 'fail') {
      _p3._fail('Immune resistance overwhelmed the fusion machinery.');
      return;
    }
    if (reason === 'songfail') {
      _p3._fail('The endosome acidified before membrane fusion was complete.');
      return;
    }

    _p3._edu.trigger('FUSION_DONE');

    const stats = {
      perfect:   _perfect,
      good:      _good,
      misses:    _misses,
      maxCombo:  _maxCombo,
      syncHits:  _syncHits,
      syncTotal: _syncTotal,
      score:     _score,
    };
    _p3._act2Done(stats);
  }

  // ── Canvas helpers ─────────────────────────────────────────────────────

  function _createCanvas() {
    _destroyCanvas();
    const cv = document.createElement('canvas');
    cv.id = 'p3dRhythmCanvas';
    Object.assign(cv.style, {
      position:      'fixed',
      top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'auto',
      zIndex:        '18',
      cursor:        'default',
    });
    document.body.appendChild(cv);
    _canvas = cv;
    _ctx    = cv.getContext('2d');
    _onResize();
    window.addEventListener('resize', _onResize);
    cv.addEventListener('click', _onCanvasClick);
  }

  function _destroyCanvas() {
    window.removeEventListener('resize', _onResize);
    if (_canvas) {
      _canvas.removeEventListener('click', _onCanvasClick);
      _canvas.remove();
      _canvas = null;
      _ctx    = null;
    }
  }

  function _onResize() {
    if (!_canvas) return;
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
  }

  // ── Canvas rendering ───────────────────────────────────────────────────

  function _render() {
    if (!_ctx || !_canvas) return;

    const W      = _canvas.width;
    const H      = _canvas.height;
    const hitY   = H - P3D_CFG.A2_HIT_Y;
    const laneW  = P3D_CFG.A2_LANE_W;
    const gap    = 8;
    const totalW = N_LANES * laneW + (N_LANES - 1) * gap;
    const x0     = Math.floor((W - totalW) / 2);

    _ctx.clearRect(0, 0, W, H);

    // ── HA trimer diagram (left of lanes) ─────────────────────────────
    _drawHADiagram(x0, H);

    // ── Lane bands ────────────────────────────────────────────────────
    for (let i = 0; i < N_LANES; i++) {
      const lx = x0 + i * (laneW + gap);

      _ctx.fillStyle = 'rgba(0,0,0,0.52)';
      _ctx.fillRect(lx, 0, laneW, hitY + 60);

      const grad = _ctx.createLinearGradient(0, hitY - 130, 0, hitY);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, LANE_COLS[i] + '1a');
      _ctx.fillStyle = grad;
      _ctx.fillRect(lx, hitY - 130, laneW, 130);

      _ctx.strokeStyle = LANE_COLS[i] + '33';
      _ctx.lineWidth   = 1;
      _ctx.beginPath();
      _ctx.moveTo(lx,          0); _ctx.lineTo(lx,          hitY + 58);
      _ctx.moveTo(lx + laneW,  0); _ctx.lineTo(lx + laneW,  hitY + 58);
      _ctx.stroke();
    }

    // ── Lane bio + key headers ────────────────────────────────────────
    for (let i = 0; i < N_LANES; i++) {
      const cx = x0 + i * (laneW + gap) + laneW / 2;
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'top';
      _ctx.fillStyle    = LANE_COLS[i] + 'cc';
      _ctx.font         = 'bold 10px monospace';
      _ctx.fillText(LANE_BIO[i], cx, 30);
      _ctx.fillStyle = 'rgba(255,255,255,0.28)';
      _ctx.font      = '10px monospace';
      _ctx.fillText(`[${LANE_LABELS[i]}]`, cx, 44);
    }

    // ── SYNC connector lines (behind nodes) ───────────────────────────
    const syncMap = {};
    for (const n of _activeNodes) {
      if (n.type !== 'SYNC' || n.state !== 'waiting') continue;
      if (!syncMap[n.syncId]) syncMap[n.syncId] = [];
      syncMap[n.syncId].push(n);
    }
    for (const pair of Object.values(syncMap)) {
      if (pair.length !== 2) continue;
      const n0 = pair[0], n1 = pair[1];
      const cy = hitY - (n0.hitTime - _t) * P3D_CFG.A2_NODE_SPD;
      if (cy < -40 || cy > H + 40) continue;
      const cx0 = x0 + n0.lane * (laneW + gap) + laneW / 2;
      const cx1 = x0 + n1.lane * (laneW + gap) + laneW / 2;
      _ctx.beginPath();
      _ctx.moveTo(cx0, cy);
      _ctx.lineTo(cx1, cy);
      _ctx.strokeStyle = '#dd44ff88';
      _ctx.lineWidth   = 3;
      _ctx.stroke();
    }

    // ── Nodes ─────────────────────────────────────────────────────────
    for (const n of _activeNodes) {
      _drawNode(n, x0, laneW, gap, hitY);
    }

    // ── Hit zone rings + key labels ───────────────────────────────────
    for (let i = 0; i < N_LANES; i++) {
      const cx   = x0 + i * (laneW + gap) + laneW / 2;
      const col  = LANE_COLS[i];
      const held = !!_keys[LANE_KEYS[i]];
      const R    = 28;

      _ctx.beginPath();
      _ctx.arc(cx, hitY, R, 0, Math.PI * 2);
      _ctx.strokeStyle = held ? col : 'rgba(255,255,255,0.28)';
      _ctx.lineWidth   = held ? 3 : 1.5;
      _ctx.stroke();

      if (held) {
        _ctx.fillStyle = col + '22';
        _ctx.fill();
      }

      _ctx.fillStyle    = held ? col : 'rgba(255,255,255,0.45)';
      _ctx.font         = `bold ${held ? 17 : 15}px monospace`;
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(LANE_LABELS[i], cx, hitY);
    }

    // ── Judgement text per lane ───────────────────────────────────────
    for (let i = 0; i < N_LANES; i++) {
      const jf = _judgFlash[i];
      if (!jf) continue;
      const age = _t - jf.t;
      if (age > 0.55) { _judgFlash[i] = null; continue; }
      const alpha = 1 - age / 0.55;
      const riseY = hitY - 52 - age * 55;
      const cx    = x0 + i * (laneW + gap) + laneW / 2;
      const col   = jf.text === 'PERFECT' ? '#ffdd44'
                  : jf.text === 'GOOD'    ? '#00cc88'
                  : jf.text === 'SYNC!'   ? '#dd44ff'
                  :                         '#ef5350';
      _ctx.globalAlpha  = alpha;
      _ctx.fillStyle    = col;
      _ctx.font         = 'bold 14px monospace';
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(jf.text, cx, riseY);
      _ctx.globalAlpha = 1;
    }


    // ── Phase label ───────────────────────────────────────────────────
    _ctx.fillStyle    = 'rgba(200,169,81,0.80)';
    _ctx.font         = 'bold 11px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'top';
    _ctx.fillText(PHASE_LABELS[_phaseIdx], W / 2, 12);

    // ── Debug overlay: pause button + CSV button + time display ──────
    {
      const bH = 20, bY = 6;
      // Pause button
      const bW = 64, bX = W - bW - 6;
      _debugPauseBtnRect = { x: bX, y: bY, w: bW, h: bH };
      _ctx.fillStyle = _debugPaused ? 'rgba(255,200,0,0.9)' : 'rgba(60,60,60,0.75)';
      _ctx.fillRect(bX, bY, bW, bH);
      _ctx.fillStyle    = _debugPaused ? '#000' : '#ccc';
      _ctx.font         = 'bold 11px monospace';
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(_debugPaused ? '\u25b6 PLAY' : '\u23f8 PAUSE', bX + bW / 2, bY + bH / 2);

      // CSV copy button (to the left of pause)
      const cW = 56, cX = bX - cW - 4;
      _debugCsvBtnRect = { x: cX, y: bY, w: cW, h: bH };
      _ctx.fillStyle = _csvCopiedFlash > 0 ? 'rgba(60,200,60,0.9)' : 'rgba(60,60,60,0.75)';
      _ctx.fillRect(cX, bY, cW, bH);
      _ctx.fillStyle    = '#ccc';
      _ctx.font         = 'bold 11px monospace';
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(_csvCopiedFlash > 0 ? 'COPIED' : `CSV(${_hitLog.length})`, cX + cW / 2, bY + bH / 2);
      if (_csvCopiedFlash > 0) _csvCopiedFlash = Math.max(0, _csvCopiedFlash - (1 / 60));

      const audioT = (_usingMP3 && window.A2MP3Player && window.A2MP3Player._audio)
        ? window.A2MP3Player._audio.currentTime : null;
      const line1 = `t=${_t.toFixed(3)}`;
      const line2 = audioT !== null ? `a=${audioT.toFixed(3)}` : '';
      _ctx.fillStyle    = 'rgba(255,255,255,0.65)';
      _ctx.font         = '10px monospace';
      _ctx.textAlign    = 'right';
      _ctx.textBaseline = 'top';
      _ctx.fillText(line1, W - 6, bY + bH + 3);
      if (line2) _ctx.fillText(line2, W - 6, bY + bH + 15);
    }

    // ── Countdown before first note (electroswing lead-in) ───────────
    if (!_card && _phaseIdx === 0 && !_usingMP3 && window.A2ElectroswingBeatmap) {
      const LEAD_IN = 2.0;  // must match A2ElectroswingBeatmap.LEAD_IN
      if (_t < LEAD_IN + 0.5) {
        let label, alpha;
        if (_t < 1.0) {
          label = '2';
          alpha = 1.0;
        } else if (_t < LEAD_IN) {
          label = '1';
          alpha = 1.0;
        } else {
          label = 'GO!';
          alpha = Math.max(0, 1 - (_t - LEAD_IN) / 0.5);
        }
        const pulse = 1 + 0.12 * Math.sin(_t * 12);
        _ctx.save();
        _ctx.globalAlpha  = alpha;
        _ctx.font         = `bold ${Math.round(72 * pulse)}px monospace`;
        _ctx.textAlign    = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.fillStyle    = label === 'GO!' ? '#00ff88' : '#ffffff';
        _ctx.shadowColor  = label === 'GO!' ? '#00ff88' : '#aaddff';
        _ctx.shadowBlur   = 24;
        _ctx.fillText(label, W / 2, H / 2 - 40);
        _ctx.restore();
      }
    }

    // ── Intro card / countdown (drawn last, on top of everything) ─────
    if (_card) {
      if (!_card.dismissed) {
        _drawIntroCard(W, H, 1.0);
      } else {
        // Card fades out over 350ms; countdown overlays immediately
        const cardAlpha = Math.max(0, 1 - _card.countdownT / 0.35);
        if (cardAlpha > 0) _drawIntroCard(W, H, cardAlpha);
        _drawCardCountdown(W, H);
      }
    }
  }

  // ── HA trimer diagram ──────────────────────────────────────────────────

  function _drawHADiagram(x0, H) {
    // Only draw when there is enough horizontal space to the left of the lanes
    if (x0 < 150) return;

    const fp   = _fusionProgress;     // 0 (ground state) → 1 (fused)
    const dW   = 124;                 // panel width
    const dH   = 256;                 // panel height (excluding label)
    const dX   = Math.floor(x0 / 2); // center X of panel
    const dBY  = Math.floor(H * 0.72);  // bottom Y — viral membrane
    const dTop = dBY - dH;           // top Y — endosomal membrane

    // ── Panel background ───────────────────────────────────────────────
    _ctx.fillStyle = 'rgba(0,0,0,0.45)';
    _roundRect(dX - dW / 2, dTop - 28, dW, dH + 42, 8);
    _ctx.fill();

    // ── Title ──────────────────────────────────────────────────────────
    _ctx.fillStyle    = 'rgba(200,169,81,0.85)';
    _ctx.font         = 'bold 10px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('HA TRIMER', dX, dTop - 14);

    // ── Viral membrane (bottom, orange) ────────────────────────────────
    _ctx.strokeStyle = '#ff8833';
    _ctx.lineWidth   = 3;
    _ctx.beginPath();
    _ctx.moveTo(dX - dW / 2 + 10, dBY);
    _ctx.lineTo(dX + dW / 2 - 10, dBY);
    _ctx.stroke();
    // Lipid tail stubs below membrane
    _ctx.lineWidth   = 1.5;
    _ctx.strokeStyle = '#ff883355';
    for (let i = 0; i < 6; i++) {
      const lx = dX - dW / 2 + 14 + i * 17;
      _ctx.beginPath();
      _ctx.moveTo(lx, dBY); _ctx.lineTo(lx, dBY + 8);
      _ctx.stroke();
    }

    // ── Transmembrane anchor ───────────────────────────────────────────
    _ctx.strokeStyle = '#88ccff88';
    _ctx.lineWidth   = 3;
    _ctx.beginPath();
    _ctx.moveTo(dX, dBY); _ctx.lineTo(dX, dBY - 12);
    _ctx.stroke();

    // ── HA2 coiled-coil stem ───────────────────────────────────────────
    // Stem length grows as the coiled-coil fires (fp 0.3 → 0.7)
    const stemExt = fp < 0.3 ? 0 : Math.min(1, (fp - 0.3) / 0.4);
    const stemLen = 72 + stemExt * 52;        // 72 → 124 px
    const stemBaseY = dBY - 12;
    const stemTopY  = stemBaseY - stemLen;

    // Two sinusoidal strands (coiled-coil schematic)
    for (let side = -1; side <= 1; side += 2) {
      _ctx.beginPath();
      const steps = 24;
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        const sy   = stemBaseY - frac * stemLen;
        const sx   = dX + side * (4 + 3 * Math.sin(frac * Math.PI * 4.5));
        if (s === 0) _ctx.moveTo(sx, sy);
        else         _ctx.lineTo(sx, sy);
      }
      _ctx.strokeStyle = '#88ccff';
      _ctx.lineWidth   = 2.5;
      _ctx.stroke();
    }

    // ── HA1 globular heads ─────────────────────────────────────────────
    // Heads spread outward as fp increases (0.1 → 0.55)
    const headSpread = fp < 0.1 ? 0 : Math.min(1, (fp - 0.1) / 0.45);
    const headSep    = headSpread * 26;   // 0 → 26 px from centre
    const headCY     = stemTopY - 14;
    const headRX     = 13, headRY = 16;

    for (let side = -1; side <= 1; side += 2) {
      const hx = dX + side * (headRX * 0.5 + headSep);
      _ctx.beginPath();
      _ctx.ellipse(hx, headCY, headRX, headRY, side * 0.15, 0, Math.PI * 2);
      _ctx.fillStyle   = '#00cc8833';
      _ctx.fill();
      _ctx.strokeStyle = '#00cc88';
      _ctx.lineWidth   = 2;
      _ctx.stroke();
    }

    // ── Fusion peptide ─────────────────────────────────────────────────
    // Appears at fp > 0.15; travels toward endosomal membrane at fp > 0.6
    if (fp > 0.15) {
      const fpVis    = Math.min(1, (fp - 0.15) / 0.12);
      const fpTravel = fp < 0.6 ? 0 : Math.min(1, (fp - 0.6) / 0.35);
      const fpBaseY  = stemTopY - 6;
      // Membrane is at dTop + 10; FP tip travels from fpBaseY toward it
      const fpTipY   = fpBaseY - fpTravel * (fpBaseY - dTop - 14);

      _ctx.globalAlpha = fpVis;
      _ctx.beginPath();
      _ctx.moveTo(dX,      fpTipY);         // apex
      _ctx.lineTo(dX - 10, fpTipY + 16);
      _ctx.lineTo(dX + 10, fpTipY + 16);
      _ctx.closePath();
      _ctx.fillStyle   = '#ffdd4455';
      _ctx.fill();
      _ctx.strokeStyle = '#ffdd44';
      _ctx.lineWidth   = 1.8;
      _ctx.stroke();
      _ctx.globalAlpha = 1;

      // Dotted tether to endosomal membrane when close enough
      if (fp > 0.72) {
        const tetherAlpha = Math.min(1, (fp - 0.72) / 0.18) * fpVis;
        _ctx.globalAlpha  = tetherAlpha * 0.7;
        _ctx.setLineDash([3, 4]);
        _ctx.strokeStyle = '#ffdd44';
        _ctx.lineWidth   = 1.2;
        _ctx.beginPath();
        _ctx.moveTo(dX, fpTipY);
        _ctx.lineTo(dX, dTop + 10);
        _ctx.stroke();
        _ctx.setLineDash([]);
        _ctx.globalAlpha = 1;
      }
    }

    // ── Endosomal membrane (top, blue) — fades in at fp > 0.48 ─────────
    if (fp > 0.48) {
      const endAlpha = Math.min(1, (fp - 0.48) / 0.20);
      _ctx.globalAlpha = endAlpha;
      _ctx.strokeStyle = '#4488ff';
      _ctx.lineWidth   = 3;
      _ctx.beginPath();
      _ctx.moveTo(dX - dW / 2 + 10, dTop + 10);
      _ctx.lineTo(dX + dW / 2 - 10, dTop + 10);
      _ctx.stroke();
      // Lipid tail stubs above endosomal membrane
      _ctx.lineWidth   = 1.5;
      _ctx.strokeStyle = '#4488ff55';
      for (let i = 0; i < 6; i++) {
        const lx = dX - dW / 2 + 14 + i * 17;
        _ctx.beginPath();
        _ctx.moveTo(lx, dTop + 10); _ctx.lineTo(lx, dTop + 2);
        _ctx.stroke();
      }
      _ctx.globalAlpha = 1;
    }

    // ── Progress bar (right edge of panel) ────────────────────────────
    const pbX  = dX + dW / 2 - 8;
    const pbH  = dH - 16;
    const pbY  = dTop + 8;
    _ctx.fillStyle = 'rgba(255,255,255,0.07)';
    _ctx.fillRect(pbX, pbY, 4, pbH);
    _ctx.fillStyle = '#C8A951';
    _ctx.fillRect(pbX, pbY + pbH * (1 - fp), 4, pbH * fp);
    // Dot at current position
    _ctx.beginPath();
    _ctx.arc(pbX + 2, pbY + pbH * (1 - fp), 4, 0, Math.PI * 2);
    _ctx.fillStyle = '#C8A951';
    _ctx.fill();

    // ── "FUSION PROGRESS" micro-label ─────────────────────────────────
    _ctx.save();
    _ctx.translate(pbX + 2, pbY + pbH / 2);
    _ctx.rotate(-Math.PI / 2);
    _ctx.fillStyle    = 'rgba(200,169,81,0.35)';
    _ctx.font         = '8px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText('FUSION PROGRESS', 0, 0);
    _ctx.restore();
  }

  // ── Phase intro card ───────────────────────────────────────────────────

  function _drawIntroCard(W, H, extraAlpha = 1) {
    if (!_card) return;

    const fadeIn = Math.min(1, _card.t / 0.28);
    const alpha  = fadeIn * extraAlpha;

    _ctx.globalAlpha = alpha;

    // Dim overlay behind card
    _ctx.fillStyle = 'rgba(0,0,0,0.72)';
    _ctx.fillRect(0, 0, W, H);

    // Side-by-side layout: animation left, text right
    const ANIM_W  = 580;
    const cardW   = Math.min(960, W - 30);
    const cardH   = 440;
    const cX      = W / 2;
    const cY      = H / 2;
    const cardL   = cX - cardW / 2;
    const cardT_  = cY - cardH / 2;

    // Card background
    _ctx.fillStyle = 'rgba(8,12,30,0.96)';
    _roundRect(cardL, cardT_, cardW, cardH, 14);
    _ctx.fill();
    _ctx.strokeStyle = 'rgba(200,169,81,0.55)';
    _ctx.lineWidth   = 1.5;
    _ctx.stroke();

    const pi = _card.phaseIdx;

    // ── 3-D HA animation (left panel) ────────────────────────────────────
    const animPad = 14;
    const CIT_H   = 46;                             // citation + PDB label strip below viewers
    const LABEL_H = 22;                             // X / Y / Z label strip above viewers
    const animX   = cardL + animPad;
    const animY   = cardT_ + animPad;
    const animW   = Math.min(ANIM_W, cardW * 0.60);
    const animH   = cardH - animPad * 2;             // total left-panel height
    const viewH   = animH - CIT_H;                  // labels + viewers (excludes citation)

    if (window.A2MolViewer && window.A2MolViewer.ready) {
      // ── Real PDB structures via 3Dmol (three panels) ──────────────────────
      if (!_card._molShown) {
        _card._molShown = true;
        // Viewers sit below the label strip
        A2MolViewer.show(animX, animY + LABEL_H, animW, viewH - LABEL_H, pi);
      }
      A2MolViewer.setAlpha(alpha);

      // X / Y / Z labels above each viewer panel
      const lblCenters = A2MolViewer.panelCenters(animX, animW);
      const lblY       = animY + LABEL_H / 2;
      _ctx.font         = 'bold 13px monospace';
      _ctx.textBaseline = 'middle';
      _ctx.textAlign    = 'center';
      ['X', 'Y', 'Z'].forEach((lbl, i) => {
        _ctx.globalAlpha = alpha;
        _ctx.fillStyle   = 'rgba(200,169,81,0.90)';
        _ctx.fillText(lbl, lblCenters[i], lblY);
      });

      // Thin gold separator lines between panels
      _ctx.strokeStyle = 'rgba(200,169,81,0.18)';
      _ctx.lineWidth   = 1;
      [1, 2].forEach(i => {
        const sx = Math.round(lblCenters[i] - (animW / 3) / 2) - 4;
        _ctx.beginPath();
        _ctx.moveTo(sx, animY + LABEL_H + 6);
        _ctx.lineTo(sx, animY + viewH - 6);
        _ctx.stroke();
      });

      // Citation line (top of the strip below viewers)
      const stripTop = animY + viewH;
      _ctx.globalAlpha = alpha * 0.80;
      _ctx.fillStyle    = 'rgba(200,169,81,0.75)';
      _ctx.font         = '10px sans-serif';
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(
        'Benton et al., Nature 583, 2020  ·  doi:10.1038/s41586-020-2333-6',
        animX + animW / 2,
        stripTop + 11
      );

      // PDB accession centered below the citation (all panels show the same structure)
      const pdbCode = A2MolViewer.pdbsForPhase(pi)[0];
      _ctx.font         = 'bold 11px monospace';
      _ctx.textBaseline = 'middle';
      _ctx.textAlign    = 'center';
      _ctx.globalAlpha  = alpha * 0.90;
      _ctx.fillStyle    = 'rgba(200,169,81,0.95)';
      _ctx.fillText('PDB: ' + pdbCode, animX + animW / 2, stripTop + 34);
      _ctx.globalAlpha = alpha;
    } else if (window.A2HAAnim) {
      // ── Fallback: schematic Three.js animation ────────────────────────────
      _ctx.save();
      _roundRect(animX, animY, animW, animH, 8);
      _ctx.clip();
      _ctx.globalAlpha = alpha;
      window.A2HAAnim.render(_ctx, animX, animY, animW, animH, pi);
      _ctx.restore();
      _ctx.globalAlpha = alpha;
    }

    // Divider between animation and text
    _ctx.strokeStyle = 'rgba(200,169,81,0.22)';
    _ctx.lineWidth   = 1;
    _ctx.beginPath();
    _ctx.moveTo(animX + animW + animPad, cardT_ + 20);
    _ctx.lineTo(animX + animW + animPad, cardT_ + cardH - 20);
    _ctx.stroke();

    // ── Text panel (right side) ───────────────────────────────────────────
    const textPanL = animX + animW + animPad * 2 + 4;
    const textPanW = (cardL + cardW) - textPanL - 16;
    const textCX   = textPanL + textPanW / 2;

    // Phase counter (top-right corner of text panel)
    _ctx.fillStyle    = 'rgba(200,169,81,0.50)';
    _ctx.font         = '10px monospace';
    _ctx.textAlign    = 'right';
    _ctx.textBaseline = 'top';
    _ctx.fillText(`${pi + 1} / 5`, cardL + cardW - 18, cardT_ + 14);

    // Phase label
    _ctx.fillStyle    = '#C8A951';
    _ctx.font         = 'bold 13px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(PHASE_LABELS[pi], textCX, cardT_ + 38);

    // Separator under label
    _ctx.strokeStyle = 'rgba(200,169,81,0.28)';
    _ctx.lineWidth   = 1;
    _ctx.beginPath();
    _ctx.moveTo(textPanL, cardT_ + 60);
    _ctx.lineTo(textPanL + textPanW, cardT_ + 60);
    _ctx.stroke();

    // Description text (multi-line, word-wrapped to panel width)
    const lines = PHASE_DESC[pi].split('\n');
    const lineH = 26;
    const textStartY = cardT_ + 80;
    _ctx.fillStyle    = '#b8d8ba';
    _ctx.font         = '13px sans-serif';
    _ctx.textAlign    = 'left';
    _ctx.textBaseline = 'top';
    for (let li = 0; li < lines.length; li++) {
      _ctx.fillText(lines[li], textPanL, textStartY + li * lineH, textPanW);
    }

    // "GROOVE ON »" button
    if (!_card.dismissed) {
      const btnW  = 160;
      const btnH  = 38;
      const btnX  = textCX - btnW / 2;
      const btnY  = cardT_ + cardH - 58;
      _card.btnRect = { x: btnX, y: btnY, w: btnW, h: btnH };

      const pulse = 0.5 + 0.5 * Math.sin(_card.t * 3.8);
      _roundRect(btnX, btnY, btnW, btnH, 7);
      _ctx.fillStyle   = `rgba(200,169,81,${(0.15 + 0.10 * pulse).toFixed(2)})`;
      _ctx.fill();
      _ctx.strokeStyle = `rgba(200,169,81,${(0.55 + 0.35 * pulse).toFixed(2)})`;
      _ctx.lineWidth   = 1.5;
      _ctx.stroke();

      _ctx.fillStyle    = `rgba(255,235,150,${(0.82 + 0.18 * pulse).toFixed(2)})`;
      _ctx.font         = 'bold 13px monospace';
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText('GROOVE ON  »', textCX, btnY + btnH / 2);
    }

    _ctx.globalAlpha = 1;
  }

  // ── Post-dismiss countdown (3 → 2 → 1, beat-synced) ──────────────────
  function _drawCardCountdown(W, H) {
    if (!_card || !_card.dismissed) return;

    const BEAT          = 0.5;   // 120 BPM
    const BEATS_PER_NUM = 2;     // each number lasts 2 beats = 1 s
    const TOTAL         = 3 * BEATS_PER_NUM * BEAT;  // 3.0 s

    // Derive elapsed time from audio clock when available; fall back to dt sum
    const audioCtx = _p3._snd && _p3._snd.audioCtx;
    let ct;
    if (_card.beat0 !== null && _card.beat0 !== undefined && audioCtx) {
      ct = audioCtx.currentTime - _card.beat0;
    } else {
      ct = _card.countdownT;
    }
    if (ct < 0 || ct >= TOTAL) return;

    const numWindow = BEATS_PER_NUM * BEAT;           // 1.0 s per number
    const numIdx    = Math.floor(ct / numWindow);     // 0, 1, 2
    const num       = 3 - numIdx;                     // 3, 2, 1
    const fracInNum = (ct % numWindow) / numWindow;   // 0→1 within that number's window

    // Also compute beat fraction for the pop-on-beat effect within each number
    const beatFrac  = (ct % BEAT) / BEAT;             // 0→1 within each beat

    // Size: pops large on each beat, settles back down
    const scale = 1.0 + 0.20 * Math.pow(1 - beatFrac, 3);

    // Alpha: quick fade-in at start of each number, sharp cut at end
    const fadeIn  = Math.min(1, fracInNum * 8);
    const fadeOut = fracInNum > 0.88 ? Math.max(0, 1 - (fracInNum - 0.88) / 0.12) : 1;
    const alpha   = fadeIn * fadeOut;

    _ctx.save();
    _ctx.globalAlpha  = alpha;
    _ctx.font         = `bold ${Math.round(92 * scale)}px monospace`;
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillStyle    = num === 1 ? '#00ff88' : '#ffffff';
    _ctx.shadowColor  = num === 1 ? '#00ff88' : '#88aaff';
    _ctx.shadowBlur   = 38;
    _ctx.fillText(String(num), W / 2, H / 2 - 44);
    _ctx.restore();
  }

  // ── Virion rendering ───────────────────────────────────────────────────

  /**
   * Draw an influenza virion disk: sphere-shaded lipid envelope + HA trimer spikes.
   * Each spike = short stalk + three splayed head arms (Y-shape), representing
   * the HA1 globular head domains atop the HA2 stalk.
   * Spikes slowly rotate over time (_t) to imply 3-D tumbling.
   */
  function _drawVirion(cx, cy, R, col) {
    const N     = Math.round(R * 0.44);   // spike count (~10 at R=24, ~8 at R=18)
    const ST    = R * 0.30;               // stalk length
    const HD    = R * 0.22;               // head arm length
    const HANG  = 0.58;                   // radians between each of the 3 head arms
    const rot   = _t * 0.28;             // slow rotation (rad/s)

    _ctx.save();
    _ctx.lineCap  = 'round';
    _ctx.lineJoin = 'round';

    // ── HA spikes (drawn first so body covers their bases) ────────────────
    _ctx.strokeStyle = col + 'cc';
    _ctx.lineWidth   = 1.5;

    for (let i = 0; i < N; i++) {
      const a  = (i / N) * Math.PI * 2 + rot;
      const bx = cx + Math.cos(a) * R;            // stalk base on membrane
      const by = cy + Math.sin(a) * R;
      const tx = cx + Math.cos(a) * (R + ST);     // stalk tip
      const ty = cy + Math.sin(a) * (R + ST);

      // Stalk
      _ctx.beginPath();
      _ctx.moveTo(bx, by);
      _ctx.lineTo(tx, ty);
      _ctx.stroke();

      // Three head arms (HA1 globular domains)
      for (let j = -1; j <= 1; j++) {
        const ha = a + j * HANG;
        _ctx.beginPath();
        _ctx.moveTo(tx, ty);
        _ctx.lineTo(tx + Math.cos(ha) * HD, ty + Math.sin(ha) * HD);
        _ctx.stroke();
      }

      // Tiny dot at each head tip (receptor-binding site)
      _ctx.fillStyle = col + 'ee';
      for (let j = -1; j <= 1; j++) {
        const ha = a + j * HANG;
        _ctx.beginPath();
        _ctx.arc(tx + Math.cos(ha) * HD, ty + Math.sin(ha) * HD, 1.8, 0, Math.PI * 2);
        _ctx.fill();
      }
    }

    // ── Lipid envelope body (gradient gives 3-D sphere illusion) ──────────
    const hiX  = cx - R * 0.28;
    const hiY  = cy - R * 0.28;
    const grad = _ctx.createRadialGradient(hiX, hiY, R * 0.05, cx, cy, R);
    grad.addColorStop(0.00, col + 'ff');   // specular highlight
    grad.addColorStop(0.40, col + 'cc');
    grad.addColorStop(1.00, col + '44');   // dark limb

    _ctx.beginPath();
    _ctx.arc(cx, cy, R, 0, Math.PI * 2);
    _ctx.fillStyle = grad;
    _ctx.fill();
    _ctx.strokeStyle = col + 'dd';
    _ctx.lineWidth   = 1.5;
    _ctx.stroke();

    _ctx.restore();
  }

  // ── Node drawing ───────────────────────────────────────────────────────

  function _drawNode(n, x0, laneW, gap, hitY) {
    const col   = LANE_COLS[n.lane];
    const cx    = x0 + n.lane * (laneW + gap) + laneW / 2;
    const nodeY = hitY - (n.hitTime - _t) * P3D_CFG.A2_NODE_SPD;

    if (nodeY < -80 || nodeY > hitY + 80) return;

    let alpha = 1;
    if (n.state === 'hit' || n.state === 'missed') {
      const age = _t - n.flashT;
      if (age > 0.3) return;
      alpha = n.state === 'hit' ? (1 - age / 0.3) : (1 - age / 0.3) * 0.3;
    }
    _ctx.globalAlpha = alpha;

    if (n.type === 'HOLD') {
      _drawHoldNode(n, cx, nodeY, col);
    } else if (n.type === 'SYNC') {
      // Purple outer ring marks SYNC, virion body inside
      _ctx.beginPath();
      _ctx.arc(cx, nodeY, 28, 0, Math.PI * 2);
      _ctx.strokeStyle = '#dd44ff';
      _ctx.lineWidth   = 3;
      _ctx.stroke();
      _drawVirion(cx, nodeY, 24, col);
    } else {
      _drawVirion(cx, nodeY, 24, col);
    }

    _ctx.globalAlpha = 1;
  }

  function _drawHoldNode(n, cx, headY, col) {
    const tailLen = n.holdDur * P3D_CFG.A2_NODE_SPD;
    const R       = 18;
    const rectX   = cx - R;
    const rectY   = headY - tailLen;
    const rectH   = tailLen;

    _ctx.fillStyle   = col + '44';
    _ctx.strokeStyle = col + 'aa';
    _ctx.lineWidth   = 2;
    _roundRect(rectX, rectY, R * 2, rectH + R, R);
    _ctx.fill(); _ctx.stroke();

    if (n.state === 'holding' && n.holdProgress > 0) {
      const fillH = n.holdProgress * (rectH + R);
      _ctx.fillStyle = col + '88';
      _roundRect(rectX, rectY + (rectH + R) - fillH, R * 2, fillH, R);
      _ctx.fill();
    }

    _drawVirion(cx, headY, R, col);
  }

  function _roundRect(x, y, w, h, r) {
    const safeR = Math.min(r, w / 2, h / 2);
    _ctx.beginPath();
    _ctx.moveTo(x + safeR, y);
    _ctx.lineTo(x + w - safeR, y);
    _ctx.quadraticCurveTo(x + w, y, x + w, y + safeR);
    _ctx.lineTo(x + w, y + h - safeR);
    _ctx.quadraticCurveTo(x + w, y + h, x + w - safeR, y + h);
    _ctx.lineTo(x + safeR, y + h);
    _ctx.quadraticCurveTo(x, y + h, x, y + h - safeR);
    _ctx.lineTo(x, y + safeR);
    _ctx.quadraticCurveTo(x, y, x + safeR, y);
    _ctx.closePath();
  }

  // ── Input ──────────────────────────────────────────────────────────────

  function _onCanvasClick(e) {
    const rect = _canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (_canvas.width  / rect.width);
    const my   = (e.clientY - rect.top)  * (_canvas.height / rect.height);

    // Debug buttons (available whenever no card is showing)
    if (!_card) {
      // CSV copy button
      if (_debugCsvBtnRect) {
        const cb = _debugCsvBtnRect;
        if (mx >= cb.x && mx <= cb.x + cb.w && my >= cb.y && my <= cb.y + cb.h) {
          const header = 'gameT,hitTime,drift,musicT,lane,laneLabel,type';
          const rows   = _hitLog.map(r =>
            `${r.gameT},${r.hitTime},${r.drift},${r.musicT ?? ''},${r.lane},${LANE_LABELS[r.lane]},${r.type}`
          );
          const csv = [header, ...rows].join('\n');
          navigator.clipboard.writeText(csv).then(() => {
            _csvCopiedFlash = 2.0;
          }).catch(() => {
            // Clipboard blocked — fall back to a prompt the user can copy from
            window.prompt('Copy this CSV (Ctrl+C / Cmd+C):', csv);
          });
          return;
        }
      }
      // Pause button
      if (_debugPauseBtnRect) {
        const pb = _debugPauseBtnRect;
        if (mx >= pb.x && mx <= pb.x + pb.w && my >= pb.y && my <= pb.y + pb.h) {
          _debugPaused = !_debugPaused;
          if (_usingMP3 && window.A2MP3Player && window.A2MP3Player._audio) {
            if (_debugPaused) window.A2MP3Player._audio.pause();
            else window.A2MP3Player._audio.play().catch(() => {});
          }
          return;
        }
      }
    }

    if (!_card || _card.dismissed) return;
    const b    = _card.btnRect;
    if (!b || mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return;

    _card.dismissed  = true;
    _card.countdownT = 0;

    if (_usingMP3 && window.A2MP3Player) {
      // MP3 path: stop loop, compute nearest beat in track for resume seek
      window.A2MP3Player.stopLoop();
      const BEAT_DUR  = 60 / A2MP3_BPM;
      const DOWNBEAT  = A2MP3_DOWNBEAT;
      const pausedAt  = window.A2MP3Player._pausedAt || 0;
      const beatIdx   = Math.ceil((pausedAt - DOWNBEAT) / BEAT_DUR + 0.05);
      _card.resumeSeekT  = DOWNBEAT + beatIdx * BEAT_DUR;
      _card.beat0        = null;
      _card.resumeAudioT = null;
      // Sync beatmap: all phases use LEAD_TIME countdown so browser has time to seek.
      // gameAtResume = 0 for all phases (_t = -LEAD_TIME, song resumes when _t >= 0).
      if (window.A2MP3Beatmap) {
        const LEAD_TIME = 3.0;
        window.A2MP3Beatmap.setSongOffset(_card.resumeSeekT, 0);
        _nodes        = [];
        _nodePtr      = 0;
        _activeNodes.length = 0;   // clear stale hit/miss nodes from previous phase
        _t         = -LEAD_TIME;
        // Phase A: lead-in counts from -LEAD_TIME (no kicks before song start anyway).
        // Phase B+: start from 0 so buildPhaseLoop only picks kicks at/after seekT.
        _lastNodeT = (_phaseIdx === 0) ? -LEAD_TIME : 0;
        _appendPhaseLoop();
      }
    } else {
      // Electroswing path: snap countdown to next beat boundary on audioCtx clock
      const BEAT           = 0.5;          // 120 BPM quarter note
      const BEATS_PER_NUM  = 2;
      const audioCtx = _p3._snd && _p3._snd.audioCtx;
      if (audioCtx && _synthStartAt) {
        const now       = audioCtx.currentTime;
        const elapsed   = now - _synthStartAt;
        const beatPhase = ((elapsed % BEAT) + BEAT) % BEAT;
        const toNext    = beatPhase > BEAT * 0.05 ? BEAT - beatPhase : 0;
        _card.beat0        = now + toNext;
        _card.resumeAudioT = _card.beat0 + 3 * BEATS_PER_NUM * BEAT;
        _card.resumeSeekT  = null;
      } else {
        _card.beat0        = null;
        _card.resumeAudioT = null;
        _card.resumeSeekT  = null;
      }
    }
  }

  function _onKeyDown(e) {
    if (_keys[e.code]) return;
    _keys[e.code] = true;
    // Ignore lane hits during intro cards
    if (_card) return;
    const lane = LANE_KEYS.indexOf(e.code);
    if (lane >= 0) _tryHitLane(lane);
  }

  function _onKeyUp(e) {
    _keys[e.code] = false;
  }

  function _removeInput() {
    window.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('keyup',   _onKeyUp);
    for (const k in _keys) delete _keys[k];
  }

  // ── Pause / resume ─────────────────────────────────────────────────────

  function _pause()  { _paused = true;  }
  function _resume() { _paused = false; }

  // ── Destroy ────────────────────────────────────────────────────────────

  function destroy() {
    _running = false;
    _paused  = false;
    _removeInput();
    _destroyCanvas();
    if (window.A2MolViewer) A2MolViewer.destroy();
    if (window.A2MP3Player)         window.A2MP3Player.stop();
    if (window.A2ElectroswingSynth) window.A2ElectroswingSynth.stop();
    if (window.P3DMatLib && P3DMatLib.endosome) {
      P3DMatLib.endosome.emissiveIntensity = 0.6;
    }
    _p3 = null;
  }

  // ── Public interface ───────────────────────────────────────────────────

  const pub = {
    get _running() { return _running; },
    init,
    start,
    tick,
    _pause,
    _resume,
    destroy,
  };

  window.P3DAct2BossBattle = pub;
  return pub;
})();
