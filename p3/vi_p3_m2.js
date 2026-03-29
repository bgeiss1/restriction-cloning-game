// vi_p3_m2.js — P3M2System: M2 proton channel management, internal pH, vRNP release
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js, vi_p3_surface.js
'use strict';

class P3M2System {

  // channels — array from P3ViralSurface.getM2Channels()
  // cfg      — P3_CFG reference
  constructor(channels, cfg) {
    this._channels = channels;
    this._cfg      = cfg;
    this._t        = 0;    // elapsed time (for animations)

    // ── Readable state (read by P3Escape._updateSubSystems each frame) ───────
    this.internalPH    = cfg.INTERNAL_PH_START;
    this.vRNPRelease   = 0;      // 0–100 %
    this.vrnpDestroyed = false;

    // ── Private tracking ─────────────────────────────────────────────────────
    this._vrnpHealth = 100;    // decreases when internalPH < INTERNAL_PH_DAMAGE

    // One-shot edu flags so each fact fires at most once
    this._edu = { M2_OPEN: false, M2_BURN: false, VRNP_MID: false, VRNP_FREE: false };
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called every frame from P3Escape._updateSubSystems.
  // endosomalPH passed for context (not used here — internal pH is self-driven by channels).
  update(dt /*, endosomalPH */) {
    this._t += dt;
    this._tickChannels(dt);
    this._tickInternalPH(dt);
    this._tickVRNPRelease(dt);
    this._tickVRNPDamage(dt);
  }

  // Open ↔ close a specific channel. Burnout channels cannot be toggled.
  toggleChannel(index) {
    const ch = this._channels[index];
    if (!ch || ch.state === 'burnout') return;

    if (ch.state === 'closed') {
      this._openChannel(ch);
    } else {
      this._closeChannel(ch);
    }
  }

  // Returns array of per-channel snapshots for the HUD.
  getChannelStates() {
    return this._channels.map(ch => ({
      index:       ch.index,
      state:       ch.state,
      // burnoutFrac: 0 = fresh, 1 = fully burned out / already burnout
      burnoutFrac: ch.state === 'open'
        ? Math.min(1, ch.openDuration / this._cfg.M2_BURNOUT_TIME)
        : (ch.state === 'burnout' ? 1 : 0),
    }));
  }

  // Number of channels currently open (used by P3Particles for spawn-rate bonus).
  getOpenCount() {
    return this._channels.filter(c => c.state === 'open').length;
  }

  getBurnedOutCount() {
    return this._channels.filter(c => c.state === 'burnout').length;
  }

  destroy() {
    // Reset channel visuals to closed (scene may be reused in a retry)
    this._channels.forEach(ch => {
      if (ch.state !== 'closed') {
        ch.state = 'closed';
        ch.openDuration = 0;
        this._applyVisual(ch);
      }
    });
  }

  // ── Per-channel tick ─────────────────────────────────────────────────────────

  _tickChannels(dt) {
    const t   = this._t;
    const cfg = this._cfg;

    this._channels.forEach(ch => {
      if (ch.state !== 'open') return;

      ch.openDuration += dt;

      // Burnout check
      if (ch.openDuration >= cfg.M2_BURNOUT_TIME) {
        ch.state = 'burnout';
        this._applyVisual(ch);
        this._fireEdu('M2_BURN', cfg.EDU.M2_BURN,
          'M2 Channel Burnout',
          'Prolonged M2 channel opening collapses the electrochemical gradient — the ' +
          'proton motive force dissipates and the channel stalls. This is analogous ' +
          'to amantadine resistance mutations that disrupt proton selectivity.');
        return;
      }

      // Live animation: pore pulses cyan
      const pulse = 0.55 + Math.sin(t * 4.2 + ch.index * 1.1) * 0.28;
      if (ch.poreMat) ch.poreMat.emissiveIntensity = pulse;
      if (ch.pore) {
        ch.pore.scale.setScalar(1.10 + Math.sin(t * 3.1 + ch.index * 0.9) * 0.08);
      }

      // Burnout warning: body color lerps cyan → orange in last 30% of burnout time
      const warnStart = cfg.M2_BURNOUT_TIME * 0.70;
      if (ch.openDuration > warnStart) {
        const f = (ch.openDuration - warnStart) / (cfg.M2_BURNOUT_TIME * 0.30);
        if (ch.bodyMat) {
          ch.bodyMat.color.setHex(_p3LerpHex(cfg.COL_M2_OPEN, 0xff6600, Math.min(1, f)));
        }
      }
    });
  }

  // ── Internal pH ──────────────────────────────────────────────────────────────

  _tickInternalPH(dt) {
    const openCount = this.getOpenCount();
    if (openCount === 0) return;

    this.internalPH = Math.max(
      this._cfg.INTERNAL_PH_MIN,
      this.internalPH - this._cfg.M2_ACID_RATE * openCount * dt
    );
  }

  // ── vRNP release ─────────────────────────────────────────────────────────────

  _tickVRNPRelease(dt) {
    if (this.vRNPRelease >= 100) return;

    const rate = this._vrnpReleaseRate(this.internalPH);
    this.vRNPRelease = Math.min(100, this.vRNPRelease + rate * dt);

    if (this.vRNPRelease >= 50 && !this._edu.VRNP_MID) {
      this._fireEdu('VRNP_MID', this._cfg.EDU.VRNP_MID,
        'Matrix Dissociation',
        'As internal pH falls, the M1 matrix protein undergoes conformational change ' +
        'and releases the 8 vRNP complexes. Each vRNP is viral RNA coated with ' +
        'nucleoprotein (NP) and capped at one end by the PB1/PB2/PA polymerase trimer.');
    }
    if (this.vRNPRelease >= 100 && !this._edu.VRNP_FREE) {
      this._fireEdu('VRNP_FREE', this._cfg.EDU.VRNP_FREE,
        'Genome Freed',
        'All 8 vRNP segments are free within the virion lumen. Once membrane fusion ' +
        'opens a pore to the cytoplasm, importin-α/β will recognise the NLS on NP ' +
        'and escort each segment through the nuclear pore complex.');
    }
  }

  _vrnpReleaseRate(pH) {
    for (const band of this._cfg.VRNP_RELEASE_RATES) {
      if (pH > band.above) return band.rate;
    }
    return 0;
  }

  // ── vRNP damage ──────────────────────────────────────────────────────────────

  _tickVRNPDamage(dt) {
    if (this.vrnpDestroyed) return;
    if (this.internalPH >= this._cfg.INTERNAL_PH_DAMAGE) return;

    this._vrnpHealth -= this._cfg.VRNP_DAMAGE_RATE * dt;
    if (this._vrnpHealth <= 0) {
      this._vrnpHealth  = 0;
      this.vrnpDestroyed = true;
    }
  }

  // ── Channel open / close ─────────────────────────────────────────────────────

  _openChannel(ch) {
    ch.state        = 'open';
    ch.openDuration = 0;
    this._applyVisual(ch);

    this._fireEdu('M2_OPEN', this._cfg.EDU.M2_OPEN,
      'M2 Proton Channel',
      'The M2 protein is a homo-tetrameric proton channel activated at acidic pH. ' +
      'It is the target of amantadine and rimantadine. Opening M2 allows endosomal ' +
      'H⁺ to flood the virion, acidifying the interior and triggering M1 uncoating.');
  }

  _closeChannel(ch) {
    ch.state        = 'closed';
    ch.openDuration = 0;
    this._applyVisual(ch);
  }

  // ── Visuals ──────────────────────────────────────────────────────────────────

  _applyVisual(ch) {
    const cfg = this._cfg;

    if (ch.state === 'open') {
      if (ch.bodyMat) {
        ch.bodyMat.color.setHex(cfg.COL_M2_OPEN);
        ch.bodyMat.emissive.setHex(0x004455);
        ch.bodyMat.emissiveIntensity = 0.45;
      }
      if (ch.poreMat) {
        ch.poreMat.color.setHex(cfg.COL_M2_OPEN);
        ch.poreMat.emissive.setHex(0x006677);
        ch.poreMat.emissiveIntensity = 0.60;
      }
      if (ch.pore) ch.pore.scale.setScalar(1.10);

    } else if (ch.state === 'burnout') {
      if (ch.bodyMat) {
        ch.bodyMat.color.setHex(cfg.COL_M2_BURNOUT);
        ch.bodyMat.emissive.setHex(0x110800);
        ch.bodyMat.emissiveIntensity = 0.06;
      }
      if (ch.poreMat) {
        ch.poreMat.color.setHex(cfg.COL_M2_BURNOUT);
        ch.poreMat.emissive.setHex(0x110800);
        ch.poreMat.emissiveIntensity = 0.04;
      }
      if (ch.pore) ch.pore.scale.setScalar(0.80);

    } else { // closed
      if (ch.bodyMat) {
        ch.bodyMat.color.setHex(cfg.COL_M2_CLOSED);
        ch.bodyMat.emissive.setHex(0x001133);
        ch.bodyMat.emissiveIntensity = 0.30;
      }
      if (ch.poreMat) {
        ch.poreMat.color.setHex(cfg.COL_M2_CLOSED);
        ch.poreMat.emissive.setHex(0x001133);
        ch.poreMat.emissiveIntensity = 0.55;
      }
      if (ch.pore) ch.pore.scale.setScalar(1.0);
    }
  }

  // ── Educational helper ───────────────────────────────────────────────────────

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
    && !P3Escape.m2 && P3Escape.surface) {
  P3Escape.m2 = new P3M2System(P3Escape.surface.getM2Channels(), P3_CFG);
}
