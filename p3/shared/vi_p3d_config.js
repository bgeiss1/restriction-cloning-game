'use strict';
const P3D_CFG = {

  // ── pH progression ────────────────────────────────────────────────────
  PH_START:         7.4,
  PH_ACT1_END:      5.3,    // triggers Act 1 → 2 transition
  PH_ACT2_END:      5.0,    // pH at Act 2 completion
  PH_ACT2_RATE:     0.004,  // fixed pH/sec during Act 2

  // Piecewise drop rate during Act 1 (tested high → low)
  PH_RATE_TABLE: [
    { above: 7.0, rate: 0.015 },
    { above: 6.5, rate: 0.018 },
    { above: 6.0, rate: 0.022 },
    { above: 5.5, rate: 0.028 },
    { above: 0.0, rate: 0.032 },
  ],

  // pH color keyframes — ambient, fog, endosome tint (pH descending order)
  PH_KEYFRAMES: [
    { ph: 7.4, ambient: 0x1a2a5a, fog: 0x080c1e, endo: 0x2244aa },
    { ph: 6.8, ambient: 0x1a3a4a, fog: 0x0a1420, endo: 0x226688 },
    { ph: 6.2, ambient: 0x2a3a2a, fog: 0x0f1a10, endo: 0x446644 },
    { ph: 5.8, ambient: 0x3a2a1a, fog: 0x1a1208, endo: 0x886644 },
    { ph: 5.2, ambient: 0x4a1a1a, fog: 0x1a0808, endo: 0xcc4422 },
    { ph: 4.8, ambient: 0x5a0a0a, fog: 0x200404, endo: 0xcc2200 },
  ],

  // ── Act 1: Descent ────────────────────────────────────────────────────
  A1_DESCENT_BASE:   4.0,
  A1_DESCENT_ACCEL:  0.015,
  A1_DESCENT_CAP:    7.0,

  A1_ENDO_RADIUS:    2.5,
  A1_MOVE_ACCEL:     12.0,
  A1_MOVE_DRAG:      0.88,   // per-second velocity multiplier
  A1_MOVE_MAX:       6.0,
  A1_BOUNDARY_R:     15.0,
  A1_BOUNDARY_F:     8.0,    // restoring force strength
  A1_TILT_MAX_DEG:   8.0,
  A1_TILT_LERP:      0.1,

  A1_CHUNK_H:        60,
  A1_CHUNK_N:        3,
  A1_FILAMENTS_N:    10,
  A1_MITO_N:         2,
  A1_ER_N:           1,
  A1_VESICLE_N:      4,
  A1_AMBIENT_PTS:    250,

  // [pHAbove, minPerChunk, maxPerChunk]
  A1_LYSO_TABLE: [
    { above: 6.5, min: 1, max: 2 },
    { above: 5.8, min: 2, max: 3 },
    { above: 0.0, min: 3, max: 4 },
  ],
  A1_LYSO_MAX:       6,
  A1_LYSO_R_MIN:     1.5,
  A1_LYSO_R_MAX:     2.0,
  A1_LYSO_DANGER_R:  4.0,
  A1_LYSO_HOME_SPD:  1.5,
  A1_LYSO_DRIFT_AMP: 3.5,
  A1_LYSO_DRIFT_PER: 5.0,
  A1_LYSO_DMG:       20,
  A1_MITO_DMG:       5,
  A1_AB_ALERT_INC:   10,

  A1_NEAR_MISS_PTS:  50,
  A1_COLLECT_PTS:    100,
  A1_HEALTH_RESTORE: 15,
  A1_AB_STRAG_FREQ:  2.5,   // avg chunks between stragglers

  A1_CLATHRIN_FADE:  15.0,
  A1_RAB5_PH:        6.8,
  A1_RAB7_PH:        6.0,
  A1_BEAT_PH_START:  6.0,
  A1_BEAT_RATE_S:    1.0,
  A1_BEAT_RATE_E:    1.4,

  A1_CAM_LERP:       0.08,
  A1_CAM_OY:         12,
  A1_CAM_OZ:        -6,
  A1_CAM_FOV_S:      55,
  A1_CAM_FOV_E:      50,
  A1_CAM_SHAKE_DEC:  5.0,
  A1_CAM_SHAKE_AMP:  0.15,
  A1_CAM_SHAKE_DUR:  0.3,
  A1_FOG_DENSITY:    0.012,

  // ── Act 2: Conformational Change ─────────────────────────────────────
  A2_BPM:            { A: 90,  B: 100, C: 110, D: 120, E: 130 },
  A2_PHASE_DUR:      { A: 15,  B: 15,  C: 20,  D: 10,  E: 15  },

  A2_T_PERFECT_MS:   55,
  A2_T_GOOD_MS:      130,
  A2_T_SYNC_MS:      80,

  A2_PTS_PERFECT:    100,
  A2_PTS_GOOD:       50,
  A2_PTS_HOLD:       150,
  A2_PTS_SYNC:       200,
  A2_PTS_TAP:        30,
  A2_PTS_BURST:      100,

  A2_IR_FAIL:        16,
  A2_IR_MISS:        1,
  A2_IR_AB:          1,
  A2_IR_SYNC_MISS:   2,

  A2_ORBIT_RATE:     0.025,
  A2_NODE_SPD:       300,    // px/sec scroll
  A2_LANE_W:         100,    // px
  A2_HIT_Y:          80,     // px from bottom of lane

  // Score multiplier tiers [irMax, mult, label]
  A2_SCORE_TIERS: [
    { irMax:  5, mult: 1.0, label: 'Clean'    },
    { irMax: 10, mult: 0.8, label: 'Rough'    },
    { irMax: 15, mult: 0.5, label: 'Impaired' },
  ],

  // M2 token carryover: each removes 1 starting immune resistance (max 3)
  M2_IR_OFFSET:     1,
  M2_IR_MAX:        3,

  // ── Act 3: Epilogue ───────────────────────────────────────────────────
  A3_TRAVEL_SPD:    3.0,
  A3_VRNP_INTERVAL: 1.0,
  A3_NUDGE_RANGE:   2.0,
  A3_NUDGE_SPD:     3.0,
  A3_JOURNEY_DUR:   25.0,
  A3_NPC_N:         25,
  A3_NUCLEUS_R:     10.0,
  A3_NUCLEUS_POS:   { x: 0, y: 0, z: 80 },

  A3_VRNP_COUNTS: [
    { irMax:  5, n: 8 },
    { irMax: 10, n: 7 },
    { irMax: 15, n: 6 },
  ],
  A3_VRNP_LABELS: [
    'PB2 — polymerase cap-binding subunit',
    'PB1 — RNA-dependent RNA polymerase',
    'PA — polymerase endonuclease',
    'HA — hemagglutinin (used for fusion)',
    'NP — nucleoprotein (RNA coat)',
    'NA — neuraminidase (viral release)',
    'M1 & M2 — matrix protein and ion channel',
    'NS1 & NEP — immune evasion and nuclear export',
  ],
  A3_VRNP_COLS: [
    0xffdd66, 0xffcc44, 0xffbb33, 0xffaa22,
    0xeecc55, 0xddbb44, 0xccaa33, 0xcc9922,
  ],
  A3_NPC_NOTES:     [330, 370, 415, 440, 494, 554, 587, 660],
  NS1_SUPP_R:       3.0,
  NS1_SUPP_DUR:     5.0,

  // ── Transitions ───────────────────────────────────────────────────────
  TRANS_12_DUR:     6.0,
  TRANS_12_SLOW:    2.0,
  TRANS_23_DUR:     9.0,

  // ── Audio ─────────────────────────────────────────────────────────────
  AUD_MASTER:       0.6,
  AUD_DRONE_FREQS:  [50, 75],
  AUD_DRONE_GAIN:   0.025,
  AUD_NOISE_GAIN:   0.005,
  AUD_WHOOSH_GAIN_LO: 0.005,
  AUD_WHOOSH_GAIN_HI: 0.012,
  AUD_BEAT_FREQ:    40,
  AUD_BEAT_GAIN_S:  0.01,
  AUD_BEAT_GAIN_E:  0.04,
  AUD_A2_MUSIC_GAIN: 0.07,  // Act 2 SMB synth gain (direct to destination)
  AUD_LANE_FREQS:   [440, 554, 660],
  AUD_TICK_GAIN:    0.015,
  AUD_HIT_P_GAIN:   0.04,
  AUD_HIT_G_GAIN:   0.02,
  AUD_MISS_GAIN:    0.025,
  AUD_SYNC_GAIN:    0.04,
  AUD_BUZZ_GAIN:    0.03,
  AUD_VRNP_FREQS:   [330, 370, 415, 440, 494, 554, 587, 660],
  AUD_NUC_FREQS:    [65, 130, 195],
  AUD_VRNP_GAIN:    0.025,
  AUD_NUC_GAIN:     0.015,

  // ── Structural colors ─────────────────────────────────────────────────
  COL_VIRUS:        0xff6644,
  COL_HA:           0x00cc88,
  COL_HA_EM:        0x003322,
  COL_FP:           0xff44aa,
  COL_M2_CLOSED:    0x4488ff,
  COL_M2_OPEN:      0x00ffff,
  COL_VRNP:         0xffcc44,
  COL_M1:           0x888899,
  COL_LYSO:         0xff2222,
  COL_CYTO:         0x667799,
  COL_RAB5:         0x44cc88,
  COL_RAB7:         0xccaa44,
  COL_CLATHRIN:     0xccbb88,
  COL_NUCLEUS:      0x6644cc,
  COL_NPC:          0xaa88ff,
  COL_PROTON:       0xffffaa,
  COL_MITO:         0x225533,
  COL_ER:           0x334488,
  COL_M2_TOK:       0x4488ff,
  COL_NS1_TOK:      0x9944cc,
  COL_HEALTH_TOK:   0x44cc44,
  COL_IMPORTIN:     0x8899bb,

  // ── Education ticker ──────────────────────────────────────────────────
  EDU_SHOW_DUR:     4.0,
  EDU_FADE_DUR:     0.5,
};
