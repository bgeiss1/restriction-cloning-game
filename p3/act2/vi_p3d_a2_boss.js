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
 * Immune Resistance (IR) rises on misses; game-over at IR ≥ A2_IR_FAIL (16).
 * M2 token carryover from Act 1 gives a free IR buffer (−1 per token, max 3).
 */
const P3DAct2BossBattle = (() => {

  // ── Constants ──────────────────────────────────────────────────────────
  const N_LANES     = 3;
  const LANE_KEYS   = ['KeyA', 'KeyS', 'KeyD'];
  const LANE_LABELS = ['A', 'S', 'D'];
  const LANE_COLS   = ['#00cc88', '#C8A951', '#4488ff'];
  const LANE_BIO    = ['HA1 · Head', 'HA2 · Stem', 'FP · Peptide'];

  const CARD_DUR = 3.2;   // seconds each intro card is displayed

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
  let _t        = 0;
  let _totalDur = 0;

  // Phase
  let _phaseIdx    = 0;
  let _phaseStartT = [];

  // Node pool
  let _nodes       = [];
  let _nodePtr     = 0;
  let _activeNodes = [];

  // Sync
  let _syncTotal  = 0;
  let _syncHits   = 0;
  let _nextSyncId = 0;

  // Scoring / survival
  let _score    = 0;
  let _ir       = 0;
  let _irFail   = P3D_CFG.A2_IR_FAIL;
  let _combo    = 0;
  let _maxCombo = 0;
  let _perfect  = 0;
  let _good     = 0;
  let _misses   = 0;

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

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function init(p3, act1Stats) {
    _p3 = p3;

    _t              = 0;
    _nodePtr        = 0;
    _activeNodes    = [];
    _heldNode       = [null, null, null];
    _judgFlash      = [null, null, null];
    _score          = 0;
    _combo          = 0;
    _maxCombo       = 0;
    _perfect        = 0;
    _good           = 0;
    _misses         = 0;
    _syncHits       = 0;
    _syncTotal      = 0;
    _nextSyncId     = 0;
    _beatFlash      = 0;
    _orbitAngle     = 0;
    _phaseIdx       = 0;
    _fusionProgress = 0;
    _perf           = 0.4;
    _card           = null;

    // M2 carryover: each token offsets 1 IR (max 3)
    const m2 = (act1Stats && (act1Stats.m2 || act1Stats.m2Tokens)) || 0;
    _ir    = -Math.min(m2, P3D_CFG.M2_IR_MAX);
    _irFail = P3D_CFG.A2_IR_FAIL;

    _lookY = -((act1Stats && act1Stats.depth) || 80);

    // Build phase timing
    _phaseStartT = [];
    let acc = 0;
    for (const k of PHASE_KEYS) {
      _phaseStartT.push(acc);
      acc += P3D_CFG.A2_PHASE_DUR[k];
    }
    _totalDur = acc;

    _nodes = _generateNodes();

    // Prime HUD
    _p3._hud.updateIR(Math.max(0, _ir), _irFail);
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
    _p3._edu.trigger('HA_LOOSEN');

    // Start SMB music, then immediately pause for the Phase A intro card
    if (window.A2SMBSynth) {
      try {
        window.A2SMBSynth.init(_p3._snd);
        const ctx = _p3._snd.audioCtx;
        if (ctx) {
          window.A2SMBSynth.start(ctx.currentTime + 0.05);
          window.A2SMBSynth.pauseForCard();
        }
      } catch(e) {
        console.error('[A2SMBSynth] start failed:', e);
      }
    }

    // Show intro card for Phase A before any notes fall
    _card = { phaseIdx: 0, t: 0 };
  }

  // ── Main tick ──────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_running || _paused) return;

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

    // ── Intro card — freeze game time ────────────────────────────────
    if (_card) {
      _card.t += dt;
      _render();
      if (_card.t >= CARD_DUR) {
        _card = null;
        if (window.A2SMBSynth) window.A2SMBSynth.resumeFromCard();
      }
      return;
    }

    _t += dt;

    // ── Perf drift toward neutral (0.4) at 0.5 u/s ──────────────────
    if (_perf > 0.4) _perf = Math.max(0.4, _perf - 0.5 * dt);
    else             _perf = Math.min(0.4, _perf + 0.5 * dt);

    // ── Fusion progress lerp to perf-driven target ───────────────────
    const phaseMin     = _phaseIdx / 5;
    const phaseMax     = (_phaseIdx + 1) / 5;
    const fusionTarget = phaseMin + _perf * (phaseMax - phaseMin);
    _fusionProgress   += (fusionTarget - _fusionProgress) * Math.min(1, 2.5 * dt);

    // ── Phase transition ─────────────────────────────────────────────
    const newPhase = _phaseAt(_t);
    if (newPhase !== _phaseIdx) {
      _phaseIdx = newPhase;
      _p3._hud.updateA2Phase(PHASE_LABELS[_phaseIdx]);
      _p3._edu.trigger(PHASE_EDU[_phaseIdx]);
      // Drop any stale nodes from the previous phase; cancel held notes
      _activeNodes = _activeNodes.filter(n => n.hitTime >= _phaseStartT[_phaseIdx]);
      for (let li = 0; li < N_LANES; li++) _heldNode[li] = null;
      _card = { phaseIdx: _phaseIdx, t: 0 };
      if (window.A2SMBSynth) window.A2SMBSynth.pauseForCard();
      _render();
      return;
    }

    // ── Activate pending nodes ───────────────────────────────────────
    const canvasH   = _canvas ? _canvas.height : 600;
    const hitZoneY  = canvasH - P3D_CFG.A2_HIT_Y;
    const lookahead = (hitZoneY + 60) / P3D_CFG.A2_NODE_SPD;

    while (_nodePtr < _nodes.length &&
           _nodes[_nodePtr].hitTime <= _t + lookahead) {
      _activeNodes.push(_nodes[_nodePtr++]);
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
          _score += Math.floor(P3D_CFG.A2_PTS_HOLD * frac);
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
          _score += P3D_CFG.A2_PTS_HOLD;
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
    _p3._hud.updateIR(Math.max(0, _ir), _irFail);
    _p3._hud.updateProgress(Math.min(100, (_t / _totalDur) * 100));

    // ── Canvas render ─────────────────────────────────────────────────
    _render();

    // ── Fail check ───────────────────────────────────────────────────
    if (_ir >= _irFail && !window._p3dNoFail) {
      _complete('fail');
      return;
    }

    // ── Completion ────────────────────────────────────────────────────
    if (_t >= _totalDur + 1.5) {
      _complete('done');
    }
  }

  // ── Beat-map generation ────────────────────────────────────────────────

  function _generateNodes() {
    // Use SMB-derived beatmap when available; fall back to LCG otherwise.
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
    _score += pts;
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
      _score += P3D_CFG.A2_PTS_SYNC;
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

    const irDelta = node.type === 'SYNC'
      ? P3D_CFG.A2_IR_SYNC_MISS
      : P3D_CFG.A2_IR_MISS;
    _ir += irDelta;
    _misses++;
    _combo = 0;
    _perf = Math.max(0, _perf - 0.25);

    _judgFlash[node.lane] = { text: 'MISS', t: _t };
    _p3._hud.updateIR(Math.max(0, _ir), _irFail);
    _p3._hud.updateCombo(0);
    _p3._hud.showDamageFlash?.();

    if (_ir >= 4 && _ir < 4 + irDelta) _p3._edu.trigger('AB_BLOCK');
  }

  // ── Phase helper ───────────────────────────────────────────────────────

  function _phaseAt(t) {
    for (let i = _phaseStartT.length - 1; i >= 0; i--) {
      if (t >= _phaseStartT[i]) return i;
    }
    return 0;
  }

  // ── Complete / fail ────────────────────────────────────────────────────

  function _complete(reason) {
    _running = false;
    _removeInput();
    _destroyCanvas();
    if (window.A2SMBSynth) window.A2SMBSynth.stop();
    if (window.P3DMatLib && P3DMatLib.endosome) {
      P3DMatLib.endosome.emissiveIntensity = 0.6;
    }

    if (reason === 'fail') {
      _p3._fail('Immune resistance overwhelmed the fusion machinery.');
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
      ir:        Math.max(0, _ir),
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
      pointerEvents: 'none',
      zIndex:        '18',
    });
    document.body.appendChild(cv);
    _canvas = cv;
    _ctx    = cv.getContext('2d');
    _onResize();
    window.addEventListener('resize', _onResize);
  }

  function _destroyCanvas() {
    window.removeEventListener('resize', _onResize);
    if (_canvas) { _canvas.remove(); _canvas = null; _ctx = null; }
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

    // ── Combo display ─────────────────────────────────────────────────
    if (_combo >= 5) {
      const pulse = 0.78 + 0.22 * Math.sin(_t * 7.5);
      _ctx.globalAlpha  = pulse;
      _ctx.fillStyle    = '#C8A951';
      _ctx.font         = 'bold 18px monospace';
      _ctx.textAlign    = 'center';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(`COMBO ×${_combo}`, W / 2, hitY - 110);
      _ctx.globalAlpha = 1;
    }

    // ── Phase label ───────────────────────────────────────────────────
    _ctx.fillStyle    = 'rgba(200,169,81,0.80)';
    _ctx.font         = 'bold 11px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'top';
    _ctx.fillText(PHASE_LABELS[_phaseIdx], W / 2, 12);

    // ── IR warning overlay ────────────────────────────────────────────
    const irPct = Math.max(0, _ir) / _irFail;
    if (irPct > 0.6) {
      const alpha = (irPct - 0.6) / 0.4 * 0.18;
      _ctx.fillStyle = `rgba(239,83,80,${alpha.toFixed(3)})`;
      _ctx.fillRect(0, 0, W, H);
    }

    // ── Intro card (drawn last, on top of everything) ──────────────────
    if (_card) {
      _drawIntroCard(W, H);
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

  function _drawIntroCard(W, H) {
    if (!_card) return;

    const t        = _card.t;
    const progress = Math.min(1, t / CARD_DUR);
    const fadeIn   = Math.min(1, t / 0.28);
    const fadeOut  = t > CARD_DUR - 0.28 ? Math.max(0, (CARD_DUR - t) / 0.28) : 1;
    const alpha    = fadeIn * fadeOut;

    _ctx.globalAlpha = alpha;

    // Dim overlay behind card
    _ctx.fillStyle = 'rgba(0,0,0,0.68)';
    _ctx.fillRect(0, 0, W, H);

    const cardW = Math.min(520, W - 60);
    const cardH = 230;
    const cX    = W / 2;
    const cY    = H / 2;

    // Card background
    _ctx.fillStyle = 'rgba(8,12,30,0.94)';
    _roundRect(cX - cardW / 2, cY - cardH / 2, cardW, cardH, 12);
    _ctx.fill();
    _ctx.strokeStyle = 'rgba(200,169,81,0.55)';
    _ctx.lineWidth   = 1.5;
    _ctx.stroke();

    const pi = _card.phaseIdx;

    // Phase counter (top-right)
    _ctx.fillStyle    = 'rgba(200,169,81,0.50)';
    _ctx.font         = '10px monospace';
    _ctx.textAlign    = 'right';
    _ctx.textBaseline = 'top';
    _ctx.fillText(`${pi + 1} / 5`, cX + cardW / 2 - 18, cY - cardH / 2 + 14);

    // Phase label
    _ctx.fillStyle    = '#C8A951';
    _ctx.font         = 'bold 13px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(PHASE_LABELS[pi], cX, cY - cardH / 2 + 36);

    // Separator
    _ctx.strokeStyle = 'rgba(200,169,81,0.28)';
    _ctx.lineWidth   = 1;
    _ctx.beginPath();
    _ctx.moveTo(cX - cardW / 2 + 24, cY - cardH / 2 + 58);
    _ctx.lineTo(cX + cardW / 2 - 24, cY - cardH / 2 + 58);
    _ctx.stroke();

    // Description text (multi-line)
    const lines  = PHASE_DESC[pi].split('\n');
    const lineH  = 24;
    const textCY = cY + 8;
    _ctx.fillStyle    = '#b8d8ba';
    _ctx.font         = '13px sans-serif';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    for (let li = 0; li < lines.length; li++) {
      const ly = textCY + (li - (lines.length - 1) / 2) * lineH;
      _ctx.fillText(lines[li], cX, ly);
    }

    // Timer bar
    const barW = cardW - 60;
    const barY = cY + cardH / 2 - 22;
    _ctx.fillStyle = 'rgba(255,255,255,0.07)';
    _ctx.fillRect(cX - barW / 2, barY, barW, 3);
    _ctx.fillStyle = '#C8A951';
    _ctx.fillRect(cX - barW / 2, barY, barW * progress, 3);

    _ctx.globalAlpha = 1;
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
      _ctx.beginPath();
      _ctx.arc(cx, nodeY, 24, 0, Math.PI * 2);
      _ctx.fillStyle   = col + '44';
      _ctx.fill();
      _ctx.strokeStyle = '#dd44ff';
      _ctx.lineWidth   = 3;
      _ctx.stroke();
      _ctx.beginPath();
      _ctx.arc(cx, nodeY, 8, 0, Math.PI * 2);
      _ctx.fillStyle = '#dd44ff88';
      _ctx.fill();
    } else {
      _ctx.beginPath();
      _ctx.arc(cx, nodeY, 24, 0, Math.PI * 2);
      _ctx.fillStyle   = col + 'bb';
      _ctx.fill();
      _ctx.strokeStyle = col;
      _ctx.lineWidth   = 2.5;
      _ctx.stroke();
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

    _ctx.beginPath();
    _ctx.arc(cx, headY, R, 0, Math.PI * 2);
    _ctx.fillStyle   = col + 'cc';
    _ctx.fill();
    _ctx.strokeStyle = col;
    _ctx.lineWidth   = 2;
    _ctx.stroke();
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
    if (window.A2SMBSynth) window.A2SMBSynth.stop();
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
