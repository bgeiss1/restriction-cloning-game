/**
 * vi_p1_main.js — Phase 0 "Aerosol Odyssey" entry point.
 *
 * State machine:
 *   TITLE → CINEMATIC → ZOOM_IN → PLAYING_2D → WIN | FAIL
 *
 * CINEMATIC sub-phases (driven by _cinT):
 *   A  0.0 – 1.0  Wide angled shot; infected student tips head back
 *   B  1.0 – 1.6  Sneeze burst; camera accelerates forward
 *   C  1.6 – 3.8  Camera rushes past cloud toward target droplet; droplet appears
 *   D  3.8 – 5.0  Camera precision-locks on droplet; FOV narrows 22° → 13°
 *   → triggers ZOOM_IN
 *
 * ZOOM_IN: iris-wipe canvas overlay (light-blue circle expands → fades to black)
 *   → _startPlaying2D()   [stub; 2D platformer filled in by Chunk B]
 *
 * API (matches P2Attachment / P3Descent / P4NuclearFactory shape):
 *   P1AerosolOdyssey.launch(carryover, onComplete, onFail)
 *   P1AerosolOdyssey.destroy()
 *   P1AerosolOdyssey._tick(dt)
 *   P1AerosolOdyssey._active
 *   P1AerosolOdyssey.scene
 *   P1AerosolOdyssey.camera
 */

/* global THREE, P1_CFG, P1Classroom, P1Furniture, P1Students, P1Audio, P1Level, P1Droplet, P1HUD */

const P1AerosolOdyssey = (() => {

  // ── Module state ───────────────────────────────────────────────────────────
  let _active     = false;
  let _onComplete = null;
  let _onFail     = null;

  let scene  = null;
  let camera = null;

  let _t       = 0.0;
  let _elapsed = 0.0;

  // Phase: 'TITLE' | 'CINEMATIC' | 'ZOOM_IN' | 'PLAYING_2D' | 'WIN' | 'FAIL'
  let _phase = 'TITLE';

  let _introOverlay  = null;
  let _resultOverlay = null;

  // ── Cinematic constants ────────────────────────────────────────────────────
  const _CIN_A   = 1.0;   // end of Phase A (wide + head-back)
  const _CIN_B   = 1.6;   // end of Phase B (sneeze fires at CIN_A)
  const _CIN_C   = 3.8;   // end of Phase C (camera rush in)
  const _CIN_D   = 5.0;   // end of Phase D → triggers ZOOM_IN
  const _ZI_DUR  = 1.1;   // iris-wipe duration (seconds)

  // Cinematic runtime state
  let _cinT        = 0;
  let _sneezeFired = false;
  let _coughCloud  = null;
  let _coughVels   = null;

  // Target droplet (3D mesh in cinematic scene)
  let _targetDroplet = null;   // { group, outerMat }
  let _tdPos         = null;   // {x,y,z} world position

  // Zoom-in iris wipe
  let _ziT        = 0;
  let _irisCanvas = null;
  let _irisCtx    = null;

  // 2D game state
  let _scrollX     = 0;
  let _scrollSpeed = P1_CFG.SCROLL_SPEED_INIT_2D;
  let _viewW       = 0;   // orthographic view width
  let _keys        = { up: false, down: false, left: false, right: false };
  let _kDown       = false;
  let _kUp         = false;

  // Polish effects (Chunk F)
  let _lastSpeedBoostX = -1;
  let _screenEffectTime = 0;

  // ── Preload ────────────────────────────────────────────────────────────────
  // Called by viral_infiltration.html showBriefing(0) so the classroom renders
  // behind the briefing panel while the user reads the intro text.

  function preload() {
    if (_active) return;
    _active  = true;
    _elapsed = 0;
    _buildScene();
  }

  // ── Launch ─────────────────────────────────────────────────────────────────

  function launch(carryover, onComplete, onFail) {
    _onComplete = onComplete || (() => {});
    _onFail     = onFail     || null;

    if (!_active) {
      _active  = true;
      _elapsed = 0;
      _buildScene();
    }
    _showTitleOverlay();
  }

  // ── 3D scene (cinematic only) ──────────────────────────────────────────────

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
    P1Students.init(scene, P1Furniture.getDeskPositions());
  }

  // Reinit subsystems into existing scene (used by retry path).
  function _resetScene() {
    P1Students.destroy();
    P1Furniture.destroy();
    P1Classroom.destroy();

    scene.background = new THREE.Color(0x1a1510);
    scene.fog        = new THREE.Fog(0x1a1510, 18, 32);

    camera.position.set(5.5, 4.8, -9.0);
    camera.lookAt(0, 1.2, 0);
    camera.fov = P1_CFG.CAM_FOV_NORMAL;
    camera.updateProjectionMatrix();

    P1Classroom.init(scene);
    P1Furniture.init(scene);
    P1Students.init(scene, P1Furniture.getDeskPositions());
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
          A sneeze is coming.
        </div>
        <div style="font-size:0.80rem;color:#88aacc;margin-bottom:32px;line-height:1.5;
                    max-width:400px;margin-left:auto;margin-right:auto">
          Guide a virus-laden droplet through the classroom air.<br>
          Avoid UV light, heat, and drying air currents.<br>
          Reach the susceptible student before the droplet evaporates.
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;
                    margin-bottom:32px">
          <kbd style="font-size:0.70rem;padding:4px 10px;
                      border:1px solid rgba(255,255,255,0.25);border-radius:4px;
                      color:#ccc;background:rgba(255,255,255,0.05)">↑ ↓</kbd>
          <span style="color:#555;font-size:0.75rem;padding-top:4px">altitude</span>
          <kbd style="font-size:0.70rem;padding:4px 10px;
                      border:1px solid rgba(255,255,255,0.25);border-radius:4px;
                      color:#ccc;background:rgba(255,255,255,0.05)">← →</kbd>
          <span style="color:#555;font-size:0.75rem;padding-top:4px">lateral</span>
        </div>
        <button id="p1StartBtn" style="
          padding:12px 48px;
          font-size:0.88rem;letter-spacing:0.16em;text-transform:uppercase;
          background:rgba(200,140,60,0.18);
          border:1px solid rgba(200,140,60,0.55);
          border-radius:6px;color:#e0b870;
          cursor:pointer;transition:background 0.2s,border-color 0.2s">
          WATCH THE SNEEZE
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
    P1Audio.init();
    _removeIntroOverlay();
    _startCinematic();
  }

  function _removeIntroOverlay() {
    if (_introOverlay && _introOverlay.parentNode) {
      _introOverlay.parentNode.removeChild(_introOverlay);
    }
    _introOverlay = null;
  }

  // ── Cinematic setup ────────────────────────────────────────────────────────

  function _startCinematic() {
    _phase        = 'CINEMATIC';
    _cinT         = 0;
    _sneezeFired  = false;
    _tdPos        = null;
    _targetDroplet = null;

    // Ensure camera starts from consistent position for repeatable cinematic
    camera.position.set(5.5, 4.8, -9.0);
    camera.lookAt(0, 1.2, 0);
    camera.fov = P1_CFG.CAM_FOV_NORMAL;
    camera.updateProjectionMatrix();
  }

  // ── Cough cloud ────────────────────────────────────────────────────────────

  function _buildCoughCloud() {
    const mouth = P1Students.getInfectedMouth();
    if (!mouth) return;

    const N = 80;
    const positions = new Float32Array(N * 3);
    _coughVels      = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      positions[i*3  ] = mouth.x + (Math.random() - 0.5) * 0.06;
      positions[i*3+1] = mouth.y + (Math.random() - 0.5) * 0.06;
      positions[i*3+2] = mouth.z + (Math.random() - 0.5) * 0.06;

      // Forward cone (+Z) — most particles fly forward, some scatter wide
      const spread = 0.45 + Math.random() * 0.25;
      _coughVels[i*3  ] = (Math.random() - 0.5) * spread;
      _coughVels[i*3+1] = (Math.random() - 0.3) * spread * 0.7 + 0.15;
      _coughVels[i*3+2] = 0.9 + Math.random() * 2.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color:       0xbbddf0,
      size:        0.07,
      transparent: true,
      opacity:     0.80,
      depthWrite:  false,
    });

    _coughCloud = new THREE.Points(geo, mat);
    scene.add(_coughCloud);
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

  // ── Target droplet mesh ────────────────────────────────────────────────────
  // A single virus-laden droplet visible in the scene — the cinematic zooms
  // in on this object before the iris wipe to the 2D game.

  function _spawnTargetDroplet() {
    const mouth = P1Students.getInfectedMouth();
    const base  = mouth || { x: -2.5, y: 1.2, z: -4.5 };

    // Slightly forward (+Z) and elevated relative to the mouth
    _tdPos = { x: base.x + 0.08, y: base.y + 0.15, z: base.z + 0.58 };

    const group = new THREE.Group();
    group.position.set(_tdPos.x, _tdPos.y, _tdPos.z);

    // Outer water-drop shell
    const outerGeo = new THREE.SphereGeometry(0.18, 16, 12);
    const outerMat = new THREE.MeshPhongMaterial({
      color:       0x88ddff,
      emissive:    new THREE.Color(0x001133),
      transparent: true,
      opacity:     0.0,    // fades in during Phase C
      depthWrite:  false,
      shininess:   90,
    });
    group.add(new THREE.Mesh(outerGeo, outerMat));

    // Inner virus — smooth sphere
    const virusGeo = new THREE.SphereGeometry(0.056, 12, 8);
    const virusMat = new THREE.MeshPhongMaterial({
      color:             0xff6644,
      emissive:          new THREE.Color(0x441100),
      emissiveIntensity: 0.45,
      shininess:         25,
    });
    group.add(new THREE.Mesh(virusGeo, virusMat));

    // HA Trimers — 6 cardinal directions (replace spike cones with influenza HA trimers)
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    dirs.forEach(([dx, dy, dz]) => {
      const trimerGroup = new THREE.Group();
      const trimerPos = new THREE.Vector3(dx, dy, dz).multiplyScalar(0.056); // Contact virus surface
      trimerGroup.position.copy(trimerPos);

      // Align trimer to point outward from virus center
      const outward = new THREE.Vector3(dx, dy, dz);
      trimerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);

      // HA2 stem (stalk) - smaller scale for cinematic
      const stemGeo = new THREE.CylinderGeometry(0.003, 0.006, 0.025, 6);
      const stemMat = new THREE.MeshPhongMaterial({
        color: 0xff6644,
        emissive: 0x220000,
        emissiveIntensity: 0.15
      });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.0125; // half height to position base at origin
      trimerGroup.add(stem);

      // Three HA1 head domains (120° apart) - smaller scale for cinematic
      for (let j = 0; j < 3; j++) {
        const angle = (j / 3) * Math.PI * 2;
        const headGeo = new THREE.SphereGeometry(0.008, 6, 5);
        const headMat = new THREE.MeshPhongMaterial({
          color: 0xff8866,
          emissive: 0x331100,
          emissiveIntensity: 0.12
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(
          Math.cos(angle) * 0.009,
          0.030,
          Math.sin(angle) * 0.009
        );
        trimerGroup.add(head);
      }

      group.add(trimerGroup);
    });

    scene.add(group);
    _targetDroplet = { group, outerMat };
  }

  function _destroyTargetDroplet() {
    if (!_targetDroplet) return;
    const { group } = _targetDroplet;
    if (group.parent) group.parent.remove(group);
    group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    _targetDroplet = null;
    _tdPos         = null;
  }

  // ── Cinematic tick ─────────────────────────────────────────────────────────

  function _updateCinematic(dt) {
    _cinT += dt;
    const mouth = P1Students.getInfectedMouth();
    const mBase = mouth || { x: -2.5, y: 1.2, z: -4.5 };

    // Smoothstep helper
    const ss = f => Math.max(0, Math.min(1, f)) ** 2 * (3 - 2 * Math.max(0, Math.min(1, f)));

    // Frame-rate-independent lerp: rate is units per second reaching fraction
    const lerpCam = (tx, ty, tz, rate) => {
      const k = Math.min(1, rate * dt);
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (ty - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
    };

    // ── Particle cloud ───────────────────────────────────────────────────────
    if (_coughCloud) {
      const pos = _coughCloud.geometry.attributes.position.array;
      const N   = pos.length / 3;
      for (let i = 0; i < N; i++) {
        pos[i*3  ] += _coughVels[i*3  ] * dt;
        pos[i*3+1] += _coughVels[i*3+1] * dt;
        pos[i*3+2] += _coughVels[i*3+2] * dt;
      }
      _coughCloud.geometry.attributes.position.needsUpdate = true;
      const age = Math.max(0, _cinT - _CIN_A);
      _coughCloud.material.opacity = Math.max(0, 0.80 - age * 0.28);
      if (_coughCloud.material.opacity <= 0) _removeCoughCloud();
    }

    // ── Target droplet fade-in + gentle bob ──────────────────────────────────
    if (_targetDroplet) {
      const fadeStart = _CIN_B + 0.55;
      if (_cinT > fadeStart) {
        const fadeFrac = Math.min(1, (_cinT - fadeStart) / 0.7);
        _targetDroplet.outerMat.opacity = fadeFrac * 0.68;
      }
      if (_tdPos) {
        _targetDroplet.group.position.y = _tdPos.y + Math.sin(_cinT * 2.4) * 0.006;
        _targetDroplet.group.rotation.y += dt * 0.75;
      }
    }

    // ── Phase A: 0 → CIN_A — wide shot, head tips back ───────────────────────
    if (_cinT < _CIN_A) {
      const frac = ss(_cinT / _CIN_A);
      // Camera drifts from initial wide position toward infected-student side
      lerpCam(-1.0, 3.2, -8.5, 1.5 + frac * 2.0);
      camera.lookAt(mBase.x, mBase.y + 0.25, mBase.z);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      // Infected student tips head back: pose 0 (hunch) → 0.5 (head back)
      P1Students.setSneezePose(frac * 0.5);

    // ── Phase B: CIN_A → CIN_B — sneeze burst, camera accelerates ────────────
    } else if (_cinT < _CIN_B) {
      const frac = (_cinT - _CIN_A) / (_CIN_B - _CIN_A);
      const ease = 1 - (1 - frac) ** 2;

      lerpCam(-1.8, 2.3, -7.0, 8);
      camera.lookAt(mBase.x, mBase.y + 0.1, mBase.z);
      camera.fov = 56 - ease * 8;
      camera.updateProjectionMatrix();
      // Head snaps forward into sneeze: pose 0.5 (head back) → 1.0 (sneeze)
      P1Students.setSneezePose(0.5 + frac * 0.5);

      // Fire sneeze on first frame of Phase B
      if (!_sneezeFired) {
        _sneezeFired = true;
        _buildCoughCloud();
        P1Audio.playCough();
      }

    // ── Phase C: CIN_B → CIN_C — camera rushes past cloud, droplet appears ───
    } else if (_cinT < _CIN_C) {
      const frac  = (_cinT - _CIN_B) / (_CIN_C - _CIN_B);
      const ease2 = frac * frac;   // ease-in — camera accelerates

      // Spawn target droplet at start of Phase C
      if (!_targetDroplet) _spawnTargetDroplet();

      const tdp = _tdPos || { x: mBase.x + 0.08, y: mBase.y + 0.15, z: mBase.z + 0.58 };

      // Camera sweeps from mouth-proximity to directly in front of target droplet.
      // The infected student is at z≈-4.5 facing +Z; droplet is at z≈-3.92.
      // Camera comes around to z > droplet.z, looking back in -Z direction.
      const tgtX = tdp.x + 0.04;
      const tgtY = tdp.y + 0.15 - ease2 * 0.12;
      const tgtZ = tdp.z + 0.95 - ease2 * 0.33;   // arrives at tdp.z + 0.62

      lerpCam(tgtX, tgtY, tgtZ, 2.8 + ease2 * 7.0);
      camera.lookAt(tdp.x, tdp.y, tdp.z);
      camera.fov = 48 - ease2 * 26;   // 48 → 22
      camera.updateProjectionMatrix();

    // ── Phase D: CIN_C → CIN_D — precision zoom, FOV narrows ─────────────────
    } else if (_cinT < _CIN_D) {
      const frac = ss((_cinT - _CIN_C) / (_CIN_D - _CIN_C));
      const tdp  = _tdPos || { x: mBase.x + 0.08, y: mBase.y + 0.15, z: mBase.z + 0.58 };

      // Lock camera: directly in front of droplet, looking straight back at it
      lerpCam(tdp.x + 0.01, tdp.y + 0.01, tdp.z + 0.60, 14);
      camera.lookAt(tdp.x, tdp.y, tdp.z);
      camera.fov = 22 - frac * 9;   // 22 → 13
      camera.updateProjectionMatrix();

    } else {
      // Phase D complete → iris wipe
      _startZoomIn();
    }
  }

  // ── Iris-wipe (ZOOM_IN phase) ──────────────────────────────────────────────

  function _startZoomIn() {
    _phase = 'ZOOM_IN';
    _ziT   = 0;

    _irisCanvas        = document.createElement('canvas');
    _irisCanvas.width  = window.innerWidth;
    _irisCanvas.height = window.innerHeight;
    _irisCanvas.style.cssText = [
      'position:fixed', 'inset:0',
      'z-index:400', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(_irisCanvas);
    _irisCtx = _irisCanvas.getContext('2d');
  }

  function _drawIris(frac) {
    const w    = _irisCanvas.width;
    const h    = _irisCanvas.height;
    const cx   = w / 2;
    const cy   = h / 2;
    const diag = Math.hypot(w, h);
    const ctx  = _irisCtx;
    ctx.clearRect(0, 0, w, h);

    if (frac < 0.62) {
      // Expanding light-blue droplet circle
      const r = diag * (frac / 0.62) * 0.74;
      ctx.fillStyle = '#a0d8f0';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Full-screen blue, fading to black
      const blackFrac = Math.min(1, (frac - 0.62) / 0.38);
      ctx.fillStyle = '#a0d8f0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(0,0,0,${blackFrac.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function _destroyIris() {
    if (_irisCanvas && _irisCanvas.parentNode) {
      _irisCanvas.parentNode.removeChild(_irisCanvas);
    }
    _irisCanvas = null;
    _irisCtx    = null;
  }

  function _updateZoomIn(dt) {
    _ziT += dt;
    const frac = Math.min(1, _ziT / _ZI_DUR);
    _drawIris(frac);
    if (frac >= 1) {
      _destroyIris();
      _startPlaying2D();
    }
  }

  // ── 2D game setup ──────────────────────────────────────────────────────────

  function _startPlaying2D() {
    _phase = 'PLAYING_2D';

    // Clean up 3D cinematic assets
    _cleanupCinematic();
    P1Students.destroy();
    P1Furniture.destroy();
    P1Classroom.destroy();

    // Switch to orthographic camera
    const aspect = window.innerWidth / window.innerHeight;
    const vH = P1_CFG.VIEW_HEIGHT_2D;
    _viewW = vH * aspect;

    camera = new THREE.OrthographicCamera(-_viewW/2, _viewW/2, vH/2, -vH/2, 0.1, 50);
    _scrollX = 0;
    _scrollSpeed = P1_CFG.SCROLL_SPEED_INIT_2D;

    // Reset scene for 2D
    scene.background = new THREE.Color(0x87ceeb);  // sky blue
    scene.fog = null;

    // Add lighting for 2D scene
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Initialize 2D subsystems
    P1Level.init(scene, aspect);
    P1Droplet.init(scene, _scrollX, _scrollSpeed, _viewW);
    P1HUD.init();

    // Set up keyboard listeners
    _setupKeyListeners();

    // Start ambient audio
    P1Audio.playAmbient();
  }

  function _setupKeyListeners() {
    const onKeyDown = (e) => {
      if (_phase !== 'PLAYING_2D') return;
      switch (e.code) {
        case 'ArrowUp':    case 'KeyW': _keys.up = true; e.preventDefault(); break;
        case 'ArrowDown':  case 'KeyS': _keys.down = true; e.preventDefault(); break;
        case 'ArrowLeft':  case 'KeyA': _keys.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'KeyD': _keys.right = true; e.preventDefault(); break;
      }
    };

    const onKeyUp = (e) => {
      if (_phase !== 'PLAYING_2D') return;
      switch (e.code) {
        case 'ArrowUp':    case 'KeyW': _keys.up = false; e.preventDefault(); break;
        case 'ArrowDown':  case 'KeyS': _keys.down = false; e.preventDefault(); break;
        case 'ArrowLeft':  case 'KeyA': _keys.left = false; e.preventDefault(); break;
        case 'ArrowRight': case 'KeyD': _keys.right = false; e.preventDefault(); break;
      }
    };

    if (!_kDown) {
      window.addEventListener('keydown', onKeyDown);
      _kDown = true;
    }
    if (!_kUp) {
      window.addEventListener('keyup', onKeyUp);
      _kUp = true;
    }
  }

  function _tick2D(dt) {
    // Auto-scroll with dynamic speed progression (enhanced in Chunk F)
    let targetSpeed = P1_CFG.SCROLL_SPEED_INIT_2D;

    // Add speed boosts at specific points with enhanced feedback
    for (const boostPoint of P1_CFG.DIFFICULTY_PROGRESSION_2D.speedBoostPoints) {
      if (_scrollX >= boostPoint && _lastSpeedBoostX < boostPoint) {
        targetSpeed += P1_CFG.DIFFICULTY_PROGRESSION_2D.speedBoostAmount;
        _lastSpeedBoostX = boostPoint;

        // Enhanced speed boost feedback (Chunk F)
        _screenEffectTime = P1_CFG.SPEED_BOOST_EFFECT_2D;

        // Audio feedback for speed boost
        if (typeof P1Audio !== 'undefined' && P1Audio.playSpeedBoost) {
          P1Audio.playSpeedBoost(0.6);
        }
      } else if (_scrollX >= boostPoint) {
        targetSpeed += P1_CFG.DIFFICULTY_PROGRESSION_2D.speedBoostAmount;
      }
    }

    // Natural ramp up to max speed
    targetSpeed = Math.min(P1_CFG.SCROLL_SPEED_MAX_2D, targetSpeed);
    _scrollSpeed = Math.min(targetSpeed, _scrollSpeed + P1_CFG.SCROLL_RAMP_2D * dt);
    _scrollX += _scrollSpeed * dt;

    // Update screen effects
    if (_screenEffectTime > 0) {
      _screenEffectTime -= dt;

      // Create subtle screen flash effect for speed boosts
      if (_screenEffectTime > P1_CFG.SPEED_BOOST_EFFECT_2D * 0.8) {
        const intensity = (_screenEffectTime - P1_CFG.SPEED_BOOST_EFFECT_2D * 0.8) / (P1_CFG.SPEED_BOOST_EFFECT_2D * 0.2);
        // Could add scene.background color flash here if desired
      }
    }

    // Update camera to follow scroll
    camera.position.set(_scrollX + _viewW/2, P1_CFG.VIEW_HEIGHT_2D/2, 10);
    camera.lookAt(_scrollX + _viewW/2, P1_CFG.VIEW_HEIGHT_2D/2, 0);

    // Tick subsystems
    const dropletPos = P1Droplet.getPos();
    P1Level.tick(dt, _scrollX, dropletPos);
    const breathState = P1Level.getBreathState(dropletPos.x, dropletPos.y);
    P1Droplet.tick(dt, _scrollX, _scrollSpeed, _viewW, _keys, breathState);

    // Update HUD with enhanced feedback (Chunk F polish)
    const dropletState = P1Droplet.getState();
    const distToTarget = Math.sqrt(
      (dropletPos.x - P1_CFG.MOUTH_WORLD_X_2D) ** 2 +
      (dropletPos.y - P1_CFG.MOUTH_WORLD_Y_2D) ** 2
    );

    // Enhanced zone name with difficulty indicators
    let enhancedZoneName = breathState.zoneName || 'AIRBORNE';
    if (breathState.hazardEffects && breathState.hazardEffects.difficultyMult > 1.2) {
      enhancedZoneName += ' ⚠'; // Warning indicator for high difficulty areas
    }

    P1HUD.update({
      dropletIntegrity: dropletState.dropletIntegrity,
      viralViability: dropletState.viralViability,
      distToTarget,
      zoneName: enhancedZoneName,
      // Additional polish data for enhanced HUD
      scrollSpeed: _scrollSpeed.toFixed(1),
      progressPercent: Math.min(100, (_scrollX / P1_CFG.WORLD_WIDTH_2D) * 100)
    });

    // Check win/fail conditions
    if (P1Droplet.hasWon()) {
      _handleWin(dropletState);
    } else if (!P1Droplet.isAlive()) {
      _handleFail(P1Droplet.getFailReason(), dropletState);
    }
  }

  function _showPlaceholderOverlay() {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(0,10,20,0.96)',
      'z-index:500', 'pointer-events:auto',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    el.innerHTML = `
      <div style="text-align:center;max-width:480px;padding:0 24px">
        <div style="font-size:0.65rem;letter-spacing:0.22em;color:#446;
                    text-transform:uppercase;margin-bottom:14px">AEROSOL ODYSSEY</div>
        <div style="font-size:1.9rem;font-weight:700;color:#88ccee;
                    margin-bottom:10px">Cinematic complete.</div>
        <div style="font-size:0.88rem;color:#667;margin-bottom:32px;line-height:1.6">
          The 2D droplet platformer begins here in Chunk B.
        </div>
        <div style="display:flex;gap:12px;justify-content:center">
          <button id="p1PlRetry" style="
            padding:10px 28px;font-size:0.80rem;letter-spacing:0.14em;text-transform:uppercase;
            background:rgba(200,140,60,0.15);border:1px solid rgba(200,140,60,0.45);
            border-radius:6px;color:#e0b870;cursor:pointer">
            REPLAY CINEMATIC
          </button>
          <button id="p1PlSkip" style="
            padding:10px 28px;font-size:0.80rem;letter-spacing:0.14em;text-transform:uppercase;
            background:rgba(0,180,120,0.12);border:1px solid rgba(0,180,120,0.40);
            border-radius:6px;color:#44cc88;cursor:pointer">
            SKIP →
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    _resultOverlay = el;

    document.getElementById('p1PlRetry').addEventListener('click', () => {
      if (el.parentNode) el.parentNode.removeChild(el);
      _resultOverlay = null;

      // Complete cleanup of both 2D game and cinematic
      _cleanupGame2D();
      _cleanupCinematic();
      _resetScene();

      // Reset all state variables
      _phase = 'TITLE';
      _t = 0;
      _elapsed = 0;
      _cinT = 0;
      _ziT = 0;
      _lastSpeedBoostX = -1;
      _screenEffectTime = 0;

      _startCinematic();
    });

    document.getElementById('p1PlSkip').addEventListener('click', () => {
      if (el.parentNode) el.parentNode.removeChild(el);
      _resultOverlay = null;
      _active = false;
      if (_onComplete) _onComplete({ viralViability: 80 });
    });
  }

  // ── Win / Fail (used by 2D game in Chunk B+) ──────────────────────────────

  function _handleWin(stats) {
    _phase = 'WIN';
    P1Audio.stopAmbient();
    P1Audio.playWin();
    _showResultOverlay(true, stats);
  }

  function _handleFail(reason, stats) {
    _phase = 'FAIL';
    P1Audio.stopAmbient();
    P1Audio.playFail();
    _showResultOverlay(false, stats, reason);
  }

  function _showResultOverlay(won, state, reason) {
    _resultOverlay = document.createElement('div');
    _resultOverlay.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(8,6,4,0.82)', 'z-index:500',
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

    const winBtn = document.getElementById('p1WinBtn');
    if (winBtn) winBtn.addEventListener('click', () => {
      const vv = state ? Math.round(state.viralViability) : 80;
      destroy();
      if (_onComplete) _onComplete({ viralViability: vv });
    });

    const retryBtn = document.getElementById('p1RetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => {
      _removeResultOverlay();

      // Complete cleanup of both 2D game and cinematic
      _cleanupGame2D();
      _cleanupCinematic();
      _resetScene();

      // Reset all state variables
      _phase = 'TITLE';
      _t = 0;
      _elapsed = 0;
      _cinT = 0;
      _ziT = 0;
      _lastSpeedBoostX = -1;
      _screenEffectTime = 0;

      _startCinematic();
    });

    const skipBtn = document.getElementById('p1SkipBtn2');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      destroy();
      if (_onComplete) _onComplete({ viralViability: 80 });
    });
  }

  function _removeResultOverlay() {
    if (_resultOverlay && _resultOverlay.parentNode) {
      _resultOverlay.parentNode.removeChild(_resultOverlay);
    }
    _resultOverlay = null;
  }

  // ── Cinematic cleanup (does not destroy scene) ─────────────────────────────

  function _cleanupCinematic() {
    _removeCoughCloud();
    _destroyTargetDroplet();
    _destroyIris();
    _sneezeFired = false;
    _cinT        = 0;
    _ziT         = 0;
  }

  // ── Main tick ──────────────────────────────────────────────────────────────

  function _tick(dt) {
    if (!_active) return;
    _t       += dt;
    _elapsed += dt;

    if (_phase === 'TITLE') {
      // Gentle wide orbit so the classroom is visible behind the overlay
      const r     = 10.5;
      const angle = -Math.PI * 0.55 + _t * 0.06;
      camera.position.x = Math.cos(angle) * r * 0.7;
      camera.position.z = Math.sin(angle) * r - 1.0;
      camera.position.y = 4.2 + Math.sin(_t * 0.12) * 0.3;
      camera.lookAt(0, 1.2, 1.0);

    } else if (_phase === 'CINEMATIC') {
      _updateCinematic(dt);

    } else if (_phase === 'ZOOM_IN') {
      _updateZoomIn(dt);

    } else if (_phase === 'PLAYING_2D') {
      _tick2D(dt);
    }

    // Tick classroom subsystems during all 3D phases
    if (_phase === 'TITLE' || _phase === 'CINEMATIC' || _phase === 'ZOOM_IN') {
      P1Classroom.tick(dt);
      P1Students.tick(dt);
    }
  }

  // ── destroy ────────────────────────────────────────────────────────────────

  function destroy() {
    _active = false;
    _phase  = 'TITLE';

    _removeIntroOverlay();
    _removeResultOverlay();
    _cleanupCinematic();

    _cleanupGame2D();
    P1Audio.destroy();
    P1Students.destroy();
    P1Furniture.destroy();
    P1Classroom.destroy();

    if (scene) {
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      scene = null;
    }
    camera   = null;
    _t       = 0;
    _elapsed = 0;
    _cinT    = 0;
    _ziT     = 0;
  }

  // ── 2D game cleanup ────────────────────────────────────────────────────────

  function _cleanupGame2D() {
    if (typeof P1Level !== 'undefined') P1Level.destroy();
    if (typeof P1Droplet !== 'undefined') P1Droplet.destroy();
    if (typeof P1HUD !== 'undefined') P1HUD.destroy();

    // Remove event listeners (generic cleanup)
    if (_kDown || _kUp) {
      _kDown = false;
      _kUp = false;
    }

    _scrollX = 0;
    _scrollSpeed = P1_CFG.SCROLL_SPEED_INIT_2D;
    _viewW = 0;
    _keys = { up: false, down: false, left: false, right: false };
  }

  // ── Public object ──────────────────────────────────────────────────────────
  return {
    preload,
    launch,
    destroy,
    _tick,
    // Called by Chunk B to hook into the 2D game start:
    _startPlaying2D,
    // Called by Chunk B to fire win/fail from the 2D game:
    _handleWin,
    _handleFail,
    get _active() { return _active; },
    get scene()   { return scene;   },
    get camera()  { return camera;  },
  };

})();
