/**
 * vi_p4_polii.js — Phase 4 RNA Polymerase II transcription sites.
 *
 * Each site represents an active host Pol II complex that produces a capped
 * pre-mRNA strand.  The viral RdRp will arrive, snatch the 5′ cap, and use
 * it as a primer for viral transcription (cap-snatching, Chunk 4).
 *
 * Visual per site:
 *   - Pol II body: central bright-gold sphere + 3 small subunit spheres
 *   - Halo ring flat on the floor
 *   - Growing pre-mRNA TubeGeometry (rebuilt every 3 frames, max POLII_MRNA_MAX_LEN)
 *   - Gold cap sphere at the growing tip
 *   - PointLight (pulsing)
 *
 * States:  'active' → (cap snatched) → 'cooldown' (10s) → 'active'
 *          'suppressed'  (Chunk 8 antiviral)
 *
 * API:
 *   P4PolIISites.init(scene)
 *   P4PolIISites.tick(dt)
 *   P4PolIISites.destroy()
 *   P4PolIISites.getSites()            → site[]
 *   P4PolIISites.getByIndex(i)         → site | null
 *   P4PolIISites.setClickHandler(fn)   fn(siteIdx, worldPos)
 *   P4PolIISites.startCooldown(idx)    — called by Chunk 4 after cap snatch
 *
 * Site object shape:
 *   { idx, x, z, state, cooldownT, mrnaDist,
 *     group, bodyMesh, strandMesh, capMesh, light,
 *     mrnaCurveOX, mrnaCurveOZ }
 */

/* global THREE, P4_CFG, P4Interaction */

const P4PolIISites = (() => {

  let _scene  = null;
  let _sites  = [];
  let _lights = [];
  let _geos   = [];
  let _mats   = [];
  let _t      = 0;
  let _frame  = 0;

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // ── Build one site ────────────────────────────────────────────────────────

  function _buildSite(idx) {
    const cfg = P4_CFG.POLII_POSITIONS[idx];
    const x = cfg.x, z = cfg.z;

    const group = new THREE.Group();
    group.position.set(x, 0, z);
    _scene.add(group);

    // ── Halo ring on floor ────────────────────────────────────────────────
    const haloGeo = _geo(new THREE.RingGeometry(0.45, 0.60, 24));
    const haloMat = _mat(new THREE.MeshBasicMaterial({
      color:       P4_CFG.COL_POLII,
      transparent: true,
      opacity:     0.22,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    }));
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;
    group.add(halo);

    // ── Main body sphere ──────────────────────────────────────────────────
    const bodyGeo = _geo(new THREE.SphereGeometry(0.22, 9, 7));
    const bodyMat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_POLII,
      emissive:          new THREE.Color(P4_CFG.COL_POLII),
      emissiveIntensity: 0.55,
    }));
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.set(0, 0.22, 0);
    bodyMesh.name = `polii_body_${idx}`;
    group.add(bodyMesh);

    // ── Three small subunit spheres ───────────────────────────────────────
    const subGeo = _geo(new THREE.SphereGeometry(0.09, 6, 5));
    const subMat = _mat(new THREE.MeshLambertMaterial({
      color:             0xffeeaa,
      emissive:          new THREE.Color(0xffeeaa),
      emissiveIntensity: 0.35,
    }));
    const subOffsets = [
      { x: 0.28, y: 0.18, z:  0    },
      { x:-0.20, y: 0.14, z:  0.20 },
      { x: 0.08, y: 0.30, z: -0.22 },
    ];
    for (const o of subOffsets) {
      const sub = new THREE.Mesh(subGeo, subMat);
      sub.position.set(o.x, o.y, o.z);
      group.add(sub);
    }

    // ── Pre-mRNA strand (TubeGeometry, rebuilt in tick) ───────────────────
    // Placeholder geometry replaced on first tick
    const strandMat = _mat(new THREE.MeshLambertMaterial({
      color:       P4_CFG.COL_HOST_MRNA,
      transparent: true,
      opacity:     0.70,
    }));
    const strandMesh = new THREE.Mesh(new THREE.BufferGeometry(), strandMat);
    strandMesh.name = `polii_strand_${idx}`;
    _scene.add(strandMesh);   // world-space mesh (not in group) for easy positioning

    // ── Cap sphere at tip ─────────────────────────────────────────────────
    const capGeo = _geo(new THREE.SphereGeometry(P4_CFG.MRNA_CAP_RADIUS, 8, 6));
    const capMat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_MRNA_CAP,
      emissive:          new THREE.Color(P4_CFG.COL_MRNA_CAP),
      emissiveIntensity: 0.60,
    }));
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.visible = false;
    capMesh.name = `polii_cap_${idx}`;
    _scene.add(capMesh);

    // ── PointLight ────────────────────────────────────────────────────────
    const light = new THREE.PointLight(
      P4_CFG.COL_POLII,
      P4_CFG.POLII_LIGHT_INTENSITY,
      P4_CFG.POLII_LIGHT_DIST
    );
    light.position.set(x, 1.5, z);
    _scene.add(light);
    _lights.push(light);

    // ── Curve offset (deterministic golden-ratio spread) ─────────────────
    const oAngle = (idx * 0.618033 * Math.PI * 2) % (Math.PI * 2);
    const oMag   = 0.55;

    const site = {
      idx, x, z,
      state:      'active',
      cooldownT:  0,
      mrnaDist:   0,
      group, bodyMesh, strandMesh, capMesh, bodyMat, light, haloMat,
      mrnaCurveOX: Math.cos(oAngle) * oMag,
      mrnaCurveOZ: Math.sin(oAngle) * oMag,
    };

    // ── Hover / click registration (body mesh) ────────────────────────────
    const _tooltipHTML = () => {
      if (site.state === 'cooldown') {
        return `<strong>RNA Pol II Site ${idx + 1}</strong><br>`
             + `<span style="color:#ff9966;font-size:0.68rem">`
             + `Cooldown: ${Math.ceil(site.cooldownT).toFixed(0)} s</span>`;
      }
      const readyMsg = site.mrnaDist >= P4_CFG.POLII_MRNA_MAX_LEN * 0.9
        ? '<span style="color:#ffdd44">Pre-mRNA ready — send RdRp complex</span>'
        : '<span style="color:#aaaaaa">Active transcription in progress</span>';
      return `<strong>RNA Pol II Site ${idx + 1}</strong><br>`
           + `<span style="font-size:0.68rem">${readyMsg}</span>`;
    };

    P4Interaction.register(bodyMesh, {
      onHover:     (m, sx, sy) => { bodyMat.emissiveIntensity = 0.90; P4Interaction.showTooltip(_tooltipHTML(), sx, sy); },
      onHoverMove: (m, sx, sy) => P4Interaction.showTooltip(_tooltipHTML(), sx, sy),
      onHoverEnd:  ()          => { bodyMat.emissiveIntensity = 0.55; P4Interaction.hideTooltip(); },
      // onClick set by setClickHandler
    });

    return site;
  }

  // ── Pre-mRNA curve helpers ────────────────────────────────────────────────

  function _buildCurve(site) {
    const len = site.mrnaDist;
    const frac = len / P4_CFG.POLII_MRNA_MAX_LEN;
    const ox = site.mrnaCurveOX * frac;
    const oz = site.mrnaCurveOZ * frac;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(site.x,               0.42,            site.z),
      new THREE.Vector3(site.x + ox * 0.35,   0.42 + len * 0.45, site.z + oz * 0.35),
      new THREE.Vector3(site.x + ox,          0.42 + len,      site.z + oz),
    ]);
  }

  function _rebuildStrand(site) {
    if (site.mrnaDist < 0.05) {
      site.strandMesh.visible = false;
      site.capMesh.visible    = false;
      return;
    }
    const curve  = _buildCurve(site);
    const newGeo = new THREE.TubeGeometry(curve, 6, 0.028, 4, false);
    if (site.strandMesh.geometry) site.strandMesh.geometry.dispose();
    site.strandMesh.geometry = newGeo;
    site.strandMesh.visible  = true;

    // Cap position = end of curve
    const tip = curve.getPoint(1);
    site.capMesh.position.copy(tip);
    site.capMesh.visible = true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
    for (let i = 0; i < P4_CFG.POLII_POSITIONS.length; i++) {
      _sites.push(_buildSite(i));
    }
  }

  function tick(dt) {
    _t    += dt;
    _frame++;
    const rebuild = (_frame % 3 === 0);

    for (const site of _sites) {
      if (site.state === 'active') {
        // Grow pre-mRNA
        site.mrnaDist = Math.min(
          site.mrnaDist + P4_CFG.POLII_MRNA_GROW_RATE * dt,
          P4_CFG.POLII_MRNA_MAX_LEN
        );
        if (rebuild) _rebuildStrand(site);

        // Pulsing light
        site.light.intensity = P4_CFG.POLII_LIGHT_INTENSITY
          * (0.80 + 0.20 * Math.sin(_t * 2.2 + site.idx * 0.6));

        // Halo pulse
        site.haloMat.opacity = 0.18 + 0.10 * Math.sin(_t * 1.8 + site.idx * 0.9);

      } else if (site.state === 'cooldown') {
        site.cooldownT -= dt;
        if (site.cooldownT <= 0) {
          site.state    = 'active';
          site.mrnaDist = 0;
        }
        site.light.intensity = 0.08;
        site.haloMat.opacity = 0.06;

      } else {
        // suppressed
        site.light.intensity = 0.03;
        site.haloMat.opacity = 0.03;
      }
    }
  }

  function destroy() {
    for (const site of _sites) {
      P4Interaction.unregister(site.bodyMesh);
      if (site.group.parent)      site.group.parent.remove(site.group);
      if (site.strandMesh.parent) site.strandMesh.parent.remove(site.strandMesh);
      if (site.capMesh.parent)    site.capMesh.parent.remove(site.capMesh);
      if (site.strandMesh.geometry) site.strandMesh.geometry.dispose();
    }
    for (const l of _lights) {
      if (l.parent) l.parent.remove(l);
    }
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _sites  = [];
    _lights = [];
    _geos   = [];
    _mats   = [];
    _scene  = null;
  }

  function getSites()    { return _sites; }
  function getByIndex(i) { return _sites[i] || null; }

  /** Call after cap-snatch to reset site.  fn called by Chunk 4. */
  function startCooldown(idx) {
    const site = _sites[idx];
    if (!site) return;
    site.state        = 'cooldown';
    site.cooldownT    = P4_CFG.POLII_COOLDOWN_S;
    site.mrnaDist     = 0;
    site.strandMesh.visible = false;
    site.capMesh.visible    = false;
  }

  /** Add onClick to every site body mesh. fn(siteIdx, worldPos) */
  function setClickHandler(fn) {
    for (const site of _sites) {
      // Re-register the body mesh with the same hover callbacks plus onClick.
      const bMat = site.bodyMat;
      const _tooltipHTML = () => {
        if (site.state === 'cooldown') {
          return `<strong>RNA Pol II Site ${site.idx + 1}</strong><br>`
               + `<span style="color:#ff9966;font-size:0.68rem">`
               + `Cooldown: ${Math.ceil(site.cooldownT)} s</span>`;
        }
        const readyMsg = site.mrnaDist >= P4_CFG.POLII_MRNA_MAX_LEN * 0.9
          ? '<span style="color:#ffdd44">Pre-mRNA ready — send RdRp complex</span>'
          : '<span style="color:#aaaaaa">Active transcription in progress</span>';
        return `<strong>RNA Pol II Site ${site.idx + 1}</strong><br>`
             + `<span style="font-size:0.68rem">${readyMsg}</span>`;
      };
      // Re-register with onClick added
      P4Interaction.register(site.bodyMesh, {
        onHover:     (m, sx, sy) => { bMat.emissiveIntensity = 0.90; P4Interaction.showTooltip(_tooltipHTML(), sx, sy); },
        onHoverMove: (m, sx, sy) => P4Interaction.showTooltip(_tooltipHTML(), sx, sy),
        onHoverEnd:  ()          => { bMat.emissiveIntensity = 0.55; P4Interaction.hideTooltip(); },
        onClick:     (m, wp)     => fn(site.idx, wp),
      });
    }
  }

  return { init, tick, destroy, getSites, getByIndex, setClickHandler, startCooldown };

})();
