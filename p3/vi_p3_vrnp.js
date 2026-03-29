// vi_p3_vrnp.js — P3VRNPTargeting: vRNP segment extraction through fusion pore
// Segments auto-extract sequentially; SPACE rushes the inter-segment gap.
// Antibody tagging (25% per segment) stalls a segment mid-transit for ANTIBODY_DELAY s.
// Pore stability decays at PORE_DECAY_RATE %/s — pore collapse ends the phase.
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js, vi_p3_surface.js
'use strict';

class P3VRNPTargeting {

  constructor(cfg) {
    this._cfg = cfg;

    // ── Public state (read by P3Escape._buildHUDState) ────────────────────────
    this.poreStability     = cfg.PORE_STABILITY_START;
    this.segmentsExtracted = 0;

    // ── Internal state ────────────────────────────────────────────────────────
    this._segments    = [];   // from P3ViralSurface.getVRNPSegments()
    this._origPos     = [];   // cached starting world positions
    this._porePos     = null; // THREE.Vector3 on endosome inner wall
    this._onComplete  = null;
    this._done        = false;

    // Current extraction slot
    this._slotIdx        = 0;      // which segment is up next
    this._transitTimer   = 0;      // time elapsed in active transit
    this._transitActive  = false;  // a segment is currently flying
    this._abChecked      = false;  // antibody one-shot check fired
    this._abTagged       = false;  // segment is stalled by antibody
    this._abTimer        = 0;      // remaining antibody stall time (s)
    this._gapTimer       = 0;      // inter-segment pause countdown (s)
    this._inGap          = false;  // currently in inter-segment gap

    // Scene objects
    this._abGlow   = null;   // THREE.Mesh — yellow sphere during antibody stall
    this._ripples  = [];     // [{mesh, age}] — brief flash rings at pore
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called from P3Escape._onFusionComplete.
  start(segments, porePos, onComplete) {
    this._segments   = segments;
    this._porePos    = porePos.clone();
    this._onComplete = onComplete;
    this._done       = false;

    this.poreStability     = this._cfg.PORE_STABILITY_START;
    this.segmentsExtracted = 0;

    // Cache starting world positions for each segment
    this._origPos = segments.map(s => s.mesh.position.clone());

    // Brief cinematic hold before first extraction begins
    this._slotIdx       = 0;
    this._inGap         = true;
    this._gapTimer      = 0.8;   // 0.8 s intro pause
    this._transitActive = false;

    this._updateHUDText();
  }

  // Called from P3Escape._tick during VRNP_TARGETING state.
  update(dt) {
    if (this._done) return;

    // Decay pore stability continuously
    this.poreStability = Math.max(0, this.poreStability - this._cfg.PORE_DECAY_RATE * dt);

    this._updateRipples(dt);

    if (this._inGap) {
      this._tickGap(dt);
    } else if (this._transitActive) {
      this._tickTransit(dt);
    }

    if (this.poreStability <= 0 && !this._done) {
      this._finish();
    }
  }

  // Called when SPACE is pressed during VRNP_TARGETING (wired from main.js).
  // Rushing the inter-segment gap only — pressing during transit has no effect.
  requestExtract() {
    if (this._inGap && this._gapTimer > 0) {
      this._gapTimer = 0;    // collapse gap immediately
    }
  }

  destroy() {
    this._removeABGlow();
    this._flushRipples();
  }

  // ── Gap tick ─────────────────────────────────────────────────────────────────

  _tickGap(dt) {
    this._gapTimer -= dt;
    if (this._gapTimer <= 0) {
      this._inGap = false;
      if (this._slotIdx < this._segments.length) {
        this._beginTransit(this._slotIdx);
      } else {
        this._finish();
      }
    }
  }

  // ── Transit tick ─────────────────────────────────────────────────────────────

  _beginTransit(idx) {
    this._transitActive = true;
    this._transitTimer  = 0;
    this._abChecked     = false;
    this._abTagged      = false;
    this._abTimer       = 0;

    // Edu fact card for this segment
    const cfg = this._cfg;
    const esc = typeof P3Escape !== 'undefined' ? P3Escape : null;
    if (esc && esc.edu) {
      esc.edu.trigger(
        cfg.EDU.SEG[idx],
        `Segment ${idx + 1} · ${['PB2','PB1','PA','HA','NP','NA','M','NS'][idx] || ''}`,
        cfg.SEG_TEXT[idx] || ''
      );
    }

    this._updateHUDText();
  }

  _tickTransit(dt) {
    const seg     = this._segments[this._slotIdx];
    const origPos = this._origPos[this._slotIdx];
    if (!seg || !origPos) { this._transitActive = false; return; }

    // ── Antibody stall ────────────────────────────────────────────────────────
    if (this._abTagged && this._abTimer > 0) {
      this._abTimer -= dt;

      // Keep antibody glow tracking segment position
      if (this._abGlow) this._abGlow.position.copy(seg.mesh.position);

      if (this._abTimer <= 0) {
        this._abTagged = false;
        this._abTimer  = 0;
        this._removeABGlow();
        // Restore segment colour to original gold
        seg.mat.color.setHex(this._cfg.COL_VRNP[this._slotIdx] || this._cfg.COL_VRNP_BASE);
        seg.mat.emissiveIntensity = 0.25;
        this._updateHUDText();
      }
      return; // transit clock frozen during stall
    }

    // ── Normal transit ────────────────────────────────────────────────────────
    this._transitTimer += dt;
    const totalTime = this._cfg.VRNP_TRANSIT_TIME;
    const f = Math.min(1.0, this._transitTimer / totalTime);

    // One-shot antibody check at f ≈ 0.30 (segment is partway to the pore)
    if (!this._abChecked && f >= 0.30) {
      this._abChecked = true;
      if (Math.random() < 0.27) {  // 27 % chance
        this._abTagged = true;
        this._abTimer  = this._cfg.ANTIBODY_DELAY;
        this._spawnABGlow(seg.mesh.position.clone());
        seg.mat.color.setHex(0xffee00);   // bright antibody yellow
        seg.mat.emissiveIntensity = 0.90;
        this._updateHUDText();
        return; // don't advance this frame
      }
    }

    // ── Segment position animation ────────────────────────────────────────────
    // Phase 1 (f 0→0.55): origPos → porePos (flying across endosome interior)
    // Phase 2 (f 0.55→1.0): porePos → beyond wall (exiting into cytoplasm)
    if (f < 0.55) {
      const ef = _p3VrnpEase(f / 0.55);
      seg.mesh.position.lerpVectors(origPos, this._porePos, ef);
    } else {
      const ef  = _p3VrnpEase((f - 0.55) / 0.45);
      // Move 4 units past the pore, along the outward normal
      const exitDir = this._porePos.clone().normalize().multiplyScalar(4.5);
      const exitPos = this._porePos.clone().add(exitDir);
      seg.mesh.position.lerpVectors(this._porePos, exitPos, ef);
    }

    // Spin segment during flight for visual dynamism
    seg.mesh.rotation.y += dt * (3.5 + this._slotIdx * 0.4);

    if (f >= 1.0) this._onTransitComplete(seg);
  }

  _onTransitComplete(seg) {
    // Park segment off-screen
    seg.mesh.position.set(0, 5000, 0);
    seg.extracted = true;
    this.segmentsExtracted++;

    this._transitActive = false;
    this._removeABGlow();

    // Visual: flash ring at pore
    this._spawnRipple();

    this._slotIdx++;

    if (this._slotIdx >= this._segments.length) {
      this._finish();
      return;
    }

    // Inter-segment gap — SPACE rushes it
    this._inGap    = true;
    this._gapTimer = 0.55;   // 0.55 s breathing room between segments

    this._updateHUDText();
  }

  // ── Ripple effects ────────────────────────────────────────────────────────────

  _spawnRipple() {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (!scene || !this._porePos) return;

    const geo  = new THREE.TorusGeometry(1.6, 0.07, 6, 36);
    const mat  = new THREE.MeshBasicMaterial({
      color: this._cfg.COL_FUSION_LINE, transparent: true, opacity: 0.90, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(this._porePos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    this._ripples.push({ mesh, age: 0, maxAge: 0.42 });
  }

  _updateRipples(dt) {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const r = this._ripples[i];
      r.age += dt;
      const f = r.age / r.maxAge;
      r.mesh.scale.setScalar(1 + f * 2.2);
      r.mesh.material.opacity = (1 - f) * 0.90;
      if (r.age >= r.maxAge) {
        if (scene) scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this._ripples.splice(i, 1);
      }
    }
  }

  _flushRipples() {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    this._ripples.forEach(r => {
      if (scene) scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    });
    this._ripples = [];
  }

  // ── Antibody glow ─────────────────────────────────────────────────────────────

  _spawnABGlow(pos) {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (!scene) return;

    const geo  = new THREE.SphereGeometry(0.38, 10, 8);
    const mat  = new THREE.MeshBasicMaterial({
      color: 0xffee00, transparent: true, opacity: 0.70, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    this._abGlow = mesh;
  }

  _removeABGlow() {
    if (!this._abGlow) return;
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (scene) scene.remove(this._abGlow);
    this._abGlow.geometry.dispose();
    this._abGlow.material.dispose();
    this._abGlow = null;
  }

  // ── HUD text ──────────────────────────────────────────────────────────────────

  _updateHUDText() {
    const esc = typeof P3Escape !== 'undefined' ? P3Escape : null;
    if (!esc || !esc.hud) return;

    const pct  = Math.round(this.poreStability);
    const ext  = this.segmentsExtracted;
    const slot = this._slotIdx;

    let text;
    if (this._abTagged) {
      text = `Segment ${slot + 1}/8 — ANTIBODY TAGGED  ·  Pore ${pct}%`;
    } else if (this._transitActive) {
      text = `Segment ${slot + 1}/8 transiting…  ·  Pore ${pct}%  ·  (${ext} escaped)`;
    } else if (this._inGap) {
      text = `${ext}/8 segments escaped  ·  Pore ${pct}%  ·  SPACE to rush`;
    } else {
      text = `${ext}/8 segments escaped  ·  Pore ${pct}%`;
    }

    esc.hud.setObjective(text);
  }

  // ── Finish ────────────────────────────────────────────────────────────────────

  _finish() {
    if (this._done) return;
    this._done = true;
    this._removeABGlow();
    this._flushRipples();
    const cb = this._onComplete;
    this._onComplete = null;
    if (cb) cb();
  }
}

// ── Easing helper (local) ────────────────────────────────────────────────────────
function _p3VrnpEase(f) {
  // Smooth quintic ease-in-out
  return f * f * f * (f * (f * 6 - 15) + 10);
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.vrnp) {
  P3Escape.vrnp = new P3VRNPTargeting(P3_CFG);
}
