'use strict';
/**
 * P3DAct3Epilogue — Act 3 "Cytoplasmic Release" epilogue.
 *
 * Interface: { get _running(), init(p3, act2Stats), start(), tick(dt), destroy() }
 *
 * vRNP segments released from the endosomal burst site travel autonomously
 * through the cytoplasm toward the nucleus.  Each segment that reaches a
 * nuclear pore complex scores 200 pts (+ 100 bonus if early).
 *
 * The number of segments in play is IR-dependent (carried from Act 2 via
 * P3D_CFG.A3_VRNP_COUNTS: 8 / 7 / 6 segments for ir ≤ 5 / 10 / 15).
 *
 * On completion: calls P3Descent._act3Done({ score }).
 */
const P3DAct3Epilogue = (() => {

  // ── Constants ──────────────────────────────────────────────────────────
  const PTS_ENTRY       = 200;
  const PTS_ENTRY_BONUS = 100;   // added if entered before BONUS_T seconds
  const BONUS_T         = 20;    // seconds
  const WANDER_AMP      = 1.4;   // lateral wander amplitude (units)
  const WANDER_FREQ     = 0.55;  // wander oscillation frequency (rad/s)
  const ENTRY_DIST      = 1.8;   // collision distance past nucleus surface
  const CAM_MOVE_DUR    = 12.0;  // seconds to reach cinematic camera position
  const OUTRO_WAIT      = 2.2;   // seconds after last entry before completing

  // ── Private state ──────────────────────────────────────────────────────
  let _p3      = null;
  let _running = false;

  // Game time
  let _t         = 0;
  let _score     = 0;
  let _entered   = 0;      // segments that have entered the nucleus
  let _nVRNP     = 8;      // segments in play (IR-dependent)
  let _allDoneT  = -1;     // time when last segment entered

  // Scene objects (added to P3Descent.scene)
  let _nucleus      = null;   // THREE.Mesh
  let _npcRings     = [];     // Array<THREE.Mesh>
  let _cytoObjs     = [];     // Array<THREE.Mesh>  (cytoplasmic NPC fill)
  let _localGeos    = [];     // geometries to dispose on destroy
  let _localMats    = [];     // materials to dispose on destroy

  // vRNP segment state
  let _segs = [];
  // Each: { mesh, pos:THREE.Vector3, vel:THREE.Vector3, idx, phase:'waiting'|'traveling'|'entered', releaseT, flashT }

  // Camera
  let _camStart = null;
  let _camEnd   = null;

  // Canvas overlay
  let _canvas = null;
  let _ctx    = null;

  // Entry flash state  [{ t, pos:THREE.Vector3, col }]
  let _flashes = [];

  // Education flags
  let _eduVrnpFired  = false;
  let _eduNpcFired   = false;
  let _eduAllFired   = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────

  function init(p3, act2Stats) {
    _p3     = p3;
    _t      = 0;
    _score  = 0;
    _entered = 0;
    _allDoneT = -1;
    _segs   = [];
    _npcRings = [];
    _cytoObjs = [];
    _localGeos = [];
    _localMats = [];
    _flashes = [];
    _eduVrnpFired = false;
    _eduNpcFired  = false;
    _eduAllFired  = false;

    // IR-dependent vRNP count
    const ir = (act2Stats && act2Stats.ir) || 0;
    const tier = P3D_CFG.A3_VRNP_COUNTS.find(t => ir <= t.irMax)
              || P3D_CFG.A3_VRNP_COUNTS[P3D_CFG.A3_VRNP_COUNTS.length - 1];
    _nVRNP = tier.n;

    // Camera setup: start from current position, move to wide nucleus view
    const cam = window.P3Descent && P3Descent.camera;
    if (cam) {
      _camStart = cam.position.clone();
      _camEnd   = new THREE.Vector3(0, 18, 50);
    }

    // HUD
    _p3._hud.updateScore(_score);
    _p3._hud.updateProgress(0);
  }

  function start() {
    _running = true;

    // Build Act 3 scene objects
    _buildScene();

    // Create canvas overlay
    _createCanvas();

    // Release first vRNP immediately (others staggered in tick)
    _buildSegments();

    // Educational trigger at start
    _p3._edu.trigger('VRNP_EXIT');
  }

  // ── Scene construction ─────────────────────────────────────────────────

  function _buildScene() {
    const scene = P3Descent.scene;
    if (!scene) return;

    const NUC_POS = P3D_CFG.A3_NUCLEUS_POS;
    const NUC_R   = P3D_CFG.A3_NUCLEUS_R;

    // ── Nucleus ────────────────────────────────────────────────────────
    const nucGeo = new THREE.SphereGeometry(NUC_R, 32, 24);
    _localGeos.push(nucGeo);
    _nucleus = new THREE.Mesh(nucGeo, P3DMatLib.nucleus);
    _nucleus.position.set(NUC_POS.x, NUC_POS.y, NUC_POS.z);
    scene.add(_nucleus);

    // Inner glow (smaller sphere, BackSide, slightly more opaque)
    const innerGeo = new THREE.SphereGeometry(NUC_R * 0.88, 24, 18);
    const innerMat = new THREE.MeshPhongMaterial({
      color: 0x3322aa, emissive: 0x220066, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false,
    });
    _localGeos.push(innerGeo);
    _localMats.push(innerMat);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.set(NUC_POS.x, NUC_POS.y, NUC_POS.z);
    scene.add(innerMesh);
    _cytoObjs.push(innerMesh);  // included for cleanup

    // ── Nuclear pore complexes — 8-fold symmetry around equator ────────
    const npcN = 8;
    for (let i = 0; i < npcN; i++) {
      const angle = (i / npcN) * Math.PI * 2;
      const px = NUC_POS.x + Math.cos(angle) * NUC_R;
      const py = NUC_POS.y + Math.sin(angle) * NUC_R;

      // Outer ring (torus)
      const rGeo = new THREE.TorusGeometry(0.9, 0.18, 6, 16);
      _localGeos.push(rGeo);
      const ring = new THREE.Mesh(rGeo, P3DMatLib.npc);
      ring.position.set(px, py, NUC_POS.z);
      ring.lookAt(NUC_POS.x, NUC_POS.y, NUC_POS.z);
      scene.add(ring);
      _npcRings.push(ring);
    }

    // ── Cytoplasmic fill objects (ribosomes, organelle fragments) ──────
    const rng = _lcgInit(0xbeef1234);
    const NPC_N = P3D_CFG.A3_NPC_N;
    const cytoMat = new THREE.MeshPhongMaterial({
      color: 0x445566, emissive: 0x111122, emissiveIntensity: 0.15,
      shininess: 40, transparent: true, opacity: 0.55,
    });
    _localMats.push(cytoMat);

    for (let i = 0; i < NPC_N; i++) {
      const r = _lcgNext(rng);
      const r2 = _lcgNext(rng);
      const r3 = _lcgNext(rng);
      const r4 = _lcgNext(rng);
      // Scatter along travel corridor (z: 10–75) with XY spread
      const px2 = (r - 0.5) * 24;
      const py2 = (r2 - 0.5) * 20;
      const pz  = 10 + r3 * 65;
      const scale = 0.25 + r4 * 0.55;

      const geo = (i % 3 === 0)
        ? new THREE.SphereGeometry(0.45, 6, 5)
        : (i % 3 === 1)
          ? new THREE.TetrahedronGeometry(0.4, 0)
          : new THREE.OctahedronGeometry(0.38, 0);
      _localGeos.push(geo);
      const mesh = new THREE.Mesh(geo, cytoMat);
      mesh.position.set(px2, py2, pz);
      mesh.scale.setScalar(scale);
      mesh.rotation.set(r * Math.PI * 2, r2 * Math.PI * 2, r3 * Math.PI * 2);
      scene.add(mesh);
      _cytoObjs.push(mesh);
    }
  }

  function _buildSegments() {
    const scene = P3Descent.scene;
    if (!scene) return;

    const rng = _lcgInit(0xdeadcafe);
    const capsGeo = THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.30, 1.0, 4, 8)
      : new THREE.SphereGeometry(0.50, 8, 6);
    _localGeos.push(capsGeo);

    for (let i = 0; i < _nVRNP; i++) {
      const mat = new THREE.MeshPhongMaterial({
        color:             P3D_CFG.A3_VRNP_COLS[i],
        emissive:          P3D_CFG.A3_VRNP_COLS[i],
        emissiveIntensity: 0.5,
        shininess:         80,
        transparent:       true,
        opacity:           0.0,   // hidden until released
      });
      _localMats.push(mat);

      const mesh = new THREE.Mesh(capsGeo, mat);
      // Slight random spawn offset so they don't all stack
      const ox = (_lcgNext(rng) - 0.5) * 2.5;
      const oy = (_lcgNext(rng) - 0.5) * 2.5;
      mesh.position.set(ox, oy, 1.0);
      mesh.visible = false;
      scene.add(mesh);

      _segs.push({
        mesh,
        mat,
        pos:      new THREE.Vector3(ox, oy, 1.0),
        idx:      i,
        phase:    'waiting',
        releaseT: i * P3D_CFG.A3_VRNP_INTERVAL,
        flashT:   -1,
        wOffset:  _lcgNext(rng) * Math.PI * 2,   // phase offset for wander
      });
    }
  }

  // ── Main tick ──────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_running) return;
    _t += dt;

    // ── Camera dolly ──────────────────────────────────────────────────
    _tickCamera();

    // ── Nucleus pulse ─────────────────────────────────────────────────
    if (_nucleus) {
      const pulse = 0.35 + 0.08 * Math.sin(_t * 1.2);
      if (P3DMatLib.nucleus) P3DMatLib.nucleus.emissiveIntensity = pulse;
      _nucleus.rotation.y += 0.008 * dt;
      _nucleus.rotation.x += 0.003 * dt;
    }

    // ── NPC ring rotation ─────────────────────────────────────────────
    for (let i = 0; i < _npcRings.length; i++) {
      _npcRings[i].rotation.z += (0.4 + i * 0.05) * dt;
    }

    // ── vRNP segments ─────────────────────────────────────────────────
    let allReleased = true;
    for (const seg of _segs) {
      if (seg.phase === 'waiting') {
        allReleased = false;
        if (_t >= seg.releaseT) {
          // Release this segment
          seg.phase = 'traveling';
          seg.mesh.visible = true;
          seg.mat.opacity = 1.0;
          if (!_eduVrnpFired) {
            _p3._edu.trigger('VRNP_EXIT');
            _eduVrnpFired = true;
          }
        }
        continue;
      }

      if (seg.phase === 'entered') continue;

      // Traveling
      const NUC = P3D_CFG.A3_NUCLEUS_POS;
      const toNuc = new THREE.Vector3(NUC.x, NUC.y, NUC.z).sub(seg.pos);
      const dist = toNuc.length();

      // Wander: sinusoidal XY perturbation perpendicular to travel axis
      const wt   = _t + seg.wOffset;
      const wx   = Math.sin(wt * WANDER_FREQ) * WANDER_AMP;
      const wy   = Math.cos(wt * WANDER_FREQ * 0.73) * WANDER_AMP * 0.6;
      const wanderDecay = Math.max(0, Math.min(1, (dist - 5) / 15));
      const wander = new THREE.Vector3(wx, wy, 0).multiplyScalar(wanderDecay);

      // Move: normalized direction toward nucleus + wander
      const dir = toNuc.normalize().add(wander).normalize();
      const spd = P3D_CFG.A3_TRAVEL_SPD;
      seg.pos.addScaledVector(dir, spd * dt);
      seg.mesh.position.copy(seg.pos);

      // Orient capsule along travel direction
      const up = new THREE.Vector3(0, 1, 0);
      seg.mesh.quaternion.setFromUnitVectors(up, dir);

      // Pulsing emissive
      seg.mat.emissiveIntensity = 0.4 + 0.25 * Math.sin(_t * 3.5 + seg.wOffset);

      // Entry check
      const nucR = P3D_CFG.A3_NUCLEUS_R;
      if (dist < nucR + ENTRY_DIST) {
        _onEntry(seg);
      }

      // NPC approach education
      if (!_eduNpcFired && dist < nucR + 8) {
        _p3._edu.trigger('NPC_APPROACH');
        _eduNpcFired = true;
      }
    }

    // ── Entry flashes ─────────────────────────────────────────────────
    _flashes = _flashes.filter(f => _t - f.t < 0.6);

    // ── All done? ─────────────────────────────────────────────────────
    const allEntered = _segs.every(s => s.phase === 'entered');
    if (allEntered && !_eduAllFired) {
      _p3._edu.trigger('ALL_IN_NUCLEUS');
      _p3._snd.playFinalChord();
      _eduAllFired = true;
      _allDoneT = _t;
    }

    const timedOut = _t >= P3D_CFG.A3_JOURNEY_DUR && allReleased;
    if (timedOut && _allDoneT < 0) _allDoneT = _t;

    if (_allDoneT > 0 && _t - _allDoneT >= OUTRO_WAIT) {
      _complete();
      return;
    }

    // ── HUD ──────────────────────────────────────────────────────────
    _p3._hud.updateScore(_score);
    const progress = Math.min(100, (_entered / _nVRNP) * 100);
    _p3._hud.updateProgress(progress);

    // ── Canvas ────────────────────────────────────────────────────────
    _render();
  }

  function _tickCamera() {
    const cam = window.P3Descent && P3Descent.camera;
    if (!cam || !_camStart || !_camEnd) return;

    const frac = Math.min(1, _t / CAM_MOVE_DUR);
    const ease = frac * frac * (3 - 2 * frac);
    cam.position.lerpVectors(_camStart, _camEnd, ease);

    // Look at a point that slides from mid-corridor to nucleus
    const lookZ = 30 + ease * 50;
    cam.lookAt(0, 0, lookZ);
  }

  function _onEntry(seg) {
    seg.phase   = 'entered';
    seg.flashT  = _t;
    _entered++;

    // Score
    const bonus = _t < BONUS_T ? PTS_ENTRY_BONUS : 0;
    _score += PTS_ENTRY + bonus;

    // Sound
    _p3._snd.playNPCTransit(seg.idx);

    // Edu on first import
    if (_entered === 1) {
      _p3._edu.trigger('NPC_IMPORT');
    }

    // Visual flash at entry point
    _flashes.push({ t: _t, col: '#' + P3D_CFG.A3_VRNP_COLS[seg.idx].toString(16).padStart(6, '0') });

    // Fade out mesh
    seg.mat.transparent = true;
    seg.mat.opacity = 0;
    seg.mesh.visible = false;
  }

  // ── Canvas rendering ───────────────────────────────────────────────────

  function _createCanvas() {
    if (_canvas) { _canvas.remove(); }
    const cv = document.createElement('canvas');
    cv.id = 'p3dA3Canvas';
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
    const W = _canvas.width;
    const H = _canvas.height;
    _ctx.clearRect(0, 0, W, H);

    // ── Entry flash overlay (brief radial burst when segment arrives) ──
    for (const f of _flashes) {
      const age  = _t - f.t;
      const a    = Math.max(0, 1 - age / 0.45);
      const bell = Math.exp(-((age / 0.15) * (age / 0.15)));
      _ctx.globalAlpha = bell * 0.55;
      const grad = _ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * 0.4);
      grad.addColorStop(0, f.col + 'ff');
      grad.addColorStop(0.4, f.col + '55');
      grad.addColorStop(1, 'transparent');
      _ctx.fillStyle = grad;
      _ctx.fillRect(0, 0, W, H);
      _ctx.globalAlpha = 1;
    }

    // ── vRNP tracker panel (bottom-centre) ────────────────────────────
    _drawTracker(W, H);
  }

  function _drawTracker(W, H) {
    const n      = _nVRNP;
    const dotR   = 9;
    const dotGap = 8;
    const panW   = n * (dotR * 2 + dotGap) + dotGap + 20;
    const panH   = 56;
    const panX   = (W - panW) / 2;
    const panY   = H - panH - 20;

    // Background
    _ctx.fillStyle = 'rgba(0,0,0,0.50)';
    _rrect(_ctx, panX, panY, panW, panH, 10);
    _ctx.fill();

    // Label
    _ctx.fillStyle    = 'rgba(200,169,81,0.85)';
    _ctx.font         = 'bold 10px monospace';
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'top';
    _ctx.fillText(`vRNP IN NUCLEUS: ${_entered} / ${n}`, W / 2, panY + 8);

    // Dots (one per segment)
    for (let i = 0; i < n; i++) {
      const seg = _segs[i];
      const dx  = panX + dotGap + i * (dotR * 2 + dotGap) + dotR + 10;
      const dy  = panY + panH - dotR - 10;
      const col = '#' + P3D_CFG.A3_VRNP_COLS[i].toString(16).padStart(6, '0');

      if (!seg || seg.phase === 'waiting') {
        // Not yet released — dark grey
        _ctx.beginPath();
        _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle = '#222233';
        _ctx.fill();
        _ctx.strokeStyle = '#333344';
        _ctx.lineWidth   = 1;
        _ctx.stroke();
      } else if (seg.phase === 'traveling') {
        // In transit — pulsing coloured ring
        const pulse = 0.6 + 0.4 * Math.sin(_t * 4 + i);
        _ctx.globalAlpha = pulse;
        _ctx.beginPath();
        _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle   = col + '44';
        _ctx.fill();
        _ctx.strokeStyle = col;
        _ctx.lineWidth   = 2;
        _ctx.stroke();
        _ctx.globalAlpha = 1;
      } else {
        // Entered — solid filled dot with check mark
        _ctx.beginPath();
        _ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        _ctx.fillStyle = col;
        _ctx.fill();
        _ctx.fillStyle    = 'rgba(0,0,0,0.6)';
        _ctx.font         = `bold ${dotR}px monospace`;
        _ctx.textAlign    = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.fillText('✓', dx, dy);
      }
    }

    // Time remaining bar
    const elapsed = Math.min(1, _t / P3D_CFG.A3_JOURNEY_DUR);
    const barW    = panW - 20;
    const barY    = panY + panH - 5;
    _ctx.fillStyle = 'rgba(255,255,255,0.07)';
    _ctx.fillRect(panX + 10, barY, barW, 3);
    const barCol = elapsed < 0.7 ? '#C8A951' : '#FFA726';
    _ctx.fillStyle = barCol;
    _ctx.fillRect(panX + 10, barY, barW * elapsed, 3);
  }

  // ── Complete ───────────────────────────────────────────────────────────

  function _complete() {
    _running = false;

    const stats = { score: _score, entered: _entered, total: _nVRNP, time: _t };
    _p3._act3Done(stats);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  function destroy() {
    _running = false;
    window.removeEventListener('resize', _onResize);

    if (_canvas) { _canvas.remove(); _canvas = null; _ctx = null; }

    const scene = P3Descent && P3Descent.scene;
    if (scene) {
      if (_nucleus)  scene.remove(_nucleus);
      for (const r of _npcRings)  scene.remove(r);
      for (const o of _cytoObjs)  scene.remove(o);
      for (const s of _segs) if (s.mesh) scene.remove(s.mesh);
    }

    for (const g of _localGeos) g.dispose();
    for (const m of _localMats) m.dispose();
    _localGeos = []; _localMats = [];
    _nucleus = null; _npcRings = []; _cytoObjs = []; _segs = [];

    _p3 = null;
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  // Simple LCG for deterministic scatter
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

  // ── Public interface ───────────────────────────────────────────────────

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
