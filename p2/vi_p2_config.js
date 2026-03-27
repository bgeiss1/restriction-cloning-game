// vi_p2_config.js — Phase 2 Attachment: all tunable constants
'use strict';

const P2_CFG = {

  // ── Lanes ────────────────────────────────────────────────────────────────
  LANES:               [-6, -3, 0, 3, 6],
  LANE_LERP_DURATION:  0.15,   // seconds to complete a lane switch
  LANE_ROLL_DEG:       15,     // tilt angle (degrees) during lane switch

  // ── Player movement ──────────────────────────────────────────────────────
  JUMP_RISE_TIME:      0.30,   // s to reach peak
  JUMP_FALL_TIME:      0.40,   // s to fall back to ground
  JUMP_HEIGHT:         3.0,    // world units
  SLIDE_DURATION:      0.5,    // s
  SLIDE_SCALE_Y:       0.4,
  SLIDE_SCALE_XZ:      1.3,
  BOB_AMPLITUDE:       0.05,   // gentle float bob (world units)
  BOB_PERIOD:          1.0,    // seconds per full bob cycle
  LAND_SQUASH_SCALE:   0.8,
  LAND_SQUASH_DURATION:0.1,    // s

  // ── Speed ────────────────────────────────────────────────────────────────
  BASE_SPEED:          1.0,
  SPEED_RAMP:          0.01,   // added per second of elapsed time
  SPEED_CAP:           2.0,

  // ── Health & meters ──────────────────────────────────────────────────────
  PLAYER_HP:           100,
  BINDING_PER_RECEPTOR:[2, 3],  // [min, max] % per sialic acid hit
  BINDING_WIN:         100,     // % to trigger phase complete
  ALERT_DECAY:         1.0,     // % per second when not taking hits
  HP_REGEN_RATE:       4,       // HP per second recovered when not recently hit
  HP_REGEN_DELAY:      2.5,     // seconds after last hit before regen resumes

  // ── Damage values ────────────────────────────────────────────────────────
  DMG_WRONG_RECEPTOR:  15,
  DMG_DECOY:           10,
  DMG_ANTIBODY:        25,
  DMG_COMPLEMENT:      20,

  // ── Alert gains on hit ───────────────────────────────────────────────────
  ALERT_WRONG_RECEPTOR:8,
  ALERT_ANTIBODY:      12,
  ALERT_COMPLEMENT:    15,

  // ── Antibody carryover from Phase 1 ─────────────────────────────────────
  // Index = number of bound sites (0–4).
  // Receptor score multiplier — 0 bound = full credit, 4 bound = 10%
  CARRYOVER_MULTIPLIER:  [1.00, 0.80, 0.55, 0.30, 0.10],
  // Starting alert % inherited from Phase 1 outcome
  CARRYOVER_ALERT_START: [0,    10,   20,   35,   50],

  // ── Terrain ──────────────────────────────────────────────────────────────
  CHUNK_LENGTH:        200,    // world units along Z per chunk
  CHUNK_WIDTH:         40,     // world units along X
  LIPID_SPACING:       0.14,  // grid pitch between lipid head centers (world units)
  LIPID_RADIUS:        0.07,  // lipid head sphere radius
  NUM_CHUNKS:          3,
  PLAYER_Z:            0,      // player fixed world Z; terrain scrolls toward -Z
  CAMERA_Z_OFFSET:    -8,      // camera behind player
  CAMERA_Y_OFFSET:     6,

  // ── Lighting ─────────────────────────────────────────────────────────────
  MAX_POINT_LIGHTS:    8,      // hard cap; lights beyond this are removed

  // ── Difficulty stage start times (seconds elapsed) ───────────────────────
  STAGE_TUTORIAL_END:  15,
  STAGE_MID_START:     15,
  STAGE_HARD_START:    30,
  STAGE_FULL_START:    60,
  STAGE_MAX_START:     90,

  // ── Receptor spawn weights (must sum ≤ 1.0; remainder = empty slot) ──────
  SPAWN_W_SIALIC:      0.10,
  SPAWN_W_ACE2:        0.20,
  SPAWN_W_CD4:         0.15,
  SPAWN_W_ICAM1:       0.15,
  SPAWN_W_DECOY:       0.07,
  // In a lipid raft zone, sialic acid weight rises to:
  SPAWN_W_SIALIC_RAFT: 0.17,
  // Guarantee one sialic acid every N rows
  SPAWN_GUARANTEE_ROWS:6,
  // Decoys only appear after this many correct collections
  DECOY_MIN_COLLECTED: 3,

  // ── Row / chunk layout ───────────────────────────────────────────────────
  ROW_SPACING:         8,      // world units between spawn rows
  RECEPTORS_PER_ROW:   [1, 3], // [min, max] receptors per row
  MIN_OPEN_LANES:      2,      // lanes that must stay clear per row

  // ── Obstacle timing ──────────────────────────────────────────────────────
  ANTIBODY_START_T:    15,     // seconds before antibodies appear
  COMPLEMENT_START_T:  30,
  MUCUS_START_T:       15,

  // ── Power-ups ────────────────────────────────────────────────────────────
  POWERUP_CHANCE:      0.5,    // probability of a power-up per chunk
  DRIFT_DURATION:      8,      // seconds
  DRIFT_BINDING_MULT:  0.5,    // sialic acid only gives 50% binding while active
  NA_DURATION:         5,
  NA_RADIUS:           15,     // world units cleared forward
  RAFT_DURATION:       6,

  // ── Collision radii ──────────────────────────────────────────────────────
  RADIUS_PLAYER:       0.5,
  RADIUS_RECEPTOR:     0.4,
  RADIUS_ANTIBODY:     0.8,
  RADIUS_COMPLEMENT:   0.5,
  RADIUS_COMP_RING:    2.0,    // detonation danger zone
  RADIUS_MUCUS:        1.5,
  RADIUS_POWERUP:      0.6,
  COLLISION_Z_RANGE:   20,     // only check objects within this many units of player

  // ── Colors (integer hex for Three.js) ───────────────────────────────────
  FOG_DENSITY:   0.009,     // lower = more visible distance (shows curve better)

  COL_BG:        0x0a0404,  // bronchial lumen: dark warm near-black
  COL_FOG:       0x160808,  // warm respiratory haze
  COL_MEMBRANE:  0x7c2e38,  // respiratory epithelium: muted dusty rose
  COL_MEM_EMI:   0x250810,  // subtle warm mucosal glow
  COL_SUBMEM:    0x280c12,  // submucosa: deeper reddish tissue
  COL_RAFT:      0x4a1a22,  // lipid raft in tissue context
  COL_SIALIC:    0x00ff88,
  COL_ACE2:      0x4488ff,
  COL_CD4:       0xaa44ff,
  COL_ICAM1:     0xff8844,
  COL_DECOY:     0x88ff44,
  COL_ANTIBODY:  0xffdd44,
  COL_COMPLEMENT:0xff4444,
  COL_PLAYER:    0xff6644,
  COL_SPIKE_HA:  0xff4422,
  COL_SPIKE_NA:  0xff8833,
  COL_MUCUS:     0xaaffcc,
  COL_GLYCO:     0x88ddff,
  COL_PU_DRIFT:  0xff88ff,
  COL_PU_NA:     0xff8800,
  COL_PU_RAFT:   0x00ccff,
  COL_PLAYER_LIGHT: 0xff8866,
  COL_LIPID_HEAD:   0x8c3c48,  // phospholipid head (outer leaflet) — warm pink
  COL_LIPID_EMI:    0x1c0808,  // lipid head emissive
};
