// vi_p3_camera.js — P3FirstPersonCam: pointer lock, mouse look, idle drift, shake
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js
'use strict';

class P3FirstPersonCam {

  // camera — the THREE.PerspectiveCamera owned by P3Escape (already in scene)
  // cfg    — P3_CFG reference
  constructor(camera, cfg) {
    this._camera = camera;
    this._cfg    = cfg;

    // Current and target Euler angles (YXZ order: yaw around world-Y, then pitch)
    this._yaw    = 0;
    this._pitch  = cfg.PITCH_MAX * 0.90;   // start looking mostly upward at endosome ceiling
    this._tYaw   = 0;
    this._tPitch = cfg.PITCH_MAX * 0.90;

    // Camera shake
    this._shakeAmt = 0;            // decays exponentially each frame

    // Idle drift — sinusoidal sway when mouse hasn't moved
    this._t            = 0;        // total elapsed seconds
    this._lastMovedAt  = -999;     // timestamp of last mousemove

    // Pointer lock
    this._locked = false;

    // Bound event handlers (kept so we can remove them in destroy())
    this._evMouseMove    = null;
    this._evPLChange     = null;
    this._evCanvasClick  = null;

    this._bindPointerLock();
    this._applyAngles();  // set initial camera orientation
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Apply a transient camera shake. intensity ∈ [0,1]; stacks with existing shake.
  applyShake(intensity) {
    this._shakeAmt = Math.min(1.0, this._shakeAmt + intensity);
  }

  // Called every frame from P3Escape._tick (runs during any active state)
  update(dt) {
    this._t += dt;

    // Idle drift: after 2.5 s of mouse inactivity, add gentle sinusoidal yaw sway
    if (this._t - this._lastMovedAt > 2.5) {
      const driftDelta = Math.sin(this._t / this._cfg.IDLE_YAW_PERIOD * Math.PI * 2)
                       * this._cfg.IDLE_YAW_AMP * dt * 60; // scale to per-frame
      this._tYaw += driftDelta;
    }

    // Smooth lerp toward targets
    const alpha  = this._cfg.CAM_LERP;
    this._yaw   += (this._tYaw   - this._yaw)   * alpha;
    this._pitch += (this._tPitch - this._pitch) * alpha;

    this._applyAngles();

    // Exponential shake decay
    if (this._shakeAmt > 0.001) {
      this._shakeAmt *= Math.exp(-this._cfg.SHAKE_DECAY * dt);
      const sx = (Math.random() * 2 - 1) * this._shakeAmt * 0.25;
      const sy = (Math.random() * 2 - 1) * this._shakeAmt * 0.25;
      this._camera.position.x += sx;
      this._camera.position.y += sy;
    } else {
      this._shakeAmt = 0;
    }
  }

  destroy() {
    document.removeEventListener('mousemove',       this._evMouseMove);
    document.removeEventListener('pointerlockchange', this._evPLChange);

    const canvas = this._getCanvas();
    if (canvas && this._evCanvasClick) {
      canvas.removeEventListener('click', this._evCanvasClick);
    }

    if (document.exitPointerLock) document.exitPointerLock();
    this._locked = false;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  // Apply current _yaw / _pitch angles to camera quaternion and restore Y position
  _applyAngles() {
    const euler = new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ');
    this._camera.quaternion.setFromEuler(euler);
    // Camera position is always on the viral surface; only position.y drifts with shake
    this._camera.position.x = 0;
    this._camera.position.y = this._cfg.CAMERA_HEIGHT;
    this._camera.position.z = 0;
  }

  _getCanvas() {
    return document.querySelector('canvas') || document.body;
  }

  _bindPointerLock() {
    const canvas = this._getCanvas();

    // Request pointer lock on canvas click (only when Phase 3 is actively playing)
    this._evCanvasClick = () => {
      if (!this._locked &&
          typeof P3Escape !== 'undefined' &&
          P3Escape._active &&
          (P3Escape.state === 'PLAYING' || P3Escape.state === 'VRNP_TARGETING')) {
        canvas.requestPointerLock();
      }
    };
    canvas.addEventListener('click', this._evCanvasClick);

    // Raw mouse input when locked
    this._evMouseMove = (e) => {
      if (!this._locked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;

      this._tYaw   -= dx * this._cfg.MOUSE_SENSITIVITY;
      this._tPitch -= dy * this._cfg.MOUSE_SENSITIVITY;
      this._tPitch  = Math.max(this._cfg.PITCH_MIN,
                               Math.min(this._cfg.PITCH_MAX, this._tPitch));
      this._lastMovedAt = this._t;
    };
    document.addEventListener('mousemove', this._evMouseMove);

    // Track lock state
    this._evPLChange = () => {
      this._locked = (document.pointerLockElement !== null);
    };
    document.addEventListener('pointerlockchange', this._evPLChange);
  }
}

// Self-register if P3Escape is already running (dynamic load scenario)
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.cam) {
  P3Escape.cam = new P3FirstPersonCam(P3Escape.camera, P3_CFG);
}
