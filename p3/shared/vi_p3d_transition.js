'use strict';
/**
 * TransitionManager — orchestrates Act 1→2 and Act 2→3 transitions.
 * Fully implemented in Chunk 4 (Act 1→2) and Chunk 6 (Act 2→3).
 * Chunk 1 provides stubs so the main module can reference them safely.
 */
const P3DTransition = {
  _t:       0,
  _dur:     0,
  _active:  false,
  _onDone:  null,
  _phase:   null,  // 'act1to2' | 'act2to3'

  // ── Act 1 → 2 ─────────────────────────────────────────────────────────
  // Called when pH reaches PH_ACT1_END.
  // Slows descent, centers endosome, camera pushes in, text overlays,
  // then calls onDone() to hand off to Act2BossBattle.
  startAct1To2(onDone) {
    this._phase  = 'act1to2';
    this._t      = 0;
    this._dur    = P3D_CFG.TRANS_12_DUR;
    this._active = true;
    this._onDone = onDone;
    // Sub-system hooks inserted in Chunk 4
  },

  // ── Act 2 → 3 ─────────────────────────────────────────────────────────
  // Called after the final sync node in Act 2.
  // Plays fusion cinematic (5 beats), then calls onDone() for Act3Epilogue.
  startAct2To3(immuneResistance, onDone) {
    this._phase  = 'act2to3';
    this._t      = 0;
    this._dur    = P3D_CFG.TRANS_23_DUR;
    this._active = true;
    this._onDone = onDone;
    this._ir     = immuneResistance;
    // Sub-system hooks inserted in Chunk 6
  },

  tick(dt) {
    if (!this._active) return;
    this._t += dt;
    if (this._t >= this._dur) {
      this._active = false;
      if (typeof this._onDone === 'function') { const fn = this._onDone; this._onDone = null; fn(); }
    }
  },

  isActive() { return this._active; },
  reset()    { this._active = false; this._t = 0; this._onDone = null; },
};
