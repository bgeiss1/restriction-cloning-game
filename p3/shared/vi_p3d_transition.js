'use strict';
/**
 * P3DTransition — Act 1→2 and Act 2→3 cinematic transitions.
 *
 * Act 1→2  (TRANS_12_DUR = 6 s):
 *   0 – 2 s   : camera dollies 9 units along look direction (smoothstep)
 *   2 – 5.15 s: canvas overlay fades in — "LATE ENDOSOME / pH 5.3 / ..."
 *   5.15 – 6 s: overlay fades out; onDone() fires at 6 s
 *
 * Act 2→3  (TRANS_23_DUR = 9 s):
 *   0 – 3 s   : camera smoothstep-closes in toward endosome
 *   0 – 2.5 s : endosome emissive ramps 0.6 → 3.5
 *   2.5 s     : burst flash (orange/white full-screen)
 *   1.0–5.5 s : "FULL MEMBRANE FUSION" canvas card
 *   5.0–9.0 s : "vRNP SEGMENTS RELEASED" canvas card (IR-dependent count,
 *               staggered label reveal); onDone() fires at 9 s
 */
const P3DTransition = {
  _t:       0,
  _dur:     0,
  _active:  false,
  _onDone:  null,
  _phase:   null,    // 'act1to2' | 'act2to3'
  _ir:      0,

  // ── Act 1→2 cinematic state ───────────────────────────────────────────
  _overlay:    null,   // DOM div (act1to2 only)
  _camStart:   null,   // THREE.Vector3
  _camEnd:     null,   // THREE.Vector3
  _lookTgt:    null,   // THREE.Vector3
  _endoEmBase: 0.6,

  // ── Act 2→3 cinematic state ───────────────────────────────────────────
  _fusionCanvas: null,
  _fusionCtx:    null,
  _vrnpCount:    8,

  // ── Act 1 → 2 ─────────────────────────────────────────────────────────
  startAct1To2(onDone) {
    this._phase  = 'act1to2';
    this._t      = 0;
    this._dur    = P3D_CFG.TRANS_12_DUR;
    this._active = true;
    this._onDone = onDone;

    const cam = window.P3Descent && P3Descent.camera;
    if (cam) {
      this._camStart = cam.position.clone();
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      this._camEnd  = cam.position.clone().addScaledVector(dir, 9);
      this._lookTgt = cam.position.clone().addScaledVector(dir, 16);
    }

    if (window.P3DMatLib && P3DMatLib.endosome) {
      this._endoEmBase = P3DMatLib.endosome.emissiveIntensity;
    }

    const hud = window.P3Descent && P3Descent._hud;
    if (hud) hud.showPHWash(0xff4422);

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

    // vRNP count is IR-dependent
    this._vrnpCount = this._getVRNPCount(immuneResistance);

    // ── Camera setup ──────────────────────────────────────────────────
    const cam = window.P3Descent && P3Descent.camera;
    if (cam) {
      this._camStart = cam.position.clone();
      // Infer look-at Y from the orbit height (orbit was at lookY + 14)
      const lookY = cam.position.y - 14;
      this._lookTgt = new THREE.Vector3(0, lookY, 0);
      // Cinematic end: stable front-centre close-up
      this._camEnd  = new THREE.Vector3(0, lookY + 8, 14);
    }

    // ── Record endosome emissive baseline ─────────────────────────────
    if (window.P3DMatLib && P3DMatLib.endosome) {
      this._endoEmBase = P3DMatLib.endosome.emissiveIntensity;
    }

    // ── HUD pH wash ───────────────────────────────────────────────────
    const hud = window.P3Descent && P3Descent._hud;
    if (hud) hud.showPHWash(0xff6600);

    // ── Create canvas overlay ─────────────────────────────────────────
    this._createFusionCanvas();
  },

  // ── Tick ──────────────────────────────────────────────────────────────
  tick(dt) {
    if (!this._active) return;
    this._t += dt;
    const t   = this._t;
    const dur = this._dur;

    if (this._phase === 'act1to2') {
      this._tickAct1To2(t, dur);
    } else if (this._phase === 'act2to3') {
      this._tickAct2To3(t, dur);
    }

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

  // ── Act 1→2 tick ──────────────────────────────────────────────────────
  _tickAct1To2(t, dur) {
    const cam  = window.P3Descent && P3Descent.camera;
    const slow = P3D_CFG.TRANS_12_SLOW;

    if (cam && this._camStart && this._camEnd) {
      if (t < slow) {
        const frac = t / slow;
        const ease = frac * frac * (3 - 2 * frac);
        cam.position.lerpVectors(this._camStart, this._camEnd, ease);
        cam.lookAt(this._lookTgt);
      } else {
        cam.position.copy(this._camEnd);
        cam.lookAt(this._lookTgt);
      }
    }

    if (window.P3DMatLib && P3DMatLib.endosome) {
      const base  = this._endoEmBase;
      const ramp  = Math.min(1, t / slow);
      const pulse = 0.15 * Math.sin(t * Math.PI * 1.8);
      P3DMatLib.endosome.emissiveIntensity = base + ramp * (1.8 - base) + pulse;
    }

    if (this._overlay) {
      const textStart  = slow;
      const textFadeIn = 0.5;
      const fadeOutAt  = dur - 0.85;
      let opacity = 0;
      if (t >= textStart && t < fadeOutAt) {
        opacity = Math.min(1, (t - textStart) / textFadeIn);
      } else if (t >= fadeOutAt) {
        opacity = Math.max(0, 1 - (t - fadeOutAt) / 0.85);
      }
      this._overlay.style.opacity = opacity.toFixed(3);
    }
  },

  // ── Act 2→3 tick ──────────────────────────────────────────────────────
  _tickAct2To3(t, dur) {
    // ── Camera close-in (0–3 s) ────────────────────────────────────────
    const cam = window.P3Descent && P3Descent.camera;
    if (cam && this._camStart && this._camEnd && this._lookTgt) {
      if (t < 3.0) {
        const frac = t / 3.0;
        const ease = frac * frac * (3 - 2 * frac);
        cam.position.lerpVectors(this._camStart, this._camEnd, ease);
      } else {
        cam.position.copy(this._camEnd);
      }
      cam.lookAt(this._lookTgt);
    }

    // ── Endosome emissive ──────────────────────────────────────────────
    if (window.P3DMatLib && P3DMatLib.endosome) {
      let em;
      if (t < 2.5) {
        // Ramp from baseline to 3.5
        em = this._endoEmBase + (t / 2.5) * (3.5 - this._endoEmBase);
      } else if (t < 3.0) {
        // Brief spike to 4.5 then rapid decay
        const ft = (t - 2.5) / 0.5;
        em = 3.5 + Math.exp(-ft * 5) * 3.0 * (1 - ft) - ft * (3.5 - 1.0);
        em = Math.max(1.0, em);
      } else {
        // Settle at 1.2 for Act 3
        em = 1.2;
      }
      P3DMatLib.endosome.emissiveIntensity = em;
    }

    // ── Canvas overlay ─────────────────────────────────────────────────
    if (!this._fusionCtx || !this._fusionCanvas) return;
    const ctx = this._fusionCtx;
    const W   = this._fusionCanvas.width;
    const H   = this._fusionCanvas.height;

    ctx.clearRect(0, 0, W, H);

    // ── Burst flash (peaks around t = 2.5 s) ──────────────────────────
    if (t >= 1.8 && t < 3.8) {
      const ft   = (t - 1.8) / 2.0;   // 0→1 over the flash window
      const bell = Math.exp(-((ft - 0.35) * (ft - 0.35)) / 0.028);
      const a    = bell * 0.82;
      // Warm orange-white burst
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
      grad.addColorStop(0,   `rgba(255,210,120,${(a).toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(255,140,60,${(a * 0.7).toFixed(3)})`);
      grad.addColorStop(1,   `rgba(180,60,20,0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Card 1: "FULL MEMBRANE FUSION" (1.0 – 5.5 s) ─────────────────
    if (t >= 1.0 && t < 5.5) {
      const fi = Math.min(1, (t - 1.0) / 0.45);
      const fo = t > 5.0 ? Math.max(0, (5.5 - t) / 0.5) : 1;
      this._drawFusionCard1(ctx, W, H, fi * fo);
    }

    // ── Card 2: vRNP release list (5.0 – 9.0 s) ──────────────────────
    if (t >= 5.0) {
      const elapsed = t - 5.0;
      const fi = Math.min(1, elapsed / 0.45);
      const fo = t > 8.5 ? Math.max(0, (9.0 - t) / 0.5) : 1;
      this._drawFusionCard2(ctx, W, H, elapsed, fi * fo);
    }
  },

  // ── Card drawing ──────────────────────────────────────────────────────

  _drawFusionCard1(ctx, W, H, alpha) {
    ctx.globalAlpha = alpha;

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);

    const cW = Math.min(480, W - 60);
    const cH = 200;
    const cX = W / 2;
    const cY = H / 2;

    // Card background
    ctx.fillStyle = 'rgba(8,12,30,0.92)';
    this._rrect(ctx, cX - cW / 2, cY - cH / 2, cW, cH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,60,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // "FULL MEMBRANE FUSION"
    ctx.fillStyle    = '#ff8833';
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FULL MEMBRANE FUSION', cX, cY - cH / 2 + 34);

    // pH label
    ctx.fillStyle = '#e8f5e9';
    ctx.font      = 'bold 2.6rem monospace';
    ctx.fillText('pH 5.1', cX, cY - 14);

    // Separator
    ctx.strokeStyle = 'rgba(255,140,60,0.28)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cX - cW / 2 + 22, cY - cH / 2 + 56);
    ctx.lineTo(cX + cW / 2 - 22, cY - cH / 2 + 56);
    ctx.stroke();

    // Science text
    const lines = [
      'Hemifusion stalk expands to a full fusion pore.',
      'Viral RNPs are released into the cytoplasm.',
    ];
    ctx.fillStyle    = '#a8c5a0';
    ctx.font         = '13px sans-serif';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cX, cY + 22 + i * 22);
    }

    // Act label
    ctx.fillStyle = '#C8A951';
    ctx.font      = 'bold 11px monospace';
    ctx.fillText('ACT 3  ·  CYTOPLASMIC RELEASE', cX, cY + cH / 2 - 18);

    ctx.globalAlpha = 1;
  },

  _drawFusionCard2(ctx, W, H, elapsed, alpha) {
    ctx.globalAlpha = alpha;

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, W, H);

    const n    = this._vrnpCount;    // IR-determined (6, 7, or 8)
    const lost = 8 - n;
    const cW   = Math.min(480, W - 60);
    const cH   = Math.min(380, H - 80);
    const cX   = W / 2;
    const cY   = H / 2;

    // Card background
    ctx.fillStyle = 'rgba(8,12,30,0.93)';
    this._rrect(ctx, cX - cW / 2, cY - cH / 2, cW, cH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,169,81,0.50)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Header
    ctx.fillStyle    = '#C8A951';
    ctx.font         = 'bold 12px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('vRNP SEGMENTS RELEASED', cX, cY - cH / 2 + 30);

    // Count: n / 8
    const countCol = n === 8 ? '#66BB6A' : (n >= 7 ? '#C8A951' : '#FFA726');
    ctx.fillStyle = countCol;
    ctx.font      = `bold 2.0rem monospace`;
    ctx.fillText(`${n} / 8`, cX, cY - cH / 2 + 68);

    // Separator
    ctx.strokeStyle = 'rgba(200,169,81,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(cX - cW / 2 + 22, cY - cH / 2 + 90);
    ctx.lineTo(cX + cW / 2 - 22, cY - cH / 2 + 90);
    ctx.stroke();

    // Staggered vRNP labels — one appears every 0.38 s
    const INTERVAL = 0.38;
    const labels = P3D_CFG.A3_VRNP_LABELS;
    const cols   = P3D_CFG.A3_VRNP_COLS;
    const rowH   = Math.min(26, (cH - 110) / 8);
    const listTopY = cY - cH / 2 + 102;

    for (let i = 0; i < 8; i++) {
      const appear = i * INTERVAL;
      if (elapsed < appear) break;

      const rowAlpha = Math.min(1, (elapsed - appear) / 0.22);
      const isLost   = i >= n;   // last `lost` segments were not released

      ctx.globalAlpha = alpha * rowAlpha;

      // Colour dot
      const dotX = cX - cW / 2 + 32;
      const rowY = listTopY + i * rowH + rowH / 2;

      if (isLost) {
        // Greyed out with ✗
        ctx.fillStyle = '#333344';
        ctx.beginPath();
        ctx.arc(dotX, rowY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef535088';
        ctx.font      = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('✗  ' + labels[i], dotX + 12, rowY);
      } else {
        // Present — colored dot
        ctx.fillStyle = '#' + cols[i].toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(dotX, rowY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c8e6c9';
        ctx.font      = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], dotX + 14, rowY);
      }
    }

    ctx.globalAlpha = alpha;

    // IR note at bottom (if any segments lost)
    if (lost > 0) {
      ctx.fillStyle    = '#ef5350aa';
      ctx.font         = '10px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${lost} segment${lost > 1 ? 's' : ''} lost to immune degradation (IR: ${this._ir})`,
        cX, cY + cH / 2 - 18
      );
    }

    ctx.globalAlpha = 1;
  },

  // ── Helpers ───────────────────────────────────────────────────────────

  _getVRNPCount(ir) {
    const tiers = P3D_CFG.A3_VRNP_COUNTS;
    const tier  = tiers.find(t => ir <= t.irMax) || tiers[tiers.length - 1];
    return tier.n;
  },

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

  _createFusionCanvas() {
    this._destroyFusionCanvas();
    const cv = document.createElement('canvas');
    cv.id = 'p3dFusionCanvas';
    Object.assign(cv.style, {
      position:      'fixed',
      top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none',
      zIndex:        '25',
    });
    document.body.appendChild(cv);
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
    this._fusionCanvas = cv;
    this._fusionCtx    = cv.getContext('2d');
  },

  _destroyFusionCanvas() {
    if (this._fusionCanvas) {
      this._fusionCanvas.remove();
      this._fusionCanvas = null;
      this._fusionCtx    = null;
    }
  },

  // Rounded rect path helper (no fill/stroke — caller does that)
  _rrect(ctx, x, y, w, h, r) {
    const s = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + s, y);
    ctx.lineTo(x + w - s, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + s);
    ctx.lineTo(x + w, y + h - s);
    ctx.quadraticCurveTo(x + w, y + h, x + w - s, y + h);
    ctx.lineTo(x + s, y + h);
    ctx.quadraticCurveTo(x,     y + h, x,     y + h - s);
    ctx.lineTo(x, y + s);
    ctx.quadraticCurveTo(x, y,         x + s, y);
    ctx.closePath();
  },

  _cleanup() {
    this._destroyOverlay();
    this._destroyFusionCanvas();

    // Restore endosome emissive baseline
    if (window.P3DMatLib && P3DMatLib.endosome) {
      // After act1to2: restore pre-transition value
      // After act2to3: leave at 1.2 so Act 3 scene looks glowing/post-fusion
      if (this._phase === 'act1to2') {
        P3DMatLib.endosome.emissiveIntensity = this._endoEmBase;
      }
      // act2to3: leave at whatever _tickAct2To3 settled to
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
