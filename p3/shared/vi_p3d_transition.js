'use strict';
/**
 * P3DTransition — Act 1→2 and Act 2→3 cinematic transitions.
 *
 * Act 1→2  (TRANS_12_DUR = 6 s):
 *   0 – TRANS_12_SLOW (2 s) : camera dollies in toward the endosome
 *   2 – 5.2 s              : full-screen overlay fades in; scene continues
 *                             to update (pH colours keep shifting red)
 *   5.2 – 6 s              : overlay fades out, onDone() fires at 6 s
 *
 * Act 2→3  (TRANS_23_DUR = 9 s):
 *   Fusion cinematic — implemented in Chunk 6.
 *   Stub fires onDone() after the timeout so the game can proceed.
 */
const P3DTransition = {
  _t:       0,
  _dur:     0,
  _active:  false,
  _onDone:  null,
  _phase:   null,    // 'act1to2' | 'act2to3'
  _ir:      0,

  // Cinematic state
  _overlay:    null,
  _camStart:   null,   // THREE.Vector3
  _camEnd:     null,   // THREE.Vector3
  _lookTgt:    null,   // THREE.Vector3
  _endoEmBase: 0.6,    // baseline emissiveIntensity; restored on reset

  // ── Act 1 → 2 ─────────────────────────────────────────────────────────
  startAct1To2(onDone) {
    this._phase  = 'act1to2';
    this._t      = 0;
    this._dur    = P3D_CFG.TRANS_12_DUR;
    this._active = true;
    this._onDone = onDone;

    // ── Camera setup ──────────────────────────────────────────────────
    const cam = window.P3Descent && P3Descent.camera;
    if (cam) {
      this._camStart = cam.position.clone();

      // Dolly in: push 9 units along the camera's current look direction
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      this._camEnd  = cam.position.clone().addScaledVector(dir, 9);
      // Hold-look target: 16 units ahead of start (deeper into scene)
      this._lookTgt = cam.position.clone().addScaledVector(dir, 16);
    }

    // ── Endosome glow ramp-up ─────────────────────────────────────────
    if (window.P3DMatLib && P3DMatLib.endosome) {
      this._endoEmBase = P3DMatLib.endosome.emissiveIntensity;
    }

    // ── pH colour flash ───────────────────────────────────────────────
    const hud = window.P3Descent && P3Descent._hud;
    if (hud) hud.showPHWash(0xff4422);

    // ── Overlay ───────────────────────────────────────────────────────
    this._createAct1Overlay();
  },

  // ── Act 2 → 3 ─────────────────────────────────────────────────────────
  startAct2To3(immuneResistance, onDone) {
    this._phase  = 'act2to3';
    this._t      = 0;
    this._dur    = P3D_CFG.TRANS_23_DUR;
    this._active = true;
    this._onDone = onDone;
    this._ir     = immuneResistance;
    // Full fusion cinematic implemented in Chunk 6.
    // Stub: overlay fires onDone at timeout via tick().
  },

  // ── Tick ──────────────────────────────────────────────────────────────
  tick(dt) {
    if (!this._active) return;
    this._t += dt;
    const t   = this._t;
    const dur = this._dur;

    if (this._phase === 'act1to2') {
      this._tickAct1To2(t, dur);
    }
    // act2to3 stub: nothing to animate until Chunk 6

    if (t >= dur) {
      this._active = false;
      this._cleanup();
      if (typeof this._onDone === 'function') {
        const fn = this._onDone;
        this._onDone = null;
        fn();
      }
    }
  },

  _tickAct1To2(t, dur) {
    const cam  = window.P3Descent && P3Descent.camera;
    const slow = P3D_CFG.TRANS_12_SLOW;  // 2 s dolly phase

    // ── Camera dolly in ────────────────────────────────────────────────
    if (cam && this._camStart && this._camEnd) {
      if (t < slow) {
        const frac = t / slow;
        const ease = frac * frac * (3 - 2 * frac);   // smoothstep
        cam.position.lerpVectors(this._camStart, this._camEnd, ease);
        cam.lookAt(this._lookTgt);
      } else {
        // Hold position after dolly
        cam.position.copy(this._camEnd);
        cam.lookAt(this._lookTgt);
      }
    }

    // ── Endosome emissive pulse ────────────────────────────────────────
    if (window.P3DMatLib && P3DMatLib.endosome) {
      const base     = this._endoEmBase;
      // Ramp from base to 1.8 over the dolly phase, then pulse
      const ramp     = Math.min(1, t / slow);
      const pulse    = 0.15 * Math.sin(t * Math.PI * 1.8);
      P3DMatLib.endosome.emissiveIntensity = base + ramp * (1.8 - base) + pulse;
    }

    // ── Text overlay fade ──────────────────────────────────────────────
    if (this._overlay) {
      const textStart  = slow;                  // 2.0 s
      const textFadeIn = 0.5;                   // 0.5 s to full opacity
      const fadeOutAt  = dur - 0.85;            // 5.15 s

      let opacity = 0;
      if (t >= textStart && t < fadeOutAt) {
        opacity = Math.min(1, (t - textStart) / textFadeIn);
      } else if (t >= fadeOutAt) {
        opacity = Math.max(0, 1 - (t - fadeOutAt) / 0.85);
      }
      this._overlay.style.opacity = opacity.toFixed(3);
    }
  },

  // ── Helpers ───────────────────────────────────────────────────────────

  _createAct1Overlay() {
    if (this._overlay) this._destroyOverlay();

    const el = document.createElement('div');
    el.id = 'p3dTransOverlay';
    Object.assign(el.style, {
      position:       'fixed',
      top:            '0', left: '0',
      width:          '100%', height: '100%',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'rgba(0,0,0,0.62)',
      opacity:        '0',
      pointerEvents:  'none',
      zIndex:         '25',
      fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', monospace",
    });

    el.innerHTML = `
      <div style="color:#ff5533;font-size:0.70rem;font-weight:700;letter-spacing:0.18em;
                  text-transform:uppercase;margin-bottom:8px;">Late Endosome</div>

      <div style="color:#e8f5e9;font-size:3.0rem;font-weight:700;letter-spacing:0.06em;
                  margin-bottom:4px;">pH 5.3</div>

      <div style="color:#ff7755;font-size:0.72rem;letter-spacing:0.10em;margin-bottom:20px;">
        Fusion Threshold Reached
      </div>

      <div style="width:200px;height:1px;
                  background:linear-gradient(to right,transparent,#ff5533,transparent);
                  margin-bottom:22px;"></div>

      <div style="color:#a8c5a0;font-size:0.80rem;line-height:1.8;
                  max-width:400px;text-align:center;margin-bottom:28px;">
        Acidic luminal pH destabilises the HA stem region.<br>
        The fusion peptide is exposed — and the membrane attack begins.
      </div>

      <div style="color:#C8A951;font-size:0.82rem;font-weight:700;
                  letter-spacing:0.14em;text-transform:uppercase;">
        Act 2 · Conformational Change
      </div>
    `;

    document.body.appendChild(el);
    this._overlay = el;
  },

  _destroyOverlay() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  },

  _cleanup() {
    this._destroyOverlay();

    // Restore endosome emissive to pre-transition baseline
    if (window.P3DMatLib && P3DMatLib.endosome) {
      P3DMatLib.endosome.emissiveIntensity = this._endoEmBase;
    }

    this._camStart = null;
    this._camEnd   = null;
    this._lookTgt  = null;
  },

  // ── Misc ──────────────────────────────────────────────────────────────
  isActive() { return this._active; },

  reset() {
    this._active = false;
    this._t      = 0;
    this._onDone = null;
    this._phase  = null;
    this._cleanup();
  },
};
