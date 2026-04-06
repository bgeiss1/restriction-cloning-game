/**
 * vi_p4_main.js — Phase 4 "Nuclear Factory" main module.
 *
 * Public interface (matches P3Descent shape):
 *   window.P4NuclearFactory._active          — bool
 *   window.P4NuclearFactory.scene            — THREE.Scene
 *   window.P4NuclearFactory.camera           — THREE.PerspectiveCamera
 *   window.P4NuclearFactory.launch(carryover, onComplete, onFail)
 *   window.P4NuclearFactory._tick(dt)
 *   window.P4NuclearFactory.pause()
 *   window.P4NuclearFactory.resume()
 *   window.P4NuclearFactory.destroy()
 *
 * Carryover from Phase 3 (P3Descent._stats):
 *   carryover.act3.score     — score entering Phase 4
 *   carryover.act3.segments  — number of vRNP segments delivered (6–8)
 *   carryover.act2.ir        — immune resistance (affects NS1 starting count)
 *
 * Sub-system call order per tick:
 *   P4Camera → P4Interaction → P4Nucleus → P4Templates → P4Polymerases
 *   → P4PolIISites → P4PolymeraseManager → P4CapSnatch → P4Transcription
 *   → P4MRNAProduct → P4NPCExport → P4Resources → P4ProteinProduction
 *   → P4PolymeraseAssembly → P4Replication → P4CRNAIntermediate
 *   → P4SegmentInventory → P4NS1Deployment → P4Sound → P4Minimap → P4HUD
 *   → P4Antiviral  ← runs last to override PolII light after polii.js tick
 */

/* global THREE, P4_CFG, P4Nucleus, P4Camera, P4Interaction,
          P4Templates, P4Polymerases, P4PolIISites,
          P4SteeringBehavior, P4PolymeraseManager, P4CapSnatch,
          P4Transcription, P4MRNAProduct, P4NPCExport,
          P4Resources, P4ProteinProduction, P4PolymeraseAssembly,
          P4Replication, P4CRNAIntermediate, P4SegmentInventory,
          P4NS1Deployment, P4Antiviral,
          P4Sound, P4Minimap, P4HUD */

window.P4NuclearFactory = (() => {

  // ── Module state ──────────────────────────────────────────────────────────
  let _active       = false;
  let _paused       = false;
  let _scene        = null;
  let _camera       = null;
  let _onComplete   = null;
  let _onFail       = null;
  let _carryover    = {};
  let _nucleus      = null;
  let _hudEl        = null;
  let _canvas       = null;

  // Chunk 9: timing + slow-motion
  let _elapsed      = 0;      // real wall-clock seconds since launch
  let _slowMoScale  = 1.0;    // multiplied into dt for all subsystems
  let _slowMoTimer  = 0;      // countdown until slow-mo ends → show overlay

  // ── Scene + camera ────────────────────────────────────────────────────────

  function _initScene() {
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(P4_CFG.COL_BG);
    _scene.fog = new THREE.FogExp2(P4_CFG.COL_BG, P4_CFG.FOG_DENSITY);
  }

  function _initCamera() {
    const w = window.innerWidth, h = window.innerHeight;
    _camera = new THREE.PerspectiveCamera(
      P4_CFG.CAM_FOV, w / h, P4_CFG.CAM_NEAR, P4_CFG.CAM_FAR
    );
    const ip = P4_CFG.CAM_INIT_POS;
    _camera.position.set(ip[0], ip[1], ip[2]);
    const lt = P4_CFG.CAM_LOOK_TARGET;
    _camera.lookAt(lt[0], lt[1], lt[2]);
  }

  // ── HUD (base bar — Chunk 9 P4HUD enhances it) ───────────────────────────

  function _initHUD() {
    const div = document.createElement('div');
    div.id = 'p4Hud';
    div.style.cssText = [
      'position:fixed;top:0;left:0;right:0;pointer-events:none;z-index:300',
      'display:flex;align-items:center;justify-content:space-between',
      'padding:10px 18px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    div.innerHTML = `
      <div style="
        background:rgba(10,8,24,0.82);
        border:1px solid rgba(100,80,200,0.35);
        border-radius:6px;padding:6px 16px;
        color:#ccbbee;font-size:0.78rem;letter-spacing:0.08em;font-weight:600">
        PHASE 4 · NUCLEAR FACTORY
      </div>
      <div id="p4AntiviralBar" style="
        background:rgba(10,8,24,0.82);
        border:1px solid rgba(200,60,60,0.30);
        border-radius:6px;padding:6px 14px;
        color:#ff8888;font-size:0.75rem;display:flex;align-items:center;gap:8px">
        <span style="letter-spacing:0.06em">ANTIVIRAL RESPONSE</span>
        <div style="
          position:relative;
          width:130px;height:6px;background:rgba(255,68,68,0.18);
          border-radius:3px;overflow:visible">
          <div id="p4AntiviralFill" style="
            height:100%;width:0%;
            background:linear-gradient(90deg,#cc2222,#ff5555);
            border-radius:3px;transition:width 0.5s linear"></div>
        </div>
        <span id="p4AntiviralPct" style="min-width:30px;text-align:right">0%</span>
      </div>
      <div id="p4NpDisplay" style="
        background:rgba(10,8,24,0.82);
        border:1px solid rgba(200,169,50,0.30);
        border-radius:6px;padding:6px 14px;
        color:#ffcc44;font-size:0.78rem">
        NP: <strong id="p4NpVal">0</strong>
        &nbsp;|&nbsp; RdRp: <strong id="p4PolyVal">—</strong>
      </div>
    `;
    document.body.appendChild(div);
    _hudEl = div;
  }

  function _destroyHUD() {
    if (_hudEl && _hudEl.parentNode) _hudEl.parentNode.removeChild(_hudEl);
    _hudEl = null;
  }

  // ── Cap-snatch callbacks (Chunk 4 → 5) ───────────────────────────────────

  function _onCapSuccess(poly, siteIdx, outcome) {
    poly.capEfficiency = outcome.efficiency;
    poly.capScore      = outcome.score;
    P4Transcription.startTranscription(poly, poly.assignedTemplate, outcome.efficiency);
  }

  function _onCapFail(poly, siteIdx) {
    // Poly already freed by P4CapSnatch._finishMinigame; nothing else to do.
  }

  // ── Phase complete / fail handlers ───────────────────────────────────────

  function _buildStats() {
    const np    = typeof P4Resources !== 'undefined' ? P4Resources.getNP() : 0;
    const score = typeof P4Resources !== 'undefined' ? (P4Resources.getScore ? P4Resources.getScore() : 0) : 0;
    const sets  = typeof P4SegmentInventory !== 'undefined'
      ? P4SegmentInventory.getCompleteSets() : 0;
    const isg   = typeof P4Antiviral !== 'undefined'
      ? Math.round(P4Antiviral.getISGFraction() * 100) : 0;
    return {
      time     : Math.round(_elapsed),   // used by HUD overlays
      elapsed  : Math.round(_elapsed),
      score,
      np,
      sets,
      isg,
      carryover: _carryover,
    };
  }

  function _handlePhaseComplete() {
    if (!_active) return;
    _active      = false;
    _slowMoScale = 0.25;
    _slowMoTimer = 2.0;   // 2 real-seconds of slow-mo then show overlay

    const stats = _buildStats();

    // After slow-mo timer expires the tick will call showPhaseComplete
    // We stash the callback so tick can fire it exactly once
    _pendingPhaseComplete = () => {
      if (typeof P4HUD !== 'undefined') {
        P4HUD.showPhaseComplete(stats, () => {
          if (_onComplete) _onComplete(_carryover);
        });
      } else {
        if (_onComplete) _onComplete(_carryover);
      }
    };
  }

  function _handleFail(reason) {
    if (!_active) return;
    _active = false;
    const stats = _buildStats();
    if (typeof P4HUD !== 'undefined') {
      P4HUD.showGameOver(reason, stats, () => {
        if (_onFail) _onFail(reason);
      });
    } else {
      if (_onFail) _onFail(reason);
    }
  }

  let _pendingPhaseComplete = null;

  // ── Main tick ─────────────────────────────────────────────────────────────

  function _tick(dt) {
    if (_paused) return;
    if (!_active && _slowMoScale < 1.0) {
      // Slow-mo wind-down after phase complete — keep rendering
    } else if (!_active) {
      return;
    }

    // Real elapsed (not slowed)
    _elapsed += dt;

    // Slow-mo countdown
    if (_slowMoTimer > 0) {
      _slowMoTimer -= dt;
      if (_slowMoTimer <= 0 && _pendingPhaseComplete) {
        _slowMoScale = 1.0;
        const cb = _pendingPhaseComplete;
        _pendingPhaseComplete = null;
        cb();
        return;
      }
    }

    const sDt = dt * _slowMoScale;

    P4Camera.tick(sDt);
    P4Interaction.tick();

    if (_nucleus) _nucleus.tick(sDt);

    P4Templates.tick(sDt);
    P4Polymerases.tick(sDt);
    P4PolIISites.tick(sDt);
    P4PolymeraseManager.tick(sDt);
    P4CapSnatch.tick(sDt);
    P4Transcription.tick(sDt);
    P4MRNAProduct.tick(sDt);
    P4NPCExport.tick(sDt);
    P4Resources.tick(sDt);
    P4ProteinProduction.tick(sDt);
    P4PolymeraseAssembly.tick(sDt);
    P4Replication.tick(sDt);
    P4CRNAIntermediate.tick(sDt);
    P4SegmentInventory.tick(sDt);
    P4NS1Deployment.tick(sDt);

    if (typeof P4Sound   !== 'undefined') P4Sound.tick(sDt);
    if (typeof P4Minimap !== 'undefined') P4Minimap.tick(sDt);
    if (typeof P4HUD     !== 'undefined') P4HUD.tick(dt);  // HUD gets real dt for clock

    P4Antiviral.tick(sDt);   // runs last to override PolII light after polii.js tick
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function launch(carryover, onComplete, onFail) {
    if (_active) destroy();

    _carryover  = carryover || {};
    _onComplete = onComplete || null;
    _onFail     = onFail     || null;

    const act3 = (_carryover.act3 || {});
    _carryover._segmentCount = act3.enteredSegments || 8;

    _elapsed             = 0;
    _slowMoScale         = 1.0;
    _slowMoTimer         = 0;
    _pendingPhaseComplete = null;

    _initScene();
    _initCamera();

    // Nuclear environment
    _nucleus = P4Nucleus;
    P4Nucleus.init(_scene);

    // Canvas reference for input binding
    _canvas = document.getElementById('viCanvas');

    // Camera controller
    P4Camera.init(_camera, _canvas);

    // Interaction (hover / click / drag)
    P4Interaction.init(_canvas, _camera);

    // Viral objects
    const segCount = _carryover._segmentCount;
    P4Templates.init(_scene, segCount);
    P4Polymerases.init(_scene, segCount);

    // Pol II transcription sites + polymerase management
    P4PolIISites.init(_scene);
    P4PolymeraseManager.init(_scene);

    // Cap-snatch minigame (Chunk 4)
    P4CapSnatch.init(_scene, _camera, _canvas);
    P4PolymeraseManager.setPolIIArrivalHandler((poly, siteIdx) => {
      P4CapSnatch.start(poly, siteIdx, _onCapSuccess, _onCapFail);
    });

    // Transcription, mRNA products, NPC export (Chunk 5)
    P4NPCExport.init(_scene, _camera);
    P4MRNAProduct.init(_scene);
    P4Transcription.init(_scene);

    // Economy (Chunk 6)
    P4Resources.init(_scene, _carryover);
    P4ProteinProduction.init();
    P4PolymeraseAssembly.init(_scene);
    P4NPCExport.setExportCallback(mrna => P4ProteinProduction.onMRNAExported(mrna));

    // Replication + inventory (Chunk 7)
    P4Replication.init(_scene);
    P4CRNAIntermediate.init(_scene);
    P4SegmentInventory.init();

    // Wire template arrival → replication (R mode)
    P4PolymeraseManager.setTemplateArrivalHandler((poly, tmplIdx) => {
      if (poly.taskMode === 'replication') {
        P4Replication.startReplication(poly, tmplIdx);
      } else {
        poly.state = 'idle';
      }
    });

    // Wire cRNA click → step 2 dispatch
    P4CRNAIntermediate.setClickHandler(crna => {
      const idxArr = P4PolymeraseManager.getSelectedIndices();
      if (!idxArr.length) return;
      const poly = P4Polymerases.getByIndex(idxArr[0]);
      if (!poly || poly.taskMode !== 'replication' || poly.state === 'busy') return;
      P4Replication.startCRNAtoVRNA(poly, crna);
    });

    // Win condition → phase complete handler
    P4SegmentInventory.setCompleteCallback(() => {
      _handlePhaseComplete();
    });

    // Antiviral system + NS1 (Chunk 8)
    P4NS1Deployment.init(_scene, _canvas);
    P4Antiviral.init(_scene, reason => {
      _handleFail(reason);
    });

    // UI / Audio (Chunk 9)
    _initHUD();
    if (typeof P4Sound   !== 'undefined') P4Sound.init();
    if (typeof P4Minimap !== 'undefined') P4Minimap.init();
    if (typeof P4HUD     !== 'undefined') P4HUD.init();

    // Start paused — show intro, then unpause
    _active = true;
    _paused = true;

    if (typeof P4HUD !== 'undefined') {
      P4HUD.showIntro(() => {
        _paused = false;
      });
    } else {
      _paused = false;
    }

    console.log('[P4NuclearFactory] launched — segments:', segCount);
  }

  function pause() {
    _paused = true;
  }

  function resume() {
    _paused = false;
  }

  function destroy() {
    _active      = false;
    _paused      = false;
    _slowMoScale = 1.0;
    _slowMoTimer = 0;
    _pendingPhaseComplete = null;

    P4Camera.destroy();
    P4Interaction.destroy();
    P4CapSnatch.destroy();
    P4Transcription.destroy();
    P4MRNAProduct.destroy();
    P4NPCExport.destroy();
    P4Antiviral.destroy();
    P4NS1Deployment.destroy();
    P4SegmentInventory.destroy();
    P4CRNAIntermediate.destroy();
    P4Replication.destroy();
    P4PolymeraseAssembly.destroy();
    P4ProteinProduction.destroy();
    P4Resources.destroy();
    P4PolymeraseManager.destroy();
    P4PolIISites.destroy();
    P4Templates.destroy();
    P4Polymerases.destroy();

    if (typeof P4Sound   !== 'undefined') P4Sound.destroy();
    if (typeof P4Minimap !== 'undefined') P4Minimap.destroy();
    if (typeof P4HUD     !== 'undefined') P4HUD.destroy();

    if (_nucleus) {
      _nucleus.destroy();
      _nucleus = null;
    }

    _destroyHUD();

    if (_scene) {
      _scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach(m => m.dispose());
          else
            obj.material.dispose();
        }
      });
      _scene = null;
    }

    _camera     = null;
    _onComplete = null;
    _onFail     = null;

    console.log('[P4NuclearFactory] destroyed');
  }

  // ── Exposed object ────────────────────────────────────────────────────────
  return {
    get _active() { return _active; },
    get scene()   { return _scene;  },
    get camera()  { return _camera; },
    launch,
    _tick,
    pause,
    resume,
    destroy,
  };

})();
