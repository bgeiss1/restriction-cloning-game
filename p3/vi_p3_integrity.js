// vi_p3_integrity.js — P3Integrity: TLR sensors, NS1 jamming, IFITM patches, lysosome timer
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js, vi_p3_env.js
'use strict';

class P3Integrity {

  // tlrNodes    — array from P3Environment.getTLRNodes()
  // endoRadius  — P3_CFG.ENDO_RADIUS (world units)
  // cfg         — P3_CFG reference
  constructor(tlrNodes, endoRadius, cfg) {
    this._nodes = tlrNodes;
    this._R     = endoRadius;
    this._cfg   = cfg;

    // ── Public state (read by P3Escape._updateSubSystems each frame) ──────────
    this.immuneAlert   = 0;
    this.ns1Charges    = cfg.NS1_CHARGES;
    // Inherit the bonused starting value that _resetMeters() already applied.
    this.lysosomeTimer = (typeof P3Escape !== 'undefined' && P3Escape.lysosomeTimer > 0)
                         ? P3Escape.lysosomeTimer : cfg.LYSOSOME_TIME;

    // ── Per-TLR timers ────────────────────────────────────────────────────────
    // Stagger initial scan offsets so TLRs don't all fire at the same moment.
    const period = cfg.TLR_SCAN_PERIOD;
    this._scanTimers     = tlrNodes.map((_, i) =>
      i * (period / Math.max(1, tlrNodes.length))
    );
    this._cooldownTimers = new Float32Array(tlrNodes.length);  // 0 = not cooling

    // ── IFITM patch tracking: [{mesh, center: THREE.Vector3}] ─────────────────
    this._ifitmPatches = [];
    this._ifitmFired   = new Set();   // thresholds already spawned (prevents re-fire)

    // ── One-shot edu flags ────────────────────────────────────────────────────
    this._edu = { TLR_SCAN: false, NS1_USE: false, NS1_OUT: false, IFITM: false };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called every frame during PLAYING from P3Escape._updateSubSystems.
  update(dt, vRNPRelease) {
    this.lysosomeTimer = Math.max(0, this.lysosomeTimer - dt);
    this._tickTLRSensors(dt, vRNPRelease);
    this._checkIFITMThresholds();
  }

  // Expend one NS1 charge to silence a TLR node for TLR_COOLDOWN seconds.
  // Called from P3Escape._onKeyDown (KeyQ) when a TLR is targeted.
  jamTLR(nodeRef) {
    if (!nodeRef) return;
    if (nodeRef.state === 'jammed') return;   // already silenced

    if (this.ns1Charges <= 0) {
      this._fireEdu('NS1_OUT', this._cfg.EDU.NS1_OUT,
        'NS1 Exhausted',
        'All NS1 charges have been spent. NS1 is a multifunctional virulence factor that ' +
        'sequesters dsRNA and blocks RIG-I/MDA5 and TLR3/7 signalling. Without remaining ' +
        'charges, TLR detection cannot be jammed — avoid exposing vRNP segments.');
      // Show a quick HUD toast if available
      if (typeof P3Escape !== 'undefined' && P3Escape.hud) {
        P3Escape.hud.showFusionFailure(['No NS1 charges remaining (Q)']);
      }
      return;
    }

    const idx = this._nodes.indexOf(nodeRef);
    if (idx === -1) return;

    this.ns1Charges--;
    nodeRef.state = 'jammed';
    this._cooldownTimers[idx] = this._cfg.TLR_COOLDOWN;

    this._fireEdu('NS1_USE', this._cfg.EDU.NS1_USE,
      'NS1 Immune Evasion',
      'NS1 binds directly to TLR signalling adaptors and sequesters viral dsRNA, ' +
      'preventing pattern recognition receptor activation. Influenza strains with ' +
      'truncated NS1 are highly attenuated in interferon-competent hosts — making NS1 ' +
      'a key target for live-attenuated vaccine design.');
  }

  // Returns true if any IFITM patch overlaps the proposed fusion site.
  // center: THREE.Vector3, radius: world units (fusion site spread)
  isFusionSiteBlocked(center, radius) {
    const blockR = radius + this._cfg.IFITM_RADIUS;
    return this._ifitmPatches.some(p => center.distanceTo(p.center) < blockR);
  }

  // Returns the live IFITM patch list. Length is read by HUD state builder.
  getIFITMPatches() { return this._ifitmPatches; }

  destroy() {
    // Return patches to the environment system for proper disposal
    const env = typeof P3Escape !== 'undefined' ? P3Escape.env : null;
    if (env) {
      this._ifitmPatches.forEach(p => env.removeIFITMPatch(p.mesh));
    }
    this._ifitmPatches = [];

    // Reset TLR states so they render correctly on retry
    this._nodes.forEach(n => { n.state = 'idle'; });
  }

  // ── TLR sensor tick ──────────────────────────────────────────────────────────

  _tickTLRSensors(dt, vRNPRelease) {
    const cfg = this._cfg;

    this._nodes.forEach((n, i) => {
      // Tick cooldown; reset to idle when it expires
      if (this._cooldownTimers[i] > 0) {
        this._cooldownTimers[i] -= dt;
        if (this._cooldownTimers[i] <= 0) {
          this._cooldownTimers[i] = 0;
          n.state = 'idle';
          this._scanTimers[i] = 0;    // fresh scan cycle after jam wears off
        }
        return;   // no detection while jammed / cooling
      }

      // Advance scan clock
      this._scanTimers[i] += dt;
      if (this._scanTimers[i] < cfg.TLR_SCAN_PERIOD) return;

      // Scan cycle complete — reset timer for next cycle
      this._scanTimers[i] -= cfg.TLR_SCAN_PERIOD;

      // Detection only occurs once vRNP has started releasing
      // (TLR7 recognises ssRNA, which isn't exposed until uncoating begins)
      if (vRNPRelease >= cfg.TLR_DETECT_VRNP_THR) {
        this.immuneAlert = Math.min(
          cfg.IMMUNE_ALERT_MAX,
          this.immuneAlert + cfg.TLR_DETECT_ALERT
        );

        this._fireEdu('TLR_SCAN', cfg.EDU.TLR_SCAN,
          'TLR7 Detection Event',
          'Endosomal TLR7 recognises single-stranded viral RNA exposed during vRNP ' +
          'uncoating. This triggers MyD88-dependent NF-κB signalling and type I ' +
          'interferon (IFN-α/β) production — alerting neighbouring cells to the ' +
          'infection. Use NS1 (Q) to jam sensors before they fire.');
      }
    });
  }

  // ── IFITM threshold spawning ─────────────────────────────────────────────────

  _checkIFITMThresholds() {
    for (const thr of this._cfg.IFITM_THRESHOLDS) {
      if (this.immuneAlert >= thr && !this._ifitmFired.has(thr)) {
        this._ifitmFired.add(thr);
        this._spawnIFITMPatches(2);
        this._fireEdu('IFITM', this._cfg.EDU.IFITM,
          'IFITM Restriction Factors',
          'Interferon-Induced Transmembrane proteins (IFITM1/2/3) accumulate in late ' +
          'endosomes after IFN signalling and restrict influenza membrane fusion by ' +
          'rigidifying the lipid bilayer at viral contact sites. Re-aim your HA trimers ' +
          'to an unblocked region of the endosomal wall.');
      }
    }
  }

  _spawnIFITMPatches(count) {
    const env = typeof P3Escape !== 'undefined' ? P3Escape.env : null;
    if (!env) return;

    for (let i = 0; i < count; i++) {
      // Uniform random point on the endosome inner sphere surface
      const u      = Math.random() * 2 - 1;
      const phi    = Math.random() * Math.PI * 2;
      const sinLat = Math.sqrt(1 - u * u);
      const center = new THREE.Vector3(
        sinLat * Math.cos(phi) * this._R,
        u                      * this._R,
        sinLat * Math.sin(phi) * this._R
      );
      const mesh = env.addIFITMPatch(center);
      this._ifitmPatches.push({ mesh, center: center.clone() });
    }
  }

  // ── Edu helper ───────────────────────────────────────────────────────────────

  _fireEdu(localKey, factId, title, text) {
    if (this._edu[localKey]) return;
    this._edu[localKey] = true;
    if (typeof P3Escape !== 'undefined' && P3Escape.edu) {
      P3Escape.edu.trigger(factId, title, text);
    }
  }
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active
    && !P3Escape.integrity && P3Escape.env) {
  P3Escape.integrity = new P3Integrity(
    P3Escape.env.getTLRNodes(), P3_CFG.ENDO_RADIUS, P3_CFG
  );
}
