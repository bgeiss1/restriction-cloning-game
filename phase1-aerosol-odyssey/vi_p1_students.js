/**
 * vi_p1_students.js — Phase 1 student character models.
 *
 * Builds simplified low-poly seated student figures.  Three special students:
 *   - Infected student (back-left): subtle red aura + tissue box on desk
 *   - Target student (front-right): subtle green glow, targeting ring, upward head tilt
 *   - Masked student (middle): visible surgical mask
 *
 * API:
 *   P1Students.init(scene, deskPositions)
 *   P1Students.tick(dt)                     — breathing animation on target
 *   P1Students.destroy()
 *   P1Students.getTargetHead()              → {x, y, z, mesh}
 *   P1Students.getInfectedMouth()           → {x, y, z}
 *   P1Students.getMaskedStudent()           → {pos: {x,y,z}, headRadius: 0.12}
 *   P1Students.getStudentPositions()        → [{x,y,z}]  all students (for thermal plumes)
 */

/* global THREE, P1_CFG */

const P1Students = (() => {

  let _scene = null;
  let _root  = null;
  let _geos  = [];
  let _mats  = [];
  let _students = [];     // all student data
  let _targetStudent  = null;
  let _infectedStudent = null;
  let _maskedStudent   = null;
  let _targetingRing   = null;   // pulsing indicator above target
  let _t = 0;

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // Seeded LCG (same as furniture, but different seed)
  let _seed = 0xbeefc0de;
  function _rand() {
    _seed = (Math.imul(_seed, 1664525) + 1013904223) | 0;
    return ((_seed >>> 0) / 0x100000000);
  }

  // ── Build one student ─────────────────────────────────────────────────────

  function _buildStudent(dp, opts) {
    opts = opts || {};
    const x = dp.x, z = dp.z;

    const skinIdx    = Math.floor(_rand() * P1_CFG.SKIN_TONES.length);
    const hairIdx    = Math.floor(_rand() * P1_CFG.HAIR_COLORS.length);
    const shirtIdx   = Math.floor(_rand() * P1_CFG.SHIRT_COLORS.length);
    const skinColor  = opts.skinColor  || P1_CFG.SKIN_TONES[skinIdx];
    const hairColor  = opts.hairColor  || P1_CFG.HAIR_COLORS[hairIdx];
    const shirtColor = opts.shirtColor || P1_CFG.SHIRT_COLORS[shirtIdx];

    const skinMat  = _mat(new THREE.MeshPhongMaterial({ color: skinColor, shininess: 5 }));
    const hairMat  = _mat(new THREE.MeshPhongMaterial({ color: hairColor, shininess: 3 }));
    const shirtMat = _mat(new THREE.MeshPhongMaterial({
      color:             shirtColor,
      emissive:          opts.infected ? new THREE.Color(0x331100) : new THREE.Color(0x000000),
      emissiveIntensity: opts.infected ? 0.25 : 0,
      shininess: 4,
    }));
    const pantsMat = _mat(new THREE.MeshPhongMaterial({ color: 0x336699, shininess: 3 }));

    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Torso
    const torsoGeo = _geo(new THREE.BoxGeometry(0.30, 0.50, 0.22));
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.set(0, 0.70, 0);
    group.add(torso);

    // Head
    const headGeo = _geo(new THREE.SphereGeometry(0.12, 9, 7));
    const head = new THREE.Mesh(headGeo, skinMat);
    const headY = P1_CFG.HEAD_Y;
    // Target student looks slightly upward; infected is hunched (slightly lower)
    const headTiltX = opts.target   ? -0.22 :
                      opts.infected ? 0.18   : 0;
    head.position.set(0, headY, 0);
    head.rotation.x = headTiltX;
    group.add(head);

    // Hair (slightly larger sphere sitting on top of head)
    const hairType = Math.floor(_rand() * 3);
    let hair;
    if (hairType === 0) {
      // Full sphere
      const hg = _geo(new THREE.SphereGeometry(0.125, 8, 6));
      hair = new THREE.Mesh(hg, hairMat);
      hair.position.set(0, headY + 0.04, -0.01);
    } else if (hairType === 1) {
      // Flat-top box
      const hg = _geo(new THREE.BoxGeometry(0.22, 0.07, 0.20));
      hair = new THREE.Mesh(hg, hairMat);
      hair.position.set(0, headY + 0.11, -0.01);
    } else {
      // Short bob (squished sphere)
      const hg = _geo(new THREE.SphereGeometry(0.125, 8, 6));
      hair = new THREE.Mesh(hg, hairMat);
      hair.position.set(0, headY + 0.03, 0);
      hair.scale.y = 0.65;
    }
    group.add(hair);

    // Arms (resting forward on desk surface)
    const armGeo = _geo(new THREE.BoxGeometry(0.07, 0.06, 0.25));
    const leftArm  = new THREE.Mesh(armGeo, skinMat);
    const rightArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.16, 0.70, 0.18);
    rightArm.position.set( 0.16, 0.70, 0.18);
    group.add(leftArm);
    group.add(rightArm);

    // Legs
    const legGeo = _geo(new THREE.BoxGeometry(0.11, 0.28, 0.10));
    const leftLeg  = new THREE.Mesh(legGeo, pantsMat);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.08, 0.35, 0.04);
    rightLeg.position.set( 0.08, 0.35, 0.04);
    group.add(leftLeg);
    group.add(rightLeg);

    // Face orientation: students face "forward" (+Z direction = toward the front wall)
    // Slight random yaw so they don't all look identical
    const yaw = opts.infected ? 0 : opts.target ? 0 : (_rand() - 0.5) * 0.3;
    group.rotation.y = yaw;

    _root.add(group);

    const studentData = {
      group, head, torso,
      pos: { x, y: 0, z },
      headPos: { x, y: headY, z },
    };

    if (opts.infected)  _buildInfectedExtras(studentData, dp);
    if (opts.target)    _buildTargetExtras(studentData);
    if (opts.mask)      _buildMask(studentData, head);

    return studentData;
  }

  // ── Infected student extras ───────────────────────────────────────────────

  function _buildInfectedExtras(student, dp) {
    // Tissue box on desk
    const tboxMat = _mat(new THREE.MeshPhongMaterial({ color: 0xeeddff, shininess: 5 }));
    const tboxGeo = _geo(new THREE.BoxGeometry(0.12, 0.10, 0.08));
    const tbox = new THREE.Mesh(tboxGeo, tboxMat);
    tbox.position.set(dp.x + 0.18, dp.y + 0.05, dp.z + 0.05);
    _root.add(tbox);

    // Subtle red point light (the "infected aura")
    const infectedLight = new THREE.PointLight(0xff3300, 0.20, 1.8);
    infectedLight.position.set(student.pos.x, P1_CFG.HEAD_Y, student.pos.z);
    _scene.add(infectedLight);
    student.infectedLight = infectedLight;
  }

  // ── Target student extras ─────────────────────────────────────────────────

  function _buildTargetExtras(student) {
    // Subtle green PointLight
    const targetLight = new THREE.PointLight(0x44ffaa, 0.30, 4.0);
    targetLight.position.set(student.pos.x, P1_CFG.HEAD_Y + 0.5, student.pos.z);
    _scene.add(targetLight);
    student.targetLight = targetLight;

    // Pulsing targeting ring on the floor
    const ringGeo = _geo(new THREE.RingGeometry(0.28, 0.36, 24));
    const ringMat = _mat(new THREE.MeshBasicMaterial({
      color:       0x44ffaa,
      transparent: true,
      opacity:     0.60,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    }));
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(student.pos.x, 0.02, student.pos.z);
    ring.name = 'targetRing';
    _root.add(ring);
    student.targetRingMat = ringMat;
    _targetingRing = { mesh: ring, mat: ringMat };

    // Nose feature: a small wedge on the head face
    const noseGeo = _geo(new THREE.ConeGeometry(0.022, 0.055, 5));
    const noseMat = _mat(new THREE.MeshPhongMaterial({ color: 0xc49060, shininess: 3 }));
    const nose = new THREE.Mesh(noseGeo, noseMat);
    // Position nose on front face of head sphere at head height, pointing +Z
    nose.position.set(student.pos.x, P1_CFG.HEAD_Y, student.pos.z + 0.12);
    nose.rotation.x = Math.PI / 2;
    _root.add(nose);
    student.nose = nose;
  }

  // ── Surgical mask ─────────────────────────────────────────────────────────

  function _buildMask(student, head) {
    // Flat light-blue rectangle covering lower half of face
    const maskMat = _mat(new THREE.MeshPhongMaterial({
      color:     0x99ccee,
      shininess: 15,
    }));
    const maskGeo = _geo(new THREE.BoxGeometry(0.22, 0.09, 0.04));
    const mask = new THREE.Mesh(maskGeo, maskMat);
    mask.position.set(student.pos.x, P1_CFG.HEAD_Y - 0.04, student.pos.z + 0.10);
    mask.name = 'surgicalMask';
    _root.add(mask);
    student.mask = mask;

    // Ear loops (thin boxes from mask edge to ear positions)
    const loopMat = _mat(new THREE.MeshPhongMaterial({ color: 0x99bbcc, shininess: 5 }));
    const loopGeo = _geo(new THREE.BoxGeometry(0.12, 0.012, 0.012));
    [-1, 1].forEach(side => {
      const loop = new THREE.Mesh(loopGeo, loopMat);
      loop.position.set(student.pos.x + side * 0.17, P1_CFG.HEAD_Y - 0.04, student.pos.z + 0.04);
      loop.rotation.z = side * 0.35;
      _root.add(loop);
    });
  }

  // ── Which desks are occupied ──────────────────────────────────────────────

  function _selectOccupiedDesks(total, infectedIdx, targetIdx, maskedIdx) {
    // Always include infected and target; deterministically fill to OCCUPIED_DESKS
    const occupied = new Set([infectedIdx, targetIdx, maskedIdx]);
    const indices  = [];
    for (let i = 0; i < total; i++) {
      if (!occupied.has(i)) indices.push(i);
    }
    // Shuffle deterministically
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(_rand() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const needed = P1_CFG.OCCUPIED_DESKS - 3;
    for (let i = 0; i < needed && i < indices.length; i++) {
      occupied.add(indices[i]);
    }
    return occupied;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, deskPositions) {
    _scene = scene;
    _root  = new THREE.Group();
    _root.name = 'P1Students';
    scene.add(_root);

    const total       = deskPositions.length;  // 24
    const infectedIdx = P1_CFG.INFECTED_COL * P1_CFG.DESK_ROWS + P1_CFG.INFECTED_ROW;
    const targetIdx   = P1_CFG.TARGET_COL   * P1_CFG.DESK_ROWS + P1_CFG.TARGET_ROW;
    const maskedIdx   = P1_CFG.MASKED_COL   * P1_CFG.DESK_ROWS + P1_CFG.MASKED_ROW;

    const occupied = _selectOccupiedDesks(total, infectedIdx, targetIdx, maskedIdx);

    for (const idx of occupied) {
      const dp = deskPositions[idx];
      const opts = {
        infected: idx === infectedIdx,
        target:   idx === targetIdx,
        mask:     idx === maskedIdx,
      };
      const student = _buildStudent(dp, opts);
      _students.push(student);

      if (opts.infected) _infectedStudent = student;
      if (opts.target)   _targetStudent   = student;
      if (opts.mask)     _maskedStudent   = student;
    }
  }

  function tick(dt) {
    _t += dt;

    // Target student chest breathing (subtle torso scale oscillation)
    if (_targetStudent) {
      const breathScale = 1.0 + 0.03 * Math.sin(_t * (Math.PI * 2 / P1_CFG.BREATH_CYCLE_S));
      _targetStudent.torso.scale.x = breathScale;
    }

    // Targeting ring pulse
    if (_targetingRing) {
      _targetingRing.mat.opacity = 0.35 + 0.35 * Math.abs(Math.sin(_t * 1.4));
    }

    // Infected light flicker
    if (_infectedStudent && _infectedStudent.infectedLight) {
      _infectedStudent.infectedLight.intensity = 0.18 + 0.06 * Math.sin(_t * 3.5);
    }
  }

  function destroy() {
    // Remove scene lights added by students
    for (const s of _students) {
      if (s.infectedLight && s.infectedLight.parent) s.infectedLight.parent.remove(s.infectedLight);
      if (s.targetLight   && s.targetLight.parent)   s.targetLight.parent.remove(s.targetLight);
    }
    if (_root && _root.parent) _root.parent.remove(_root);
    _root = null;
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos = [];
    _mats = [];
    _students = [];
    _targetStudent  = null;
    _infectedStudent = null;
    _maskedStudent   = null;
    _targetingRing   = null;
    _scene = null;
  }

  function getTargetHead() {
    if (!_targetStudent) return null;
    return {
      x:    _targetStudent.pos.x,
      y:    P1_CFG.HEAD_Y,
      z:    _targetStudent.pos.z,
      mesh: _targetStudent.head,
    };
  }

  function getInfectedMouth() {
    if (!_infectedStudent) return null;
    return {
      x: _infectedStudent.pos.x,
      y: P1_CFG.MOUTH_Y,
      z: _infectedStudent.pos.z,
    };
  }

  function getMaskedStudent() {
    if (!_maskedStudent) return null;
    return {
      pos:        _maskedStudent.pos,
      headRadius: 0.12,
    };
  }

  function getStudentPositions() {
    return _students.map(s => s.pos);
  }

  return { init, tick, destroy, getTargetHead, getInfectedMouth, getMaskedStudent, getStudentPositions };

})();
