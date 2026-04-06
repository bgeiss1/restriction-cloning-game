/**
 * vi_p1_classroom.js — Phase 1 classroom environment.
 *
 * Builds: walls, floor, ceiling, ceiling grid, fluorescent fixtures,
 * windows (with mullion frames + exterior view), whiteboard, bookshelf,
 * HVAC supply vent (visual only), sunbeam shafts + dust motes, lighting.
 *
 * API:
 *   P1Classroom.init(scene)
 *   P1Classroom.tick(dt)
 *   P1Classroom.destroy()
 *   P1Classroom.getCeilingLights()  → THREE.PointLight[]  (for LOD toggling)
 */

/* global THREE, P1_CFG */

const P1Classroom = (() => {

  let _scene = null;
  let _root  = null;
  let _geos  = [];
  let _mats  = [];
  let _lights = [];
  let _ceilLights = [];   // the 6 ceiling PointLights — toggled based on player pos
  let _dustPoints = null;
  let _dustVel    = null;
  let _t = 0;

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  function _mesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    _root.add(m);
    return m;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
    _root  = new THREE.Group();
    _root.name = 'P1Classroom';
    scene.add(_root);

    _buildFloor();
    _buildCeiling();
    _buildWalls();
    _buildWindows();
    _buildExterior();
    _buildSunbeams();
    _buildWhiteboard();
    _buildBookshelf();
    _buildHVACVent();
    _buildLights();
    _buildDustMotes();
  }

  function tick(dt) {
    _t += dt;

    // Subtle ceiling light flicker
    for (let i = 0; i < _ceilLights.length; i++) {
      const base = P1_CFG.CEIL_LIGHT_INTENSITY;
      _ceilLights[i].intensity = base * (0.96 + 0.04 * Math.sin(_t * 22 + i * 1.3));
    }

    // Drift dust motes
    if (_dustPoints) {
      const pos = _dustPoints.geometry.attributes.position;
      for (let i = 0; i < _dustVel.length; i++) {
        pos.array[i * 3    ] += _dustVel[i].x * dt;
        pos.array[i * 3 + 1] += _dustVel[i].y * dt;
        pos.array[i * 3 + 2] += _dustVel[i].z * dt;
        // Wrap within sunbeam region (X -4 to -0.5, Y 0 to 2.8)
        if (pos.array[i*3]   <  -4.2) pos.array[i*3]   = -0.4;
        if (pos.array[i*3]   >  -0.3) pos.array[i*3]   = -4.0;
        if (pos.array[i*3+1] <   0.1) pos.array[i*3+1] =  2.6;
        if (pos.array[i*3+1] >   2.8) pos.array[i*3+1] =  0.2;
      }
      pos.needsUpdate = true;
    }
  }

  function destroy() {
    if (_root && _root.parent) _root.parent.remove(_root);
    _root = null;
    for (const l of _lights) { if (l.parent) l.parent.remove(l); }
    _lights = [];
    _ceilLights = [];
    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos = [];
    _mats = [];
    _dustPoints = null;
    _dustVel    = null;
    _scene = null;
  }

  function getCeilingLights() { return _ceilLights; }

  // ── Floor ─────────────────────────────────────────────────────────────────

  function _buildFloor() {
    // Subtle tile look: two-tone checkerboard using vertex colors would be complex —
    // use a single flat muted warm gray-tan for a clean low-poly floor.
    const geo = _geo(new THREE.PlaneGeometry(P1_CFG.ROOM_WIDTH, P1_CFG.ROOM_LENGTH));
    const mat = _mat(new THREE.MeshPhongMaterial({
      color: P1_CFG.COL_FLOOR,
      shininess: 8,
    }));
    const floor = _mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.name = 'floor';
    floor.receiveShadow = true;
  }

  // ── Ceiling ───────────────────────────────────────────────────────────────

  function _buildCeiling() {
    const geo = _geo(new THREE.PlaneGeometry(P1_CFG.ROOM_WIDTH, P1_CFG.ROOM_LENGTH));
    const mat = _mat(new THREE.MeshPhongMaterial({
      color: P1_CFG.COL_CEILING,
      side: THREE.BackSide,
      shininess: 2,
    }));
    const ceiling = _mesh(geo, mat);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = P1_CFG.ROOM_HEIGHT;
    ceiling.name = 'ceiling';

    _buildCeilingGrid();
    _buildFluorescentFixtures();
  }

  function _buildCeilingGrid() {
    const positions = [];
    const yg = P1_CFG.ROOM_HEIGHT - 0.01;
    const step = 0.6;
    const xHalf = P1_CFG.ROOM_WIDTH  / 2;
    const zHalf = P1_CFG.ROOM_LENGTH / 2;

    // Lines parallel to X (running left-right), one every 0.6m in Z
    for (let z = -zHalf; z <= zHalf + 0.001; z += step) {
      positions.push(-xHalf, yg, z,  xHalf, yg, z);
    }
    // Lines parallel to Z (running front-back), one every 0.6m in X
    for (let x = -xHalf; x <= xHalf + 0.001; x += step) {
      positions.push(x, yg, -zHalf,  x, yg, zHalf);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    _geos.push(geo);
    const mat = _mat(new THREE.LineBasicMaterial({ color: 0xd0ccc8 }));
    const grid = new THREE.LineSegments(geo, mat);
    grid.name = 'ceilingGrid';
    _root.add(grid);
  }

  function _buildFluorescentFixtures() {
    // 2 rows × 3 fixtures = 6 total
    // Row at X=-1.8, X=+1.8;  columns at Z=-3, 0, +3
    const fixtureGeo = _geo(new THREE.BoxGeometry(1.0, 0.05, 0.15));
    const fixtureMat = _mat(new THREE.MeshPhongMaterial({
      color:             P1_CFG.COL_FLUORESCENT,
      emissive:          new THREE.Color(P1_CFG.COL_FLUORESCENT),
      emissiveIntensity: 0.85,
      shininess: 30,
    }));

    const rows = [-1.8, 1.8];
    const cols = [-3.0, 0.0, 3.0];
    const lightY = P1_CFG.ROOM_HEIGHT - 0.20;

    rows.forEach(x => {
      cols.forEach(z => {
        const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
        fixture.position.set(x, P1_CFG.ROOM_HEIGHT - 0.025, z);
        fixture.name = 'fluorescent';
        _root.add(fixture);

        // PointLight under each fixture
        const pl = new THREE.PointLight(
          0xfff8ee,
          P1_CFG.CEIL_LIGHT_INTENSITY,
          P1_CFG.CEIL_LIGHT_DIST
        );
        pl.position.set(x, lightY, z);
        _scene.add(pl);
        _lights.push(pl);
        _ceilLights.push(pl);
      });
    });
  }

  // ── Walls ─────────────────────────────────────────────────────────────────

  function _buildWalls() {
    const h = P1_CFG.ROOM_HEIGHT;
    const hw = P1_CFG.ROOM_WIDTH  / 2;   // 4
    const hl = P1_CFG.ROOM_LENGTH / 2;   // 6

    // Back wall (Z = -6): warm beige, corkboard + clock + door
    const backMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_WALL_BEIGE, shininess: 3 }));
    const backGeo = _geo(new THREE.PlaneGeometry(P1_CFG.ROOM_WIDTH, h));
    const back = _mesh(backGeo, backMat);
    back.position.set(0, h/2, -hl);
    back.name = 'wallBack';

    // Front wall (Z = +6): light gray-green, whiteboard is mounted separately
    const frontMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_WALL_FRONT, shininess: 3 }));
    const frontGeo = _geo(new THREE.PlaneGeometry(P1_CFG.ROOM_WIDTH, h));
    const front = _mesh(frontGeo, frontMat);
    front.position.set(0, h/2, hl);
    front.rotation.y = Math.PI;
    front.name = 'wallFront';

    // Left wall (X = -4): windows are cut in separately
    const leftMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_WALL_BEIGE, shininess: 3 }));
    const leftGeo = _geo(new THREE.PlaneGeometry(P1_CFG.ROOM_LENGTH, h));
    const left = _mesh(leftGeo, leftMat);
    left.position.set(-hw, h/2, 0);
    left.rotation.y = Math.PI / 2;
    left.name = 'wallLeft';

    // Right wall (X = +4): bookshelf mounted separately
    const rightMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_WALL_BEIGE, shininess: 3 }));
    const rightGeo = _geo(new THREE.PlaneGeometry(P1_CFG.ROOM_LENGTH, h));
    const right = _mesh(rightGeo, rightMat);
    right.position.set(hw, h/2, 0);
    right.rotation.y = -Math.PI / 2;
    right.name = 'wallRight';

    _buildBackWallDetails();
    _buildDoors();
    _buildCorkboard();
    _buildWallClock();
  }

  function _buildBackWallDetails() {
    // These are small flat planes placed just in front of the back wall
  }

  function _buildDoors() {
    const doorMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_DOOR, shininess: 5 }));
    // Back wall door (right side of back wall)
    const doorGeo = _geo(new THREE.BoxGeometry(0.90, 2.10, 0.06));
    const door1 = new THREE.Mesh(doorGeo, doorMat);
    door1.position.set(2.8, 1.05, -5.97);
    door1.name = 'doorBack';
    _root.add(door1);

    // Door window pane
    const paneGeo = _geo(new THREE.PlaneGeometry(0.36, 0.36));
    const paneMat = _mat(new THREE.MeshPhongMaterial({ color: 0xbbddee, transparent: true, opacity: 0.55, shininess: 60 }));
    const pane = new THREE.Mesh(paneGeo, paneMat);
    pane.position.set(2.8, 1.65, -5.93);
    _root.add(pane);

    // Right wall door
    const door2 = new THREE.Mesh(doorGeo, doorMat);
    door2.position.set(3.97, 1.05, 2.5);
    door2.rotation.y = Math.PI / 2;
    door2.name = 'doorRight';
    _root.add(door2);
  }

  function _buildCorkboard() {
    // Corkboard on back wall, left side
    const boardMat = _mat(new THREE.MeshPhongMaterial({ color: 0xd4a86a, shininess: 2 }));
    const boardGeo = _geo(new THREE.PlaneGeometry(2.0, 1.2));
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(-1.5, 1.8, -5.96);
    board.name = 'corkboard';
    _root.add(board);

    // Pinned paper rectangles
    const paperColors = [0xf8f0e0, 0xffeedd, 0xe8f0ff, 0xeeffee, 0xffeeff];
    paperColors.forEach((c, i) => {
      const pMat = _mat(new THREE.MeshPhongMaterial({ color: c }));
      const pGeo = _geo(new THREE.PlaneGeometry(0.28 + Math.random() * 0.14, 0.22));
      const p = new THREE.Mesh(pGeo, pMat);
      const angle = (Math.random() - 0.5) * 0.18;
      p.position.set(-2.2 + i * 0.38, 1.7 + (Math.random() - 0.5) * 0.4, -5.95);
      p.rotation.z = angle;
      _root.add(p);
    });
  }

  function _buildWallClock() {
    // Simple circle clock on back wall
    const clockMat = _mat(new THREE.MeshPhongMaterial({ color: 0xf5f0e8, shininess: 10 }));
    const clockGeo = _geo(new THREE.CircleGeometry(0.18, 16));
    const clock = new THREE.Mesh(clockGeo, clockMat);
    clock.position.set(0.8, 2.5, -5.96);
    _root.add(clock);

    // Clock hands (thin boxes)
    const handMat = _mat(new THREE.MeshPhongMaterial({ color: 0x222222 }));
    const hourGeo = _geo(new THREE.BoxGeometry(0.015, 0.10, 0.01));
    const minGeo  = _geo(new THREE.BoxGeometry(0.010, 0.14, 0.01));
    const hour = new THREE.Mesh(hourGeo, handMat);
    const min  = new THREE.Mesh(minGeo, handMat);
    hour.position.set(0.8, 2.55, -5.94);
    min.position.set(0.83, 2.54, -5.94);
    hour.rotation.z = 0.8;
    min.rotation.z  = -0.4;
    _root.add(hour);
    _root.add(min);
  }

  // ── Windows (left wall) ───────────────────────────────────────────────────

  function _buildWindows() {
    const glassMat = _mat(new THREE.MeshPhongMaterial({
      color:     P1_CFG.COL_WINDOW_GLASS,
      transparent: true,
      opacity:   0.55,
      shininess: 80,
      depthWrite: false,
    }));

    const mullionMat = _mat(new THREE.MeshPhongMaterial({ color: 0x445566, shininess: 10 }));

    // Two windows: centered at Z=-1.5 and Z=1.5
    // Each 2.0m wide × 1.5m tall, bottom at Y=0.8
    const windowDefs = [
      { z: -1.5 },
      { z:  1.5 },
    ];

    const W = 2.0, H = 1.5;
    const wx = -P1_CFG.ROOM_WIDTH / 2 + 0.01;

    windowDefs.forEach(wd => {
      // Glass pane
      const glassGeo = _geo(new THREE.PlaneGeometry(W, H));
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.rotation.y = Math.PI / 2;
      glass.position.set(wx, 0.8 + H/2, wd.z);
      glass.name = 'windowGlass';
      _root.add(glass);

      // Outer frame (4 thin boxes)
      const frameThick = 0.04;
      const frameMat = _mat(new THREE.MeshPhongMaterial({ color: 0x5a6a70, shininess: 8 }));
      const frames = [
        { w: W + frameThick*2, h: frameThick, x: 0,    y:  H/2 },   // top
        { w: W + frameThick*2, h: frameThick, x: 0,    y: -H/2 },   // bottom
        { w: frameThick,       h: H,          x: -W/2, y:  0   },   // left
        { w: frameThick,       h: H,          x:  W/2, y:  0   },   // right
      ];
      frames.forEach(f => {
        const fg = _geo(new THREE.BoxGeometry(frameThick, f.h, f.w));
        const fm = new THREE.Mesh(fg, frameMat);
        fm.position.set(wx - 0.01, 0.8 + H/2 + f.y, wd.z + f.x);
        _root.add(fm);
      });

      // Mullions: 2 vertical (3 columns) + 1 horizontal (2 rows)
      const mullionT = 0.025;
      // Vertical mullions at ±W/3
      for (let v = 1; v <= 2; v++) {
        const vx = -W/2 + v * (W/3);
        const vg = _geo(new THREE.BoxGeometry(mullionT, H, mullionT));
        const vm = new THREE.Mesh(vg, mullionMat);
        vm.position.set(wx, 0.8 + H/2, wd.z + vx);
        _root.add(vm);
      }
      // Horizontal mullion at H/2
      const hg = _geo(new THREE.BoxGeometry(mullionT, mullionT, W));
      const hm = new THREE.Mesh(hg, mullionMat);
      hm.position.set(wx, 0.8 + H * 0.5, wd.z);
      _root.add(hm);
    });
  }

  // ── Exterior (visible through windows) ────────────────────────────────────

  function _buildExterior() {
    const extX = -P1_CFG.ROOM_WIDTH / 2 - 0.5;  // just outside the left wall

    // Sky backdrop
    const skyGeo = _geo(new THREE.PlaneGeometry(16, 8));
    const skyMat = _mat(new THREE.MeshBasicMaterial({ color: 0x88bbee, side: THREE.DoubleSide }));
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.rotation.y = Math.PI / 2;
    sky.position.set(extX - 0.5, 2.5, 0);
    sky.name = 'exteriorSky';
    _root.add(sky);

    // Ground outside
    const groundGeo = _geo(new THREE.PlaneGeometry(4, P1_CFG.ROOM_LENGTH));
    const groundMat = _mat(new THREE.MeshBasicMaterial({ color: 0x6a8a5a, side: THREE.DoubleSide }));
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(extX - 1.0, -0.01, 0);
    _root.add(ground);

    // Trees (3 simplified trees)
    const treeDefs = [
      { x: extX - 1.2, z: -2.5 },
      { x: extX - 2.0, z:  0.5 },
      { x: extX - 1.4, z:  2.8 },
    ];
    const trunkMat = _mat(new THREE.MeshPhongMaterial({ color: 0x5a3a1a }));
    const leafMat  = _mat(new THREE.MeshPhongMaterial({ color: 0x3a7a2a, shininess: 2 }));
    treeDefs.forEach(td => {
      const tg = _geo(new THREE.CylinderGeometry(0.07, 0.10, 0.9, 6));
      const trunk = new THREE.Mesh(tg, trunkMat);
      trunk.position.set(td.x, 0.45, td.z);
      _root.add(trunk);
      const lg = _geo(new THREE.SphereGeometry(0.45 + Math.random() * 0.15, 7, 6));
      const leaves = new THREE.Mesh(lg, leafMat);
      leaves.position.set(td.x, 1.2, td.z);
      _root.add(leaves);
    });
  }

  // ── Sunbeam shafts ────────────────────────────────────────────────────────

  function _buildSunbeams() {
    // Two angled translucent planes representing sunlight shafts.
    // They enter from the left wall (X=-4) at roughly 35° downward.
    const shaftMat = _mat(new THREE.MeshBasicMaterial({
      color:       0xffeeaa,
      transparent: true,
      opacity:     0.07,
      depthWrite:  false,
      side:        THREE.DoubleSide,
      blending:    THREE.AdditiveBlending,
    }));

    // Each shaft: a wide quad (8m long crossing the room, 1.6m wide in Z)
    // tilted at ~35° from vertical, anchored at the left window height
    const shaftDefs = [
      { z: -1.5, ry: 0.18 },   // slight forward angle
      { z:  1.5, ry: 0.12 },
    ];

    shaftDefs.forEach(sd => {
      const sg = _geo(new THREE.PlaneGeometry(8.5, 1.5));
      const shaft = new THREE.Mesh(sg, shaftMat);
      // Position at midpoint of the shaft (center of the crossing diagonal)
      shaft.position.set(-1.5, 1.4, sd.z);
      // Tilt so it angled down-right from the left wall
      shaft.rotation.set(0, sd.ry, Math.PI / 2 - 0.60);
      shaft.name = 'sunbeam';
      _root.add(shaft);
    });
  }

  // ── Whiteboard (front wall) ───────────────────────────────────────────────

  function _buildWhiteboard() {
    const boardGeo = _geo(new THREE.BoxGeometry(3.0, 1.0, 0.04));
    const boardMat = _mat(new THREE.MeshPhongMaterial({
      color: P1_CFG.COL_WHITEBOARD,
      shininess: 30,
    }));
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(-0.5, 1.9, 5.97);
    board.name = 'whiteboard';
    _root.add(board);

    // Whiteboard tray (ledge below)
    const trayGeo = _geo(new THREE.BoxGeometry(3.0, 0.06, 0.12));
    const trayMat = _mat(new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 5 }));
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.set(-0.5, 1.38, 5.92);
    _root.add(tray);

    // Marker scribbles — a few colored line segments on the board face
    _buildWhiteboardMarkers();

    // Projector screen (partially lowered from ceiling above the board)
    const screenGeo = _geo(new THREE.PlaneGeometry(2.0, 1.2));
    const screenMat = _mat(new THREE.MeshPhongMaterial({
      color: 0xf8f8ff,
      transparent: true,
      opacity: 0.90,
      shininess: 5,
      side: THREE.DoubleSide,
    }));
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(-0.5, 2.3, 5.94);
    _root.add(screen);
  }

  function _buildWhiteboardMarkers() {
    // A few colored lines on the whiteboard face using LineSegments
    const colors = [0x4444ff, 0xcc2222, 0x22aa22, 0x222222];
    const pts = [
      // "writing" lines — a few horizontal strokes
      [-1.1, 1.95, 5.96,  0.2, 1.95, 5.96],
      [-1.1, 1.82, 5.96, -0.4, 1.82, 5.96],
      [-1.1, 1.69, 5.96,  0.5, 1.69, 5.96],
      [ 0.8, 1.95, 5.96,  1.3, 1.95, 5.96],
    ];
    pts.forEach((p, i) => {
      const positions = new Float32Array(p);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      _geos.push(geo);
      const mat = _mat(new THREE.LineBasicMaterial({ color: colors[i % colors.length] }));
      _root.add(new THREE.LineSegments(geo, mat));
    });
  }

  // ── Bookshelf (right wall) ────────────────────────────────────────────────

  function _buildBookshelf() {
    const shelfMat = _mat(new THREE.MeshPhongMaterial({ color: P1_CFG.COL_BOOKSHELF, shininess: 10 }));
    const rx = P1_CFG.ROOM_WIDTH / 2 - 0.04;

    // Frame: top, bottom, two sides
    const frames = [
      { w: 2.4, h: 0.04, d: 0.24, y: 2.0,  z:  0.8 },   // top shelf
      { w: 2.4, h: 0.04, d: 0.24, y: 0.02, z:  0.8 },   // bottom
      { w: 0.04, h: 2.0, d: 0.24, y: 1.0,  z: -0.4 },   // left side
      { w: 0.04, h: 2.0, d: 0.24, y: 1.0,  z:  2.0 },   // right side
      { w: 2.4, h: 0.04, d: 0.24, y: 0.67, z:  0.8 },   // middle shelf 1
      { w: 2.4, h: 0.04, d: 0.24, y: 1.34, z:  0.8 },   // middle shelf 2
    ];
    frames.forEach(f => {
      const g = _geo(new THREE.BoxGeometry(f.w, f.h, f.d));
      const m = new THREE.Mesh(g, shelfMat);
      m.position.set(rx, f.y, f.z);
      _root.add(m);
    });

    // Books — colored rectangular spines
    const bookColors = [0xcc4444, 0x4466cc, 0x44aa44, 0x884499, 0xddaa22,
                        0x446644, 0xcc8833, 0x2244aa, 0x886644, 0x44aaaa];
    const shelfZones = [
      { y: 0.35,  count: 8 },  // bottom shelf
      { y: 1.00,  count: 7 },  // second shelf
      { y: 1.67,  count: 6 },  // third shelf
    ];
    let colorIdx = 0;
    shelfZones.forEach(sz => {
      const totalW = 1.9;
      const bookW  = totalW / sz.count;
      for (let b = 0; b < sz.count; b++) {
        const h = 0.28 + (Math.random() - 0.5) * 0.06;
        const d = 0.19 + (Math.random() - 0.5) * 0.02;
        const bg = _geo(new THREE.BoxGeometry(bookW * 0.88, h, d));
        const bm = _mat(new THREE.MeshPhongMaterial({ color: bookColors[colorIdx % bookColors.length], shininess: 5 }));
        colorIdx++;
        const book = new THREE.Mesh(bg, bm);
        book.position.set(rx, sz.y + h/2, -0.4 + 0.1 + b * bookW + bookW/2);
        _root.add(book);
      }
    });
  }

  // ── HVAC supply vent (visual only) ────────────────────────────────────────

  function _buildHVACVent() {
    const ventH = P1_CFG.ROOM_HEIGHT - 0.025;
    const ventMat = _mat(new THREE.MeshPhongMaterial({ color: 0xddddcc, shininess: 8 }));

    // Grille frame
    const frameGeo = _geo(new THREE.BoxGeometry(0.60, 0.04, 0.60));
    const frame = new THREE.Mesh(frameGeo, ventMat);
    frame.position.set(
      P1_CFG.HVAC_SUPPLY_POS.x,
      ventH,
      P1_CFG.HVAC_SUPPLY_POS.z
    );
    frame.name = 'hvacSupplyVent';
    _root.add(frame);

    // Slats (5 thin boxes across the grille)
    const slatMat = _mat(new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 3 }));
    for (let s = 0; s < 5; s++) {
      const sg = _geo(new THREE.BoxGeometry(0.54, 0.02, 0.04));
      const slat = new THREE.Mesh(sg, slatMat);
      slat.position.set(
        P1_CFG.HVAC_SUPPLY_POS.x,
        ventH + 0.01,
        P1_CFG.HVAC_SUPPLY_POS.z - 0.24 + s * 0.12
      );
      _root.add(slat);
    }

    // Return air vent on right wall
    const returnMat = _mat(new THREE.MeshPhongMaterial({ color: 0xccccbb, shininess: 5 }));
    const returnGeo = _geo(new THREE.BoxGeometry(0.04, 0.35, 0.50));
    const returnVent = new THREE.Mesh(returnGeo, returnMat);
    returnVent.position.set(
      P1_CFG.HVAC_RETURN_POS.x,
      P1_CFG.HVAC_RETURN_POS.y,
      P1_CFG.HVAC_RETURN_POS.z
    );
    returnVent.name = 'hvacReturnVent';
    _root.add(returnVent);
  }

  // ── Dust motes (in sunbeam zone) ──────────────────────────────────────────

  function _buildDustMotes() {
    const N = P1_CFG.DUST_MOTE_COUNT;
    const positions = new Float32Array(N * 3);
    _dustVel = [];

    for (let i = 0; i < N; i++) {
      // Place within the sunbeam region (left half of room)
      positions[i*3    ] = -4.0 + Math.random() * 3.5;
      positions[i*3 + 1] = 0.2  + Math.random() * 2.6;
      positions[i*3 + 2] = -2.5 + Math.random() * 4.0;
      _dustVel.push({
        x: (Math.random() - 0.5) * 0.04,
        y: (Math.random() - 0.3) * 0.03,  // slight upward drift
        z: (Math.random() - 0.5) * 0.04,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    _geos.push(geo);

    const mat = _mat(new THREE.PointsMaterial({
      color:       0xfffce0,
      size:        0.025,
      transparent: true,
      opacity:     0.65,
      depthWrite:  false,
      sizeAttenuation: true,
    }));

    _dustPoints = new THREE.Points(geo, mat);
    _dustPoints.name = 'dustMotes';
    _root.add(_dustPoints);
  }

  // ── Lights ────────────────────────────────────────────────────────────────

  function _buildLights() {
    // Ambient
    const amb = new THREE.AmbientLight(0xe8e0d4, P1_CFG.AMB_INTENSITY);
    amb.name = 'p1Ambient';
    _scene.add(amb);
    _lights.push(amb);

    // Hemisphere (cool sky, warm floor)
    const hemi = new THREE.HemisphereLight(0xeef0ff, 0xd4c8b8, P1_CFG.HEMI_SKY_INT);
    hemi.name = 'p1Hemi';
    _scene.add(hemi);
    _lights.push(hemi);

    // Directional sunlight from left wall (matches window angle)
    const sun = new THREE.DirectionalLight(0xfff4cc, P1_CFG.SUN_INTENSITY);
    sun.position.set(-8, 6, 2);
    sun.name = 'p1Sun';
    _scene.add(sun);
    _lights.push(sun);
  }

  // ── Public object ─────────────────────────────────────────────────────────
  return { init, tick, destroy, getCeilingLights };

})();
