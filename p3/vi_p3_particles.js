// vi_p3_particles.js — P3Particles: H⁺ proton particle system
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js
// Protons spawn on the endosome wall and travel inward toward the viral particle.
// Spawn rate is pH-driven (more protons as pH drops) with a bonus per open M2 channel.
'use strict';

class P3Particles {

  // scene — the THREE.Scene owned by P3Escape
  // cfg   — P3_CFG reference
  constructor(scene, cfg) {
    this._scene = scene;
    this._cfg   = cfg;
    this._max   = cfg.PROTON_MAX;

    // Typed arrays for particle state — kept parallel (index i = one particle)
    this._pos    = new Float32Array(this._max * 3);   // xyz positions
    this._vel    = new Float32Array(this._max * 3);   // xyz velocities
    this._life   = new Float32Array(this._max);       // remaining lifetime (s)
    this._active = new Uint8Array(this._max);         // 1 = alive, 0 = dead

    // Fractional spawn accumulator — avoids integer rounding artifacts
    this._spawnAccum = 0;

    // Park every slot off-screen so inactive particles are invisible
    for (let i = 0; i < this._max; i++) {
      this._pos[i * 3 + 1] = 5000;
    }

    // Single Points object — far cheaper than individual Mesh instances
    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this._pos, 3)
    );

    this._mat = new THREE.PointsMaterial({
      color:          cfg.COL_PROTON,
      size:           cfg.PROTON_SIZE,
      sizeAttenuation: true,
      transparent:    true,
      opacity:        0.82,
      depthWrite:     false,
    });

    this._points = new THREE.Points(this._geo, this._mat);
    scene.add(this._points);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called every frame from P3Escape._updateSubSystems (before M2 update — one-frame lag is fine).
  update(dt) {
    this._advanceParticles(dt);
    this._spawnParticles(dt);
    this._geo.attributes.position.needsUpdate = true;
  }

  destroy() {
    this._geo.dispose();
    this._mat.dispose();
    this._scene.remove(this._points);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _advanceParticles(dt) {
    const pos  = this._pos;
    const vel  = this._vel;
    const life = this._life;
    const act  = this._active;

    for (let i = 0; i < this._max; i++) {
      if (!act[i]) continue;

      life[i] -= dt;
      if (life[i] <= 0) {
        act[i] = 0;
        pos[i * 3 + 1] = 5000;   // park off-screen
        continue;
      }

      const vi = i * 3;
      pos[vi]     += vel[vi]     * dt;
      pos[vi + 1] += vel[vi + 1] * dt;
      pos[vi + 2] += vel[vi + 2] * dt;
    }
  }

  _spawnParticles(dt) {
    const cfg = this._cfg;

    // Read endosomal pH from P3Escape (the global singleton)
    const pH = typeof P3Escape !== 'undefined' ? P3Escape.endosomalPH : cfg.PH_START;

    // Base rate scales 0 → ~160/s as pH drops from PH_START to PH_END
    const pHFrac = Math.max(0, Math.min(1,
      (cfg.PH_START - pH) / (cfg.PH_START - cfg.PH_END)
    ));
    const baseRate = pHFrac * 160;

    // Bonus: each open M2 channel adds extra protons (they're pumping H⁺ in)
    const openCount = typeof P3Escape !== 'undefined' && P3Escape.m2
      ? P3Escape.m2.getOpenCount() : 0;
    const m2Bonus = openCount * 24;

    this._spawnAccum += (baseRate + m2Bonus) * dt;

    while (this._spawnAccum >= 1) {
      this._spawnAccum -= 1;
      this._spawnOne();
    }
  }

  _spawnOne() {
    const cfg = this._cfg;

    // Find a free slot — scan linearly; with max 300 slots this is fast
    for (let i = 0; i < this._max; i++) {
      if (this._active[i]) continue;

      // Random point on the endosome sphere surface (uniform spherical distribution)
      const u     = Math.random() * 2 - 1;
      const phi   = Math.random() * Math.PI * 2;
      const sinLat = Math.sqrt(1 - u * u);
      const sx = sinLat * Math.cos(phi) * cfg.ENDO_RADIUS;
      const sy = u                      * cfg.ENDO_RADIUS;
      const sz = sinLat * Math.sin(phi) * cfg.ENDO_RADIUS;

      // Velocity: mostly inward (toward origin) with small scatter for organic look
      const len     = Math.sqrt(sx * sx + sy * sy + sz * sz);  // ≈ ENDO_RADIUS
      const scatter = 0.14;
      const speed   = cfg.PROTON_SPEED * (0.65 + Math.random() * 0.70);

      const vx = (-sx / len + (Math.random() - 0.5) * scatter) * speed;
      const vy = (-sy / len + (Math.random() - 0.5) * scatter) * speed;
      const vz = (-sz / len + (Math.random() - 0.5) * scatter) * speed;

      const vi = i * 3;
      this._active[i]  = 1;
      this._life[i]    = cfg.PROTON_LIFE * (0.45 + Math.random() * 0.90);
      this._pos[vi]    = sx;
      this._pos[vi + 1] = sy;
      this._pos[vi + 2] = sz;
      this._vel[vi]    = vx;
      this._vel[vi + 1] = vy;
      this._vel[vi + 2] = vz;
      return;
    }
    // All slots occupied — skip this spawn tick
  }
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.particles) {
  P3Escape.particles = new P3Particles(P3Escape.scene, P3_CFG);
}
