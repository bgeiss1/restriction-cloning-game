'use strict';
/**
 * Reusable pooled particle system.
 * Uses a single THREE.Points object; dead particles are parked far off-screen.
 * Supports up to `maxCount` simultaneous live particles.
 */
class P3DParticleSystem {
  constructor(scene, maxCount, material) {
    this._max   = maxCount;
    this._scene = scene;
    this._pos   = new Float32Array(maxCount * 3);
    this._vel   = new Float32Array(maxCount * 3);
    this._life  = new Float32Array(maxCount);
    this._maxL  = new Float32Array(maxCount);
    this._alive = new Uint8Array(maxCount);

    // Park all particles
    for (let i = 0; i < maxCount; i++) this._pos[i * 3 + 1] = 5000;

    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));

    this._mat    = material || new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.8, sizeAttenuation: true });
    this._points = new THREE.Points(this._geo, this._mat);
    scene.add(this._points);
  }

  /**
   * Emit `count` particles from `pos`.
   * @param {THREE.Vector3} pos  — spawn origin
   * @param {Function} velFn    — () => {x,y,z} random velocity; called per particle
   * @param {number} lifetime   — seconds
   * @param {number} count
   */
  emit(pos, velFn, lifetime, count) {
    let spawned = 0;
    for (let i = 0; i < this._max && spawned < count; i++) {
      if (this._alive[i]) continue;
      this._alive[i]   = 1;
      const b          = i * 3;
      this._pos[b]     = pos.x;
      this._pos[b + 1] = pos.y;
      this._pos[b + 2] = pos.z;
      const v          = velFn ? velFn() : { x: 0, y: 0.5, z: 0 };
      this._vel[b]     = v.x;
      this._vel[b + 1] = v.y;
      this._vel[b + 2] = v.z;
      this._life[i]    = lifetime;
      this._maxL[i]    = lifetime;
      spawned++;
    }
  }

  update(dt) {
    let anyAlive = false;
    for (let i = 0; i < this._max; i++) {
      if (!this._alive[i]) continue;
      this._life[i] -= dt;
      if (this._life[i] <= 0) {
        this._alive[i]       = 0;
        this._pos[i * 3 + 1] = 5000; // park
        continue;
      }
      anyAlive = true;
      const b = i * 3;
      this._pos[b]     += this._vel[b]     * dt;
      this._pos[b + 1] += this._vel[b + 1] * dt;
      this._pos[b + 2] += this._vel[b + 2] * dt;
    }
    if (anyAlive) this._geo.attributes.position.needsUpdate = true;
  }

  setVisible(v) { this._points.visible = v; }

  removeFromScene() {
    this._scene.remove(this._points);
  }

  destroy() {
    this._scene.remove(this._points);
    this._geo.dispose();
    // Don't dispose _mat — caller may have passed in a shared material
  }
}

// ── AmbientParticles ─────────────────────────────────────────────────────────
// 250 tiny points drifting slowly upward through the scene.
class P3DAmbientParticles {
  constructor(scene) {
    const N   = P3D_CFG.A1_AMBIENT_PTS;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 28;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = P3DMatLib.ambientPts ||
      new THREE.PointsMaterial({ color: 0xaabbcc, size: 0.06, transparent: true, opacity: 0.12, sizeAttenuation: true });
    this._pts = new THREE.Points(geo, mat);
    this._geo = geo;
    this._pos = pos;
    this._N   = N;
    scene.add(this._pts);
  }

  // Move particles upward relative to world (descent creates upward drift illusion).
  update(dt, descentSpeed) {
    const spd = descentSpeed * 0.3;
    const range = 80;
    for (let i = 0; i < this._N; i++) {
      this._pos[i * 3 + 1] += spd * dt;
      if (this._pos[i * 3 + 1] > range / 2) {
        this._pos[i * 3 + 1] -= range;
      }
    }
    this._geo.attributes.position.needsUpdate = true;
  }

  destroy(scene) {
    scene.remove(this._pts);
    this._geo.dispose();
  }
}
