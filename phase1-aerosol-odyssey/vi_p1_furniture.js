/**
 * vi_p1_furniture.js — Phase 1 classroom furniture.
 *
 * Builds: 24 student desks + chairs, teacher's desk + objects, trash can,
 * backpacks, water bottles, humidifier prop.
 *
 * All furniture positions are deterministic (seeded random for jitter/rotation).
 *
 * API:
 *   P1Furniture.init(scene)
 *   P1Furniture.destroy()
 *   P1Furniture.getColliders()  → THREE.Box3[]  (for collision system)
 *   P1Furniture.getDeskPositions() → {x, y, z, col, row}[]  (24 entries, desk surface centers)
 */

/* global THREE, P1_CFG */

const P1Furniture = (() => {

  let _scene = null;
  let _root  = null;
  let _geos  = [];
  let _mats  = [];
  let _colliders = [];      // THREE.Box3[]
  let _deskPositions = [];  // {x, y, z, col, row}[]

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  // Seeded LCG for deterministic furniture jitter
  let _seed = 0xdeadc0de;
  function _rand() {
    _seed = (Math.imul(_seed, 1664525) + 1013904223) | 0;
    return ((_seed >>> 0) / 0x100000000);
  }

  // ── Shared materials ──────────────────────────────────────────────────────
  let _deskMat, _chairMat, _teacherMat;

  function _initMats() {
    _deskMat    = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_DESK_WOOD,   shininess: 15 }));
    _chairMat   = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_CHAIR,       shininess: 5  }));
    _teacherMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_TEACHER_DESK, shininess: 12 }));
  }

  // ── Desk unit ─────────────────────────────────────────────────────────────
  // Each desk is a group: flat top + 4 legs
  // Returns the group and adds an AABB collider.

  function _buildDesk(wx, wz, jx, jz, rot) {
    const group = new THREE.Group();
    group.position.set(wx + jx, 0, wz + jz);
    group.rotation.y = rot;
    _root.add(group);

    // Top surface
    const topGeo = _geo(new THREE.BoxGeometry(0.60, 0.04, 0.45));
    const top = new THREE.Mesh(topGeo, _deskMat);
    top.position.set(0, 0.74, 0);
    group.add(top);

    // Four legs
    const legGeo = _geo(new THREE.BoxGeometry(0.04, 0.72, 0.04));
    const legOffsets = [
      [-0.26, 0.36,  0.19],
      [ 0.26, 0.36,  0.19],
      [-0.26, 0.36, -0.19],
      [ 0.26, 0.36, -0.19],
    ];
    legOffsets.forEach(lo => {
      const leg = new THREE.Mesh(legGeo, _deskMat);
      leg.position.set(...lo);
      group.add(leg);
    });

    // AABB for collision (slightly simplified — just the top volume + leg bounding box)
    const box = new THREE.Box3();
    box.min.set(wx + jx - 0.32, 0, wz + jz - 0.24);
    box.max.set(wx + jx + 0.32, 0.78, wz + jz + 0.24);
    _colliders.push(box);

    return group;
  }

  // ── Chair unit ────────────────────────────────────────────────────────────

  function _buildChair(wx, wz, jx, jz, rot) {
    const group = new THREE.Group();
    // Chair is tucked slightly under the desk (offset -0.12 in local Z)
    group.position.set(wx + jx, 0, wz + jz - 0.10);
    group.rotation.y = rot;
    _root.add(group);

    // Seat
    const seatGeo = _geo(new THREE.BoxGeometry(0.40, 0.04, 0.40));
    const seat = new THREE.Mesh(seatGeo, _chairMat);
    seat.position.set(0, 0.47, 0);
    group.add(seat);

    // Back rest (tilted slightly back ~5°)
    const backGeo = _geo(new THREE.BoxGeometry(0.38, 0.35, 0.04));
    const back = new THREE.Mesh(backGeo, _chairMat);
    back.position.set(0, 0.67, -0.20);
    back.rotation.x = -0.12;
    group.add(back);

    // Four legs
    const legGeo = _geo(new THREE.BoxGeometry(0.03, 0.45, 0.03));
    const legOffsets = [
      [-0.17, 0.225,  0.17],
      [ 0.17, 0.225,  0.17],
      [-0.17, 0.225, -0.17],
      [ 0.17, 0.225, -0.17],
    ];
    legOffsets.forEach(lo => {
      const leg = new THREE.Mesh(legGeo, _chairMat);
      leg.position.set(...lo);
      group.add(leg);
    });

    // Chair collider (seat + back combined)
    const box = new THREE.Box3();
    box.min.set(wx + jx - 0.22, 0, wz + jz - 0.32);
    box.max.set(wx + jx + 0.22, 0.85, wz + jz + 0.22);
    _colliders.push(box);

    return group;
  }

  // ── Student desks & chairs grid ───────────────────────────────────────────

  function _buildStudentGrid() {
    for (let col = 0; col < P1_CFG.DESK_COLS; col++) {
      for (let row = 0; row < P1_CFG.DESK_ROWS; row++) {
        const wx = P1_CFG.DESK_X[col];
        const wz = P1_CFG.DESK_Z_START + row * P1_CFG.DESK_Z_SPACING;

        // Small random offset and rotation for organic feel
        const jx  = (_rand() - 0.5) * 0.10;
        const jz  = (_rand() - 0.5) * 0.10;
        const rot = (_rand() - 0.5) * 0.10;   // ±~3°

        _buildDesk(wx, wz, jx, jz, rot);
        _buildChair(wx, wz, jx, jz, rot);

        // Track desk surface position for student placement
        _deskPositions.push({ x: wx + jx, y: 0.76, z: wz + jz, col, row });
      }
    }
  }

  // ── Teacher's desk (front-left) ───────────────────────────────────────────

  function _buildTeacherDesk() {
    const tx = -2.5, tz = 4.8;
    const group = new THREE.Group();
    group.position.set(tx, 0, tz);
    _root.add(group);

    // Desk top (larger)
    const topGeo = _geo(new THREE.BoxGeometry(1.2, 0.04, 0.7));
    const top = new THREE.Mesh(topGeo, _teacherMat);
    top.position.set(0, 0.77, 0);
    group.add(top);

    // Thick legs
    const legGeo = _geo(new THREE.BoxGeometry(0.06, 0.75, 0.06));
    [[-0.54, 0.375,  0.30], [0.54, 0.375, 0.30], [-0.54, 0.375, -0.30], [0.54, 0.375, -0.30]].forEach(lo => {
      const leg = new THREE.Mesh(legGeo, _teacherMat);
      leg.position.set(...lo);
      group.add(leg);
    });

    // Modesty panel (front face)
    const panelGeo = _geo(new THREE.BoxGeometry(1.10, 0.60, 0.02));
    const panel = new THREE.Mesh(panelGeo, _teacherMat);
    panel.position.set(0, 0.42, 0.35);
    group.add(panel);

    _buildTeacherDeskObjects(tx, tz);

    // Collider
    const box = new THREE.Box3();
    box.min.set(tx - 0.65, 0, tz - 0.40);
    box.max.set(tx + 0.65, 0.79, tz + 0.40);
    _colliders.push(box);

    // Teacher chair
    _buildLargeChair(tx + 0.0, tz - 0.55);
  }

  function _buildLargeChair(wx, wz) {
    const group = new THREE.Group();
    group.position.set(wx, 0, wz);
    _root.add(group);

    const mat = _mat(new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 8 }));
    const seatGeo = _geo(new THREE.BoxGeometry(0.46, 0.05, 0.44));
    const seat = new THREE.Mesh(seatGeo, mat);
    seat.position.y = 0.50;
    group.add(seat);

    const backGeo = _geo(new THREE.BoxGeometry(0.44, 0.50, 0.05));
    const back = new THREE.Mesh(backGeo, mat);
    back.position.set(0, 0.79, -0.22);
    back.rotation.x = -0.15;
    group.add(back);

    const legGeo = _geo(new THREE.BoxGeometry(0.03, 0.50, 0.03));
    [[-0.20, 0.25, 0.19],[0.20, 0.25, 0.19],[-0.20, 0.25,-0.19],[0.20, 0.25,-0.19]].forEach(lo => {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(...lo);
      group.add(leg);
    });
  }

  function _buildTeacherDeskObjects(tx, tz) {
    const surfY = 0.79;

    // Laptop (flat base + angled screen)
    const laptopBase = _mat(new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 20 }));
    const baseGeo = _geo(new THREE.BoxGeometry(0.28, 0.015, 0.22));
    const base = new THREE.Mesh(baseGeo, laptopBase);
    base.position.set(tx + 0.20, surfY + 0.008, tz + 0.05);
    _root.add(base);

    const screenGeo = _geo(new THREE.BoxGeometry(0.26, 0.18, 0.010));
    const screenMat = _mat(new THREE.MeshPhongMaterial({ color: 0x112244, emissive: 0x102030, emissiveIntensity: 0.3, shininess: 30 }));
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(tx + 0.20, surfY + 0.10, tz - 0.04);
    screen.rotation.x = -1.1;
    _root.add(screen);

    // Coffee mug
    const mugGeo = _geo(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10));
    const mugMat = _mat(new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 20 }));
    const mug = new THREE.Mesh(mugGeo, mugMat);
    mug.position.set(tx - 0.35, surfY + 0.045, tz + 0.05);
    _root.add(mug);

    // Paper stack
    const paperMat = _mat(new THREE.MeshPhongMaterial({ color: 0xfafaf0, shininess: 2 }));
    const paperGeo = _geo(new THREE.BoxGeometry(0.22, 0.018, 0.28));
    const papers = new THREE.Mesh(paperGeo, paperMat);
    papers.position.set(tx - 0.15, surfY + 0.009, tz - 0.10);
    papers.rotation.y = 0.15;
    _root.add(papers);

    // Humidifier (small box with mist stem)
    const humMat = _mat(new THREE.MeshPhongMaterial({ color: 0xddeeff, shininess: 25 }));
    const humGeo = _geo(new THREE.BoxGeometry(0.12, 0.14, 0.10));
    const hum = new THREE.Mesh(humGeo, humMat);
    hum.position.set(tx - 0.42, surfY + 0.07, tz - 0.12);
    hum.name = 'humidifier';
    _root.add(hum);

    // Mist emitter nozzle
    const nozzleGeo = _geo(new THREE.CylinderGeometry(0.012, 0.018, 0.04, 6));
    const nozzle = new THREE.Mesh(nozzleGeo, humMat);
    nozzle.position.set(tx - 0.42, surfY + 0.15, tz - 0.12);
    _root.add(nozzle);
  }

  // ── Trash can ─────────────────────────────────────────────────────────────

  function _buildTrashCan() {
    const mat = _mat(new THREE.MeshPhongMaterial({ color: 0x445533, shininess: 5 }));
    const geo = _geo(new THREE.CylinderGeometry(0.15, 0.18, 0.40, 8));
    const can = new THREE.Mesh(geo, mat);
    can.position.set(-1.8, 0.20, 5.2);
    can.name = 'trashCan';
    _root.add(can);

    const box = new THREE.Box3();
    box.min.set(-1.98, 0, 5.02);
    box.max.set(-1.62, 0.40, 5.38);
    _colliders.push(box);
  }

  // ── Backpacks (on floor next to desks) ────────────────────────────────────

  function _buildBackpacks() {
    const bagColors = [0xcc3333, 0x3355cc, 0x228833, 0x883399, 0x558844, 0xcc7722, 0x225588];
    const backpackDesks = [0, 2, 5, 8, 11, 14, 17, 3];   // which desk indices get backpacks

    backpackDesks.forEach((di, bi) => {
      if (di >= _deskPositions.length) return;
      const dp = _deskPositions[di];
      const mat = _mat(new THREE.MeshPhongMaterial({ color: bagColors[bi % bagColors.length], shininess: 5 }));
      const geo = _geo(new THREE.BoxGeometry(0.25, 0.30, 0.12));
      const bag = new THREE.Mesh(geo, mat);
      bag.position.set(dp.x + (_rand()-0.5)*0.12, 0.15, dp.z - 0.22);
      bag.rotation.y = (_rand()-0.5)*0.5;
      bag.name = 'backpack';
      _root.add(bag);
    });
  }

  // ── Water bottles (on desk surfaces) ─────────────────────────────────────

  function _buildWaterBottles() {
    const bottleDesks = [4, 9, 16];
    const bottleColors = [0x88ccee, 0xeedd88, 0x88eebb];
    bottleDesks.forEach((di, bi) => {
      if (di >= _deskPositions.length) return;
      const dp = _deskPositions[di];
      const mat = _mat(new THREE.MeshPhongMaterial({ color: bottleColors[bi], transparent: true, opacity: 0.80, shininess: 60 }));
      const geo = _geo(new THREE.CylinderGeometry(0.025, 0.028, 0.18, 8));
      const bottle = new THREE.Mesh(geo, mat);
      bottle.position.set(dp.x + 0.20, dp.y + 0.09, dp.z + 0.08);
      bottle.name = 'waterBottle';
      _root.add(bottle);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
    _root  = new THREE.Group();
    _root.name = 'P1Furniture';
    scene.add(_root);

    _initMats();
    _buildStudentGrid();
    _buildTeacherDesk();
    _buildTrashCan();
    _buildBackpacks();
    _buildWaterBottles();
  }

  function destroy() {
    if (_root && _root.parent) _root.parent.remove(_root);
    _root = null;
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos = [];
    _mats = [];
    _colliders = [];
    _deskPositions = [];
    _scene = null;
  }

  function getColliders()      { return _colliders; }
  function getDeskPositions()  { return _deskPositions; }

  return { init, destroy, getColliders, getDeskPositions };

})();
