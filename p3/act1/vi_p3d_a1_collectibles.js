'use strict';
/**
 * P3DCollectibleMgr — spawns and tracks collectible tokens in Act 1.
 *
 * Token types:
 *   'M2'     — octahedron, blue     — adds to M2 inventory
 *   'NS1'    — box,        purple   — adds to NS1 inventory
 *   'HEALTH' — small sphere, green  — restores HP
 *
 * Tokens spin and bob in place.  Collection is detected by simple
 * sphere-sphere overlap with the endosome radius + 0.6 pickup margin.
 *
 * Owns its three materials; never disposes shared geometries.
 */
class P3DCollectibleMgr {
  constructor(scene) {
    this._scene  = scene;
    this._tokens = [];  // { mesh, type, collected, id }

    this._matM2     = new THREE.MeshLambertMaterial({
      color: P3D_CFG.COL_M2_TOK,    emissive: 0x001133 });
    this._matNS1    = new THREE.MeshLambertMaterial({
      color: P3D_CFG.COL_NS1_TOK,   emissive: 0x110022 });
    this._matHealth = new THREE.MeshLambertMaterial({
      color: P3D_CFG.COL_HEALTH_TOK, emissive: 0x001100 });

    this._nextId = 0;
  }

  // ── Spawn ──────────────────────────────────────────────────────────────

  /**
   * Spawn a single token at worldPos.
   * @param {'M2'|'NS1'|'HEALTH'} type
   * @param {THREE.Vector3}       worldPos
   */
  spawn(type, worldPos) {
    const geo = type === 'M2'     ? P3DGeoLib.octaM2      :
                type === 'NS1'    ? P3DGeoLib.boxNS1       :
                                    P3DGeoLib.sphereSmall;
    const mat = type === 'M2'     ? this._matM2     :
                type === 'NS1'    ? this._matNS1    :
                                    this._matHealth;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(worldPos);
    mesh.scale.setScalar(1.5);
    this._scene.add(mesh);
    this._tokens.push({ mesh, type, collected: false, id: this._nextId++ });
  }

  /**
   * Spawn a cluster of tokens around a descent depth.
   * Called once per chunk as the vehicle passes the chunk boundary.
   *
   * @param {number} descentY   current accumulated descent depth
   */
  spawnGroup(descentY) {
    const H     = P3D_CFG.A1_CHUNK_H;
    const R     = P3D_CFG.A1_BOUNDARY_R * 0.65;
    // Place tokens 30–55 units ahead of current depth, spread vertically
    const baseY = -(descentY + H * 0.5);

    const _rnd = (spread) => (Math.random() - 0.5) * spread;
    const _pos = (dy, xOff, zOff) => new THREE.Vector3(
      _rnd(R * 2) + xOff,
      baseY + dy,
      _rnd(R * 2) + zOff
    );

    // 1 guaranteed M2 + 50% chance of a second
    this.spawn('M2', _pos(0,   0,  0));
    if (Math.random() < 0.5) this.spawn('M2',  _pos(-5,  3, -2));

    // 1 NS1
    this.spawn('NS1', _pos(-10, -2,  3));

    // 1 health pickup, deeper in the chunk
    this.spawn('HEALTH', _pos(-18,  1, -1));
  }

  // ── Per-frame update ───────────────────────────────────────────────────

  /**
   * Spin/bob tokens, check pickup.
   * @param {number}        dt
   * @param {THREE.Vector3} vehiclePos    world position of endosome centre
   * @param {number}        vehicleRadius endosome radius (+ pickup margin applied inside)
   * @returns {{ type: string }[]}  array of items collected this frame
   */
  update(dt, vehiclePos, vehicleRadius) {
    const collected = [];
    const pickR2    = (vehicleRadius + 0.6) ** 2;
    const t         = performance.now() * 0.001;

    for (const tok of this._tokens) {
      if (tok.collected) continue;

      // Animation
      tok.mesh.rotation.y += dt * 1.3;
      tok.mesh.rotation.x += dt * 0.5;
      // Gentle float bob — use token id as phase offset
      tok.mesh.position.y += Math.sin(t * 1.8 + tok.id * 1.1) * 0.004 * dt * 60;

      // Pickup test
      const dx = tok.mesh.position.x - vehiclePos.x;
      const dy = tok.mesh.position.y - vehiclePos.y;
      const dz = tok.mesh.position.z - vehiclePos.z;
      if (dx*dx + dy*dy + dz*dz < pickR2) {
        tok.collected = true;
        this._scene.remove(tok.mesh);
        collected.push({ type: tok.type });
      }
    }

    // Prune collected entries
    if (collected.length) {
      this._tokens = this._tokens.filter(t => !t.collected);
    }

    return collected;
  }

  /**
   * Remove tokens that have scrolled well above the vehicle (unreachable).
   * @param {number} vehicleWorldY   vehicle's current world Y
   */
  cullAbove(vehicleWorldY) {
    const threshold = vehicleWorldY + P3D_CFG.A1_CHUNK_H * 1.5;
    this._tokens = this._tokens.filter(tok => {
      if (tok.mesh.position.y > threshold) {
        this._scene.remove(tok.mesh);
        return false;
      }
      return true;
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  destroy() {
    for (const tok of this._tokens) {
      this._scene.remove(tok.mesh);
    }
    this._tokens = [];
    this._matM2.dispose();
    this._matNS1.dispose();
    this._matHealth.dispose();
  }
}
