'use strict';
class P3DPHSystem {
  constructor() {
    this.pH = P3D_CFG.PH_START;
    this._rateOverride = null; // set to fixed number to bypass piecewise table
  }

  update(dt) {
    const rate = (this._rateOverride !== null)
      ? this._rateOverride
      : this._piecewiseRate(this.pH);
    this.pH = Math.max(P3D_CFG.PH_ACT2_END, this.pH - rate * dt);
  }

  setPHRate(r) { this._rateOverride = r; }
  clearPHRate() { this._rateOverride = null; }

  _piecewiseRate(pH) {
    for (const e of P3D_CFG.PH_RATE_TABLE) {
      if (pH > e.above) return e.rate;
    }
    return P3D_CFG.PH_RATE_TABLE[P3D_CFG.PH_RATE_TABLE.length - 1].rate;
  }

  // Interpolate a color key ('ambient' | 'fog' | 'endo') at current pH.
  // Returns a hex integer.
  getColor(key) {
    return P3DPHSystem.interpKF(this.pH, key);
  }

  static interpKF(pH, key) {
    const kf = P3D_CFG.PH_KEYFRAMES;
    if (pH >= kf[0].ph)           return kf[0][key];
    if (pH <= kf[kf.length-1].ph) return kf[kf.length-1][key];
    for (let i = 0; i < kf.length - 1; i++) {
      if (pH >= kf[i+1].ph) {
        const t = (kf[i].ph - pH) / (kf[i].ph - kf[i+1].ph);
        return P3DPHSystem.lerpHex(kf[i][key], kf[i+1][key], t);
      }
    }
    return kf[kf.length-1][key];
  }

  static lerpHex(a, b, t) {
    const ar = (a >> 16 & 0xff), ag = (a >> 8 & 0xff), ab = (a & 0xff);
    const br = (b >> 16 & 0xff), bg = (b >> 8 & 0xff), bb = (b & 0xff);
    return ((Math.round(ar + (br - ar) * t) << 16) |
            (Math.round(ag + (bg - ag) * t) << 8) |
             Math.round(ab + (bb - ab) * t));
  }

  getDepthLabel() {
    if (this.pH >= P3D_CFG.A1_RAB5_PH)  return 'EARLY ENDOSOME';
    if (this.pH >= P3D_CFG.A1_RAB7_PH)  return 'SORTING ENDOSOME';
    if (this.pH >= P3D_CFG.PH_ACT1_END) return 'LATE ENDOSOME';
    return 'FUSION ZONE';
  }

  fmt() { return this.pH.toFixed(1); }

  reset() { this.pH = P3D_CFG.PH_START; this._rateOverride = null; }
}
