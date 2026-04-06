/**
 * vi_p4_config.js — Phase 4 "Nuclear Factory" configuration constants.
 * All tunable values live here. Referenced as P4_CFG.* throughout all p4/ files.
 */

/* global THREE */

const P4_CFG = {

  // ── Nuclear envelope ─────────────────────────────────────────────────────
  NUCLEUS_RADIUS:        30,    // hard wall radius (units)
  ENVELOPE_OUTER_R:      30.3,  // outer nuclear membrane torus major radius
  ENVELOPE_INNER_R:      29.6,  // inner nuclear membrane torus major radius
  ENVELOPE_TUBE_OUTER:   0.22,  // tube cross-section radius, outer
  ENVELOPE_TUBE_INNER:   0.16,  // tube cross-section radius, inner
  FLOOR_RADIUS:          30,

  // ── Camera ───────────────────────────────────────────────────────────────
  CAM_INIT_POS:          [0, 45, 25],
  CAM_LOOK_TARGET:       [0, 0, 0],
  CAM_FOV:               50,
  CAM_NEAR:              0.1,
  CAM_FAR:               200,
  CAM_ZOOM_MIN:          20,    // closest allowed camera distance
  CAM_ZOOM_MAX:          55,    // farthest
  CAM_ZOOM_LERP:         0.12,
  CAM_PAN_SPEED_KB:      10,   // units/sec keyboard pan (WASD)
  CAM_PAN_SPEED_EDGE:    3,    // units/sec edge-of-screen pan
  CAM_EDGE_MARGIN_PX:    40,
  CAM_FOCUS_DURATION:    0.5,  // seconds for quick-focus transition
  CAM_PAN_CLAMP:         25,   // max distance of look-target from origin

  // ── Fog / background ─────────────────────────────────────────────────────
  FOG_DENSITY:           0.008,
  CLEAR_COLOR:           0x0a0818,

  // ── Nuclear pore complexes ───────────────────────────────────────────────
  NPC_COUNT:             8,
  NPC_MAJOR_RADIUS:      0.85,   // torus major radius
  NPC_TUBE_RADIUS:       0.15,   // torus tube radius
  NPC_HEIGHT:            0.8,    // y position above floor
  NPC_EXPORT_COOLDOWN_S: 3,

  // ── Chromatin terrain ────────────────────────────────────────────────────
  // Heterochromatin blobs: x, z = center; rx/rz = ellipse semi-axes (visual);
  // bsr = bounding-sphere radius used by steering behaviour (slightly larger).
  HETERO_BLOBS: [
    { x: -9,  z: -14, rx: 3.5, ry: 0.9, rz: 2.8, bsr: 4.5 },
    { x:  14, z: -9,  rx: 3.8, ry: 1.1, rz: 3.2, bsr: 5.0 },
    { x:  16, z:  9,  rx: 2.8, ry: 0.8, rz: 3.2, bsr: 4.2 },
    { x: -15, z:  10, rx: 3.2, ry: 1.0, rz: 3.6, bsr: 4.8 },
    { x: -4,  z:  18, rx: 2.5, ry: 0.8, rz: 2.5, bsr: 3.5 },
    { x:  10, z:  19, rx: 2.8, ry: 0.9, rz: 2.8, bsr: 4.0 },
    { x: -20, z: -2,  rx: 2.5, ry: 0.8, rz: 2.5, bsr: 3.8 },
    { x:  1,  z: -20, rx: 3.0, ry: 1.0, rz: 2.8, bsr: 4.2 },
  ],

  // Euchromatin fiber clusters: center position + fiber count
  EU_CLUSTERS: [
    { x:  4,  z: -7,  n: 10 },
    { x: -6,  z:  4,  n: 10 },
    { x:  9,  z:  3,  n:  9 },
    { x: -1,  z:  11, n:  8 },
    { x: -11, z: -8,  n:  9 },
    { x:  6,  z: -16, n:  7 },
  ],
  EU_FIBER_SPREAD:       2.5,   // cluster scatter radius
  EU_FIBER_LENGTH_MIN:   1.2,
  EU_FIBER_LENGTH_MAX:   3.0,
  EU_FIBER_RADIUS:       0.035,

  // Nucleolus
  NUCLEOLUS_POS:         [-6, 0, -4],
  NUCLEOLUS_RADIUS:      3.8,

  // ── Pol II sites (positions defined here, used by vi_p4_polii.js) ────────
  // Placed in/near euchromatin clusters, clear of heterochromatin bsrs
  POLII_POSITIONS: [
    { x:  3,  z: -6  },
    { x: -5,  z:  3  },
    { x:  10, z:  2  },
    { x: -1,  z:  12 },
    { x: -12, z: -6  },
    { x:  5,  z: -15 },
    { x:  7,  z:  9  },
    { x: -8,  z: -1  },
  ],
  POLII_COOLDOWN_S:      10,
  POLII_CAP_SNATCH_DIST: 1.5,   // click radius for minigame
  POLII_MRNA_GROW_RATE:  0.18,  // units per second (pre-mRNA strand growth)
  POLII_MRNA_MAX_LEN:    3.5,
  POLII_LIGHT_INTENSITY: 0.5,
  POLII_LIGHT_DIST:      8,

  // ── vRNP template segments ───────────────────────────────────────────────
  SEGMENT_GENES:  ['PB2', 'PB1', 'PA', 'HA', 'NP', 'NA', 'M1/M2', 'NS1/NEP'],
  SEGMENT_LABELS: [
    'Segment 1 — PB2 (polymerase cap-binding)',
    'Segment 2 — PB1 (polymerase catalytic)',
    'Segment 3 — PA (polymerase endonuclease)',
    'Segment 4 — HA (hemagglutinin)',
    'Segment 5 — NP (nucleoprotein)',
    'Segment 6 — NA (neuraminidase)',
    'Segment 7 — M1/M2 (matrix / ion channel)',
    'Segment 8 — NS1/NEP (immune evasion / export)',
  ],
  // Initial ring placement: 8 positions in a circle of radius 8 at y=0
  TEMPLATE_RING_RADIUS:  8,
  TEMPLATE_LENGTH:       3.0,
  TEMPLATE_TUBE_RADIUS:  0.12,
  TEMPLATE_NP_BEADS:     9,     // NP bead spheres per template
  TEMPLATE_MAX_POLYS:    2,     // max simultaneous polymerases per template
  TEMPLATE_DRAG_Y:       0.5,   // y height while dragging

  // ── RdRp polymerase complexes ────────────────────────────────────────────
  POLY_LOBE_RADIUS:      0.22,  // each sub-sphere radius
  POLY_LOBE_OFFSET:      0.20,  // spacing between lobe centers
  POLY_BOB_AMPLITUDE:    0.12,  // idle bobbing
  POLY_BOB_SPEED:        1.8,   // rad/sec
  POLY_SPEED:            4.0,   // movement speed (units/sec)
  POLY_ARRIVE_DIST:      0.4,   // considered "arrived" within this distance
  POLY_STEER_FORCE:      12,    // steering acceleration
  POLY_SEPARATION:       0.8,   // min distance between polymerases

  // ── Synthesis ────────────────────────────────────────────────────────────
  SYNTH_TRAVERSE_SPEED:  0.3,   // units/sec traversal along template
  MRNA_CAP_RADIUS:       0.12,
  MRNA_POLYA_BEADS:      4,
  POLYA_REGION_FRAC:     0.10,  // final 10% of template = poly-U region
  POLYA_STUTTER_N:       4,
  POLYA_STUTTER_PERIOD:  0.25,  // seconds per stutter

  // ── Economy ──────────────────────────────────────────────────────────────
  NTP_START:             500,
  NTP_REGEN_RATE:        3,     // per second
  NTP_TRANSCR_RATE:      5,     // per second consumed during transcription
  NP_REPLICATION_THRESH: 30,
  NP_PER_REPLICATION:    15,    // NP consumed per full replication
  NP_PER_UNIT:           2,     // NP consumed per unit of template traversed
  NP_SPHERE_MAX_VISIBLE: 50,

  // Translation delays (seconds) and products, keyed by 0-based segment index
  TRANS_DELAY_S:   [20, 20, 20, 15, 12, 15, 15, 10],
  TRANS_NP_YIELD:  20,    // NP from Seg 5 (index 4)

  // ── Antiviral system ─────────────────────────────────────────────────────
  ANTIVIRAL_DURATION_S:  300,
  ISG_THRESHOLDS:        [0.25, 0.50, 0.75, 0.90, 1.00],
  IFIT_PATROL_SPEED:     1.0,
  OAS_ATTACK_CHANCE:     0.30,
  OAS_ATTACK_PERIOD_S:   5,
  OAS_ATTACK_RANGE:      5,

  // ── NS1 ──────────────────────────────────────────────────────────────────
  NS1_RADIUS:            6,
  NS1_DURATION_S:        30,

  // ── Win condition ────────────────────────────────────────────────────────
  WIN_COMPLETE_SETS:     8,

  // ── Lighting ─────────────────────────────────────────────────────────────
  MAX_POINTLIGHTS:       14,
  LIGHT_NPC_INTENSITY:   0.30,
  LIGHT_NPC_DIST:        5,
  LIGHT_NUCLEOLUS_INT:   0.15,
  LIGHT_NUCLEOLUS_DIST:  7,

  // ── Colors (0x hex for Three.js, '#hex' for CSS) ─────────────────────────
  COL_BG:           0x0a0818,
  COL_ENVELOPE:     0x4422aa,
  COL_NPC:          0xffaa44,
  COL_EU_CHROM:     0x445566,
  COL_HET_CHROM:    0x221833,
  COL_NUCLEOLUS:    0x441144,
  COL_FLOOR:        0x080614,
  COL_POLII:        0xffdd88,
  COL_HOST_MRNA:    0xffaaaa,
  COL_MRNA_CAP:     0xffcc00,
  COL_VRNA:         0xccaa33,
  COL_NP:           0xffcc44,
  COL_CRNA:         0x44ccaa,
  COL_MRNA_PROD:    0xff8844,
  COL_NS1:          0x8844cc,
  COL_ISG:          0xff4444,
  COL_PA:           0x44aa66,
  COL_PB1:          0x4466cc,
  COL_PB2:          0xcc6644,
};
