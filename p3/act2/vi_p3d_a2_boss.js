'use strict';
/**
 * P3DAct2BossBattle — Act 2 "Conformational Change" rhythm mini-game.
 *
 * Interface: { get _running(), init(p3, act1Stats), start(), tick(dt),
 *              _pause(), _resume(), destroy() }
 *
 * Three lanes — keys A / S / D.  Nodes fall from the top of each lane and
 * must be hit when they reach the hit zone at the bottom.
 *
 * Phases A–E ramp BPM from 90 → 130, modelling successive steps of HA
 * conformational change during endosomal acidification.
 *
 * Immune Resistance (IR) rises on miss; game-over at IR ≥ A2_IR_FAIL (16).
 * M2 token carryover from Act 1 gives a free IR buffer (−1 per token, max 3).
 *
 * On success: calls P3Descent._act2Done(stats).
 * On fail:    calls P3Descent._fail(reason).
 */
const P3DAct2BossBattle = (() => {

  // ── Constants ──────────────────────────────────────────────────────────
  const N_LANES    = 3;
  const LANE_KEYS  = ['KeyA', 'KeyS', 'KeyD'];
  const LANE_LABELS = ['A', 'S', 'D'];
  const LANE_COLS  = ['#00cc88', '#C8A951', '#4488ff'];

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

  // ── Private state ──────────────────────────────────────────────────────
  let _p3      = null;
  let _running = false;
  let _paused  = false;

  // Canvas
  let _canvas = null;
  let _ctx    = null;

  // Time
  let _t        = 0;
  let _totalDur = 0;

  // Phase
  let _phaseIdx    = 0;
  let _phaseStartT = [];   // absolute start time of each phase

  // Node pool
  let _nodes       = [];   // all pre-generated nodes, sorted by hitTime
  let _nodePtr     = 0;    // next un-activated node
  let _activeNodes = [];   // currently visible subset

  // Sync tracking
  let _syncTotal   = 0;
  let _syncHits    = 0;
  let _nextSyncId  = 0;

  // Scoring / survival
  let _score    = 0;
  let _ir       = 0;
  let _irFail   = P3D_CFG.A2_IR_FAIL;
  let _combo    = 0;
  let _maxCombo = 0;
  let _perfect  = 0;
  let _good     = 0;
  let _misses   = 0;

  // Per-lane hold slot (null or the node currently being held)
  let _heldNode = [null, null, null];

  // Per-lane judgement flash { text, t }
  let _judgFlash = [null, null, null];

  // 3-D scene
  let _orbitAngle = 0;
  let _lookY      = 0;
  let _beatFlash  = 0;   // 0–1, decays; drives endosome emissive

  // Input
  const _keys = {};

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function init(p3, act1Stats) {
    _p3 = p3;

    _t           = 0;
    _nodePtr     = 0;
    _activeNodes = [];
    _heldNode    = [null, null, null];
    _judgFlash   = [null, null, null];
    _score       = 0;
    _combo       = 0;
    _maxCombo    = 0;
    _perfect     = 0;
    _good        = 0;
    _misses      = 0;
    _syncHits    = 0;
    _syncTotal   = 0;
    _nextSyncId  = 0;
    _beatFlash   = 0;
    _orbitAngle  = 0;
    _phaseIdx    = 0;

    // M2 carryover: each token offsets 1 IR point (up to M2_IR_MAX=3)
    const m2 = (act1Stats && (act1Stats.m2 || act1Stats.m2Tokens)) || 0;
    _ir = -Math.min(m2, P3D_CFG.M2_IR_MAX);
    _irFail = P3D_CFG.A2_IR_FAIL;

    // Look-at target for camera orbit
    _lookY = -((act1Stats && act1Stats.depth) || 80);

    // Build phase timing
    _phaseStartT = [];
    let acc = 0;
    for (const k of PHASE_KEYS) {
      _phaseStartT.push(acc);
      acc += P3D_CFG.A2_PHASE_DUR[k];
    }
    _totalDur = acc;

    // Generate the full beatmap
    _nodes = _generateNodes();

    // Prime HUD
    _p3._hud.updateIR(Math.max(0, _ir), _irFail);
    _p3._hud.updateProgress(0);
    _p3._hud.updateA2Phase(PHASE_LABELS[0]);
    _p3._hud.updateScore(_score);
    _p3._hud.updateCombo(0);

    // Canvas overlay
    _createCanvas();

    // Input listeners
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup',   _onKeyUp);
  }

  function start() {
    _running = true;
    _paused  = false;
    _p3._edu.trigger('HA_LOOSEN');
  }

  // ── Main tick ──────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_running || _paused) return;

    _t += dt;

    // ── Phase transition ─────────────────────────────────────────────
    const newPhase = _phaseAt(_t);
    if (newPhase !== _phaseIdx) {
      _phaseIdx = newPhase;
      _p3._hud.updateA2Phase(PHASE_LABELS[_phaseIdx]);
      _p3._edu.trigger(PHASE_EDU[_phaseIdx]);
    }

    // ── Activate pending nodes ───────────────────────────────────────
    const canvasH  = _canvas ? _canvas.height : 600;
    const hitZoneY = canvasH - P3D_CFG.A2_HIT_Y;
    const lookahead = (hitZoneY + 60) / P3D_CFG.A2_NODE_SPD;  // seconds

    while (_nodePtr < _nodes.length &&
           _nodes[_nodePtr].hitTime <= _t + lookahead) {
      _activeNodes.push(_nodes[_nodePtr++]);
    }

    // ── Process active nodes ─────────────────────────────────────────
    const goodT = P3D_CFG.A2_T_GOOD_MS / 1000;
    const perfT = P3D_CFG.A2_T_PERFECT_MS / 1000;

    for (let i = _activeNodes.length - 1; i >= 0; i--) {
      const n = _activeNodes[i];

      // Advance holding nodes
      if (n.state === 'holding') {
        n.holdProgress += dt / n.holdDur;
        if (!_keys[LANE_KEYS[n.lane]]) {
          // Key released early
          const frac = Math.min(n.holdProgress, 1.0);
          _score += Math.floor(P3D_CFG.A2_PTS_HOLD * frac);
          n.state = 'hit'; n.judgement = frac >= 0.75 ? 'GOOD' : null; n.flashT = _t;
          _heldNode[n.lane] = null;
          if (frac >= 0.75) { _combo++; if (_combo > _maxCombo) _maxCombo = _combo; _good++; }
          else { _combo = 0; }
          _judgFlash[n.lane] = frac >= 0.75 ? { text: 'GOOD', t: _t } : { text: 'MISS', t: _t };
          _p3._hud.updateScore(_score);
          _p3._hud.updateCombo(_combo);
        } else if (n.holdProgress >= 1.0) {
          // Full hold
          _score += P3D_CFG.A2_PTS_HOLD;
          n.state = 'hit'; n.judgement = 'PERFECT'; n.flashT = _t;
          _heldNode[n.lane] = null;
          _combo++; if (_combo > _maxCombo) _maxCombo = _combo; _perfect++;
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

      // Cull old nodes (> 0.5s past their hit time, or > 0.4s past missed)
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

    // ── Camera orbit ─────────────────────────────────────────────────
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

    // ── HUD ──────────────────────────────────────────────────────────
    _p3._hud.updateIR(Math.max(0, _ir), _irFail);
    _p3._hud.updateProgress(Math.min(100, (_t / _totalDur) * 100));

    // ── Canvas render ─────────────────────────────────────────────────
    _render();

    // ── Fail check ───────────────────────────────────────────────────
    if (_ir >= _irFail) {
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
    const out = [];

    // Simple deterministic LCG for a consistent map every run
    let seed = 0xdeadbeef;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 0) / 0x100000000);
    };

    for (let pi = 0; pi < PHASE_KEYS.length; pi++) {
      const k        = PHASE_KEYS[pi];
      const bpm      = P3D_CFG.A2_BPM[k];
      const dur      = P3D_CFG.A2_PHASE_DUR[k];
      const bi       = 60 / bpm;                   // beat interval (s)
      const nb       = Math.floor(dur / bi);
      const tBase    = _phaseStartT[pi];
      const skipP    = [0.28, 0.22, 0.16, 0.09, 0.04][pi];

      let prevLane = -1;

      for (let b = 0; b < nb; b++) {
        const hitTime = tBase + b * bi;

        // Allow occasional rest beats (fewer at high BPM)
        if (b > 1 && rand() < skipP) continue;

        const r = rand();

        if (r < 0.16 && b > 3) {
          // SYNC — two different lanes simultaneously
          const l1 = Math.floor(rand() * 3);
          const l2 = (l1 + 1 + Math.floor(rand() * 2)) % 3;
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
          // TAP — favour a different lane from the previous note
          const lane = _pickLane(rand, prevLane);
          out.push(_mkNode('TAP', lane, hitTime, {}));
          prevLane = lane;
        }
      }
    }

    out.sort((a, b) => a.hitTime - b.hitTime);
    return out;
  }

  /** Choose a lane, biasing away from prevLane for musical variety. */
  function _pickLane(rand, prevLane) {
    if (prevLane < 0) return Math.floor(rand() * 3);
    const r = rand();
    if (r < 0.25) return prevLane;                       // same lane (25%)
    const other = [0, 1, 2].filter(l => l !== prevLane);
    return other[Math.floor(rand() * other.length)];     // different lane (75%)
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
    // If a hold is active on this lane, ignore (already tracking)
    if (_heldNode[lane]) return;

    const goodT = P3D_CFG.A2_T_GOOD_MS / 1000;
    const perfT = P3D_CFG.A2_T_PERFECT_MS / 1000;

    let best = null;
    let bestDt = Infinity;
    for (const n of _activeNodes) {
      if (n.state !== 'waiting' || n.lane !== lane) continue;
      const dt = Math.abs(_t - n.hitTime);
      if (dt <= goodT && dt < bestDt) { best = n; bestDt = dt; }
    }

    if (!best) return;   // ghost hit — no penalty

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
    if (judgement === 'PERFECT') _perfect++; else _good++;

    _judgFlash[node.lane] = { text: judgement, t: _t };
    _beatFlash = judgement === 'PERFECT' ? 1.0 : 0.65;

    if (node.type === 'SYNC') _checkSync(node);

    _p3._hud.updateScore(_score);
    _p3._hud.updateCombo(_combo);
  }

  function _checkSync(node) {
    const syncT = P3D_CFG.A2_T_SYNC_MS / 1000;
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

    _judgFlash[node.lane] = { text: 'MISS', t: _t };
    _p3._hud.updateIR(Math.max(0, _ir), _irFail);
    _p3._hud.updateCombo(0);
    _p3._hud.showDamageFlash?.();

    // Antibody education note the first time IR gets high
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
    const laneW  = P3D_CFG.A2_LANE_W;    // 100
    const gap    = 8;
    const totalW = N_LANES * laneW + (N_LANES - 1) * gap;
    const x0     = Math.floor((W - totalW) / 2);

    _ctx.clearRect(0, 0, W, H);

    // ── Lane bands ────────────────────────────────────────────────────
    for (let i = 0; i < N_LANES; i++) {
      const lx = x0 + i * (laneW + gap);

      // Dark band
      _ctx.fillStyle = 'rgba(0,0,0,0.52)';
      _ctx.fillRect(lx, 0, laneW, hitY + 60);

      // Gradient glow near hit zone
      const grad = _ctx.createLinearGradient(0, hitY - 130, 0, hitY);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, LANE_COLS[i] + '1a');
      _ctx.fillStyle = grad;
      _ctx.fillRect(lx, hitY - 130, laneW, 130);

      // Lane edge lines
      _ctx.strokeStyle = LANE_COLS[i] + '33';
      _ctx.lineWidth = 1;
      _ctx.beginPath();
      _ctx.moveTo(lx, 0);       _ctx.lineTo(lx, hitY + 58);
      _ctx.moveTo(lx + laneW, 0); _ctx.lineTo(lx + laneW, hitY + 58);
      _ctx.stroke();
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
      _ctx.lineWidth = 3;
      _ctx.stroke();
    }

    // ── Nodes ─────────────────────────────────────────────────────────
    for (const n of _activeNodes) {
      _drawNode(n, x0, laneW, gap, hitY);
    }

    // ── Hit zone rings + key labels ───────────────────────────────────
    for (let i = 0; i < N_LANES; i++) {
      const cx     = x0 + i * (laneW + gap) + laneW / 2;
      const col    = LANE_COLS[i];
      const held   = !!_keys[LANE_KEYS[i]];
      const R      = 28;

      // Outer ring
      _ctx.beginPath();
      _ctx.arc(cx, hitY, R, 0, Math.PI * 2);
      _ctx.strokeStyle = held ? col : 'rgba(255,255,255,0.28)';
      _ctx.lineWidth   = held ? 3 : 1.5;
      _ctx.stroke();

      if (held) {
        _ctx.fillStyle = col + '22';
        _ctx.fill();
      }

      // Key letter
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
      const cx = x0 + i * (laneW + gap) + laneW / 2;
      const col = jf.text === 'PERFECT' ? '#ffdd44'
                : jf.text === 'GOOD'    ? '#00cc88'
                : jf.text === 'SYNC!'   ? '#dd44ff'
                :                         '#ef5350';
      _ctx.globalAlpha      = alpha;
      _ctx.fillStyle        = col;
      _ctx.font             = 'bold 14px monospace';
      _ctx.textAlign        = 'center';
      _ctx.textBaseline     = 'middle';
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
  }

  function _drawNode(n, x0, laneW, gap, hitY) {
    const col  = LANE_COLS[n.lane];
    const cx   = x0 + n.lane * (laneW + gap) + laneW / 2;
    const nodeY = hitY - (n.hitTime - _t) * P3D_CFG.A2_NODE_SPD;

    // Cull far outside viewport
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
      // Magenta-accented circle
      _ctx.beginPath();
      _ctx.arc(cx, nodeY, 24, 0, Math.PI * 2);
      _ctx.fillStyle   = col + '44';
      _ctx.fill();
      _ctx.strokeStyle = '#dd44ff';
      _ctx.lineWidth   = 3;
      _ctx.stroke();
      // Inner dot
      _ctx.beginPath();
      _ctx.arc(cx, nodeY, 8, 0, Math.PI * 2);
      _ctx.fillStyle = '#dd44ff88';
      _ctx.fill();
    } else {
      // TAP: solid circle
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
    const R = 18;
    const rectX = cx - R;
    const rectY = headY - tailLen;
    const rectH = tailLen;

    // Tail body
    _ctx.fillStyle   = col + '44';
    _ctx.strokeStyle = col + 'aa';
    _ctx.lineWidth   = 2;
    _roundRect(rectX, rectY, R * 2, rectH + R, R);
    _ctx.fill(); _ctx.stroke();

    // Progress fill (from bottom upward)
    if (n.state === 'holding' && n.holdProgress > 0) {
      const fillH = n.holdProgress * (rectH + R);
      _ctx.fillStyle = col + '88';
      _roundRect(rectX, rectY + (rectH + R) - fillH, R * 2, fillH, R);
      _ctx.fill();
    }

    // Head circle
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
    if (_keys[e.code]) return;   // suppress auto-repeat
    _keys[e.code] = true;
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
