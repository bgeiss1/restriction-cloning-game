/**
 * vi_p1_companions.js — Phase 1 companion droplets + student thermal plumes.
 *
 * Companion droplets:
 *   50 sibling respiratory droplets expelled alongside the player during the
 *   cough.  Radius is drawn from a realistic size distribution — large drops
 *   (>50 µm) arc and fall within ~1 m, medium drops travel a few metres,
 *   small aerosol particles (<10 µm, shown as the smallest radius tier) can
 *   remain airborne for the whole flight.  This makes the physics educational:
 *   the player is a small-to-medium aerosol that has a real chance of reaching
 *   the susceptible student.
 *
 * Thermal plumes:
 *   Each seated student emits a gentle upward column of warm air (body heat).
 *   Rendered as very faint orange Points; the force on the player droplet is
 *   computed in vi_p1_zones.js using P1_CFG.STUDENT_THERMAL_FORCE/RADIUS.
 *
 * API:
 *   P1Companions.init(scene, mouthPos, studentPositions)
 *   P1Companions.tick(dt)
 *   P1Companions.destroy()
 */

/* global THREE, P1_CFG */

const P1Companions = (() => {

  let _scene = null;

  // ── Companion droplets (InstancedMesh) ─────────────────────────────────────
  const N  = P1_CFG.COUGH_DROPLET_COUNT;   // 50
  let _mesh     = null;
  let _geo      = null;
  let _mat      = null;
  const _dummy  = new THREE.Object3D();

  // Per-droplet state (parallel flat arrays for speed)
  const _px = new Float32Array(N);
  const _py = new Float32Array(N);
  const _pz = new Float32Array(N);
  const _vx = new Float32Array(N);
  const _vy = new Float32Array(N);
  const _vz = new Float32Array(N);
  const _r  = new Float32Array(N);   // base radius (world units)
  const _alive = new Uint8Array(N);  // 1 = alive

  // Gravity multiplier per droplet (larger = falls faster)
  const _gravMult = new Float32Array(N);

  // ── Thermal plumes (Points) ────────────────────────────────────────────────
  const N_PLUME  = 120;
  let _plumeObj  = null;
  let _plumeMat  = null;
  let _plumePos  = null;   // Float32Array (xyz * N_PLUME)
  const _pvx = new Float32Array(N_PLUME);
  const _pvy = new Float32Array(N_PLUME);
  const _pvz = new Float32Array(N_PLUME);
  const _pAge  = new Float32Array(N_PLUME);
  const _pLife = new Float32Array(N_PLUME);
  // Origin (student head position) for each plume particle
  const _pOriginX = new Float32Array(N_PLUME);
  const _pOriginY = new Float32Array(N_PLUME);
  const _pOriginZ = new Float32Array(N_PLUME);

  // ── Build helpers ──────────────────────────────────────────────────────────

  function _buildCompanions(mouth) {
    // Unit-radius sphere — scale per instance controls apparent size
    _geo = new THREE.SphereGeometry(1, 5, 4);
    _mat = new THREE.MeshPhongMaterial({
      color:       0xbbddff,
      transparent: true,
      opacity:     0.55,
      shininess:   60,
      depthWrite:  false,
    });
    _mesh = new THREE.InstancedMesh(_geo, _mat, N);
    _mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _scene.add(_mesh);

    for (let i = 0; i < N; i++) {
      // Size distribution: 15% large (> 0.05), 30% medium, 55% small/aerosol
      const u = Math.random();
      const radius = u < 0.15 ? 0.050 + Math.random() * 0.040   // large ballistic
                   : u < 0.45 ? 0.022 + Math.random() * 0.026   // medium
                   :            0.005 + Math.random() * 0.015;   // aerosol

      _r[i] = radius;
      // Gravity scales with radius^1.5 (approximates Stokes drag regime)
      _gravMult[i] = 0.6 + Math.pow(radius / 0.04, 1.5) * 3.0;

      // Spawn at mouth with small jitter
      _px[i] = mouth.x + (Math.random() - 0.5) * 0.10;
      _py[i] = mouth.y + (Math.random() - 0.5) * 0.08;
      _pz[i] = mouth.z + (Math.random() - 0.5) * 0.08;

      // Velocity: forward cone, smaller = more scatter, less raw speed
      const speed  = 0.8 + Math.random() * 2.0;
      const spread = 0.5 + (1 - Math.min(1, radius / 0.06)) * 0.7;
      _vx[i] = (Math.random() - 0.5) * spread;
      _vy[i] = (Math.random() - 0.15) * spread * 0.5 + 0.15;
      _vz[i] = speed;

      _alive[i] = 1;

      // Place at mouth initially
      _dummy.position.set(_px[i], _py[i], _pz[i]);
      _dummy.scale.setScalar(radius);
      _dummy.updateMatrix();
      _mesh.setMatrixAt(i, _dummy.matrix);
    }
    _mesh.instanceMatrix.needsUpdate = true;
  }

  function _buildThermalPlumes(studentPositions) {
    _plumePos = new Float32Array(N_PLUME * 3);

    const S = studentPositions.length;
    for (let i = 0; i < N_PLUME; i++) {
      const sp = studentPositions[i % S];
      const ox = (Math.random() - 0.5) * 0.22;
      const oz = (Math.random() - 0.5) * 0.22;

      _pOriginX[i] = sp.x + ox;
      _pOriginY[i] = P1_CFG.HEAD_Y;
      _pOriginZ[i] = sp.z + oz;

      // Stagger ages so particles don't all reset at the same time
      _pAge[i]  = Math.random() * 3.0;
      _pLife[i] = 1.8 + Math.random() * 1.6;

      _pvx[i] = (Math.random() - 0.5) * 0.04;
      _pvy[i] = 0.20 + Math.random() * 0.18;
      _pvz[i] = (Math.random() - 0.5) * 0.04;

      // Initial position along the plume column
      const t = _pAge[i] / _pLife[i];
      _plumePos[i * 3    ] = _pOriginX[i] + (Math.random() - 0.5) * 0.05;
      _plumePos[i * 3 + 1] = _pOriginY[i] + t * 0.9;
      _plumePos[i * 3 + 2] = _pOriginZ[i] + (Math.random() - 0.5) * 0.05;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_plumePos, 3));

    _plumeMat = new THREE.PointsMaterial({
      color:           0xff9933,
      size:            0.018,
      transparent:     true,
      opacity:         0.18,
      depthWrite:      false,
      sizeAttenuation: true,
    });

    _plumeObj = new THREE.Points(geo, _plumeMat);
    _scene.add(_plumeObj);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init(scene, mouthPos, studentPositions) {
    _scene = scene;
    _buildCompanions(mouthPos);
    if (studentPositions && studentPositions.length > 0) {
      _buildThermalPlumes(studentPositions);
    }
  }

  function tick(dt) {
    _tickCompanions(dt);
    _tickPlumes(dt);
  }

  function _tickCompanions(dt) {
    if (!_mesh) return;
    for (let i = 0; i < N; i++) {
      if (!_alive[i]) continue;

      // Gravity (large drops fall fast)
      _vy[i] -= P1_CFG.GRAVITY * _gravMult[i] * dt;

      // Air drag
      const drag = Math.pow(0.94, dt * 60);
      _vx[i] *= drag;
      _vz[i] *= Math.pow(0.92, dt * 60);

      _px[i] += _vx[i] * dt;
      _py[i] += _vy[i] * dt;
      _pz[i] += _vz[i] * dt;

      // Hit floor or exit room
      if (_py[i] <= P1_CFG.Y_MIN ||
          _px[i] < P1_CFG.X_MIN - 1 || _px[i] > P1_CFG.X_MAX + 1 ||
          _pz[i] > P1_CFG.Z_END + 2) {
        _alive[i] = 0;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        _mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      _dummy.position.set(_px[i], _py[i], _pz[i]);
      _dummy.scale.setScalar(_r[i]);
      _dummy.updateMatrix();
      _mesh.setMatrixAt(i, _dummy.matrix);
    }
    _mesh.instanceMatrix.needsUpdate = true;
  }

  function _tickPlumes(dt) {
    if (!_plumeObj) return;
    for (let i = 0; i < N_PLUME; i++) {
      _pAge[i] += dt;

      if (_pAge[i] >= _pLife[i]) {
        // Recycle back to origin
        _pAge[i]  = 0;
        _pLife[i] = 1.8 + Math.random() * 1.6;
        _plumePos[i * 3    ] = _pOriginX[i] + (Math.random() - 0.5) * 0.18;
        _plumePos[i * 3 + 1] = _pOriginY[i];
        _plumePos[i * 3 + 2] = _pOriginZ[i] + (Math.random() - 0.5) * 0.18;
        _pvx[i] = (Math.random() - 0.5) * 0.04;
        _pvy[i] = 0.18 + Math.random() * 0.20;
        _pvz[i] = (Math.random() - 0.5) * 0.04;
        continue;
      }

      // Decelerate as heat dissipates
      _pvy[i] *= Math.pow(0.97, dt * 60);

      _plumePos[i * 3    ] += _pvx[i] * dt;
      _plumePos[i * 3 + 1] += _pvy[i] * dt;
      _plumePos[i * 3 + 2] += _pvz[i] * dt;
    }
    _plumeObj.geometry.attributes.position.needsUpdate = true;
  }

  function destroy() {
    if (_mesh) {
      if (_mesh.parent) _mesh.parent.remove(_mesh);
      _geo.dispose();
      _mat.dispose();
      _mesh = null; _geo = null; _mat = null;
    }
    if (_plumeObj) {
      if (_plumeObj.parent) _plumeObj.parent.remove(_plumeObj);
      _plumeObj.geometry.dispose();
      _plumeMat.dispose();
      _plumeObj = null; _plumeMat = null; _plumePos = null;
    }
    _scene = null;
  }

  return { init, tick, destroy };

})();
