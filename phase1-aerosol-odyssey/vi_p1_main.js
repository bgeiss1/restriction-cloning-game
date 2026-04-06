/**
 * vi_p1_main.js — Phase 1 "Aerosol Odyssey" game entry point.
 *
 * Chunk 1: Static classroom environment + title overlay.
 * Chunk 2: Cough launch cinematic → player droplet + controls + HUD + win/fail.
 *
 * API (matches P2Attachment / P3Descent / P4NuclearFactory pattern):
 *   P1AerosolOdyssey.launch(carryover, onComplete, onFail)
 *   P1AerosolOdyssey.destroy()
 *   P1AerosolOdyssey._tick(dt)         — called by main game loop each frame
 *   P1AerosolOdyssey._active           — true while this phase owns the renderer
 *   P1AerosolOdyssey.scene             — THREE.Scene (main loop renders this)
 *   P1AerosolOdyssey.camera            — THREE.PerspectiveCamera
 */

/* global THREE, P1_CFG, P1Classroom, P1Furniture, P1Students, P1Droplet, P1HUD */

const P1AerosolOdyssey = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let _active     = false;
  let _onComplete = null;
  let _onFail     = null;

  let scene  = null;
  let camera = null;

  let _t       = 0.0;
  let _elapsed = 0.0;

  // Sub-states: 'TITLE' | 'CINEMATIC' | 'PLAYING' | 'WIN' | 'FAIL'
  let _phase = 'TITLE';
  let _introOverlay = null;

  // Cinematic
  let _cinT       = 0;          // time within cinematic
  const _CIN_DUR  = 1.8;        // total cinematic seconds
  let _coughCloud = null;       // THREE.Points for cough particle burst
  let _coughVels  = null;       // Float32Array (velocity per particle, flat xyz)
  let _coughT     = 0;          // age of cough cloud

  // Gameplay
  let _droplet = null;
  let _hud     = null;
  let _keys    = { left: false, right: false, up: false, down: false };
  let _kd      = null;   // keydown handler ref
  let _ku      = null;   // keyup  handler ref

  // Result overlay
  let _resultOverlay = null;

  // ── Preload ────────────────────────────────────────────────────────────────
  // Called by showBriefing(0) so the classroom renders behind the briefing panel.

  function preload() {
    if (_active) return;
    _active  = true;
    _elapsed = 0;
    _t       = 0;
    _buildScene();
  }

  // ── Launch ─────────────────────────────────────────────────────────────────

  function launch(carryover, onComplete, onFail) {
    _onComplete = onComplete || (() => {});
    _onFail     = onFail     || null;

    if (!_active) {
      _active  = true;
      _elapsed = 0;
      _t       = 0;
      _buildScene();
    }

    _showTitleOverlay();
  }

  // ── Scene setup ────────────────────────────────────────────────────────────

  function _buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1510);
    scene.fog = new THREE.Fog(0x1a1510, 18, 32);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(P1_CFG.CAM_FOV_NORMAL, aspect, 0.01, 60);
    camera.position.set(5.5, 4.8, -9.0);
    camera.lookAt(0, 1.2, 0);

    P1Classroom.init(scene);
    P1Furniture.init(scene);
    const deskPositions = P1Furniture.getDeskPositions();
    P1Students.init(scene, deskPositions);
  }

  // ── Title overlay ──────────────────────────────────────────────────────────

  function _showTitleOverlay() {
    _phase = 'TITLE';
    _introOverlay = document.createElement('div');
    _introOverlay.id = 'p1TitleOverlay';
    _introOverlay.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(10,8,6,0.72)',
      'z-index:500', 'pointer-events:auto',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    _introOverlay.innerHTML = `
      <div style="text-align:center;max-width:560px;padding:0 24px">
        <div style="font-size:0.68rem;letter-spacing:0.22em;text-transform:uppercase;
                    color:#888;margin-bottom:10px">PHASE 1</div>
        <div style="font-size:2.4rem;font-weight:800;letter-spacing:0.04em;
                    color:#eeddcc;margin-bottom:6px;line-height:1.1">
          AEROSOL ODYSSEY
        </div>
        <div style="font-size:0.95rem;color:#aaa;margin-bottom:28px;line-height:1.5">
          A student in the back of the classroom has influenza.<br>
          A cough is coming.
        </div>
        <div style="font-size:0.80rem;color:#88aacc;margin-bottom:32px;line-height:1.5;
                    max-width:400px;margin-left:auto;margin-right:auto">
          Navigate through the classroom air inside a respiratory droplet.<br>
          Avoid UV light, air currents, and dry zones.<br>
          Reach the susceptible student before the droplet evaporates.
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;
                    margin-bottom:32px">
          <kbd style="font-size:0.70rem;padding:4px 10px;
                      border:1px solid rgba(255,255,255,0.25);border-radius:4px;
                      color:#ccc;background:rgba(255,255,255,0.05)">A/D</kbd>
          <span style="color:#555;font-size:0.75rem;padding-top:4px">steer</span>
          <kbd style="font-size:0.70rem;padding:4px 10px;
                      border:1px solid rgba(255,255,255,0.25);border-radius:4px;
                      color:#ccc;background:rgba(255,255,255,0.05)">W/S</kbd>
          <span style="color:#555;font-size:0.75rem;padding-top:4px">altitude</span>
        </div>
        <button id="p1StartBtn" style="
          padding:12px 48px;
          font-size:0.88rem;letter-spacing:0.16em;text-transform:uppercase;
          background:rgba(200,140,60,0.18);
          border:1px solid rgba(200,140,60,0.55);
          border-radius:6px;color:#e0b870;
          cursor:pointer;transition:background 0.2s,border-color 0.2s">
          CLICK TO BEGIN
        </button>
      </div>
    `;

    document.body.appendChild(_introOverlay);

    const btn = document.getElementById('p1StartBtn');
    if (btn) {
      btn.addEventListener('mouseover', () => {
        btn.style.background  = 'rgba(200,140,60,0.32)';
        btn.style.borderColor = 'rgba(200,140,60,0.80)';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background  = 'rgba(200,140,60,0.18)';
        btn.style.borderColor = 'rgba(200,140,60,0.55)';
      });
      btn.addEventListener('click', _onStartClicked);
    }
  }

  function _onStartClicked() {
    _removeIntroOverlay();
    _startCinematic();
  }

  function _removeIntroOverlay() {
    if (_introOverlay && _introOverlay.parentNode) {
      _introOverlay.parentNode.removeChild(_introOverlay);
    }
    _introOverlay = null;
  }

  // ── Cough launch cinematic ─────────────────────────────────────────────────
  // Timeline (seconds):
  //   0.0 – 0.6  camera sweeps to just behind infected student's mouth
  //   0.6 – 1.1  cough cloud bursts; camera holds
  //   1.1 – 1.8  camera pulls back to behind-droplet launch position
  //   1.8        gameplay begins

  function _startCinematic() {
    _phase = 'CINEMATIC';
    _cinT  = 0;
    _buildCoughCloud();
  }

  function _buildCoughCloud() {
    const mouth = P1Students.getInfectedMouth();
    if (!mouth) return;

    const N = 40;
    const positions = new Float32Array(N * 3);
    _coughVels = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      // Start at mouth, slight random offset
      positions[i * 3    ] = mouth.x + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = mouth.y + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 2] = mouth.z + (Math.random() - 0.5) * 0.05;

      // Forward (+Z) cone with random spread
      const spread = 0.30;
      _coughVels[i * 3    ] = (Math.random() - 0.5) * spread;
      _coughVels[i * 3 + 1] = (Math.random() - 0.2) * spread * 0.6;
      _coughVels[i * 3 + 2] = 1.2 + Math.random() * 1.8;   // forward speed
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:       0xffffff,
      size:        0.045,
      transparent: true,
      opacity:     0.70,
      depthWrite:  false,
    });

    _coughCloud = new THREE.Points(geo, mat);
    _coughCloud.visible = false;   // shown at t=0.6
    scene.add(_coughCloud);
    _coughT = 0;
  }

  function _updateCinematic(dt) {
    _cinT += dt;

    const mouth = P1Students.getInfectedMouth();
    if (!mouth) { _cinT = _CIN_DUR; }  // skip if no mouth pos

    if (_cinT < 0.6) {
      // Phase A: sweep camera toward mouth
      const frac = _cinT / 0.6;
      const ease = 1 - Math.pow(1 - frac, 3);

      // "Cinematic 1" target: looking at mouth from slightly in front & above
      const tgtX = mouth ? mouth.x      : 0;
      const tgtY = mouth ? mouth.y + 0.3 : 1.5;
      const tgtZ = mouth ? mouth.z - 0.7 : -5.2;

      camera.position.x += (tgtX - camera.position.x) * ease * 0.12;
      camera.position.y += (tgtY - camera.position.y) * ease * 0.12;
      camera.position.z += (tgtZ - camera.position.z) * ease * 0.12;
      if (mouth) camera.lookAt(mouth.x, mouth.y, mouth.z);

    } else if (_cinT < 1.1) {
      // Phase B: cough burst visible
      if (_coughCloud) {
        _coughCloud.visible = true;
        _coughT += dt;
        const pos = _coughCloud.geometry.attributes.position.array;
        const N = pos.length / 3;
        for (let i = 0; i < N; i++) {
          pos[i * 3    ] += _coughVels[i * 3    ] * dt;
          pos[i * 3 + 1] += _coughVels[i * 3 + 1] * dt;
          pos[i * 3 + 2] += _coughVels[i * 3 + 2] * dt;
        }
        _coughCloud.geometry.attributes.position.needsUpdate = true;
        // Fade cloud
        const age = _cinT - 0.6;
        _coughCloud.material.opacity = Math.max(0, 0.70 - age * 1.2);
      }

    } else if (_cinT < _CIN_DUR) {
      // Phase C: camera pulls back toward droplet launch position
      const dropletStart = _getDropletStartPos();
      const co = P1_CFG.CAM_OFFSET;
      const camTgt = {
        x: dropletStart.x + co.x,
        y: dropletStart.y + co.y,
        z: dropletStart.z + co.z,
      };
      camera.position.x += (camTgt.x - camera.position.x) * 0.10;
      camera.position.y += (camTgt.y - camera.position.y) * 0.10;
      camera.position.z += (camTgt.z - camera.position.z) * 0.10;
      camera.lookAt(dropletStart.x, dropletStart.y, dropletStart.z + 0.6);

      // Continue fading cloud
      if (_coughCloud) {
        _coughCloud.material.opacity = Math.max(0, _coughCloud.material.opacity - dt * 1.5);
      }

    } else {
      // Cinematic complete
      _removeCoughCloud();
      _startDropletGame();
    }
  }

  function _getDropletStartPos() {
    const mouth = P1Students.getInfectedMouth();
    if (mouth) {
      return { x: mouth.x, y: mouth.y, z: mouth.z + 0.35 };
    }
    // Fallback: back-left area
    return { x: P1_CFG.DESK_X[0], y: P1_CFG.MOUTH_Y, z: P1_CFG.Z_START + 0.3 };
  }

  function _removeCoughCloud() {
    if (_coughCloud) {
      if (_coughCloud.parent) _coughCloud.parent.remove(_coughCloud);
      _coughCloud.geometry.dispose();
      _coughCloud.material.dispose();
      _coughCloud = null;
    }
    _coughVels = null;
  }

  // ── Gameplay ───────────────────────────────────────────────────────────────

  function _startDropletGame() {
    _phase = 'PLAYING';

    const startPos = _getDropletStartPos();
    P1Droplet.init(scene, camera, startPos);

    P1HUD.init();

    // Keyboard handlers
    _keys = { left: false, right: false, up: false, down: false };
    _kd = (e) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  _keys.left  = true;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') _keys.right = true;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    _keys.up    = true;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')  _keys.down  = true;
    };
    _ku = (e) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  _keys.left  = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') _keys.right = false;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    _keys.up    = false;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')  _keys.down  = false;
    };
    document.addEventListener('keydown', _kd);
    document.addEventListener('keyup',   _ku);

    P1Droplet.setKeys(_keys);
  }

  function _removeKeyHandlers() {
    if (_kd) { document.removeEventListener('keydown', _kd); _kd = null; }
    if (_ku) { document.removeEventListener('keyup',   _ku); _ku = null; }
  }

  // ── Win / Fail ─────────────────────────────────────────────────────────────

  function _handleWin() {
    _phase = 'WIN';
    _removeKeyHandlers();
    const state = P1Droplet.getState();
    _showResultOverlay(true, state);
  }

  function _handleFail() {
    _phase = 'FAIL';
    _removeKeyHandlers();
    const reason = P1Droplet.getFailReason();
    _showResultOverlay(false, null, reason);
  }

  function _showResultOverlay(won, state, reason) {
    _resultOverlay = document.createElement('div');
    _resultOverlay.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(8,6,4,0.80)', 'z-index:500',
      'pointer-events:auto',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    if (won) {
      const vv = state ? state.viralViability.toFixed(0) : '?';
      const di = state ? state.dropletIntegrity.toFixed(0) : '?';
      _resultOverlay.innerHTML = `
        <div style="text-align:center;max-width:460px;padding:0 24px">
          <div style="font-size:1.0rem;letter-spacing:0.20em;text-transform:uppercase;
                      color:#44ffaa;margin-bottom:10px">INHALED</div>
          <div style="font-size:2.0rem;font-weight:800;color:#eeddcc;
                      margin-bottom:20px;line-height:1.1">Transmission Successful</div>
          <div style="display:flex;gap:24px;justify-content:center;margin-bottom:24px">
            <div style="text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:#55bbff">${di}%</div>
              <div style="font-size:0.65rem;color:#888;letter-spacing:0.12em;text-transform:uppercase">Droplet Integrity</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:#ff7744">${vv}%</div>
              <div style="font-size:0.65rem;color:#888;letter-spacing:0.12em;text-transform:uppercase">Viral Viability</div>
            </div>
          </div>
          <button id="p1WinBtn" style="
            padding:10px 40px;font-size:0.82rem;letter-spacing:0.14em;text-transform:uppercase;
            background:rgba(0,200,120,0.18);border:1px solid rgba(0,200,120,0.50);
            border-radius:6px;color:#44ffaa;cursor:pointer">
            CONTINUE →
          </button>
        </div>
      `;
    } else {
      _resultOverlay.innerHTML = `
        <div style="text-align:center;max-width:460px;padding:0 24px">
          <div style="font-size:1.0rem;letter-spacing:0.20em;text-transform:uppercase;
                      color:#ff5544;margin-bottom:10px">FAILED</div>
          <div style="font-size:2.0rem;font-weight:800;color:#eeddcc;
                      margin-bottom:16px;line-height:1.1">Transmission Failed</div>
          <div style="font-size:0.88rem;color:#aaa;margin-bottom:24px;line-height:1.5">
            ${reason || 'The droplet did not reach its target.'}
          </div>
          <div style="display:flex;gap:12px;justify-content:center">
            <button id="p1RetryBtn" style="
              padding:10px 32px;font-size:0.82rem;letter-spacing:0.14em;text-transform:uppercase;
              background:rgba(200,140,60,0.18);border:1px solid rgba(200,140,60,0.50);
              border-radius:6px;color:#e0b870;cursor:pointer">
              TRY AGAIN
            </button>
            <button id="p1SkipBtn2" style="
              padding:10px 32px;font-size:0.82rem;letter-spacing:0.14em;text-transform:uppercase;
              background:rgba(0,180,100,0.12);border:1px solid rgba(0,180,100,0.40);
              border-radius:6px;color:#44cc88;cursor:pointer">
              SKIP
            </button>
          </div>
        </div>
      `;
    }

    document.body.appendChild(_resultOverlay);

    // Button wiring
    const winBtn = document.getElementById('p1WinBtn');
    if (winBtn) winBtn.addEventListener('click', () => {
      _cleanupGame();
      const vv = state ? Math.round(state.viralViability) : 80;
      destroy();
      if (_onComplete) _onComplete({ viralViability: vv });
    });

    const retryBtn = document.getElementById('p1RetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => {
      _cleanupGame();
      _startCinematic();
    });

    const skipBtn = document.getElementById('p1SkipBtn2');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      _cleanupGame();
      destroy();
      if (_onComplete) _onComplete({ viralViability: 80 });
    });
  }

  function _cleanupGame() {
    _removeResultOverlay();
    if (_hud) { P1HUD.destroy(); _hud = null; }
    if (_droplet) { P1Droplet.destroy(); _droplet = null; }
    _removeKeyHandlers();
    _removeCoughCloud();
  }

  function _removeResultOverlay() {
    if (_resultOverlay && _resultOverlay.parentNode) {
      _resultOverlay.parentNode.removeChild(_resultOverlay);
    }
    _resultOverlay = null;
  }

  // ── _tick ──────────────────────────────────────────────────────────────────

  function _tick(dt) {
    if (!_active) return;
    _t       += dt;
    _elapsed += dt;

    // ── Sub-state updates ────────────────────────────────────────────────────
    if (_phase === 'TITLE') {
      // Gentle orbit during title card
      const r = 10.5;
      const angle = -Math.PI * 0.55 + _t * 0.06;
      camera.position.x = Math.cos(angle) * r * 0.7;
      camera.position.z = Math.sin(angle) * r - 1.0;
      camera.position.y = 4.2 + Math.sin(_t * 0.12) * 0.3;
      camera.lookAt(0, 1.2, 1.0);

    } else if (_phase === 'CINEMATIC') {
      _updateCinematic(dt);

    } else if (_phase === 'PLAYING') {
      P1Droplet.setKeys(_keys);
      P1Droplet.tick(dt);

      const pos   = P1Droplet.getPos();
      const state = P1Droplet.getState();
      const target = P1Students.getTargetHead();
      let distToTarget;
      if (target) {
        const dz = target.z - pos.z;
        distToTarget = Math.max(0, dz);
      }
      P1HUD.update({ ...state, distToTarget });

      if (!P1Droplet.isAlive()) {
        _handleFail();
      } else if (P1Droplet.hasWon()) {
        _handleWin();
      }
    }

    // ── Always update classroom subsystems ───────────────────────────────────
    P1Classroom.tick(dt);
    P1Students.tick(dt);
  }

  // ── destroy ────────────────────────────────────────────────────────────────

  function destroy() {
    _active = false;
    _phase  = 'TITLE';

    _removeIntroOverlay();
    _removeResultOverlay();
    _removeCoughCloud();
    _removeKeyHandlers();

    if (_hud) { P1HUD.destroy(); _hud = null; }
    if (_droplet) { P1Droplet.destroy(); _droplet = null; }

    P1Students.destroy();
    P1Furniture.destroy();
    P1Classroom.destroy();

    scene  = null;
    camera = null;
    _t = _elapsed = _cinT = _coughT = 0;
  }

  // ── Public object ──────────────────────────────────────────────────────────
  return {
    preload,
    launch,
    destroy,
    _tick,
    get _active() { return _active; },
    get scene()   { return scene;   },
    get camera()  { return camera;  },
  };

})();
