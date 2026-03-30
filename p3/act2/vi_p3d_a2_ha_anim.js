'use strict';
/**
 * vi_p3d_a2_ha_anim.js
 *
 * Phase-card HA trimer 3D conformational change animation.
 * Uses a dedicated small THREE.WebGLRenderer (300×260) drawn into the
 * 2D overlay canvas via drawImage() each time _drawIntroCard() runs.
 *
 * Public API:
 *   window.A2HAAnim.render(ctx2d, destX, destY, destW, destH, phaseIdx)
 */
window.A2HAAnim = (() => {
  if (typeof THREE === 'undefined') {
    console.warn('[A2HAAnim] THREE not available');
    return { render() {} };
  }

  // ── Palette ─────────────────────────────────────────────────────────────
  const C = {
    HA_HEAD  : 0x00cc88,
    HA_STEM  : 0x4499cc,
    FP       : 0xff44aa,
    VIRAL    : 0xff6644,
    ENDO     : 0x4466dd,
    STALK    : 0xffaa33,
    BOND     : 0xffee88,
    BG       : 0x04080f,
  };

  // ── Renderer & scene ─────────────────────────────────────────────────────
  const RW = 300, RH = 260;
  let _rend   = null;
  let _scene  = null;
  let _cam    = null;
  let _ptLite = null;   // accent point light for phase C/E

  // Component mesh refs — rebuilt each phase change
  let _built      = -1;
  let _stem       = null;
  let _stemMat    = null;
  let _heads      = [];
  let _fps        = [];
  let _bonds      = [];   // THREE.Line objects, phase A only
  let _endoDisc   = null;
  let _endoRing   = null;
  let _stalk      = null;
  let _stemGlowPt = null; // PointLight following stem tip (phase C)

  const MAX_STEM_H = 8.8;
  const BASE_Y     = -3.6;  // viral membrane centre Y

  // ── Phase animation tables ───────────────────────────────────────────────
  // Each row: [fromValue, toValue]  — lerped by t (0→1, looping)
  // stemH=coil height, stemBr=emissive multiplier, hR=head radial offset,
  // hY=head Y above stem top, fpOp=FP opacity, endOp=endo membrane opacity,
  // endoY=endo Y above viral mem, stOp=stalk opacity, bondOp=bond opacity
  const PH = [
    { // A — head loosening
      stemH:[3.1,3.1], stemBr:[0.05,0.35],
      hR:[0.72,1.50],  hY:[1.65,1.40], hTilt:[0,0.22],
      fpOp:[0,0], endOp:[0,0], endoY:[10,10], stOp:[0,0], bondOp:[0.82,0.08],
    },
    { // B — stem exposure
      stemH:[3.1,3.1], stemBr:[0.35,1.20],
      hR:[1.50,2.30],  hY:[1.40,0.95], hTilt:[0.22,0.55],
      fpOp:[0,0], endOp:[0,0], endoY:[10,10], stOp:[0,0], bondOp:[0,0],
    },
    { // C — coiled-coil fires  (most dramatic)
      stemH:[3.1,8.4], stemBr:[1.20,4.50],
      hR:[2.30,2.30],  hY:[0.95,0.95], hTilt:[0.55,0.55],
      fpOp:[0,0.90], endOp:[0,0], endoY:[10,10], stOp:[0,0], bondOp:[0,0],
    },
    { // D — FP insertion
      stemH:[8.4,8.4], stemBr:[3.00,2.00],
      hR:[2.30,2.30],  hY:[0.95,0.95], hTilt:[0.55,0.55],
      fpOp:[0.90,0.90], endOp:[0,0.82], endoY:[11.5,8.0], stOp:[0,0], bondOp:[0,0],
    },
    { // E — hemifusion stalk
      stemH:[8.4,7.0], stemBr:[2.00,1.40],
      hR:[2.30,2.30],  hY:[0.95,0.95], hTilt:[0.55,0.55],
      fpOp:[0.90,0.55], endOp:[0.82,0.82], endoY:[8.0,5.8], stOp:[0,0.92], bondOp:[0,0],
    },
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function lp(a, b, t) { return a + (b - a) * t; }

  function mkMat(color, emissive, emissInt, opts) {
    return new THREE.MeshPhongMaterial(
      Object.assign({ color, emissive, emissiveIntensity: emissInt, shininess: 65 }, opts || {})
    );
  }

  // ── Init renderer ──────────────────────────────────────────────────────────
  function _init() {
    _rend = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    _rend.setSize(RW, RH);
    _rend.setPixelRatio(1);
    _rend.setClearColor(C.BG, 1);

    _scene = new THREE.Scene();
    _scene.fog = new THREE.FogExp2(C.BG, 0.032);

    _cam = new THREE.PerspectiveCamera(46, RW / RH, 0.1, 80);

    // Lights
    _scene.add(new THREE.AmbientLight(0x223355, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(5, 10, 6); _scene.add(sun);
    const fill = new THREE.DirectionalLight(0x2244aa, 0.45);
    fill.position.set(-5, 2, -4); _scene.add(fill);

    // Dynamic accent point light — follows stem tip / stalk
    _ptLite = new THREE.PointLight(0xffffff, 0, 12);
    _scene.add(_ptLite);
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  function _build(ph) {
    // Remove previous HA components (lights & fog are permanent)
    _scene.children.filter(c => c.userData.ha).forEach(c => {
      _scene.remove(c);
      if (c.geometry) c.geometry.dispose();
    });
    _heads = []; _fps = []; _bonds = [];
    _stem = _stemMat = _endoDisc = _endoRing = _stalk = null;

    function add(mesh) { mesh.userData.ha = true; _scene.add(mesh); return mesh; }
    function addM(geo, mat) { return add(new THREE.Mesh(geo, mat)); }

    // Viral membrane — main disc
    addM(
      new THREE.CylinderGeometry(2.75, 2.75, 0.22, 40),
      mkMat(C.VIRAL, C.VIRAL, 0.22, { transparent: true, opacity: 0.88 })
    ).position.set(0, BASE_Y, 0);

    // Viral membrane — outer lipid annulus
    addM(
      new THREE.CylinderGeometry(3.05, 3.05, 0.07, 40),
      mkMat(0xff9966, 0xff9966, 0.12, { transparent: true, opacity: 0.35 })
    ).position.set(0, BASE_Y + 0.13, 0);

    // HA2 stem (scaled dynamically via scale.y)
    _stemMat = mkMat(C.HA_STEM, C.HA_STEM, 0.15);
    _stem = addM(new THREE.CylinderGeometry(0.30, 0.38, MAX_STEM_H, 14), _stemMat);

    // HA1 head spheres (×3)
    for (let i = 0; i < 3; i++) {
      _heads.push(addM(
        new THREE.SphereGeometry(0.68, 18, 14),
        mkMat(C.HA_HEAD, C.HA_HEAD, 0.18)
      ));
    }

    // Fusion peptides — small cones (×3)
    for (let i = 0; i < 3; i++) {
      _fps.push(addM(
        new THREE.ConeGeometry(0.13, 0.52, 8),
        mkMat(C.FP, C.FP, 0.55, { transparent: true, opacity: 0 })
      ));
    }

    // Bond lines — phase A only (THREE.Line, connect consecutive heads)
    if (ph === 0) {
      for (let i = 0; i < 3; i++) {
        const pts = [new THREE.Vector3(), new THREE.Vector3()];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: C.BOND, transparent: true, opacity: 0.82,
        });
        const line = new THREE.Line(geo, mat);
        line.userData.ha = true;
        _scene.add(line);
        _bonds.push(line);
      }
    }

    // Endosomal membrane (hidden until phase D)
    _endoDisc = addM(
      new THREE.CylinderGeometry(2.75, 2.75, 0.22, 40),
      mkMat(C.ENDO, C.ENDO, 0.22, { transparent: true, opacity: 0 })
    );
    _endoRing = addM(
      new THREE.CylinderGeometry(3.05, 3.05, 0.07, 40),
      mkMat(0x6688ee, 0x6688ee, 0.12, { transparent: true, opacity: 0 })
    );

    // Lipid stalk (phase E)
    _stalk = addM(
      new THREE.CylinderGeometry(0.23, 0.23, 1.0, 12),
      mkMat(C.STALK, C.STALK, 0.75, { transparent: true, opacity: 0 })
    );

    _built = ph;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────
  function _update(ph, t, nowMs) {
    if (ph !== _built) _build(ph);

    const p    = PH[ph];
    const now  = nowMs * 0.001;
    const orb  = now * 0.22;   // slow head orbit

    const stemH  = lp(p.stemH[0],  p.stemH[1],  t);
    const stemBr = lp(p.stemBr[0], p.stemBr[1], t);
    const hR     = lp(p.hR[0],     p.hR[1],     t);
    const hY     = lp(p.hY[0],     p.hY[1],     t);
    const hTilt  = lp(p.hTilt[0],  p.hTilt[1],  t);
    const fpOp   = lp(p.fpOp[0],   p.fpOp[1],   t);
    const endOp  = lp(p.endOp[0],  p.endOp[1],  t);
    const endoY  = lp(p.endoY[0],  p.endoY[1],  t);
    const stOp   = lp(p.stOp[0],   p.stOp[1],   t);
    const bondOp = lp(p.bondOp[0], p.bondOp[1], t);

    const stemTopY = BASE_Y + stemH;

    // ── Stem ───────────────────────────────────────────────────────────────
    if (_stem) {
      _stem.scale.set(1, stemH / MAX_STEM_H, 1);
      _stem.position.set(0, BASE_Y + stemH / 2, 0);
      // Phase C: dramatic pulse on extension
      if (ph === 2) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 7.0);
        _stemMat.emissiveIntensity = stemBr * 0.18 * (0.65 + 0.35 * pulse);
        _ptLite.color.set(C.HA_STEM);
        _ptLite.intensity = stemBr * 0.65 * t;
        _ptLite.position.set(0, stemTopY, 0);
      } else if (ph === 4) {
        _stemMat.emissiveIntensity = stemBr * 0.12;
        _ptLite.color.set(C.STALK);
        _ptLite.intensity = stOp * 1.1 * (0.55 + 0.45 * Math.sin(now * 4.0));
        _ptLite.position.set(0, BASE_Y + lp(stemH, endoY, 0.5), 0);
      } else {
        _stemMat.emissiveIntensity = stemBr * 0.14;
        _ptLite.intensity = 0;
      }
    }

    // ── HA1 heads ──────────────────────────────────────────────────────────
    for (let i = 0; i < _heads.length; i++) {
      const ang  = (i * 2 * Math.PI / 3) + orb;
      const tiltDy = -Math.sin(hTilt) * hR * 0.28;
      _heads[i].position.set(
        Math.cos(ang) * hR,
        stemTopY + hY + tiltDy,
        Math.sin(ang) * hR
      );
    }

    // ── Bond lines (phase A) ───────────────────────────────────────────────
    for (let i = 0; i < _bonds.length; i++) {
      const j = (i + 1) % 3;
      const pa = _heads[i].position;
      const pb = _heads[j].position;
      const pos = _bonds[i].geometry.attributes.position;
      pos.setXYZ(0, pa.x, pa.y, pa.z);
      pos.setXYZ(1, pb.x, pb.y, pb.z);
      pos.needsUpdate = true;
      _bonds[i].material.opacity = bondOp;
    }

    // ── Fusion peptides ────────────────────────────────────────────────────
    for (let i = 0; i < _fps.length; i++) {
      const ang = (i * 2 * Math.PI / 3) + Math.PI / 3 + orb;
      // FP tips rise toward endo membrane as phase progresses (D/E)
      const fpRise = (ph === 3 || ph === 4) ? t * 0.55 : 0;
      _fps[i].position.set(
        Math.cos(ang) * 0.42,
        stemTopY + 0.26 + fpRise,
        Math.sin(ang) * 0.42
      );
      _fps[i].material.opacity = fpOp;
    }

    // ── Endosomal membrane ──────────────────────────────────────────────────
    if (_endoDisc) {
      _endoDisc.position.set(0, BASE_Y + endoY, 0);
      _endoDisc.material.opacity = endOp;
    }
    if (_endoRing) {
      _endoRing.position.set(0, BASE_Y + endoY + 0.14, 0);
      _endoRing.material.opacity = endOp * 0.40;
    }

    // ── Lipid stalk (phase E) ───────────────────────────────────────────────
    if (_stalk) {
      const viralTopY  = BASE_Y + stemH;
      const endoBottY  = BASE_Y + endoY;
      const gap        = Math.max(0.2, endoBottY - viralTopY);
      const stalkH     = gap * 0.55;
      const stalkMidY  = viralTopY + gap * 0.27;
      _stalk.scale.set(1, stalkH, 1);
      _stalk.position.set(0, stalkMidY, 0);
      _stalk.material.opacity = stOp;
      if (stOp > 0.05) {
        _stalk.material.emissiveIntensity = 0.75 + 0.45 * Math.sin(now * 3.8);
      }
    }
  }

  // ── Camera preset per phase ───────────────────────────────────────────────
  const CAM = [
    { r: 9.0, h: 4.0, lY: 1.8 },   // A
    { r: 9.0, h: 4.5, lY: 2.0 },   // B
    { r:10.5, h: 5.5, lY: 3.5 },   // C — wider to show full extension
    { r:11.0, h: 6.0, lY: 4.5 },   // D
    { r:11.5, h: 6.5, lY: 4.0 },   // E
  ];

  // ── Public render ──────────────────────────────────────────────────────────
  function render(ctx2d, destX, destY, destW, destH, phaseIdx) {
    if (!_rend) _init();

    const now = performance.now();

    // Looping animation: 0→1 (2.8s) → hold (0.4s) → 1→0 (2.8s) → hold (0.4s)
    const PER = 6.4, FWD = 2.8, HOLD = 0.4;
    const ph  = (now * 0.001) % PER;
    let t;
    if      (ph < FWD)                  t = ph / FWD;
    else if (ph < FWD + HOLD)           t = 1.0;
    else if (ph < FWD * 2 + HOLD)       t = 1.0 - (ph - FWD - HOLD) / FWD;
    else                                 t = 0.0;
    t = t * t * (3 - 2 * t);   // smoothstep

    // Camera slow orbit
    const camAngle = now * 0.000170;
    const cc = CAM[phaseIdx] || CAM[0];
    _cam.position.set(
      Math.sin(camAngle) * cc.r,
      cc.h,
      Math.cos(camAngle) * cc.r
    );
    _cam.lookAt(0, cc.lY, 0);

    _update(phaseIdx, t, now);
    _rend.render(_scene, _cam);

    ctx2d.save();
    ctx2d.drawImage(_rend.domElement, destX, destY, destW, destH);
    ctx2d.restore();
  }

  return { render };
})();
