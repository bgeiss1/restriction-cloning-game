'use strict';
/**
 * P3DAct3Epilogue — Act 3 "Nuclear Import" epilogue.
 *
 * vRNP segments appear one at a time in front of the player, hover briefly,
 * then fly to individual nuclear pore complexes and enter the nucleus.
 * Each segment is a distinct 3-D structure: helical NP-RNA body + panhandle
 * loop (promoter) + polymerase complex cap (PB1/PB2/PA).
 *
 * Interface: { get _running(), init(p3, act2Stats), start(), tick(dt), destroy() }
 */
const P3DAct3Epilogue = (() => {

  // ── Constants ──────────────────────────────────────────────────────────────
  const PTS_ENTRY  = 200;
  const PTS_BONUS  = 100;
  const BONUS_T    = 20;     // s — entry before this time earns bonus
  const OUTRO_WAIT = 2.2;    // s after last entry before completing
  const LINEUP_R   = 5.5;    // radius inside nucleus for lineup dots

  // Nuclear pore complexes
  const NPC_N    = 24;
  const NPC_R    = 0.28;    // torus major radius  (1/3 of old 0.9)
  const NPC_TUBE = 0.055;   // torus tube radius   (1/3 of old 0.18)

  // Per-segment animation durations (seconds)
  const APPEAR_DUR = 0.8;
  const HOVER_DUR  = 1.4;
  const TRAVEL_DUR = 3.2;
  const ENTER_DUR  = 0.45;

  // Camera snap target (fixed at start)
  const CAM_X = 0, CAM_Y = 8,  CAM_Z = 46;
  const LK_X  = 0, LK_Y  = 2,  LK_Z  = 78;

  // Spawn zone: visible in front of camera, halfway to nucleus
  const SPAWN_Z = 64;

  // Genome segment shapes — proportional to nucleotide count
  // Structure per entry: { turns, len }
  // Helix body runs y=0→len; panhandle loop at bottom; polymerase cap at top
  const SEG_SHAPE = [
    { turns: 5.5, len: 3.5 },  // PB2 — 2341 nt
    { turns: 5.2, len: 3.3 },  // PB1 — 2341 nt
    { turns: 4.8, len: 3.0 },  // PA  — 2233 nt
    { turns: 4.0, len: 2.5 },  // HA  — 1778 nt
    { turns: 3.5, len: 2.2 },  // NP  — 1565 nt
    { turns: 3.0, len: 1.9 },  // NA  — 1413 nt
    { turns: 2.4, len: 1.5 },  // M   — 1027 nt
    { turns: 2.0, len: 1.2 },  // NS  —  890 nt
  ];

  // ── Private state ──────────────────────────────────────────────────────────
  let _p3 = null, _running = false;
  let _t = 0, _score = 0, _entered = 0, _nVRNP = 8, _allDoneT = -1;

  let _nucleus     = null;
  let _npcRings    = [];   // THREE.Mesh[]
  let _cytoObjs    = [];   // THREE.Mesh[]  (cytoplasmic fill + inner glow)
  let _lineupDots  = [];   // THREE.Mesh[]  (inside nucleus after entry)
  let _localGeos   = [];   // geometries to dispose
  let _localMats   = [];   // materials to dispose

  let _segs        = [];   // segment descriptors (see _buildAllVRNPGroups)
  let _npcPositions = [];  // THREE.Vector3[NPC_N]  — Fibonacci sphere positions
  let _nextSegIdx  = 0;    // index of next segment to release

  let _canvas = null, _ctx = null;
  let _flashes    = [];    // [ { t, col } ]
  let _labelFlash = null;  // { text, col, t, segIdx } | null

  let _eduFired = { vrnp: false, npc: false, all: false };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function init(p3, act2Stats) {
    _p3 = p3;
    _t = 0; _score = 0; _entered = 0; _allDoneT = -1; _nextSegIdx = 0;
    _segs = []; _npcRings = []; _cytoObjs = []; _lineupDots = [];
    _localGeos = []; _localMats = []; _flashes = [];
    _npcPositions = []; _labelFlash = null;
    _eduFired = { vrnp: false, npc: false, all: false };

    const ir   = (act2Stats && act2Stats.ir) || 0;
    const tier = P3D_CFG.A3_VRNP_COUNTS.find(t => ir <= t.irMax)
              || P3D_CFG.A3_VRNP_COUNTS[P3D_CFG.A3_VRNP_COUNTS.length - 1];
    _nVRNP = tier.n;

    _p3._hud.updateScore(_score);
    _p3._hud.updateProgress(0);
  }

  function start() {
    _running = true;

    // Snap camera immediately — Act 2 ends at y≈-66; nucleus lives at z=80
    const cam = window.P3Descent && P3Descent.camera;
    if (cam) {
      cam.position.set(CAM_X, CAM_Y, CAM_Z);
      cam.lookAt(LK_X, LK_Y, LK_Z);
    }

    _buildScene();
    _createCanvas();

    // Release segment 0 immediately; subsequent ones in tick()
    _releaseSegment(0);
    _nextSegIdx = 1;

    _p3._edu.trigger('VRNP_EXIT');
    _eduFired.vrnp = true;
  }

  // ── Scene construction ─────────────────────────────────────────────────────

  // Uniformly distribute n points on a sphere of radius r centred at (cx,cy,cz)
  function _fibSphere(n, r, cx, cy, cz) {
    const phi = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: n }, (_, i) => {
      const y   = 1 - (i / (n - 1)) * 2;
      const rXZ = Math.sqrt(Math.max(0, 1 - y * y));
      const th  = phi * i;
      return new THREE.Vector3(cx + Math.cos(th) * rXZ * r,
                               cy + y * r,
                               cz + Math.sin(th) * rXZ * r);
    });
  }

  function _buildScene() {
    const scene = P3Descent.scene;
    if (!scene) return;

    const NP = P3D_CFG.A3_NUCLEUS_POS;   // { x:0, y:0, z:80 }
    const NR = P3D_CFG.A3_NUCLEUS_R;     // 10.0

    // ── Nucleus ──────────────────────────────────────────────────────────────
    const nucGeo = new THREE.SphereGeometry(NR, 32, 24);
    _localGeos.push(nucGeo);
    _nucleus = new THREE.Mesh(nucGeo, P3DMatLib.nucleus);
    _nucleus.position.set(NP.x, NP.y, NP.z);
    scene.add(_nucleus);

    // Inner glow (BackSide, slightly more opaque)
    const igGeo = new THREE.SphereGeometry(NR * 0.88, 24, 18);
    const igMat = new THREE.MeshPhongMaterial({
      color: 0x3322aa, emissive: 0x220066, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.22,
      side: THREE.BackSide, depthWrite: false,
    });
    _localGeos.push(igGeo); _localMats.push(igMat);
    const igMesh = new THREE.Mesh(igGeo, igMat);
    igMesh.position.set(NP.x, NP.y, NP.z);
    scene.add(igMesh);
    _cytoObjs.push(igMesh);

    // ── Nuclear pore complexes — Fibonacci sphere ─────────────────────────
    _npcPositions = _fibSphere(NPC_N, NR, NP.x, NP.y, NP.z);
    const nucCtr = new THREE.Vector3(NP.x, NP.y, NP.z);
    const zAxis  = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i < NPC_N; i++) {
      const pos  = _npcPositions[i];
      const rGeo = new THREE.TorusGeometry(NPC_R, NPC_TUBE, 6, 16);
      _localGeos.push(rGeo);
      const ring = new THREE.Mesh(rGeo, P3DMatLib.npc);
      ring.position.copy(pos);
      const outDir = pos.clone().sub(nucCtr).normalize();
      if (outDir.lengthSq() > 0.01) {
        ring.quaternion.setFromUnitVectors(zAxis, outDir);
      }
      scene.add(ring);
      _npcRings.push(ring);
    }

    // ── vRNP groups (all 8, hidden until released) ────────────────────────
    _buildAllVRNPGroups();

    // ── Cytoplasmic fill objects ──────────────────────────────────────────
    _buildCytoFill();
  }

  // Build a TubeGeometry following a helix path
  function _makeHelixGeo(turns, length, tubeR) {
    const steps = Math.max(28, Math.round(turns * 10));
    const pts   = [];
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const a    = frac * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.13, frac * length, Math.sin(a) * 0.13));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, tubeR, 5, false);
  }

  // Build a THREE.Group representing one genome segment
  // Layout (local Y-axis, centred at origin):
  //   bottom — panhandle loop (promoter)
  //   middle — helical NP-RNA body
  //   top    — connector + polymerase complex (PB1/PB2/PA)
  function _buildVRNPGroup(idx) {
    const shape = SEG_SHAPE[idx] || SEG_SHAPE[7];
    const col   = P3D_CFG.A3_VRNP_COLS[idx];
    const group = new THREE.Group();

    // Vertical shift so the group's pivot sits at its geometric centre
    const yOff = -(shape.len + 0.5) / 2;

    // ── Helix body ──────────────────────────────────────────────────────────
    const helixMat = new THREE.MeshPhongMaterial({
      color: col, emissive: col, emissiveIntensity: 0.5, shininess: 80,
    });
    _localMats.push(helixMat);
    const helixGeo = _makeHelixGeo(shape.turns, shape.len, 0.052);
    _localGeos.push(helixGeo);
    const helixMesh = new THREE.Mesh(helixGeo, helixMat);
    helixMesh.position.y = yOff;
    group.add(helixMesh);

    // ── Panhandle loop at bottom ────────────────────────────────────────────
    const loopGeo = new THREE.TorusGeometry(0.20, 0.044, 6, 14);
    _localGeos.push(loopGeo);
    const loopMat = new THREE.MeshPhongMaterial({
      color: col, emissive: col, emissiveIntensity: 0.3, shininess: 60,
    });
    _localMats.push(loopMat);
    const loopMesh = new THREE.Mesh(loopGeo, loopMat);
    loopMesh.rotation.x = Math.PI / 2;
    loopMesh.position.set(0, yOff - 0.12, 0);
    group.add(loopMesh);

    // ── Connector cylinder (helix top → polymerase) ─────────────────────────
    const cylGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.30, 6);
    _localGeos.push(cylGeo);
    const cylMat = new THREE.MeshPhongMaterial({ color: 0xddccaa, shininess: 40 });
    _localMats.push(cylMat);
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.set(0, yOff + shape.len + 0.15, 0);
    group.add(cyl);

    // ── Polymerase complex (PB1 centre, PB2 left, PA right-back) ───────────
    const polyMat = new THREE.MeshPhongMaterial({
      color: 0xf0e8d0, emissive: 0x332211, emissiveIntensity: 0.25, shininess: 100,
    });
    _localMats.push(polyMat);
    const topY = yOff + shape.len + 0.38;

    [[0,    topY,      0,    0.18],   // PB1
     [-0.22, topY+0.08, 0.08, 0.14],  // PB2
     [ 0.18, topY+0.06,-0.12, 0.12],  // PA
    ].forEach(([x, y, z, r]) => {
      const sg = new THREE.SphereGeometry(r, 7, 5);
      _localGeos.push(sg);
      const sm = new THREE.Mesh(sg, polyMat);
      sm.position.set(x, y, z);
      group.add(sm);
    });

    return { group, helixMat };
  }

  function _buildAllVRNPGroups() {
    const scene    = P3Descent.scene;
    const npcStep  = Math.floor(NPC_N / 8);  // spread 8 segments across 24 NPCs

    for (let i = 0; i < 8; i++) {
      const { group, helixMat } = _buildVRNPGroup(i);

      // Varied spawn X/Y so repeated appearances look distinct
      const spawnPos = new THREE.Vector3(
        Math.sin(i * 1.23) * 2.0,
        4 + Math.cos(i * 0.87) * 0.8,
        SPAWN_Z
      );

      group.visible = false;
      group.scale.setScalar(0.01);
      group.position.copy(spawnPos);
      scene.add(group);

      _segs.push({
        group,
        helixMat,
        idx:         i,
        phase:       'hidden',   // hidden | appearing | hovering | traveling | entering | entered
        phaseT:      0,
        spawnPos,
        travelStart: null,
        npcIdx:      (i * npcStep) % NPC_N,
        targetPos:   _npcPositions[(i * npcStep) % NPC_N].clone(),
      });
    }
  }

  function _buildCytoFill() {
    const scene   = P3Descent.scene;
    const rng     = _lcgInit(0xbeef1234);
    const cytoMat = new THREE.MeshPhongMaterial({
      color: 0x445566, emissive: 0x111122, emissiveIntensity: 0.15,
      shininess: 40, transparent: true, opacity: 0.45,
    });
    _localMats.push(cytoMat);

    for (let i = 0; i < 20; i++) {
      const r  = _lcgNext(rng), r2 = _lcgNext(rng);
      const r3 = _lcgNext(rng), r4 = _lcgNext(rng);
      const geo = (i % 3 === 0) ? new THREE.SphereGeometry(0.45, 6, 5)
                : (i % 3 === 1) ? new THREE.TetrahedronGeometry(0.4, 0)
                :                  new THREE.OctahedronGeometry(0.38, 0);
      _localGeos.push(geo);
      const mesh = new THREE.Mesh(geo, cytoMat);
      mesh.position.set((r - 0.5) * 24, (r2 - 0.5) * 20, 50 + r3 * 30);
      mesh.scale.setScalar(0.25 + r4 * 0.45);
      mesh.rotation.set(r * 6.28, r2 * 6.28, r3 * 6.28);
      scene.add(mesh);
      _cytoObjs.push(mesh);
    }
  }

  // ── Main tick ──────────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_running) return;
    _t += dt;

    // Nucleus pulse + slow rotation
    if (_nucleus) {
      if (P3DMatLib.nucleus)
        P3DMatLib.nucleus.emissiveIntensity = 0.35 + 0.08 * Math.sin(_t * 1.2);
      _nucleus.rotation.y += 0.008 * dt;
      _nucleus.rotation.x += 0.003 * dt;
    }

    // NPC rings spin
    for (let i = 0; i < _npcRings.length; i++)
      _npcRings[i].rotation.z += (0.3 + i * 0.02) * dt;

    // Sequential release: next segment appears when previous starts traveling
    if (_nextSegIdx < _nVRNP) {
      const prev = _segs[_nextSegIdx - 1];
      if (!prev ||
          prev.phase === 'traveling' ||
          prev.phase === 'entering'  ||
          prev.phase === 'entered') {
        _releaseSegment(_nextSegIdx);
        _nextSegIdx++;
      }
    }

    // Tick each segment state machine
    for (const seg of _segs) _tickSegment(seg, dt);

    // Decay entry flashes
    _flashes = _flashes.filter(f => _t - f.t < 0.6);

    // Completion check
    const allEntered = _segs.slice(0, _nVRNP).every(s => s.phase === 'entered');
    if (allEntered && !_eduFired.all) {
      _p3._edu.trigger('ALL_IN_NUCLEUS');
      _p3._snd.playFinalChord();
      _eduFired.all = true;
      _allDoneT = _t;
    }
    if (_allDoneT > 0 && _t - _allDoneT >= OUTRO_WAIT) { _complete(); return; }

    _p3._hud.updateScore(_score);
    _p3._hud.updateProgress(Math.min(100, (_entered / _nVRNP) * 100));
    _render();
  }

  function _releaseSegment(i) {
    if (i >= _segs.length) return;
    const seg   = _segs[i];
    seg.phase   = 'appearing';
    seg.phaseT  = 0;
    seg.group.visible = true;
    seg.group.scale.setScalar(0.01);
    seg.group.position.copy(seg.spawnPos);
    seg.group.rotation.set(0, 0, 0);
  }

  function _tickSegment(seg, dt) {
    if (seg.phase === 'hidden' || seg.phase === 'entered') return;
    seg.phaseT += dt;
    const pt = seg.phaseT;
    const NP = P3D_CFG.A3_NUCLEUS_POS;

    switch (seg.phase) {

      case 'appearing': {
        const s = Math.min(1, pt / APPEAR_DUR);
        seg.group.scale.setScalar(Math.max(0.01, s * s * (3 - 2 * s)));
        seg.group.rotation.y = _t * 1.5;
        seg.group.rotation.x = Math.sin(_t * 0.8) * 0.15;
        if (pt >= APPEAR_DUR) { seg.phase = 'hovering'; seg.phaseT = 0; }
        break;
      }

      case 'hovering': {
        seg.group.scale.setScalar(1.0);
        seg.group.rotation.y = _t * 1.2;
        seg.group.position.y = seg.spawnPos.y + Math.sin(pt * 2.5) * 0.25;
        seg.helixMat.emissiveIntensity = 0.5 + 0.3 * Math.sin(_t * 3.0);

        // Show segment label on canvas
        if (!_labelFlash || _labelFlash.segIdx !== seg.idx) {
          const hex = '#' + P3D_CFG.A3_VRNP_COLS[seg.idx].toString(16).padStart(6, '0');
          _labelFlash = { text: P3D_CFG.A3_VRNP_LABELS[seg.idx], col: hex, t: _t, segIdx: seg.idx };
        }

        if (!_eduFired.npc) { _p3._edu.trigger('NPC_APPROACH'); _eduFired.npc = true; }

        if (pt >= HOVER_DUR) {
          seg.phase = 'traveling';
          seg.phaseT = 0;
          seg.travelStart = seg.group.position.clone();
        }
        break;
      }

      case 'traveling': {
        const frac = Math.min(1, pt / TRAVEL_DUR);
        const ease = frac * frac * (3 - 2 * frac);
        seg.group.position.lerpVectors(seg.travelStart, seg.targetPos, ease);

        // Orient helix axis toward nucleus
        const toNuc = new THREE.Vector3(NP.x, NP.y, NP.z)
          .sub(seg.group.position).normalize();
        if (toNuc.lengthSq() > 0.01)
          seg.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toNuc);

        // Slight scale taper as it approaches
        seg.group.scale.setScalar(1.0 - ease * 0.15);
        seg.helixMat.emissiveIntensity = 0.6 + 0.4 * Math.sin(_t * 4.0);

        if (frac >= 1.0) { seg.phase = 'entering'; seg.phaseT = 0; }
        break;
      }

      case 'entering': {
        const frac = Math.min(1, pt / ENTER_DUR);
        seg.group.scale.setScalar(Math.max(0.01, 1.0 - frac));
        seg.helixMat.emissiveIntensity = 2.5 * (1.0 - frac);
        if (frac >= 1.0) _onEntry(seg);
        break;
      }
    }
  }

  function _onEntry(seg) {
    seg.phase = 'entered';
    seg.group.visible = false;
    _entered++;

    _score += PTS_ENTRY + (_t < BONUS_T ? PTS_BONUS : 0);
    _p3._snd.playNPCTransit(seg.idx);
    if (_entered === 1) _p3._edu.trigger('NPC_IMPORT');

    const hex = '#' + P3D_CFG.A3_VRNP_COLS[seg.idx].toString(16).padStart(6, '0');
    _flashes.push({ t: _t, col: hex });
    _addLineupDot(seg.idx);
  }

  function _addLineupDot(idx) {
    const scene = P3Descent.scene;
    if (!scene) return;
    const NP    = P3D_CFG.A3_NUCLEUS_POS;
    const angle = (idx / 8) * Math.PI * 2;

    const geo = new THREE.SphereGeometry(0.28, 7, 5);
    _localGeos.push(geo);
    const mat = new THREE.MeshPhongMaterial({
      color: P3D_CFG.A3_VRNP_COLS[idx], emissive: P3D_CFG.A3_VRNP_COLS[idx],
      emissiveIntensity: 0.8, shininess: 100,
    });
    _localMats.push(mat);
    const dot = new THREE.Mesh(geo, mat);
    dot.position.set(
      NP.x + Math.cos(angle) * LINEUP_R,
      NP.y + Math.sin(angle) * LINEUP_R,
      NP.z
    );
    scene.add(dot);
    _lineupDots.push(dot);
  }

  // ── Canvas overlay ─────────────────────────────────────────────────────────

  function _createCanvas() {
    if (_canvas) _canvas.remove();
    const cv = document.createElement('canvas');
    cv.id = 'p3dA3Canvas';
    Object.assign(cv.style, {
      position: 'fixed', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '18',
    });
    document.body.appendChild(cv);
    _canvas = cv;
    _ctx    = cv.getContext('2d');
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
    window.addEventListener('resize', _onResize);
  }

  function _onResize() {
    if (_canvas) {
      _canvas.width  = window.innerWidth;
      _canvas.height = window.innerHeight;
    }
  }

  function _render() {
    if (!_ctx || !_canvas) return;
    const W = _canvas.width, H = _canvas.height;
    _ctx.clearRect(0, 0, W, H);

    // ── Entry flash radial burst ────────────────────────────────────────────
    for (const f of _flashes) {
      const age  = _t - f.t;
      const bell = Math.exp(-((age / 0.15) ** 2));
      _ctx.globalAlpha = bell * 0.55;
      const g = _ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.min(W, H) * 0.4);
      g.addColorStop(0, f.col + 'ff');
      g.addColorStop(0.4, f.col + '55');
      g.addColorStop(1, 'transparent');
      _ctx.fillStyle = g;
      _ctx.fillRect(0, 0, W, H);
      _ctx.globalAlpha = 1;
    }

    // ── Segment label (visible while hovering) ──────────────────────────────
    if (_labelFlash) {
      const age = _t - _labelFlash.t;
      const fadeIn  = Math.min(1, age / 0.3);
      const fadeOut = Math.max(0, 1 - (age - HOVER_DUR) / 0.3);
      const alpha   = Math.min(fadeIn, fadeOut) * 0.9;
      if (alpha > 0.01) {
        _ctx.globalAlpha   = alpha;
        _ctx.textAlign     = 'center';
        _ctx.textBaseline  = 'middle';
        _ctx.fillStyle     = _labelFlash.col;
        _ctx.font          = 'bold 22px monospace';
        _ctx.fillText(_labelFlash.text, W / 2, H * 0.38);
        _ctx.font          = '13px monospace';
        _ctx.fillStyle     = 'rgba(220,210,180,0.85)';
        _ctx.fillText('vRNP segment — approaching nuclear pore', W / 2, H * 0.38 + 28);
        _ctx.globalAlpha   = 1;
      } else if (age > HOVER_DUR + 0.5) {
        _labelFlash = null;
      }
    }

    _drawTracker(W, H);
  }

  function _drawTracker(W, H) {
    const n      = _nVRNP;
    const dotR   = 9, dotGap = 8;
    const panW   = n * (dotR * 2 + dotGap) + dotGap + 20;
    const panH   = 56;
    const panX   = (W - panW) / 2;
    const panY   = H - panH - 20;

    _ctx.fillStyle = 'rgba(0,0,0,0.50)';
    _rrect(_ctx, panX, panY, panW, panH, 10);
    _ctx.fill();

    _ctx.fillStyle    = 'rgba(200,169,81,0.85)';
    _ctx.font         = 'bold 10px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'top';
    _ctx.fillText(`vRNP IN NUCLEUS: ${_entered} / ${n}`, W / 2, panY + 8);

    for (let i = 0; i < n; i++) {
      const seg = _segs[i];
      const dx  = panX + dotGap + i * (dotR * 2 + dotGap) + dotR + 10;
      const dy  = panY + panH - dotR - 10;
      const col = '#' + P3D_CFG.A3_VRNP_COLS[i].toString(16).padStart(6, '0');

      if (!seg || seg.phase === 'hidden') {
        _ctx.beginPath(); _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle = '#222233'; _ctx.fill();
        _ctx.strokeStyle = '#333344'; _ctx.lineWidth = 1; _ctx.stroke();

      } else if (seg.phase === 'appearing' || seg.phase === 'hovering' || seg.phase === 'traveling') {
        const pulse = 0.6 + 0.4 * Math.sin(_t * 4 + i);
        _ctx.globalAlpha = pulse;
        _ctx.beginPath(); _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle = col + '44'; _ctx.fill();
        _ctx.strokeStyle = col; _ctx.lineWidth = 2; _ctx.stroke();
        _ctx.globalAlpha = 1;

      } else if (seg.phase === 'entering') {
        _ctx.beginPath(); _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle = col; _ctx.fill();

      } else {
        // entered — filled with checkmark
        _ctx.beginPath(); _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle = col; _ctx.fill();
        _ctx.fillStyle    = 'rgba(0,0,0,0.6)';
        _ctx.font         = `bold ${dotR}px monospace`;
        _ctx.textAlign    = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.fillText('✓', dx, dy);
      }
    }

    // Time bar
    const elapsed = Math.min(1, _t / P3D_CFG.A3_JOURNEY_DUR);
    const barW    = panW - 20;
    const barY    = panY + panH - 5;
    _ctx.fillStyle = 'rgba(255,255,255,0.07)';
    _ctx.fillRect(panX + 10, barY, barW, 3);
    _ctx.fillStyle = elapsed < 0.7 ? '#C8A951' : '#FFA726';
    _ctx.fillRect(panX + 10, barY, barW * elapsed, 3);
  }

  // ── Complete / cleanup ─────────────────────────────────────────────────────

  function _complete() {
    _running = false;
    _p3._act3Done({ score: _score, entered: _entered, total: _nVRNP, time: _t });
  }

  function destroy() {
    _running = false;
    window.removeEventListener('resize', _onResize);
    if (_canvas) { _canvas.remove(); _canvas = null; _ctx = null; }

    const scene = P3Descent && P3Descent.scene;
    if (scene) {
      if (_nucleus) scene.remove(_nucleus);
      for (const r of _npcRings)   scene.remove(r);
      for (const o of _cytoObjs)   scene.remove(o);
      for (const d of _lineupDots) scene.remove(d);
      for (const s of _segs) if (s.group) scene.remove(s.group);
    }
    for (const g of _localGeos) g.dispose();
    for (const m of _localMats) m.dispose();
    _localGeos = []; _localMats = [];
    _nucleus = null; _npcRings = []; _cytoObjs = []; _lineupDots = []; _segs = [];
    _p3 = null;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function _lcgInit(seed) { return { s: seed >>> 0 }; }
  function _lcgNext(rng) {
    rng.s = (Math.imul(rng.s, 1664525) + 1013904223) | 0;
    return ((rng.s >>> 0) / 0x100000000);
  }

  function _rrect(ctx, x, y, w, h, r) {
    const s = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + s, y);
    ctx.lineTo(x + w - s, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + s);
    ctx.lineTo(x + w, y + h - s);
    ctx.quadraticCurveTo(x + w, y + h, x + w - s, y + h);
    ctx.lineTo(x + s, y + h);
    ctx.quadraticCurveTo(x,     y + h, x,     y + h - s);
    ctx.lineTo(x, y + s);
    ctx.quadraticCurveTo(x, y,         x + s, y);
    ctx.closePath();
  }

  // ── Public interface ───────────────────────────────────────────────────────

  const pub = {
    get _running() { return _running; },
    init,
    start,
    tick,
    destroy,
  };
  window.P3DAct3Epilogue = pub;
  return pub;
})();
