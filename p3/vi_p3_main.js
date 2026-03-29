// vi_p3_main.js — Phase 3 Endosomal Escape: main singleton, scene, state machine
// Depends on: three.js r128, vi_p3_config.js
// Sub-system files loaded in later chunks populate the sub-system refs below.
'use strict';

(function () {

// ── Geometry / Material cache (same pattern as Phase 2) ──────────────────────
const _geoCache = {}, _matCache = {};
function _geo(key, factory) { return _geoCache[key] || (_geoCache[key] = factory()); }
function _mat(key, factory) { return _matCache[key] || (_matCache[key] = factory()); }

// ── Small color utilities ─────────────────────────────────────────────────────
// Decompose an integer hex color into {r,g,b} in [0,1] range.
function _hexToRGB(hex) {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >>  8) & 0xff) / 255,
    b:  (hex        & 0xff) / 255,
  };
}
// Linearly interpolate between two hex colors by factor t ∈ [0,1].
function _lerpHex(a, b, t) {
  const ca = _hexToRGB(a), cb = _hexToRGB(b);
  const r = Math.round((ca.r + (cb.r - ca.r) * t) * 255);
  const g = Math.round((ca.g + (cb.g - ca.g) * t) * 255);
  const bl = Math.round((ca.b + (cb.b - ca.b) * t) * 255);
  return (r << 16) | (g << 8) | bl;
}

// ── pH color interpolation ────────────────────────────────────────────────────
// Returns the interpolated color state object for a given pH.
// Used by the environment and lights every frame.
function _interpolateAtPH(pH) {
  const stops = P3_CFG.PH_COLORS;
  // Find the two surrounding stops
  let lo = stops[stops.length - 1], hi = stops[0];
  for (let i = 0; i < stops.length - 1; i++) {
    if (pH <= stops[i].pH && pH >= stops[i + 1].pH) {
      hi = stops[i];
      lo = stops[i + 1];
      break;
    }
  }
  // t = 0 → at hi.pH, t = 1 → at lo.pH
  const span = hi.pH - lo.pH;
  const t    = span > 0 ? Math.min(1, Math.max(0, (hi.pH - pH) / span)) : 0;
  return {
    ambient:     _lerpHex(hi.ambient,    lo.ambient,    t),
    fog:         _lerpHex(hi.fog,        lo.fog,        t),
    membrane:    _lerpHex(hi.membrane,   lo.membrane,   t),
    memOpacity:  hi.memOpacity + (lo.memOpacity - hi.memOpacity) * t,
    fluid:       _lerpHex(hi.fluid,      lo.fluid,      t),
  };
}

// ── Main singleton ────────────────────────────────────────────────────────────
const P3Escape = {

  // ── Public interface ──────────────────────────────────────────────────────
  _active: false,
  scene:   null,
  camera:  null,

  // Callbacks set by the calling code (viral_infiltration.html)
  onPhaseComplete:       null,  // (score, stats) → void
  onPhaseFail:           null,  // (reason) → void
  onEducationalTrigger:  null,  // (factId, title, text) → void

  // ── Master state variables ─────────────────────────────────────────────────
  // All sub-systems READ these; only main or their own update() WRITES them.
  state:          'IDLE',   // IDLE|INTRO|PLAYING|FUSION_CINEMATIC|VRNP_TARGETING|COMPLETE|DEAD
  endosomalPH:    7.4,      // drops automatically during PLAYING
  internalPH:     7.0,      // driven by M2 system (Chunk 4)
  vRNPRelease:    0,        // 0-100%, driven by M2 system
  immuneAlert:    0,        // 0-100%, driven by integrity system
  ns1Charges:     8,
  lysosomeTimer:  150,      // seconds remaining
  elapsed:        0,        // total PLAYING seconds

  // Peak immune alert reached — for end-of-phase stats
  _peakAlert:     0,

  // pH threshold crossing tracker — each key is a pH level (as string), set true once crossed
  _phCrossed: {},

  // ── Sub-system references (populated by sub-system files as they load) ─────
  env:         null,   // P3Environment     (vi_p3_env.js — Chunk 2)
  surface:     null,   // P3ViralSurface    (vi_p3_surface.js — Chunk 3)
  cam:         null,   // P3FirstPersonCam  (vi_p3_camera.js — Chunk 2)
  interaction: null,   // P3Interaction     (vi_p3_interaction.js — Chunk 3)
  particles:   null,   // P3Particles       (vi_p3_particles.js — Chunk 4)
  m2:          null,   // P3M2System        (vi_p3_m2.js — Chunk 4)
  ha:          null,   // P3HASystem        (vi_p3_ha.js — Chunk 5)
  integrity:   null,   // P3Integrity       (vi_p3_integrity.js — Chunk 6)
  hud:         null,   // P3HUD             (vi_p3_hud.js — Chunk 5)
  audio:       null,   // P3Audio           (vi_p3_audio.js — Chunk 6)
  edu:         null,   // P3Edu             (vi_p3_edu.js — Chunk 6)
  fusion:      null,   // P3FusionSequence  (vi_p3_fusion.js — Chunk 7)
  vrnp:        null,   // P3VRNPTargeting   (vi_p3_vrnp.js — Chunk 8)

  // ── Lights (stored so pH can modify them each frame) ─────────────────────
  _ambientLight: null,
  _hemiLight:    null,

  // ── Input ─────────────────────────────────────────────────────────────────
  _keys:       {},
  _evKD:       null,
  _evKU:       null,
  _evClick:    null,
  _evResize:   null,

  // ── Debug HUD (replaced by vi_p3_hud.js in Chunk 5) ─────────────────────
  _debugHUD:   null,

  // ── P2 carryover stats ────────────────────────────────────────────────────
  _p2Stats:    null,

  // ── launch ───────────────────────────────────────────────────────────────
  // Called by viral_infiltration.html's completePhase() after Phase 2 ends.
  // p2Stats: the G.stats object written by P2Attachment.
  // onComplete: () → void  called when phase ends successfully.
  // onFail:     () → void  called on game over (null = no separate handler).
  launch(p2Stats, onComplete, onFail) {
    this._p2Stats      = p2Stats || {};
    this._onComplete   = onComplete || null;
    this._onFail       = onFail     || null;

    this._resetMeters();
    this._buildScene();
    this._buildHUD();
    this._bindInput();
    this._active = true;

    // Hide the main game HUD while Phase 3 is active
    const mainHud = document.getElementById('hud');
    if (mainHud) mainHud.classList.add('hidden');

    this._setState('INTRO');
  },

  // ── destroy ───────────────────────────────────────────────────────────────
  destroy() {
    this._active = false;
    this._unbindInput();
    this._removeHUD();

    // Destroy all sub-systems that are loaded
    const subs = ['env','surface','cam','interaction','particles',
                  'm2','ha','integrity','hud','audio','edu','fusion','vrnp'];
    subs.forEach(k => {
      if (this[k] && typeof this[k].destroy === 'function') this[k].destroy();
      this[k] = null;
    });

    // Dispose Three.js resources
    if (this.scene) {
      this.scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m && m.dispose());
        }
      });
      this.scene = null;
    }

    // Clear geometry/material caches (they belong to this phase only)
    Object.keys(_geoCache).forEach(k => { _geoCache[k].dispose(); delete _geoCache[k]; });
    Object.keys(_matCache).forEach(k => { _matCache[k].dispose(); delete _matCache[k]; });

    this._ambientLight = null;
    this._hemiLight    = null;
    this.camera        = null;
    this.state         = 'IDLE';

    // Remove resize listener
    if (this._evResize) {
      window.removeEventListener('resize', this._evResize);
      this._evResize = null;
    }

    const mainHud = document.getElementById('hud');
    if (mainHud) mainHud.classList.remove('hidden');
  },

  pause()  {
    if (this.state === 'PLAYING') {
      this._setState('PAUSED');
      if (this.audio) this.audio.pause();
    }
  },
  resume() {
    if (this.state === 'PAUSED')  {
      this._setState('PLAYING');
      if (this.audio) this.audio.resume();
    }
  },

  // ── _tick — called from viral_infiltration.html gameLoop each frame ───────
  _tick(dt) {
    if (!this._active) return;
    if (this.state === 'PAUSED') return;

    if (this.state === 'PLAYING') {
      this.elapsed += dt;
      this._updatePH(dt);
      this._updateSubSystems(dt);
      this._applyPHColors();
      this._checkGameOverConditions();
      this._updateObjective();
    }

    if (this.state === 'FUSION_CINEMATIC' && this.fusion) {
      this.fusion.update(dt);
    }

    if (this.state === 'VRNP_TARGETING' && this.vrnp) {
      this.vrnp.update(dt);
    }

    // Camera update (always runs during active states, handles cinematic overrides)
    if (this.cam) this.cam.update(dt);

    this._updateDebugHUD();
  },

  // ── Internal reset ────────────────────────────────────────────────────────
  _resetMeters() {
    this.endosomalPH   = P3_CFG.PH_START;
    this.internalPH    = P3_CFG.INTERNAL_PH_START;
    this.vRNPRelease   = 0;
    this.immuneAlert   = 0;
    this.ns1Charges    = P3_CFG.NS1_CHARGES;
    this.elapsed       = 0;
    this._peakAlert    = 0;
    this._phCrossed    = {};
    this._keys         = {};

    // Apply Phase 2 accuracy bonus to lysosome timer
    this.lysosomeTimer = P3_CFG.LYSOSOME_TIME;
    const acc = this._p2Stats && this._p2Stats.p2Accuracy;
    if      (acc >= 80) this.lysosomeTimer += P3_CFG.LYSOSOME_BONUS_HIGH;
    else if (acc >= 60) this.lysosomeTimer += P3_CFG.LYSOSOME_BONUS_MID;
  },

  // ── Scene ─────────────────────────────────────────────────────────────────
  _buildScene() {
    const colors = _interpolateAtPH(P3_CFG.PH_START);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(colors.fog);
    this.scene.fog = new THREE.FogExp2(colors.fog, 0.02);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
    // Position: on viral surface, looking up toward endosome ceiling
    this.camera.position.set(0, P3_CFG.CAMERA_HEIGHT, 0);
    this.camera.lookAt(0, P3_CFG.ENDO_RADIUS, 0);

    // Lighting — colors shift with pH, updated each frame in _applyPHColors()
    this._ambientLight = new THREE.AmbientLight(colors.ambient, 0.3);
    this.scene.add(this._ambientLight);

    this._hemiLight = new THREE.HemisphereLight(colors.ambient, 0x050508, 0.4);
    this.scene.add(this._hemiLight);

    // Resize handler
    this._evResize = () => {
      if (!this.camera) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._evResize);

    // Initialise sub-systems whose files are already loaded.
    // Files loaded in later chunks self-register when they parse.
    if (typeof P3Environment !== 'undefined') {
      this.env = new P3Environment(this.scene, P3_CFG);
    }
    if (typeof P3ViralSurface !== 'undefined') {
      this.surface = new P3ViralSurface(this.scene, P3_CFG);
    }
    if (typeof P3FirstPersonCam !== 'undefined') {
      this.cam = new P3FirstPersonCam(this.camera, P3_CFG);
    }
    if (typeof P3Interaction !== 'undefined') {
      this.interaction = new P3Interaction(this.camera, this._buildInteractiveList(), P3_CFG);
    }
    if (typeof P3Particles !== 'undefined') {
      this.particles = new P3Particles(this.scene, P3_CFG);
    }
    if (typeof P3M2System !== 'undefined' && this.surface) {
      this.m2 = new P3M2System(this.surface.getM2Channels(), P3_CFG);
    }
    if (typeof P3HASystem !== 'undefined' && this.surface) {
      this.ha = new P3HASystem(this.surface.getHATrimers(), P3_CFG);
    }
    if (typeof P3Integrity !== 'undefined' && this.env) {
      this.integrity = new P3Integrity(this.env.getTLRNodes(), P3_CFG.ENDO_RADIUS, P3_CFG);
    }
    if (typeof P3Audio !== 'undefined') {
      this.audio = new P3Audio(P3_CFG);
    }
    if (typeof P3Edu !== 'undefined') {
      this.edu = new P3Edu(P3_CFG, this);
    }
    if (typeof P3HUD !== 'undefined') {
      this.hud = new P3HUD(P3_CFG, this);
    }
    if (typeof P3FusionSequence !== 'undefined') {
      this.fusion = new P3FusionSequence(P3_CFG);
    }
    if (typeof P3VRNPTargeting !== 'undefined') {
      this.vrnp = new P3VRNPTargeting(P3_CFG);
    }
  },

  // Returns the flat array of interactive objects for the raycaster.
  // Called when interaction system is initialised; also exposed for later re-init.
  _buildInteractiveList() {
    const list = [];
    if (this.surface) {
      list.push(...this.surface.getHATrimers().map(t => t.group));
      list.push(...this.surface.getM2Channels().map(c => c.group));
    }
    if (this.env) {
      // Pass the full group so the hitbox and ring are also raycaster targets
      list.push(...this.env.getTLRNodes().map(n => n.group));
    }
    return list;
  },

  // ── pH update ─────────────────────────────────────────────────────────────
  _updatePH(dt) {
    const rate = this._phDropRate(this.endosomalPH);
    this.endosomalPH = Math.max(P3_CFG.PH_END, this.endosomalPH - rate * dt);

    // Fire threshold callbacks exactly once per crossing
    for (const thresh of P3_CFG.PH_FLASH_THRESHOLDS) {
      const key = String(thresh);
      if (this.endosomalPH <= thresh && !this._phCrossed[key]) {
        this._phCrossed[key] = true;
        this._onPHThreshold(thresh);
      }
    }
  },

  // Piecewise pH drop rate using config bands (checked high→low)
  _phDropRate(pH) {
    for (const band of P3_CFG.PH_RATE_BANDS) {
      if (pH > band.above) return P3_CFG.PH_BASE_RATE * band.mult;
    }
    return P3_CFG.PH_BASE_RATE * 1.8;
  },

  // Called once when a pH threshold is first crossed
  _onPHThreshold(pH) {
    if (this.hud)   this.hud.showPHFlash(pH);
    if (this.audio) this.audio.playPHCrossing(pH);
    if (this.edu) {
      if (pH === 6.5) this.edu.trigger(P3_CFG.EDU.HA_PREACT,
        'HA Pre-activation', 'At pH ~6.5, HA begins conformational changes. ' +
        'The globular head domains loosen, though the fusion peptide remains hidden. ' +
        'This is a reversible intermediate state.');
      if (pH === 5.5) this.edu.trigger(P3_CFG.EDU.HA_ACTIVE,
        'HA Activated', 'At pH ~5.5, HA undergoes irreversible conformational change. ' +
        'The coiled-coil extends and the fusion peptide — a hydrophobic sequence at the ' +
        'HA2 N-terminus — is fully exposed. Aim it at the endosome wall (F key).');
    }
  },

  // ── Apply pH-driven color changes to lights and scene ────────────────────
  _applyPHColors() {
    const c = _interpolateAtPH(this.endosomalPH);

    if (this._ambientLight) this._ambientLight.color.setHex(c.ambient);
    if (this._hemiLight)    this._hemiLight.color.setHex(c.ambient);

    // Pulsing hemisphere light (heartbeat effect)
    const pulse = Math.sin(this.elapsed * P3_CFG.HEMI_PULSE_FREQ * Math.PI * 2);
    if (this._hemiLight)
      this._hemiLight.intensity = 0.4 + pulse * P3_CFG.HEMI_PULSE_AMP;

    if (this.scene) {
      this.scene.background = new THREE.Color(c.fog);
      if (this.scene.fog) this.scene.fog.color.setHex(c.fog);
    }

    // Forward to environment system (endosome membrane color, lysosome glow, etc.)
    if (this.env) this.env.applyPHColors(c, this.endosomalPH);
  },

  // ── Sub-system updates ────────────────────────────────────────────────────
  _updateSubSystems(dt) {
    const pH = this.endosomalPH;

    // Particles (independent)
    if (this.particles) this.particles.update(dt);

    // Environment (wall ripple, V-ATPase, lysosome approach)
    if (this.env) this.env.update(dt, pH, this.lysosomeTimer / P3_CFG.LYSOSOME_TIME);

    // M2 channels → drives internalPH and vRNPRelease
    if (this.m2) {
      this.m2.update(dt, pH);
      this.internalPH  = this.m2.internalPH;
      this.vRNPRelease = this.m2.vRNPRelease;
    }

    // HA activation → driven by endosomal pH
    if (this.ha) this.ha.update(dt, pH);

    // Integrity system → TLR scans, IFITM, lysosome timer
    if (this.integrity) {
      this.integrity.update(dt, this.vRNPRelease);
      this.immuneAlert   = this.integrity.immuneAlert;
      this.ns1Charges    = this.integrity.ns1Charges;
      this.lysosomeTimer = this.integrity.lysosomeTimer;
    } else {
      // When integrity system isn't loaded yet, tick the timer here
      this.lysosomeTimer = Math.max(0, this.lysosomeTimer - dt);
    }

    // Track peak alert for stats
    if (this.immuneAlert > this._peakAlert) this._peakAlert = this.immuneAlert;

    // Interaction crosshair + raycaster (must run every frame for live targeting display)
    if (this.interaction) this.interaction.update(dt);

    // HUD update
    if (this.hud) this.hud.update(this._buildHUDState());
  },

  // Snapshot of all values the HUD needs — passed as a plain object to avoid coupling
  _buildHUDState() {
    return {
      state:          this.state,
      endosomalPH:    this.endosomalPH,
      internalPH:     this.internalPH,
      vRNPRelease:    this.vRNPRelease,
      immuneAlert:    this.immuneAlert,
      ns1Charges:     this.ns1Charges,
      lysosomeTimer:  this.lysosomeTimer,
      elapsed:        this.elapsed,
      m2Channels:     this.m2  ? this.m2.getChannelStates() : [],
      haAimed:        this.ha  ? this.ha.aimedCount         : 0,
      haCount:        P3_CFG.HA_COUNT,
      haTrimers:      this.ha  ? this.ha.getTrimerStates()  : [],
      fusionReady:    this._checkFusionConditions().ok,
      fusionReasons:  this._checkFusionConditions().reasons,
      ifitmCount:     this.integrity ? this.integrity.getIFITMPatches().length : 0,
      segExtracted:   this.vrnp ? this.vrnp.segmentsExtracted : 0,
      poreStability:  this.vrnp ? this.vrnp.poreStability     : 100,
    };
  },

  // ── Game-over condition checks ────────────────────────────────────────────
  _checkGameOverConditions() {
    if (this.state !== 'PLAYING') return;

    // Lysosome timer expired
    if (this.lysosomeTimer <= 0) {
      this.triggerFail('lysosome',
        'LYSOSOME FUSION — Hydrolytic enzymes have destroyed the viral components. ' +
        'The cell\'s endolysosomal pathway successfully degraded the virus.');
      return;
    }
    // Immune alert maxed
    if (this.immuneAlert >= P3_CFG.IMMUNE_ALERT_MAX) {
      this.triggerFail('immune_alert',
        'IMMUNE ALERT MAXED — TLR detection triggered a type I interferon response. ' +
        'Neighboring cells are now in an antiviral state. The infection has been contained.');
      return;
    }
    // vRNP destruction (internal pH < damage threshold for too long — handled by m2 system)
    if (this.m2 && this.m2.vrnpDestroyed) {
      this.triggerFail('vrnp_destroyed',
        'GENOME DEGRADATION — Excessive internal acidification denatured the viral ' +
        'ribonucleoproteins. The viral genome is destroyed.');
    }
  },

  // ── Fusion condition check ────────────────────────────────────────────────
  // Returns { ok: bool, reasons: string[] } — called every frame for HUD and SPACE handler.
  _checkFusionConditions() {
    const reasons = [];
    if (this.vRNPRelease < P3_CFG.FUSION_VRNP_MIN)
      reasons.push(`vRNP Release ${Math.round(this.vRNPRelease)}% (need ${P3_CFG.FUSION_VRNP_MIN}%)`);
    if (!this.ha || this.ha.aimedCount < P3_CFG.HA_FUSION_MIN_COUNT)
      reasons.push(`${this.ha ? this.ha.aimedCount : 0}/${P3_CFG.HA_FUSION_MIN_COUNT} HAs aimed`);
    if (this.ha && this.ha.aimedCount >= P3_CFG.HA_FUSION_MIN_COUNT && !this.ha.fusionSiteValid)
      reasons.push('Aimed HAs too spread out — cluster within 4 units on the wall');
    if (this.integrity && this.ha && this.ha.fusionSiteValid &&
        this.integrity.isFusionSiteBlocked(this.ha.fusionSiteCenter, this.ha.fusionSiteRadius))
      reasons.push('IFITM patch blocking the fusion site — re-aim to a clear zone');
    if (this.endosomalPH > P3_CFG.HA_FUSION_PH_HIGH)
      reasons.push(`pH ${this.endosomalPH.toFixed(1)} too high — wait for pH ${P3_CFG.HA_FUSION_PH_HIGH}`);
    if (this.endosomalPH < P3_CFG.HA_FUSION_PH_LOW)
      reasons.push(`pH ${this.endosomalPH.toFixed(1)} too low — open fewer M2 channels`);
    return { ok: reasons.length === 0, reasons };
  },

  // ── triggerFusion — validates, then starts cinematic ─────────────────────
  triggerFusion() {
    if (this.state !== 'PLAYING') return;
    const { ok, reasons } = this._checkFusionConditions();
    if (!ok) {
      if (this.hud) this.hud.showFusionFailure(reasons);
      return;
    }
    if (this.edu) this.edu.trigger(P3_CFG.EDU.FUSION_GO,
      'HA-mediated Membrane Fusion',
      'HA-mediated membrane fusion is a remarkable molecular machine. The fusion peptide ' +
      'inserts into the endosomal membrane, then HA refolds, pulling the two membranes ' +
      'together through a hemifusion intermediate.');

    this._setState('FUSION_CINEMATIC');
    if (this.fusion) {
      const site = this.ha ? this.ha.fusionSiteCenter : new THREE.Vector3(0, P3_CFG.ENDO_RADIUS, 0);
      const trimers = this.ha ? this.ha.getAimedTrimers() : [];
      this.fusion.start(trimers, site, () => this._onFusionComplete());
    } else {
      // Fusion cinematic not loaded yet — skip straight to vRNP targeting
      setTimeout(() => this._onFusionComplete(), 300);
    }
  },

  // Called by FusionSequence when all 5 beats complete
  _onFusionComplete() {
    const porePos = this.fusion ? this.fusion.getPorePosition()
                                : new THREE.Vector3(0, P3_CFG.ENDO_RADIUS * 0.9, 0);
    this._setState('VRNP_TARGETING');
    if (this.vrnp && this.surface) {
      this.vrnp.start(this.surface.getVRNPSegments(), porePos, () => this._onVRNPComplete());
    } else {
      setTimeout(() => this._onVRNPComplete(), 500);
    }
  },

  // Called by VRNPTargeting when all segments are extracted or pore collapses
  _onVRNPComplete() {
    const extracted = this.vrnp ? this.vrnp.segmentsExtracted : 0;
    if (extracted === 0) {
      this.triggerFail('pore_collapse',
        'PORE COLLAPSED — No genome segments escaped. The viral genome remains ' +
        'trapped inside the endosome.');
      return;
    }
    this.triggerComplete();
  },

  // ── triggerFail ───────────────────────────────────────────────────────────
  triggerFail(reason, message) {
    if (this.state === 'DEAD') return;
    this._setState('DEAD');
    if (this.audio) this.audio.playGameOver(reason);
    const stats = this._buildEndStats();
    if (this.hud) this.hud.showGameOver(message || reason, stats);
    if (this._onFail) this._onFail(reason, stats);
    if (this.onPhaseFail) this.onPhaseFail(reason, stats);
  },

  // ── triggerComplete ───────────────────────────────────────────────────────
  triggerComplete() {
    if (this.state === 'COMPLETE') return;
    this._setState('COMPLETE');
    if (this.audio) this.audio.playPhaseComplete();
    if (this.edu) this.edu.trigger(P3_CFG.EDU.ESCAPE_DONE,
      'Endosomal Escape Complete',
      'The virus has escaped the endosome. Influenza\'s segmented genome — 8 vRNP complexes ' +
      '— will now be imported into the host cell nucleus via the nuclear pore complex, ' +
      'using host importin-α/β transport.');
    const score = this._computeScore();
    const stats = this._buildEndStats();
    if (this.hud) this.hud.showComplete(score, stats);
  },

  // Called from the Complete/Dead screen "SPACE to continue" handler
  _advance() {
    if (this.state !== 'COMPLETE' && this.state !== 'DEAD') return;
    const score = this.state === 'COMPLETE' ? this._computeScore() : 0;
    const stats = this._buildEndStats();
    const cb = this._onComplete;
    this.destroy();
    if (this.onPhaseComplete) this.onPhaseComplete(score, stats);
    if (cb) cb();
  },

  // ── Score / stats ─────────────────────────────────────────────────────────
  _computeScore() {
    const extracted  = this.vrnp ? this.vrnp.segmentsExtracted : 0;
    const baseScore  = extracted * 100;
    const bonus      = extracted === 8 ? 500 : 0;
    const nsBonus    = this.ns1Charges * 25;
    const alertPen   = Math.round(this._peakAlert * 2);
    return Math.max(0, baseScore + bonus + nsBonus - alertPen);
  },

  _buildEndStats() {
    return {
      endosomalPH:     this.endosomalPH,
      internalPHAtFusion: this.internalPH,
      vRNPRelease:     this.vRNPRelease,
      segmentsExtracted: this.vrnp ? this.vrnp.segmentsExtracted : 0,
      peakAlert:       Math.round(this._peakAlert),
      ns1Remaining:    this.ns1Charges,
      m2BurnedOut:     this.m2 ? this.m2.getBurnedOutCount() : 0,
      haAimed:         this.ha ? this.ha.aimedCount : 0,
      timeTaken:       Math.round(this.elapsed),
      lysosomeTimer:   Math.round(this.lysosomeTimer),
    };
  },

  // ── State machine ─────────────────────────────────────────────────────────
  _setState(s) {
    this.state = s;
    this._updateObjective();
    if (this.hud) this.hud.onStateChange(s);
  },

  _updateObjective() {
    let text;
    if      (this.state === 'INTRO')            text = P3_CFG.OBJ.INTRO;
    else if (this.state === 'VRNP_TARGETING')   text = P3_CFG.OBJ.VRNP;
    else if (this.state === 'FUSION_CINEMATIC') text = P3_CFG.OBJ.FUSION;
    else if (this.state === 'COMPLETE')         text = P3_CFG.OBJ.COMPLETE;
    else if (this.elapsed < 20)                 text = P3_CFG.OBJ.EARLY;
    else if (this.ha && this.ha.aimedCount < P3_CFG.HA_FUSION_MIN_COUNT)
                                                text = P3_CFG.OBJ.MID_HA;
    else                                        text = P3_CFG.OBJ.LATE;

    if (this.hud) this.hud.setObjective(text);
    this._updateDebugHUD();
  },

  // ── Input binding ─────────────────────────────────────────────────────────
  _bindInput() {
    this._evKD = (e) => {
      this._keys[e.code] = true;
      this._onKeyDown(e);
    };
    this._evKU = (e) => { this._keys[e.code] = false; };

    window.addEventListener('keydown', this._evKD);
    window.addEventListener('keyup',   this._evKU);
  },

  _unbindInput() {
    if (this._evKD) { window.removeEventListener('keydown', this._evKD); this._evKD = null; }
    if (this._evKU) { window.removeEventListener('keyup',   this._evKU); this._evKU = null; }
  },

  _onKeyDown(e) {
    // Dismiss intro
    if (this.state === 'INTRO' && (e.code === 'Space' || e.code === 'Enter')) {
      this._setState('PLAYING');
      return;
    }
    // Continue from end screens
    if ((this.state === 'COMPLETE' || this.state === 'DEAD') && e.code === 'Space') {
      this._advance();
      return;
    }
    // Pause / resume
    if (e.code === 'KeyP' && (this.state === 'PLAYING' || this.state === 'PAUSED')) {
      this.state === 'PLAYING' ? this.pause() : this.resume();
      return;
    }
    // VRNP_TARGETING: SPACE rushes the inter-segment gap
    if (this.state === 'VRNP_TARGETING' && e.code === 'Space') {
      if (this.vrnp) this.vrnp.requestExtract();
      return;
    }

    if (this.state !== 'PLAYING') return;

    // SPACE → attempt fusion (when ready)
    if (e.code === 'Space') {
      this.triggerFusion();
      return;
    }
    // M → toggle targeted M2 channel
    if (e.code === 'KeyM' && this.m2 && this.interaction) {
      const t = this.interaction.getTargeted();
      if (t && t.type === 'm2') this.m2.toggleChannel(t.index);
      return;
    }
    // 1-6 → toggle specific M2 channel by number
    const numMatch = e.code.match(/^Digit([1-6])$/);
    if (numMatch && this.m2) {
      this.m2.toggleChannel(parseInt(numMatch[1]) - 1);
      return;
    }
    // F → aim targeted HA trimer
    if (e.code === 'KeyF' && this.ha && this.interaction) {
      const t = this.interaction.getTargeted();
      if (t && t.type === 'ha') this.ha.aimTrimer(t.object);
      return;
    }
    // Q → jam targeted TLR sensor (NS1)
    if (e.code === 'KeyQ' && this.integrity && this.interaction) {
      const t = this.interaction.getTargeted();
      if (t && t.type === 'tlr') this.integrity.jamTLR(t.object);
      return;
    }
  },

  // ── HUD (minimal debug version until vi_p3_hud.js loads) ────────────────
  _buildHUD() {
    if (this.hud) return; // full HUD already loaded

    // Inject a minimal overlay for Chunk 1 testing.
    // This is replaced entirely by vi_p3_hud.js (Chunk 5).
    const style = document.createElement('style');
    style.id = 'p3DebugStyle';
    style.textContent = `
      #p3DebugRoot {
        position: fixed; inset: 0; pointer-events: none; z-index: 2000;
        font-family: -apple-system, BlinkMacSystemFont, monospace;
      }
      #p3IntroOverlay {
        position: absolute; inset: 0;
        background: rgba(5,10,14,0.92);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 16px;
        pointer-events: all;
      }
      #p3IntroTitle {
        font-size: 1.6rem; font-weight: 700; letter-spacing: .18em;
        text-transform: uppercase; color: #00ff88;
        text-shadow: 0 0 20px #00ff8866;
      }
      #p3IntroBody {
        font-size: .85rem; color: #a0c8a0; max-width: 480px;
        text-align: center; line-height: 1.6;
      }
      #p3IntroPrompt {
        font-size: .8rem; letter-spacing: .14em; color: #00ff88;
        opacity: .7; animation: p3Blink 1.2s infinite;
      }
      @keyframes p3Blink { 0%,100%{opacity:.7} 50%{opacity:.2} }
      #p3DebugHUD {
        position: absolute; top: 14px; left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.6); border: 1px solid rgba(0,255,136,.25);
        border-radius: 8px; padding: 8px 18px; text-align: center;
        min-width: 200px;
      }
      #p3DebugPH {
        font-size: 1.4rem; font-weight: 700; color: #00ff88;
        letter-spacing: .06em;
      }
      #p3DebugInfo {
        font-size: .65rem; color: #668866; margin-top: 3px;
        letter-spacing: .08em;
      }
      #p3DeadOverlay, #p3CompleteOverlay {
        position: absolute; inset: 0;
        background: rgba(5,10,14,0.88);
        display: none; flex-direction: column;
        align-items: center; justify-content: center; gap: 12px;
        pointer-events: all;
      }
      #p3DeadTitle { font-size: 1.3rem; font-weight: 700; color: #ff4444; }
      #p3DeadMsg   { font-size: .8rem; color: #c09090; max-width: 420px; text-align:center; }
      #p3CompleteTitle { font-size: 1.3rem; font-weight: 700; color: #00ff88; }
      #p3CompleteMsg   { font-size: .8rem; color: #90c090; max-width: 420px; text-align:center; }
      .p3SpacePrompt   { font-size: .75rem; color: #00ff88; opacity: .7;
                         letter-spacing: .14em; margin-top: 8px;
                         animation: p3Blink 1.2s infinite; }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'p3DebugRoot';
    root.innerHTML = `
      <div id="p3IntroOverlay">
        <div id="p3IntroTitle">Phase 3 · Endosomal Escape</div>
        <div id="p3IntroBody">
          The cell has engulfed you. You are trapped inside an acidifying endosome.<br>
          Manage the M2 ion channels, HA fusion proteins, and immune evasion
          to escape before the lysosome arrives.
        </div>
        <div id="p3IntroPrompt">▸ CLICK OR PRESS SPACE TO BEGIN</div>
      </div>
      <div id="p3DebugHUD" style="display:none">
        <div id="p3DebugPH">pH 7.4</div>
        <div id="p3DebugInfo">ENDOSOMAL ESCAPE · PHASE 3</div>
      </div>
      <div id="p3DeadOverlay">
        <div id="p3DeadTitle">GAME OVER</div>
        <div id="p3DeadMsg">Loading…</div>
        <div class="p3SpacePrompt">▸ PRESS SPACE TO RETRY</div>
      </div>
      <div id="p3CompleteOverlay">
        <div id="p3CompleteTitle">ENDOSOMAL ESCAPE COMPLETE</div>
        <div id="p3CompleteMsg">Loading…</div>
        <div class="p3SpacePrompt">▸ PRESS SPACE TO CONTINUE</div>
      </div>
    `;
    document.body.appendChild(root);
    this._debugRoot = root;

    // Click intro overlay to dismiss
    const introOverlay = root.querySelector('#p3IntroOverlay');
    introOverlay.addEventListener('click', () => {
      if (this.state === 'INTRO') this._setState('PLAYING');
    });
  },

  _removeHUD() {
    if (this._debugRoot) { this._debugRoot.remove(); this._debugRoot = null; }
    const st = document.getElementById('p3DebugStyle');
    if (st) st.remove();
    if (this.hud && typeof this.hud.destroy === 'function') {
      this.hud.destroy(); this.hud = null;
    }
  },

  // Update minimal debug HUD (overridden by P3HUD when available)
  _updateDebugHUD() {
    if (this.hud) return; // full HUD handles itself

    const introOverlay   = document.getElementById('p3IntroOverlay');
    const debugHUD       = document.getElementById('p3DebugHUD');
    const deadOverlay    = document.getElementById('p3DeadOverlay');
    const completeOverlay = document.getElementById('p3CompleteOverlay');
    if (!debugHUD) return;

    const s = this.state;
    if (introOverlay)    introOverlay.style.display    = (s === 'INTRO')    ? 'flex' : 'none';
    if (debugHUD)        debugHUD.style.display        = (s === 'PLAYING' || s === 'PAUSED' ||
                                                          s === 'FUSION_CINEMATIC' ||
                                                          s === 'VRNP_TARGETING') ? '' : 'none';
    if (deadOverlay)     deadOverlay.style.display     = (s === 'DEAD')     ? 'flex' : 'none';
    if (completeOverlay) completeOverlay.style.display = (s === 'COMPLETE') ? 'flex' : 'none';

    // pH color shifts from blue → red as pH drops (visual cue even with debug HUD)
    const t = Math.min(1, Math.max(0, (P3_CFG.PH_START - this.endosomalPH) /
                                       (P3_CFG.PH_START - P3_CFG.PH_END)));
    const r = Math.round(t * 255);
    const g = Math.round((1 - t) * 255);
    const phEl = document.getElementById('p3DebugPH');
    if (phEl) {
      phEl.textContent = `pH ${this.endosomalPH.toFixed(2)}`;
      phEl.style.color = `rgb(${r},${g},${Math.round((1-t)*180)})`;
    }
    const infoEl = document.getElementById('p3DebugInfo');
    if (infoEl) {
      const mins = Math.floor(this.lysosomeTimer / 60);
      const secs = Math.floor(this.lysosomeTimer % 60).toString().padStart(2, '0');
      infoEl.textContent = `Lysosome: ${mins}:${secs}  ·  vRNP: ${Math.round(this.vRNPRelease)}%  ·  Alert: ${Math.round(this.immuneAlert)}%`;
    }
  },

  // Update dead/complete overlays with message text (called from triggerFail/triggerComplete)
  _showOverlayMessage(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  },

};

// Make P3Escape globally accessible (same pattern as P2Attachment)
window.P3Escape = P3Escape;

// Convenience: expose color utilities for sub-systems that need them
window._p3LerpHex       = _lerpHex;
window._p3InterpolateAtPH = _interpolateAtPH;

})();
