/**
 * vi_p4_crna.js — Phase 4 cRNA intermediate products (Chunk 7).
 *
 * Each cRNA is a teal-green elongated cylinder that floats near where the
 * replication poly finished step 1 (the 5' end of the vRNA template).
 *
 * Behaviour:
 *   - Bobs gently + slow yaw (same pattern as mRNA products).
 *   - Degrade timer: 20 s after spawning if not yet assigned to step 2.
 *     When assigned, crna.busy=true and the timer stops.
 *   - On degrade: shrinks to zero over 0.4 s, then removed.
 *   - Click (with a poly selected in R mode): calls the registered click
 *     handler fn(crna), which P4Replication uses to start step 2.
 *   - Selection ring (blue): shown while hovered, not clicked-selected.
 *
 * API:
 *   P4CRNAIntermediate.init(scene)
 *   P4CRNAIntermediate.spawnCRNA(templateIdx, wx, wz, angle) → crna
 *   P4CRNAIntermediate.tick(dt)
 *   P4CRNAIntermediate.destroy()
 *   P4CRNAIntermediate.getAll()         → crna[]
 *   P4CRNAIntermediate.remove(crna)
 *   P4CRNAIntermediate.setClickHandler(fn)   fn(crna)
 */

/* global THREE, P4_CFG, P4Interaction */

const P4CRNAIntermediate = (() => {

  let _scene      = null;
  let _crnas      = [];
  let _t          = 0;
  let _clickFn    = null;

  let _geos = [];
  let _mats = [];
  let _geo_fn = g => { _geos.push(g); return g; };
  let _mat_fn = m => { _mats.push(m); return m; };

  const DEGRADE_TIME = 20.0;   // seconds before unassigned cRNA degrades
  const SHRINK_TIME  = 0.40;   // shrink-out duration on degrade

  // Shared geometry for cRNA body (horizontal cylinder)
  let _bodyGeo = null;

  // ── Build one cRNA ────────────────────────────────────────────────────────

  function _buildCRNA(templateIdx, wx, wz, angle, idx) {
    const group = new THREE.Group();
    // Spawn slightly above the plane and offset perpendicular to avoid overlapping template
    const perpX = -Math.sin(angle);
    const perpZ =  Math.cos(angle);
    group.position.set(wx + perpX * 0.8, 0.55, wz + perpZ * 0.8);
    // Rotate so cylinder lies along the template radial direction
    group.rotation.y = -angle;
    _scene.add(group);

    if (!_bodyGeo) {
      // CylinderGeometry along Y; we'll rotate mesh 90° so it's horizontal
      _bodyGeo = _geo_fn(new THREE.CylinderGeometry(0.10, 0.10, P4_CFG.TEMPLATE_LENGTH * 0.75, 6, 1));
    }

    const mat = _mat_fn(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_CRNA,
      emissive:          new THREE.Color(P4_CFG.COL_CRNA),
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.92,
    }));
    const mesh = new THREE.Mesh(_bodyGeo, mat);
    mesh.rotation.z = Math.PI * 0.5;   // lay horizontal along local X
    mesh.name = `crna_${idx}`;
    group.add(mesh);

    // End caps (small spheres) for NP-coated look
    const capGeo = _geo_fn(new THREE.SphereGeometry(0.10, 6, 4));
    const capMat = _mat_fn(new THREE.MeshLambertMaterial({
      color: P4_CFG.COL_NP, emissive: new THREE.Color(P4_CFG.COL_NP), emissiveIntensity: 0.20,
    }));
    const halfL = P4_CFG.TEMPLATE_LENGTH * 0.75 * 0.5;
    for (const sign of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(sign * halfL, 0, 0);
      group.add(cap);
    }

    return { mesh, mat, caps: group.children.slice(1) };
  }

  // ── Hover + click callbacks ───────────────────────────────────────────────

  function _registerMesh(crna) {
    P4Interaction.register(crna.mesh, {
      onHover(m, sx, sy) {
        crna.mat.emissiveIntensity = 0.65;
        P4Interaction.showTooltip(
          `<strong>cRNA — Seg ${crna.templateIdx + 1} (${P4_CFG.SEGMENT_GENES[crna.templateIdx]})</strong>`
          + `<br><span style="color:#aaaaaa;font-size:0.68rem">`
          + `Complementary RNA intermediate<br>`
          + `Select RdRp in <span style="color:#88ccff">R mode</span> then click to replicate → vRNA</span>`,
          sx, sy
        );
      },
      onHoverMove(m, sx, sy) {
        P4Interaction.showTooltip(
          `<strong>cRNA — ${P4_CFG.SEGMENT_GENES[crna.templateIdx]}</strong>`,
          sx, sy
        );
      },
      onHoverEnd() {
        crna.mat.emissiveIntensity = 0.28;
        P4Interaction.hideTooltip();
      },
      onClick(m, wp) {
        if (_clickFn && !crna.busy && !crna.degrading) _clickFn(crna);
      },
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
  }

  /**
   * Spawn a cRNA intermediate after step-1 replication completes.
   * wx, wz = poly's final position (near the template 5' end).
   * angle  = template radial angle (used for orientation + offset direction).
   */
  function spawnCRNA(templateIdx, wx, wz, angle) {
    const idx  = _crnas.length;
    const built = _buildCRNA(templateIdx, wx, wz, angle, idx);

    const crna = {
      idx,
      templateIdx,
      angle,
      group:       built.mesh.parent,   // the Group added to scene
      mesh:        built.mesh,
      mat:         built.mat,
      phase:       idx * 1.1,           // bob phase offset
      busy:        false,               // true when assigned to step 2
      degradeT:    0,                   // elapsed time since spawn (for degrade)
      degrading:   false,               // true during shrink-out
      shrinkT:     0,
      _remove:     false,
    };
    _crnas.push(crna);
    _registerMesh(crna);
    return crna;
  }

  function tick(dt) {
    _t += dt;

    for (const crna of _crnas) {
      if (crna._remove) continue;

      // Bob + slow yaw
      const bob = Math.sin(_t * 1.4 + crna.phase) * 0.07;
      crna.group.position.y = 0.55 + bob;
      if (!crna.busy && !crna.degrading) {
        crna.group.rotation.y -= dt * 0.10;
      }

      // Degrade timer (only while not assigned and not already shrinking)
      if (!crna.busy && !crna.degrading) {
        crna.degradeT += dt;
        if (crna.degradeT >= DEGRADE_TIME) {
          crna.degrading = true;
          crna.shrinkT   = 0;
        }
      }

      // Shrink-out animation
      if (crna.degrading) {
        crna.shrinkT += dt;
        const s = Math.max(0, 1 - crna.shrinkT / SHRINK_TIME);
        crna.group.scale.setScalar(s);
        if (crna.shrinkT >= SHRINK_TIME) {
          crna._remove = true;
        }
      }
    }

    // Remove flagged cRNAs
    for (let i = _crnas.length - 1; i >= 0; i--) {
      if (_crnas[i]._remove) {
        _doRemove(_crnas[i]);
        _crnas.splice(i, 1);
      }
    }
  }

  function _doRemove(crna) {
    P4Interaction.unregister(crna.mesh);
    if (crna.group.parent) crna.group.parent.remove(crna.group);
  }

  /** Called by P4Replication when step 2 completes (or by degrade). */
  function remove(crna) {
    crna.degrading = true;
    crna.shrinkT   = SHRINK_TIME;   // immediate removal via shrink path
    crna._remove   = true;
  }

  function destroy() {
    for (const crna of _crnas) _doRemove(crna);
    _crnas = [];
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos    = [];
    _mats    = [];
    _bodyGeo = null;
    _scene   = null;
  }

  function getAll()            { return _crnas; }
  function setClickHandler(fn) { _clickFn = fn; }

  return {
    init, spawnCRNA, tick, destroy,
    getAll, remove, setClickHandler,
  };

})();
