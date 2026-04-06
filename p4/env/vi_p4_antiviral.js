/**
 * vi_p4_antiviral.js — Phase 4 antiviral escalation system (Chunk 8).
 *
 * ISG timer runs 0→300 s (ANTIVIRAL_DURATION_S).  At each threshold:
 *
 *   25%  (75s)  : spawn 2 IFIT red cubes (random-walk 1 u/s, seize mRNAs)
 *   50% (150s)  : spawn 2-3 OAS orange rings near templates (attack every 5s)
 *   75% (225s)  : suppress 2 Pol II sites; +2 IFIT +2 OAS; expand 2 hetero bsrs
 *   90% (270s)  : remaining Pol II sites flicker 3s/3s; OAS begin patrolling; red HUD border
 *  100% (300s)  : onFail('antiviral')
 *
 * Template health (0-100):
 *   OAS attacks → -10;  3+ concurrent polys on same template → -2/s
 *   At 0: template visually destroyed; all destroyed → onFail('all_templates_destroyed')
 *
 * Polymerase durability (0-100, stored as poly.durability):
 *   OAS attacks → -15
 *   At 0: poly visually disabled; all at 0 → onFail('all_polys_destroyed')
 *
 * NS1 domes: IFITs inside are frozen; OAS inside are disabled; ISG timer pauses.
 *
 * API:
 *   P4Antiviral.init(scene, onFail)
 *   P4Antiviral.tick(dt)
 *   P4Antiviral.destroy()
 *   P4Antiviral.getISGFraction()   → 0-1  (for HUD)
 *
 * Educational triggers:
 *   IFIT_ENCOUNTER, OAS_ATTACK, POLII_SHUTDOWN
 */

/* global THREE, P4_CFG,
          P4MRNAProduct, P4Templates, P4Polymerases, P4PolIISites,
          P4NS1Deployment */

const P4Antiviral = (() => {

  let _scene   = null;
  let _onFail  = null;
  let _isgT    = 0;
  let _failed  = false;

  let _ifits    = [];   // IFIT agent objects
  let _oasRings = [];   // OAS ring objects
  let _oasAttackT   = 0;   // countdown to next attack cycle
  let _polyCrowdT   = 0;   // countdown for poly-overcrowding penalty tick

  // Threshold flags
  let _thresh25 = false, _thresh50 = false, _thresh75 = false, _thresh90 = false;

  // Pol II flicker state
  let _flickerSites = [];   // site objects flagged for flicker
  let _flickerT     = 0;

  // Red border element (90% HUD)
  let _redBorderEl = null;

  let _geos = [];
  let _mats = [];
  let _geo = g => { _geos.push(g); return g; };
  let _mat = m => { _mats.push(m); return m; };

  // Shared IFIT/OAS geometries
  let _ifitGeo = null;
  let _oasGeo  = null;

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _randomNucleusPos(maxR) {
    const r   = (5 + Math.random() * (maxR - 5));
    const ang = Math.random() * Math.PI * 2;
    return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
  }

  function _isgFrac() { return Math.min(1, _isgT / P4_CFG.ANTIVIRAL_DURATION_S); }

  // ── HUD update ────────────────────────────────────────────────────────────

  function _updateHUD() {
    const pct  = Math.min(100, Math.round(_isgFrac() * 100));
    const fill = document.getElementById('p4AntiviralFill');
    const text = document.getElementById('p4AntiviralPct');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
  }

  function _showRedBorder() {
    if (_redBorderEl) return;
    _redBorderEl = document.createElement('div');
    _redBorderEl.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0',
      'pointer-events:none;z-index:299',
      'border:3px solid rgba(255,0,0,0)',
      'box-shadow:inset 0 0 40px rgba(255,0,0,0.18)',
    ].join(';');
    document.body.appendChild(_redBorderEl);
    // Animate border in
    requestAnimationFrame(() => {
      if (_redBorderEl) _redBorderEl.style.border = '3px solid rgba(255,0,0,0.45)';
    });
  }

  // ── Template health ───────────────────────────────────────────────────────

  function _updateTemplateHealthBar(tmpl) {
    const frac = Math.max(0, tmpl.health / 100);
    tmpl.hbFg.scale.x = Math.max(0.001, frac);
    tmpl.hbFg.position.x = -tmpl.hbFgHalfW * (1 - frac);
    if (tmpl.health > 60)       tmpl.hbFgMat.color.set(0x44ee44);
    else if (tmpl.health > 30)  tmpl.hbFgMat.color.set(0xeeaa22);
    else                        tmpl.hbFgMat.color.set(0xee3333);
  }

  function _damageTemplate(tmpl, amount) {
    if (!tmpl || tmpl.health <= 0) return;
    tmpl.health = Math.max(0, tmpl.health - amount);
    _updateTemplateHealthBar(tmpl);
    if (tmpl.health <= 0) _destroyTemplate(tmpl);
  }

  function _destroyTemplate(tmpl) {
    tmpl.strandMat.color.set(0x331111);
    tmpl.strandMat.emissive.set(0x110000);
    tmpl.strandMat.emissiveIntensity = 0.05;

    const survivors = P4Templates.getAll().filter(t => t.health > 0);
    if (survivors.length === 0) _fail('all_templates_destroyed');
  }

  // ── Polymerase durability ─────────────────────────────────────────────────

  function _damagePolymerase(poly, amount) {
    if (!poly || poly.destroyed) return;
    if (poly.durability === undefined) poly.durability = 100;
    poly.durability = Math.max(0, poly.durability - amount);

    // Darken lobes proportionally
    const intense = Math.max(0.04, 0.22 * (poly.durability / 100));
    for (const m of poly.lobeMats) m.emissiveIntensity = intense;

    if (poly.durability <= 0) _destroyPolymerase(poly);
  }

  function _destroyPolymerase(poly) {
    poly.destroyed = true;
    for (const m of poly.lobeMats) {
      m.emissive.set(0x220000);
      m.emissiveIntensity = 0.04;
    }
    if (poly.state === 'busy') poly.state = 'idle';

    const all = P4Polymerases.getAll();
    if (all.length > 0 && all.every(p => p.destroyed)) {
      _fail('all_polys_destroyed');
    }
  }

  // ── Fail ──────────────────────────────────────────────────────────────────

  function _fail(reason) {
    if (_failed) return;
    _failed = true;
    if (_onFail) _onFail(reason);
  }

  // ── IFIT agents ───────────────────────────────────────────────────────────

  function _spawnIFIT(x, z) {
    if (!_ifitGeo) _ifitGeo = _geo(new THREE.BoxGeometry(0.26, 0.26, 0.26));
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:             P4_CFG.COL_ISG,
      emissive:          new THREE.Color(P4_CFG.COL_ISG),
      emissiveIntensity: 0.55,
    }));
    const mesh = new THREE.Mesh(_ifitGeo, mat);
    mesh.position.set(x, 0.26, z);
    _scene.add(mesh);

    const light = new THREE.PointLight(P4_CFG.COL_ISG, 0.25, 4.5);
    light.position.set(x, 0.5, z);
    _scene.add(light);

    const ang = Math.random() * Math.PI * 2;
    const ifit = {
      mesh, mat, light,
      vx: Math.cos(ang) * P4_CFG.IFIT_PATROL_SPEED,
      vz: Math.sin(ang) * P4_CFG.IFIT_PATROL_SPEED,
      dirT: 2.0 + Math.random() * 2.0,
      idx: _ifits.length,
    };
    _ifits.push(ifit);
    return ifit;
  }

  function _tickIFIT(ifit, dt) {
    const x = ifit.mesh.position.x, z = ifit.mesh.position.z;

    // Frozen inside NS1 dome
    if (P4NS1Deployment.isInDome(x, z)) return;

    // Direction change
    ifit.dirT -= dt;
    if (ifit.dirT <= 0) {
      const ang = Math.random() * Math.PI * 2;
      ifit.vx   = Math.cos(ang) * P4_CFG.IFIT_PATROL_SPEED;
      ifit.vz   = Math.sin(ang) * P4_CFG.IFIT_PATROL_SPEED;
      ifit.dirT = 2.0 + Math.random() * 2.0;
    }

    let nx = x + ifit.vx * dt;
    let nz = z + ifit.vz * dt;

    // Nuclear boundary reflection
    const WALL = 24;
    if (Math.hypot(nx, nz) > WALL) {
      const bounce = Math.atan2(nz, nx) + Math.PI + (Math.random() - 0.5) * 0.8;
      ifit.vx = Math.cos(bounce) * P4_CFG.IFIT_PATROL_SPEED;
      ifit.vz = Math.sin(bounce) * P4_CFG.IFIT_PATROL_SPEED;
      nx = x + ifit.vx * dt;
      nz = z + ifit.vz * dt;
    }

    ifit.mesh.position.set(nx, 0.26, nz);
    ifit.light.position.set(nx, 0.6, nz);
    // Rotate for menace
    ifit.mesh.rotation.y += dt * 1.2;
    ifit.mesh.rotation.x += dt * 0.7;

    // Seize mRNAs on contact
    const mrnas = P4MRNAProduct.getAll().slice(); // copy to safely iterate
    for (const mrna of mrnas) {
      if (mrna.state === 'exporting') continue;
      const dx = mrna.group.position.x - nx;
      const dz = mrna.group.position.z - nz;
      if (Math.hypot(dx, dz) < 0.9) {
        _dispatchEdu('IFIT_ENCOUNTER', { ifitIdx: ifit.idx });
        mrna.ifit = true;
        P4MRNAProduct.remove(mrna);
      }
    }
  }

  function _tickIFITs(dt) {
    for (const ifit of _ifits) _tickIFIT(ifit, dt);
  }

  // ── OAS rings ─────────────────────────────────────────────────────────────

  function _spawnOAS(x, z) {
    if (!_oasGeo) _oasGeo = _geo(new THREE.TorusGeometry(0.50, 0.08, 7, 22));
    const mat = _mat(new THREE.MeshLambertMaterial({
      color:             0xff8833,
      emissive:          new THREE.Color(0xff8833),
      emissiveIntensity: 0.35,
    }));
    const mesh = new THREE.Mesh(_oasGeo, mat);
    mesh.position.set(x, 0.45, z);
    mesh.rotation.x = Math.PI * 0.5;  // lay flat
    _scene.add(mesh);

    const oas = {
      mesh, mat,
      vx: 0, vz: 0,
      patrolling: false,
      dirT: 0,
      idx: _oasRings.length,
    };
    _oasRings.push(oas);
    return oas;
  }

  function _startOASPatrol() {
    for (const oas of _oasRings) {
      oas.patrolling = true;
      const ang = Math.random() * Math.PI * 2;
      oas.vx   = Math.cos(ang) * P4_CFG.OAS_ATTACK_RANGE * 0.1;
      oas.vz   = Math.sin(ang) * P4_CFG.OAS_ATTACK_RANGE * 0.1;
      oas.dirT = 3.0 + Math.random() * 2.0;
    }
  }

  function _tickOAS(dt) {
    for (const oas of _oasRings) {
      const x = oas.mesh.position.x;
      const z = oas.mesh.position.z;

      // Rotate ring
      oas.mesh.rotation.z += dt * 1.4;

      if (!oas.patrolling) continue;

      // Direction change
      oas.dirT -= dt;
      if (oas.dirT <= 0) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.5;
        oas.vx   = Math.cos(ang) * spd;
        oas.vz   = Math.sin(ang) * spd;
        oas.dirT = 3.0 + Math.random() * 2.0;
      }

      const nx = x + oas.vx * dt;
      const nz = z + oas.vz * dt;
      if (Math.hypot(nx, nz) < 26) {
        oas.mesh.position.set(nx, 0.45, nz);
      } else {
        // Bounce
        const a = Math.atan2(nz, nx) + Math.PI;
        oas.vx = Math.cos(a) * 0.5;
        oas.vz = Math.sin(a) * 0.5;
      }
    }
  }

  function _tickOASAttacks(dt) {
    _oasAttackT -= dt;
    if (_oasAttackT > 0) return;
    _oasAttackT = P4_CFG.OAS_ATTACK_PERIOD_S;

    for (const oas of _oasRings) {
      const ox = oas.mesh.position.x;
      const oz = oas.mesh.position.z;

      // Disabled inside NS1 dome
      if (P4NS1Deployment.isInDome(ox, oz)) continue;

      // Find nearest non-destroyed template within attack range
      let nearTmpl = null, nearDist = Infinity;
      for (const tmpl of P4Templates.getAll()) {
        if (tmpl.health <= 0) continue;
        const d = Math.hypot(tmpl.x - ox, tmpl.z - oz);
        if (d < P4_CFG.OAS_ATTACK_RANGE && d < nearDist) {
          nearDist  = d;
          nearTmpl  = tmpl;
        }
      }
      if (!nearTmpl) continue;

      // 30% chance to attack
      if (Math.random() > P4_CFG.OAS_ATTACK_CHANCE) continue;

      // Attack template
      _damageTemplate(nearTmpl, 10);

      // Attack nearest poly within range
      let nearPoly = null, nearPolyDist = Infinity;
      for (const poly of P4Polymerases.getAll()) {
        if (poly.destroyed) continue;
        const d = Math.hypot(poly.group.position.x - ox, poly.group.position.z - oz);
        if (d < P4_CFG.OAS_ATTACK_RANGE && d < nearPolyDist) {
          nearPolyDist = d;
          nearPoly     = poly;
        }
      }
      if (nearPoly) _damagePolymerase(nearPoly, 15);

      // Visual flash on OAS
      oas.mat.emissiveIntensity = 1.2;
      const oasMat = oas.mat;
      setTimeout(() => { if (oasMat) oasMat.emissiveIntensity = 0.35; }, 280);

      _dispatchEdu('OAS_ATTACK', {
        oasIdx:      oas.idx,
        templateIdx: nearTmpl.idx,
        gene:        P4_CFG.SEGMENT_GENES[nearTmpl.idx],
      });
    }
  }

  // ── 3+ poly overcrowding penalty ─────────────────────────────────────────

  function _tickMultiPolyPenalty(dt) {
    // Check every 0.25s for efficiency
    _polyCrowdT -= dt;
    if (_polyCrowdT > 0) return;
    _polyCrowdT = 0.25;

    for (const tmpl of P4Templates.getAll()) {
      if (tmpl.health <= 0) continue;
      const crowded = P4Polymerases.getAll().filter(p => {
        if (p.state !== 'busy' || p.destroyed) return false;
        return Math.hypot(p.group.position.x - tmpl.x, p.group.position.z - tmpl.z) < 2.2;
      }).length;
      if (crowded >= 3) {
        _damageTemplate(tmpl, 2 * 0.25);   // 2/s × 0.25s interval
      }
    }
  }

  // ── Pol II suppression ────────────────────────────────────────────────────

  function _suppressPolIISites(count) {
    const sites   = P4PolIISites.getSites();
    const active  = sites.filter(s => s.state !== 'suppressed');
    const toShut  = active.slice(0, count);
    for (const site of toShut) {
      site.state     = 'suppressed';
      site.mrnaDist  = 0;
      site.strandMesh.visible = false;
      site.capMesh.visible    = false;
    }
    if (toShut.length > 0) {
      _dispatchEdu('POLII_SHUTDOWN', { count: toShut.length });
    }

    // Remaining non-suppressed sites will flicker at 90%
    _flickerSites = sites.filter(s => s.state !== 'suppressed');
  }

  // ── Threshold event handlers ──────────────────────────────────────────────

  function _onThresh25() {
    const p1 = _randomNucleusPos(18);
    const p2 = _randomNucleusPos(18);
    _spawnIFIT(p1.x, p1.z);
    _spawnIFIT(p2.x, p2.z);
  }

  function _onThresh50() {
    // Spawn 2-3 OAS rings near template positions
    const tmpls = P4Templates.getAll().filter(t => t.health > 0);
    const count = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < Math.min(count, tmpls.length); i++) {
      const tmpl  = tmpls[Math.floor(Math.random() * tmpls.length)];
      const ang   = Math.random() * Math.PI * 2;
      const r     = 3.0 + Math.random() * 2.5;
      _spawnOAS(tmpl.x + Math.cos(ang) * r, tmpl.z + Math.sin(ang) * r);
    }
    // Reset attack cycle so first attack comes promptly
    _oasAttackT = P4_CFG.OAS_ATTACK_PERIOD_S;
  }

  function _onThresh75() {
    // Shut down 2 Pol II sites
    _suppressPolIISites(2);

    // Spawn +2 IFIT +2 OAS
    const i1 = _randomNucleusPos(20), i2 = _randomNucleusPos(20);
    _spawnIFIT(i1.x, i1.z);
    _spawnIFIT(i2.x, i2.z);

    const tmpls = P4Templates.getAll().filter(t => t.health > 0);
    for (let i = 0; i < 2; i++) {
      const tmpl = tmpls[Math.floor(Math.random() * tmpls.length)] || { x: 0, z: 0 };
      const ang  = Math.random() * Math.PI * 2;
      const r    = 3.0 + Math.random() * 2.0;
      _spawnOAS(tmpl.x + Math.cos(ang) * r, tmpl.z + Math.sin(ang) * r);
    }

    // Expand 2 heterochromatin bounding radii ×1.3
    const blobs = P4_CFG.HETERO_BLOBS;
    const picks = [
      Math.floor(Math.random() * blobs.length),
      Math.floor(Math.random() * blobs.length),
    ];
    for (const i of picks) blobs[i].bsr *= 1.3;
  }

  function _onThresh90() {
    _startOASPatrol();
    _showRedBorder();
    // _flickerSites set during _suppressPolIISites (or init all active sites if 75 wasn't hit)
    if (_flickerSites.length === 0) {
      _flickerSites = P4PolIISites.getSites().filter(s => s.state !== 'suppressed');
    }
    _flickerT = 0;
  }

  // ── Pol II flicker (90%) ──────────────────────────────────────────────────

  function _tickFlicker(dt) {
    _flickerT += dt;
    // 3s on / 3s off → 6s period
    const isOn = Math.floor(_flickerT / 3.0) % 2 === 0;
    for (const site of _flickerSites) {
      if (site.state === 'suppressed') continue;
      site.group.visible = isOn;
      if (!isOn) site.light.intensity = 0;
      // When on: polii.js tick will restore light intensity next frame
    }
  }

  // ── Threshold checks ──────────────────────────────────────────────────────

  function _checkThresholds() {
    const f = _isgFrac();
    if (!_thresh25 && f >= 0.25) { _thresh25 = true; _onThresh25(); }
    if (!_thresh50 && f >= 0.50) { _thresh50 = true; _onThresh50(); }
    if (!_thresh75 && f >= 0.75) { _thresh75 = true; _onThresh75(); }
    if (!_thresh90 && f >= 0.90) { _thresh90 = true; _onThresh90(); }
    if (f >= 1.00 && !_failed)   { _fail('antiviral'); }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, onFail) {
    _scene   = scene;
    _onFail  = onFail;
    _isgT    = 0;
    _failed  = false;
    _thresh25 = _thresh50 = _thresh75 = _thresh90 = false;
    _oasAttackT = P4_CFG.OAS_ATTACK_PERIOD_S;
    _polyCrowdT = 0.25;
    _flickerSites = [];
    _flickerT = 0;
  }

  function tick(dt) {
    if (_failed) return;

    // ISG timer: pause when any NS1 dome is active
    if (!P4NS1Deployment.isAnyDomeActive()) {
      _isgT += dt;
    }

    _updateHUD();
    _checkThresholds();
    _tickIFITs(dt);
    _tickOAS(dt);

    if (_thresh50) _tickOASAttacks(dt);
    if (_thresh90)  _tickFlicker(dt);

    _tickMultiPolyPenalty(dt);
  }

  function destroy() {
    // Remove IFIT meshes + lights
    for (const ifit of _ifits) {
      if (ifit.mesh.parent)  ifit.mesh.parent.remove(ifit.mesh);
      if (ifit.light.parent) ifit.light.parent.remove(ifit.light);
    }
    _ifits = [];

    // Remove OAS meshes
    for (const oas of _oasRings) {
      if (oas.mesh.parent) oas.mesh.parent.remove(oas.mesh);
    }
    _oasRings = [];

    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos    = [];
    _mats    = [];
    _ifitGeo = null;
    _oasGeo  = null;

    if (_redBorderEl && _redBorderEl.parentNode)
      _redBorderEl.parentNode.removeChild(_redBorderEl);
    _redBorderEl = null;

    // Restore Pol II site visibility (in case flickering was active)
    if (_thresh90) {
      for (const site of _flickerSites) site.group.visible = true;
    }
    _flickerSites = [];

    _scene   = null;
    _onFail  = null;
    _failed  = false;
  }

  function getISGFraction() { return _isgFrac(); }
  function getIFITs()       { return _ifits; }
  function getOASRings()    { return _oasRings; }

  return { init, tick, destroy, getISGFraction, getIFITs, getOASRings };

})();
