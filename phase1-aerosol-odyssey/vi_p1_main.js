/**
 * vi_p1_main.js — Phase 1 "Aerosol Odyssey" game entry point.
 *
 * Chunk 1 (current): Static classroom environment renders correctly.
 *   - Sets up Three.js scene, camera, calls P1Classroom / P1Furniture / P1Students
 *   - Shows a title overlay with "CLICK TO BEGIN" (click calls launch internally)
 *   - Intro camera orbits the classroom for visual testing
 *
 * Later chunks will add: player droplet, physics, HUD, audio, hazards.
 *
 * API (matches P2Attachment / P3Descent / P4NuclearFactory pattern):
 *   P1AerosolOdyssey.launch(carryover, onComplete, onFail)
 *   P1AerosolOdyssey.destroy()
 *   P1AerosolOdyssey._tick(dt)         — called by main game loop each frame
 *   P1AerosolOdyssey._active           — true while this phase owns the renderer
 *   P1AerosolOdyssey.scene             — THREE.Scene (main loop renders this)
 *   P1AerosolOdyssey.camera            — THREE.PerspectiveCamera
 */

/* global THREE, P1_CFG, P1Classroom, P1Furniture, P1Students */

const P1AerosolOdyssey = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let _active    = false;
  let _onComplete = null;
  let _onFail     = null;

  let scene  = null;
  let camera = null;

  let _animFrameId = null;
  let _lastTime    = 0;
  let _elapsed     = 0.0;
  let _t           = 0.0;

  // Intro / title state
  let _introShown  = false;
  let _introOverlay = null;

  // ── preload ───────────────────────────────────────────────────────────────
  // Builds the classroom scene and activates rendering without showing the
  // title overlay. Called by showBriefing(0) so the classroom renders behind
  // the briefing panel instead of the cell world.

  function preload() {
    if (_active) return;   // already loaded (or launch() was called directly)
    _active   = true;
    _elapsed  = 0;
    _t        = 0;
    _lastTime = performance.now();
    _buildScene();
    // Title overlay shown later by launch() when the user dismisses the briefing
  }

  // ── launch ────────────────────────────────────────────────────────────────

  function launch(carryover, onComplete, onFail) {
    _onComplete = onComplete || (() => {});
    _onFail     = onFail    || null;

    if (!_active) {
      // Not preloaded — build everything now
      _active   = true;
      _elapsed  = 0;
      _t        = 0;
      _lastTime = performance.now();
      _buildScene();
    }

    _showTitleOverlay();
  }

  // ── Scene setup ───────────────────────────────────────────────────────────

  function _buildScene() {
    // Create our own scene — the main game loop renders it with G.renderer
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1510);
    scene.fog = new THREE.Fog(0x1a1510, 18, 32);

    // Camera — PerspectiveCamera for immersive forward-flying perspective
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(P1_CFG.CAM_FOV_NORMAL, aspect, 0.01, 60);

    // Intro overview camera: elevated corner angle looking across the classroom
    camera.position.set(5.5, 4.8, -9.0);
    camera.lookAt(0, 1.2, 0);
    camera._introTarget = new THREE.Vector3(5.5, 4.8, -9.0);

    // Build all classroom subsystems
    P1Classroom.init(scene);
    P1Furniture.init(scene);
    const deskPositions = P1Furniture.getDeskPositions();
    P1Students.init(scene, deskPositions);
  }

  // ── Title overlay ─────────────────────────────────────────────────────────

  function _showTitleOverlay() {
    _introOverlay = document.createElement('div');
    _introOverlay.id = 'p1TitleOverlay';
    _introOverlay.style.cssText = [
      'position:fixed', 'inset:0',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'background:rgba(10,8,6,0.72)',
      'z-index:500',
      'pointer-events:auto',
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
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
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
          margin-top:36px;
          padding:12px 48px;
          font-size:0.88rem;letter-spacing:0.16em;text-transform:uppercase;
          background:rgba(200,140,60,0.18);
          border:1px solid rgba(200,140,60,0.55);
          border-radius:6px;color:#e0b870;
          cursor:pointer;
          transition:background 0.2s,border-color 0.2s">
          CLICK TO BEGIN
        </button>
      </div>
    `;

    document.body.appendChild(_introOverlay);
    _introShown = true;

    // Hover effect
    const btn = document.getElementById('p1StartBtn');
    if (btn) {
      btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(200,140,60,0.32)'; btn.style.borderColor = 'rgba(200,140,60,0.80)'; });
      btn.addEventListener('mouseout',  () => { btn.style.background = 'rgba(200,140,60,0.18)'; btn.style.borderColor = 'rgba(200,140,60,0.55)'; });
      btn.addEventListener('click', _onStartClicked);
    }
  }

  function _onStartClicked() {
    _removeIntroOverlay();
    // Chunk 2 will animate the cough launch sequence.
    // For now, proceed directly to game (placeholder).
    _beginGame();
  }

  function _removeIntroOverlay() {
    if (_introOverlay && _introOverlay.parentNode) {
      _introOverlay.parentNode.removeChild(_introOverlay);
    }
    _introOverlay = null;
    _introShown   = false;
  }

  // ── Placeholder game begin ────────────────────────────────────────────────
  // (Chunk 2 will replace this with the cough launch cinematic + droplet player)

  function _beginGame() {
    // For Chunk 1 testing: show a "game in progress" note and a skip button
    const skipOverlay = document.createElement('div');
    skipOverlay.id = 'p1SkipOverlay';
    skipOverlay.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(10,8,6,0.80)',
      'border:1px solid rgba(200,140,60,0.35)',
      'border-radius:8px', 'padding:10px 20px',
      'z-index:500', 'pointer-events:auto',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:0.72rem', 'color:#888',
      'display:flex', 'align-items:center', 'gap:16px',
    ].join(';');

    skipOverlay.innerHTML = `
      <span style="color:#aaa">Phase 1 — Classroom environment loaded (Chunk 1)</span>
      <button id="p1SkipBtn" style="
        padding:4px 14px;font-size:0.70rem;letter-spacing:0.10em;text-transform:uppercase;
        background:rgba(0,220,120,0.12);border:1px solid rgba(0,220,120,0.40);
        border-radius:4px;color:#44cc88;cursor:pointer">
        SKIP TO PHASE 2
      </button>
    `;

    document.body.appendChild(skipOverlay);

    document.getElementById('p1SkipBtn').addEventListener('click', () => {
      if (skipOverlay.parentNode) skipOverlay.parentNode.removeChild(skipOverlay);
      destroy();
      if (_onComplete) _onComplete({ viralViability: 100 });
    });

    // Move camera to behind-droplet position for the classroom view
    camera.position.set(-1.5, 1.4, -5.5);
    camera.lookAt(0, 1.4, 2);
  }

  // ── _tick (called every frame by the main game loop) ──────────────────────

  function _tick(dt) {
    if (!_active) return;
    _t       += dt;
    _elapsed += dt;

    // Intro camera: gentle slow orbit of the classroom
    if (_introShown) {
      const r  = 10.5;
      const angle = -Math.PI * 0.55 + _t * 0.06;   // slow pan
      camera.position.x = Math.cos(angle) * r * 0.7;
      camera.position.z = Math.sin(angle) * r - 1.0;
      camera.position.y = 4.2 + Math.sin(_t * 0.12) * 0.3;
      camera.lookAt(0, 1.2, 1.0);
    }

    // Update subsystems
    P1Classroom.tick(dt);
    P1Students.tick(dt);

    // Ceiling light LOD: keep only the 3 nearest lights active
    // (deferred to Chunk 4 when player position is tracked)
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy() {
    _active = false;

    _removeIntroOverlay();

    const skip = document.getElementById('p1SkipOverlay');
    if (skip && skip.parentNode) skip.parentNode.removeChild(skip);

    P1Students.destroy();
    P1Furniture.destroy();
    P1Classroom.destroy();

    scene  = null;
    camera = null;
    _lastTime = 0;
    _elapsed  = 0;
    _t        = 0;
  }

  // ── Public object ─────────────────────────────────────────────────────────
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
