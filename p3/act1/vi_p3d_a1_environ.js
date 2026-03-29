'use strict';
/**
 * P3DCytoplasmEnv — infinite scrolling cytoplasm environment for Act 1.
 *
 * Three chunks of height A1_CHUNK_H are tiled vertically and recycled
 * as the endosome descends.  Each chunk contains:
 *   • Cytoskeletal filaments (wavy BufferGeometry lines)
 *   • Mitochondria (capsuleMito shared geo, local Lambert mat)
 *   • ER membrane sheet (PlaneGeometry, local material — local geo)
 *   • Small vesicles (sphereMid shared geo, local material)
 *
 * Local geometries (lines, planes) are tracked per chunk for proper disposal.
 * Shared P3DGeoLib geometries are never disposed here.
 *
 * Also owns a P3DAmbientParticles instance that scrolls with descent speed.
 */
class P3DCytoplasmEnv {
  constructor(scene) {
    this._scene   = scene;
    this._chunks  = [];
    this._ambient = new P3DAmbientParticles(scene);

    this._initChunks();
  }

  // ── Init ──────────────────────────────────────────────────────────────

  _initChunks() {
    const H = P3D_CFG.A1_CHUNK_H;
    // Chunk 0 starts at y=0 (around vehicle start), descending in -Y
    for (let i = 0; i < P3D_CFG.A1_CHUNK_N; i++) {
      this._chunks.push(this._buildChunk(-i * H));
    }
  }

  _buildChunk(yBase) {
    const H        = P3D_CFG.A1_CHUNK_H;
    const R        = P3D_CFG.A1_BOUNDARY_R;
    const grp      = new THREE.Group();
    const localGeos = [];   // geometries to dispose with this chunk

    grp.position.y = yBase;
    this._scene.add(grp);

    // ── Cytoskeletal filaments ─────────────────────────────────────────
    for (let f = 0; f < P3D_CFG.A1_FILAMENTS_N; f++) {
      const mat = new THREE.LineBasicMaterial({
        color: P3D_CFG.COL_CYTO, transparent: true, opacity: 0.20
      });
      // Place origin outside the player boundary to avoid clutter
      const ox = (Math.random() < 0.5 ? -1 : 1) * (R * 0.6 + Math.random() * R * 0.8);
      const oz = (Math.random() < 0.5 ? -1 : 1) * (R * 0.6 + Math.random() * R * 0.8);

      const pts = [];
      for (let k = 0; k < 9; k++) {
        pts.push(new THREE.Vector3(
          ox + (Math.random() - 0.5) * 4,
          -(k * H / 8) - Math.random() * (H / 9),
          oz + (Math.random() - 0.5) * 4
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      localGeos.push(geo);
      grp.add(new THREE.Line(geo, mat));
    }

    // ── Mitochondria ──────────────────────────────────────────────────
    for (let i = 0; i < P3D_CFG.A1_MITO_N; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: P3D_CFG.COL_MITO });
      const mesh = new THREE.Mesh(P3DGeoLib.capsuleMito, mat);
      const angle = Math.random() * Math.PI * 2;
      const dist  = R * 0.5 + Math.random() * R * 0.7;
      mesh.position.set(
        Math.cos(angle) * dist,
        -(H * 0.1 + Math.random() * H * 0.8),
        Math.sin(angle) * dist
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      grp.add(mesh);
    }

    // ── ER membrane sheets ─────────────────────────────────────────────
    for (let i = 0; i < P3D_CFG.A1_ER_N; i++) {
      const w   = 4 + Math.random() * 6;
      const h   = 2 + Math.random() * 4;
      const geo = new THREE.PlaneGeometry(w, h);
      localGeos.push(geo);
      const mat = new THREE.MeshLambertMaterial({
        color: P3D_CFG.COL_ER, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = Math.random() * Math.PI * 2;
      const dist  = R * 0.3 + Math.random() * R * 0.8;
      mesh.position.set(
        Math.cos(angle) * dist,
        -(H * 0.15 + Math.random() * H * 0.7),
        Math.sin(angle) * dist
      );
      mesh.rotation.set(
        (Math.random() - 0.5) * Math.PI,
        Math.random() * Math.PI * 2,
        0
      );
      grp.add(mesh);
    }

    // ── Small vesicles ─────────────────────────────────────────────────
    for (let i = 0; i < P3D_CFG.A1_VESICLE_N; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: P3D_CFG.COL_CYTO, transparent: true, opacity: 0.45
      });
      const mesh = new THREE.Mesh(P3DGeoLib.sphereMid, mat);
      const angle = Math.random() * Math.PI * 2;
      const dist  = R * 0.2 + Math.random() * R * 0.9;
      mesh.position.set(
        Math.cos(angle) * dist,
        -(Math.random() * H * 0.9),
        Math.sin(angle) * dist
      );
      grp.add(mesh);
    }

    return { group: grp, yBase, localGeos };
  }

  // ── Per-frame update ───────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {number} descentY      accumulated descent depth (positive)
   * @param {number} descentSpeed  for ambient particle scroll speed
   */
  update(dt, descentY, descentSpeed) {
    const H = P3D_CFG.A1_CHUNK_H;
    const N = P3D_CFG.A1_CHUNK_N;

    // Vehicle is at world Y = -descentY.
    // Recycle a chunk when its top edge (group.position.y) is more than
    // one chunk height above the vehicle.
    for (const chunk of this._chunks) {
      if (chunk.group.position.y > (-descentY + H)) {
        chunk.group.position.y -= H * N;
        chunk.yBase = chunk.group.position.y;
      }
    }

    this._ambient.update(dt, descentSpeed);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  destroy() {
    for (const chunk of this._chunks) {
      this._scene.remove(chunk.group);

      // Dispose only locally-created geometries
      for (const geo of chunk.localGeos) geo.dispose();

      // Dispose all materials (each mesh in this chunk owns its own material)
      chunk.group.traverse(obj => {
        if (!obj.isMesh && !obj.isLine) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose());
      });
    }
    this._chunks = [];
    this._ambient.destroy(this._scene);
  }
}
