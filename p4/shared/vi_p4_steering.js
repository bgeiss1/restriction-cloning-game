/**
 * vi_p4_steering.js — Phase 4 polymerase steering behaviour.
 *
 * Moves polymerase complexes in the XZ plane using:
 *   - Seek force toward the assigned target
 *   - Obstacle repulsion (heterochromatin bounding spheres)
 *   - Peer separation (keep POLY_SEPARATION apart from other moving polys)
 *   - Nuclear boundary containment (stays inside NUCLEUS_RADIUS - 1)
 *
 * While a poly is moving, a dashed THREE.Line is drawn from the poly to its
 * target for visual feedback.
 *
 * API:
 *   P4SteeringBehavior.init(scene, obstacles)
 *       obstacles = [{x, z, r}] from P4Nucleus.getHeteroObstacles()
 *   P4SteeringBehavior.setTarget(poly, x, z, onArrival)
 *       onArrival() called when poly reaches within POLY_ARRIVE_DIST
 *   P4SteeringBehavior.clearTarget(poly)
 *   P4SteeringBehavior.tick(dt, allPolys)
 *   P4SteeringBehavior.destroy()
 */

/* global THREE, P4_CFG */

const P4SteeringBehavior = (() => {

  let _scene     = null;
  let _obstacles = [];   // [{x, z, r}]

  // Per-poly movement state (keyed by poly object reference)
  const _targets    = new Map();   // poly → {x, z, onArrival}
  const _velocities = new Map();   // poly → {x, z}
  const _lines      = new Map();   // poly → {line, geo, mat}

  // ── Line helpers ──────────────────────────────────────────────────────────

  function _createLine(poly) {
    const pts = [new THREE.Vector3(), new THREE.Vector3()];
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const mat  = new THREE.LineDashedMaterial({
      color:       0x8899ee,
      dashSize:    0.38,
      gapSize:     0.18,
      transparent: true,
      opacity:     0.55,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.name = `steering_line_${poly.idx}`;
    _scene.add(line);
    _lines.set(poly, { line, geo, mat });
  }

  function _updateLine(poly) {
    const entry = _lines.get(poly);
    if (!entry) return;
    const tgt = _targets.get(poly);
    if (!tgt)  return;
    const pos  = poly.group.position;
    const posAttr = entry.geo.attributes.position;
    posAttr.setXYZ(0, pos.x, 0.28, pos.z);
    posAttr.setXYZ(1, tgt.x, 0.28, tgt.z);
    posAttr.needsUpdate = true;
    entry.line.computeLineDistances();
  }

  function _removeLine(poly) {
    const entry = _lines.get(poly);
    if (!entry) return;
    if (entry.line.parent) entry.line.parent.remove(entry.line);
    entry.geo.dispose();
    entry.mat.dispose();
    _lines.delete(poly);
  }

  // ── Steering logic ────────────────────────────────────────────────────────

  function _stepPoly(poly, dt, allPolys) {
    const tgt = _targets.get(poly);
    if (!tgt) return;

    const pos = poly.group.position;
    const vel = _velocities.get(poly);

    const dx   = tgt.x - pos.x;
    const dz   = tgt.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // ── Arrival check ──────────────────────────────────────────────────────
    if (dist < P4_CFG.POLY_ARRIVE_DIST) {
      pos.x = tgt.x;
      pos.z = tgt.z;
      const cb = tgt.onArrival;
      clearTarget(poly);
      poly.state = 'busy';
      if (cb) cb();
      return;
    }

    const spd = P4_CFG.POLY_SPEED;

    // ── Seek force ─────────────────────────────────────────────────────────
    const seekX = (dx / dist) * spd - vel.x;
    const seekZ = (dz / dist) * spd - vel.z;

    // ── Obstacle repulsion ─────────────────────────────────────────────────
    let avoidX = 0, avoidZ = 0;
    for (const obs of _obstacles) {
      const ox = pos.x - obs.x;
      const oz = pos.z - obs.z;
      const od = Math.sqrt(ox * ox + oz * oz) || 0.001;
      const clearance  = obs.r + 0.9;   // stay this far from edge
      const lookahead  = 1.8;
      if (od < clearance + lookahead) {
        const penetration = Math.max(0, (clearance + lookahead - od) / lookahead);
        const repulse     = penetration * P4_CFG.POLY_STEER_FORCE * 3.5;
        avoidX += (ox / od) * repulse;
        avoidZ += (oz / od) * repulse;
      }
    }

    // ── Peer separation ────────────────────────────────────────────────────
    let sepX = 0, sepZ = 0;
    for (const other of allPolys) {
      if (other === poly || other.state === 'idle') continue;
      const sx = pos.x - other.group.position.x;
      const sz = pos.z - other.group.position.z;
      const sd = Math.sqrt(sx * sx + sz * sz) || 0.001;
      if (sd < P4_CFG.POLY_SEPARATION) {
        const push = (P4_CFG.POLY_SEPARATION - sd) / P4_CFG.POLY_SEPARATION;
        sepX += (sx / sd) * push * P4_CFG.POLY_STEER_FORCE;
        sepZ += (sz / sd) * push * P4_CFG.POLY_STEER_FORCE;
      }
    }

    // ── Nuclear boundary containment ───────────────────────────────────────
    const boundR = P4_CFG.NUCLEUS_RADIUS - 1.5;
    const dfc    = Math.sqrt(pos.x * pos.x + pos.z * pos.z) || 0.001;
    if (dfc > boundR) {
      const pull = ((dfc - boundR) / 2) * P4_CFG.POLY_STEER_FORCE * 4;
      avoidX -= (pos.x / dfc) * pull;
      avoidZ -= (pos.z / dfc) * pull;
    }

    // ── Integrate velocity ─────────────────────────────────────────────────
    const steerScale = P4_CFG.POLY_STEER_FORCE * dt;
    vel.x += (seekX + avoidX + sepX) * steerScale;
    vel.z += (seekZ + avoidZ + sepZ) * steerScale;

    // Clamp to max speed
    const velMag = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (velMag > spd) {
      vel.x = (vel.x / velMag) * spd;
      vel.z = (vel.z / velMag) * spd;
    }

    // Move
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;

    // Face direction of travel
    if (velMag > 0.15) {
      poly.group.rotation.y = Math.atan2(vel.x, vel.z);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, obstacles) {
    _scene     = scene;
    _obstacles = obstacles || [];
  }

  function setTarget(poly, x, z, onArrival) {
    _targets.set(poly, { x, z, onArrival: onArrival || null });
    if (!_velocities.has(poly)) _velocities.set(poly, { x: 0, z: 0 });
    if (!_lines.has(poly)) _createLine(poly);
    poly.state = 'moving';
  }

  function clearTarget(poly) {
    _targets.delete(poly);
    _velocities.delete(poly);
    _removeLine(poly);
    if (poly.state === 'moving') poly.state = 'idle';
  }

  function tick(dt, allPolys) {
    for (const poly of allPolys) {
      if (!_targets.has(poly)) continue;
      _stepPoly(poly, dt, allPolys);
      _updateLine(poly);
    }
  }

  function destroy() {
    for (const poly of [..._lines.keys()]) {
      _removeLine(poly);
    }
    _targets.clear();
    _velocities.clear();
    _lines.clear();
    _obstacles = [];
    _scene     = null;
  }

  return { init, setTarget, clearTarget, tick, destroy };

})();
