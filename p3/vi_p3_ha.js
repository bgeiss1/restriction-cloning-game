// vi_p3_ha.js — P3HASystem: HA trimer activation, aim targeting, fusion site
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js, vi_p3_surface.js
'use strict';

class P3HASystem {

  // trimers — array from P3ViralSurface.getHATrimers()
  // cfg     — P3_CFG reference
  constructor(trimers, cfg) {
    this._trimers = trimers;
    this._cfg     = cfg;
    this._t       = 0;

    // ── Public state (read by P3Escape each frame) ────────────────────────────
    this.aimedCount       = 0;
    this.fusionSiteValid  = false;
    this.fusionSiteCenter = new THREE.Vector3(0, cfg.ENDO_RADIUS, 0);
    this.fusionSiteRadius = 0;

    // One-shot edu flag
    this._eduAimFired = false;

    // Per-trimer extended state (not stored on the trimer objects themselves
    // to avoid coupling — kept in a parallel Map keyed by trimer index)
    this._extState = new Map();
    this._trimers.forEach(t => {
      this._extState.set(t.index, {
        baseState: 'native',   // pH-driven activation state
        aimTarget: null,       // THREE.Vector3 on endosome wall when aimed
      });
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called every frame from P3Escape._updateSubSystems.
  update(dt, pH) {
    this._t += dt;

    const newBase = this._stateForPH(pH);

    this._trimers.forEach(t => {
      const ext = this._extState.get(t.index);

      // Sync base state; don't override 'aimed'
      if (ext.baseState !== newBase) {
        ext.baseState = newBase;
        if (t.state !== 'aimed') {
          t.state = newBase;
          this._applyStateColor(t);
        }
      }
      // If not aimed, keep state tracking
      if (t.state !== 'aimed' && t.state !== ext.baseState) {
        t.state = ext.baseState;
        this._applyStateColor(t);
      }

      // Animate heads and fusion peptides toward state targets
      this._animateTrimer(t, dt);
    });

    this._updateFusionSite();
    this.aimedCount = this._trimers.filter(t => t.state === 'aimed').length;
  }

  // Toggle aim on a trimer ref. Called from P3Escape._onKeyDown (KeyF).
  // Only activated/fusion-ready trimers can be aimed.
  aimTrimer(ref) {
    if (!ref) return;
    if (ref.state === 'aimed') {
      this._unAimTrimer(ref);
    } else {
      const ext = this._extState.get(ref.index);
      const base = ext ? ext.baseState : ref.state;
      if (base !== 'activated' && base !== 'fusion-ready') return;
      this._doAimTrimer(ref);
    }
  }

  // Returns flat snapshot array for the HUD.
  getTrimerStates() {
    return this._trimers.map(t => ({
      index: t.index,
      state: t.state,
      aimed: t.state === 'aimed',
    }));
  }

  // Returns all currently aimed trimer refs (used by fusion system).
  getAimedTrimers() {
    return this._trimers.filter(t => t.state === 'aimed');
  }

  destroy() {
    // Remove laser lines from scene
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    this._trimers.forEach(t => {
      if (t.laserLine) {
        if (scene) scene.remove(t.laserLine);
        t.laserLine.geometry.dispose();
        t.laserLine.material.dispose();
        t.laserLine = null;
      }
    });
  }

  // ── pH activation state machine ──────────────────────────────────────────────

  _stateForPH(pH) {
    const cfg = this._cfg;
    if      (pH > cfg.HA_PREACT_PH) return 'native';
    else if (pH > cfg.HA_TRANS_PH)  return 'pre-activated';
    else if (pH > cfg.HA_ACT_PH)    return 'transition';
    else if (pH > cfg.HA_READY_PH)  return 'activated';
    else                            return 'fusion-ready';
  }

  // ── Per-trimer animation ─────────────────────────────────────────────────────

  _animateTrimer(t, dt) {
    const vis = t.state;   // 'aimed' overrides base state visually
    const tp  = this._targetParams(vis);
    const lf  = 1 - Math.exp(-3.5 * dt);  // exponential lerp, ~3.5/s

    // Head positions: spread outward as activation increases
    t.heads.forEach((head, j) => {
      const a = (j / 3) * Math.PI * 2;
      head.position.x += (Math.cos(a) * tp.r - head.position.x) * lf;
      head.position.y += (tp.y         - head.position.y)        * lf;
      head.position.z += (Math.sin(a) * tp.r - head.position.z) * lf;
    });

    // Fusion peptide opacity
    t.pepMats.forEach(m => {
      m.opacity += (tp.pepOpacity - m.opacity) * lf;
    });

    // Extra glow pulse when aimed
    if (t.state === 'aimed') {
      const pulse = 0.55 + Math.sin(this._t * 3.8 + t.index * 0.7) * 0.30;
      t.headMats.forEach(m => { m.emissiveIntensity = pulse * 0.8; });
      t.stemMat.emissiveIntensity = pulse * 0.5;
    }
  }

  // Per-state target parameters for the animation lerp.
  _targetParams(vis) {
    switch (vis) {
      case 'native':        return { r: 0.23, y: 1.10, pepOpacity: 0.00 };
      case 'pre-activated': return { r: 0.25, y: 1.07, pepOpacity: 0.00 };
      case 'transition':    return { r: 0.28, y: 1.03, pepOpacity: 0.20 };
      case 'activated':     return { r: 0.31, y: 0.99, pepOpacity: 0.55 };
      case 'fusion-ready':  return { r: 0.34, y: 0.95, pepOpacity: 1.00 };
      case 'aimed':         return { r: 0.34, y: 0.95, pepOpacity: 1.00 };
      default:              return { r: 0.23, y: 1.10, pepOpacity: 0.00 };
    }
  }

  // ── Visual state application ─────────────────────────────────────────────────

  _applyStateColor(t) {
    const hex = this._colorForState(t.state);
    t.stemMat.color.setHex(hex);
    t.headMats.forEach(m => {
      m.color.setHex(hex);
      m.emissiveIntensity = t.state === 'aimed' ? 0.55 : 0.18;
    });
    t.stemMat.emissiveIntensity = t.state === 'aimed' ? 0.45 : 0.18;
  }

  _colorForState(state) {
    const cfg = this._cfg;
    switch (state) {
      case 'native':        return cfg.COL_HA_BASE;     // 0x00cc88
      case 'pre-activated': return 0x88cc44;
      case 'transition':    return 0xccaa00;
      case 'activated':     return 0xff8844;
      case 'fusion-ready':  return 0xff4400;
      case 'aimed':         return cfg.COL_FUSION_LINE;  // 0x00ffcc
      default:              return cfg.COL_HA_BASE;
    }
  }

  // ── Aim / un-aim ─────────────────────────────────────────────────────────────

  _doAimTrimer(t) {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene  : null;
    const cam   = typeof P3Escape !== 'undefined' ? P3Escape.camera : null;
    if (!scene || !cam) return;

    // Intersect camera forward ray with the endosome sphere (inner wall)
    const aimPt = this._raySphereIntersect(cam, this._cfg.ENDO_RADIUS);
    if (!aimPt) return;

    // Store aim target in extended state
    const ext = this._extState.get(t.index);
    if (ext) ext.aimTarget = aimPt;

    t.state = 'aimed';
    this._applyStateColor(t);

    // Laser line: group world position → aim point on endosome wall
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      t.group.position.clone(),
      aimPt.clone(),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color:       this._cfg.COL_FUSION_LINE,
      transparent: true,
      opacity:     0.65,
      depthWrite:  false,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
    t.laserLine = line;

    // Fire edu fact on first aim
    if (!this._eduAimFired) {
      this._eduAimFired = true;
      if (typeof P3Escape !== 'undefined' && P3Escape.edu) {
        P3Escape.edu.trigger(P3_CFG.EDU.HA_AIM,
          'Aiming HA at the Endosome',
          'Each HA trimer you aim locks its fusion peptide toward the endosomal membrane. ' +
          'You need at least 6 trimers clustered within 4 world-units on the wall. ' +
          'Cooperative HA action drives hemifusion — a single HA cannot fuse membranes alone.');
      }
    }
  }

  _unAimTrimer(t) {
    const ext = this._extState.get(t.index);

    // Revert to pH-driven base state
    t.state = ext ? ext.baseState : 'native';
    if (ext) ext.aimTarget = null;
    this._applyStateColor(t);

    // Remove laser line
    if (t.laserLine) {
      const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
      if (scene) scene.remove(t.laserLine);
      t.laserLine.geometry.dispose();
      t.laserLine.material.dispose();
      t.laserLine = null;
    }
  }

  // ── Ray-sphere intersection (camera forward → endosome inner wall) ───────────

  _raySphereIntersect(cam, R) {
    const origin = cam.position.clone();
    const dir    = new THREE.Vector3(0, 0, -1)
                       .applyQuaternion(cam.quaternion)
                       .normalize();

    // Solve: |origin + t·dir|² = R²
    //   t² + 2·(origin·dir)·t + (|origin|²−R²) = 0
    const b    = origin.dot(dir);
    const c    = origin.lengthSq() - R * R;
    const disc = b * b - c;
    if (disc < 0) return null;

    // Positive root = far intersection (inner wall of sphere)
    const tHit = -b + Math.sqrt(disc);
    if (tHit <= 0) return null;

    return origin.clone().addScaledVector(dir, tHit);
  }

  // ── Fusion site ──────────────────────────────────────────────────────────────

  _updateFusionSite() {
    // Collect aim targets from all aimed trimers
    const aimed = [];
    this._trimers.forEach(t => {
      if (t.state !== 'aimed') return;
      const ext = this._extState.get(t.index);
      if (ext && ext.aimTarget) aimed.push(ext.aimTarget);
    });

    if (aimed.length === 0) {
      this.fusionSiteValid  = false;
      this.fusionSiteRadius = 0;
      return;
    }

    // Centroid of aim points
    const cen = new THREE.Vector3();
    aimed.forEach(p => cen.add(p));
    cen.divideScalar(aimed.length);
    this.fusionSiteCenter = cen;

    // Max spread (distance from centroid to farthest aim point)
    let maxR = 0;
    aimed.forEach(p => {
      const d = cen.distanceTo(p);
      if (d > maxR) maxR = d;
    });
    this.fusionSiteRadius = maxR;

    this.fusionSiteValid = aimed.length >= this._cfg.HA_FUSION_MIN_COUNT &&
                           maxR          <= this._cfg.HA_FUSION_SITE_RAD;
  }
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active
    && !P3Escape.ha && P3Escape.surface) {
  P3Escape.ha = new P3HASystem(P3Escape.surface.getHATrimers(), P3_CFG);
}
