'use strict';
/**
 * P3Descent — Phase 3 "Endosomal Descent" main module.
 * Exposes the same interface as P2Attachment:
 *   _active, scene, camera
 *   launch(carryover, onComplete, onFail)
 *   _tick(dt)
 *   pause() / resume()
 *   destroy()
 */
const P3Descent = (() => {
  // ── Private state ──────────────────────────────────────────────────────
  let _renderer    = null;
  let _onComplete  = null;
  let _onFail      = null;
  let _onEduTrigger = null;
  let _act         = 'NONE'; // 'NONE'|'ACT1'|'TRANS_12'|'ACT2'|'TRANS_23'|'ACT3'
  let _paused      = false;

  // Shared sub-system instances (created in launch)
  let _ph   = null;
  let _hud  = null;
  let _snd  = null;
  let _edu  = null;

  // Stats accumulated per act; fed forward and into complete screen
  let _stats = { act1: {}, act2: {}, act3: {} };

  // ── Public object ──────────────────────────────────────────────────────
  const pub = {
    _active: false,
    scene:   null,
    camera:  null,

    // Exposed for HUD / sub-systems
    get _ph()    { return _ph;   },
    get _hud()   { return _hud;  },
    get _snd()   { return _snd;  },
    get _edu()   { return _edu;  },
    get _stats() { return _stats; },

    // ── Lifecycle ────────────────────────────────────────────────────
    launch(carryover, onComplete, onFail) {
      if (this._active) this.destroy();

      _onComplete   = onComplete || null;
      _onFail       = onFail     || null;
      _stats        = { act1: {}, act2: {}, act3: {}, carryover: carryover || {} };

      // Reuse the main game's renderer
      _renderer = (window.G && G.renderer) ? G.renderer : null;

      // Shared sub-systems
      _ph  = new P3DPHSystem();
      _hud = new P3DHUD();
      _snd = new P3DSoundManager();
      _edu = new P3DEducationSystem();

      // Library init (creates THREE objects)
      P3DMatLib.init();
      P3DGeoLib.init();

      // HUD
      _hud.init();
      _edu.setHUD(_hud);
      _hud.setAct(1);

      // Three.js scene
      this.scene  = new THREE.Scene();
      this.scene.background = new THREE.Color(0x080c1e);
      this.scene.fog = new THREE.FogExp2(0x080c1e, P3D_CFG.A1_FOG_DENSITY);

      // Camera — Act 1 overview; each act sub-system will replace this
      this.camera = new THREE.PerspectiveCamera(
        P3D_CFG.A1_CAM_FOV_S,
        (_renderer ? _renderer.domElement.width / _renderer.domElement.height : 16/9),
        0.1, 200
      );
      this.camera.position.set(0, P3D_CFG.A1_CAM_OY, P3D_CFG.A1_CAM_OZ);
      this.camera.lookAt(0, 0, 0);

      // Lighting
      // Hemisphere: cool blue sky / near-black ground — modest fill
      const hemi = new THREE.HemisphereLight(0x4466aa, 0x111118, 0.8);
      // Ambient: small warm-tinted base so shadowed faces aren't pure black
      const amb  = new THREE.AmbientLight(0xffffff, 0.25);
      // Directional: front-above light to show endosome and scene objects clearly
      const dir  = new THREE.DirectionalLight(0xffffff, 0.7);
      dir.position.set(5, 15, -8);
      this.scene.add(hemi, amb, dir);
      this._hemi = hemi;
      this._amb  = amb;
      this._dir  = dir;

      // Hide main game HUD
      const mainHud = document.getElementById('hud');
      if (mainHud) mainHud.classList.add('hidden');

      this._active = true;
      _act = 'ACT1';

      // Initial HUD state
      _hud.updatePH(_ph.pH);
      _hud.updateHP(100, 100);
      _hud.updateAlert(0);
      _hud.updateScore(0);

      // Start ambient sound (lazy — needs first user interaction)
      _snd.startAmbient();

      // Educational: first trigger
      _edu.trigger('ENDOCYTOSIS_START');

      // Launch Act 1 if available
      if (typeof P3DAct1Descent !== 'undefined') {
        P3DAct1Descent.init(this);
        P3DAct1Descent.start();
      }
    },

    _tick(dt) {
      if (!this._active || _paused) return;

      // pH always updates
      if (_ph) {
        _ph.update(dt);
        _hud.updatePH(_ph.pH);
        _updateSceneColors();
        _snd.tickHeartbeat(dt, _ph.pH);
      }

      // Dispatch to current act sub-system
      switch (_act) {
        case 'ACT1':
          if (typeof P3DAct1Descent !== 'undefined' && P3DAct1Descent._running) {
            P3DAct1Descent.tick(dt);
          }
          break;
        case 'TRANS_12':
          P3DTransition.tick(dt);
          break;
        case 'ACT2':
          if (typeof P3DAct2BossBattle !== 'undefined' && P3DAct2BossBattle._running) {
            P3DAct2BossBattle.tick(dt);
          }
          break;
        case 'TRANS_23':
          P3DTransition.tick(dt);
          break;
        case 'ACT3':
          if (typeof P3DAct3Epilogue !== 'undefined' && P3DAct3Epilogue._running) {
            P3DAct3Epilogue.tick(dt);
          }
          break;
      }
    },

    pause() {
      _paused = true;
      _snd.pause();
      if (typeof P3DAct1Descent    !== 'undefined') P3DAct1Descent._pause?.();
      if (typeof P3DAct2BossBattle !== 'undefined') P3DAct2BossBattle._pause?.();
    },

    resume() {
      _paused = false;
      _snd.resume();
      if (typeof P3DAct1Descent    !== 'undefined') P3DAct1Descent._resume?.();
      if (typeof P3DAct2BossBattle !== 'undefined') P3DAct2BossBattle._resume?.();
    },

    destroy() {
      this._active = false;
      _act = 'NONE';

      // Sub-system teardowns
      if (typeof P3DAct1Descent    !== 'undefined') P3DAct1Descent.destroy?.();
      if (typeof P3DAct2BossBattle !== 'undefined') P3DAct2BossBattle.destroy?.();
      if (typeof P3DAct3Epilogue   !== 'undefined') P3DAct3Epilogue.destroy?.();
      P3DTransition.reset();

      // Dispose Three.js scene
      if (this.scene) {
        this.scene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => m.dispose());
          }
        });
        this.scene = null;
      }
      this.camera = null;

      // Shared resources
      P3DMatLib.dispose();
      P3DGeoLib.dispose();
      if (_snd) { _snd.destroy(); _snd = null; }
      if (_hud) { _hud.destroy(); _hud = null; }
      if (_edu) { _edu.reset();   _edu = null; }
      if (_ph)  { _ph.reset();    _ph  = null; }

      // Restore main HUD
      const mainHud = document.getElementById('hud');
      if (mainHud) mainHud.classList.remove('hidden');
    },

    // ── Inter-act callbacks (called by act sub-systems) ────────────────
    _act1Done(act1Stats) {
      _stats.act1 = act1Stats;
      _ph.setPHRate(P3D_CFG.PH_ACT2_RATE);
      _act = 'TRANS_12';
      P3DTransition.startAct1To2(() => {
        _act = 'ACT2';
        if (typeof P3DAct2BossBattle !== 'undefined') {
          P3DAct2BossBattle.init(pub, act1Stats);
          P3DAct2BossBattle.start();
        }
        _hud.setAct(2);
      });
    },

    _act2Done(act2Stats) {
      _stats.act2 = act2Stats;
      _act = 'TRANS_23';
      P3DTransition.startAct2To3(act2Stats.ir || 0, () => {
        _act = 'ACT3';
        if (typeof P3DAct3Epilogue !== 'undefined') {
          P3DAct3Epilogue.init(pub, act2Stats);
          P3DAct3Epilogue.start();
        }
        _hud.setAct(3);
      });
    },

    _act3Done(act3Stats) {
      _stats.act3 = act3Stats;
      _stats.eduLog = _edu ? _edu.getLog() : [];
      // Compute final score with Act 2 multiplier
      const tier = P3D_CFG.A2_SCORE_TIERS.find(t => (_stats.act2.ir || 0) <= t.irMax)
                || P3D_CFG.A2_SCORE_TIERS[P3D_CFG.A2_SCORE_TIERS.length - 1];
      const raw   = (act3Stats.score || 0) + (_stats.act2.score || 0) + (_stats.act1.score || 0);
      const final = Math.round(raw * tier.mult);
      _hud.showComplete(final, _stats);
    },

    _retryFromGameOver() {
      const carryover = _stats.carryover;
      const oc = _onComplete, of = _onFail;
      this.destroy();
      this.launch(carryover, oc, of);
    },

    _fireComplete() {
      const score = _stats._finalScore || 0;
      this.destroy();
      if (typeof _onComplete === 'function') _onComplete(score, _stats);
    },

    _fail(reason) {
      _edu.trigger('IMMUNE_FAIL');
      _hud.showGameOver(reason, _stats);
      _snd.pause();
    },

    // Callback wired by viral_infiltration.html (optional)
    set onEducationalTrigger(fn) { _onEduTrigger = fn; },
    get _onEduTrigger()          { return _onEduTrigger; },
  };

  // ── Scene color sync ──────────────────────────────────────────────────
  function _updateSceneColors() {
    if (!pub.scene) return;
    const ambCol = _ph.getColor('ambient');
    const fogCol = _ph.getColor('fog');
    pub.scene.background.setHex(fogCol);
    if (pub.scene.fog) pub.scene.fog.color.setHex(fogCol);
    if (pub._hemi) { pub._hemi.skyColor.setHex(ambCol); }
    if (pub._amb)  { pub._amb.color.setHex(ambCol); }
    P3DMatLib.applyPH(_ph.pH);
  }

  window.P3Descent = pub;
  return pub;
})();
