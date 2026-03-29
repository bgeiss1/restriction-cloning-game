'use strict';
/**
 * P3DDescentCam — follows the endosome vehicle during Act 1 descent.
 * Lerps toward an offset above/behind the vehicle, zooms FOV with speed,
 * and applies trauma-based camera shake.
 */
class P3DDescentCam {
  constructor(camera) {
    this._cam    = camera;
    this._trauma = 0;   // [0-1] decays over time
    this._sT     = 0;   // shake noise timer
  }

  /** Add camera trauma; values sum and clamp to 1. */
  addShake(amount) {
    this._trauma = Math.min(1, this._trauma + amount);
  }

  /**
   * @param {number}          dt
   * @param {THREE.Vector3}   vehiclePos   world-space vehicle position
   * @param {number}          speedFrac    [0-1] current descent fraction
   */
  update(dt, vehiclePos, speedFrac) {
    const cam = this._cam;

    // Target: above and slightly behind the vehicle
    const tX = vehiclePos.x * 0.25;                        // gentle X lag
    const tY = vehiclePos.y + P3D_CFG.A1_CAM_OY;
    const tZ = vehiclePos.z + P3D_CFG.A1_CAM_OZ;

    const lp = P3D_CFG.A1_CAM_LERP;
    cam.position.x += (tX - cam.position.x) * lp;
    cam.position.y += (tY - cam.position.y) * lp;
    cam.position.z += (tZ - cam.position.z) * lp;

    // Look at vehicle (slight look-ahead in Y, so we see ahead of descent)
    cam.lookAt(vehiclePos.x, vehiclePos.y - 2, vehiclePos.z);

    // FOV: narrows as speed increases (tunnel-focus effect)
    const fovTarget = P3D_CFG.A1_CAM_FOV_S +
      (P3D_CFG.A1_CAM_FOV_E - P3D_CFG.A1_CAM_FOV_S) * Math.max(0, Math.min(1, speedFrac));
    cam.fov += (fovTarget - cam.fov) * 0.04;
    cam.updateProjectionMatrix();

    // Shake (squared trauma for perceptual linearity)
    if (this._trauma > 0) {
      this._trauma -= P3D_CFG.A1_CAM_SHAKE_DEC * dt;
      if (this._trauma < 0) this._trauma = 0;

      const amp = this._trauma * this._trauma * P3D_CFG.A1_CAM_SHAKE_AMP;
      this._sT  += dt * 25;
      cam.position.x += Math.sin(this._sT * 1.7) * amp;
      cam.position.y += Math.sin(this._sT * 2.3) * amp * 0.6;
      cam.position.z += Math.sin(this._sT * 1.1) * amp * 0.4;
    }
  }

  reset() {
    this._trauma = 0;
    this._sT     = 0;
  }
}
