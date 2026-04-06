/**
 * vi_p1_config.js — Phase 1 "Aerosol Odyssey" configuration constants.
 * All gameplay-tuning values live here.
 */

/* global */ // accessed as P1_CFG throughout the phase1 modules

const P1_CFG = Object.freeze({

  // ── Classroom dimensions ────────────────────────────────────────────────
  ROOM_LENGTH:  12,   // Z axis: -6 to +6
  ROOM_WIDTH:    8,   // X axis: -4 to +4
  ROOM_HEIGHT:   3,   // Y axis: 0 to +3

  // Boundary limits (keep the droplet inside)
  X_MIN: -3.8,
  X_MAX:  3.8,
  Y_MIN:  0.1,   // floor — hitting this is game over
  Y_MAX:  2.9,   // ceiling bounce
  Z_START: -4.5, // droplet launch Z (near infected student)
  Z_END:    3.2, // target student face Z (approach zone starts 3m before)

  // ── Desk grid ───────────────────────────────────────────────────────────
  DESK_COLS:       4,
  DESK_ROWS:       6,
  DESK_X:          [-2.5, -0.8, 0.8, 2.5],
  DESK_Z_START:    -4.5,
  DESK_Z_SPACING:   1.5,
  OCCUPIED_DESKS:  14,   // out of 24

  // ── Key student positions ───────────────────────────────────────────────
  // Infected student: back-left corner (col 0, row 0)
  INFECTED_COL: 0,
  INFECTED_ROW: 0,
  // Target student: front-right (col 3, row 4)
  TARGET_COL: 3,
  TARGET_ROW: 4,
  // Masked student: middle of room (col 1, row 2)
  MASKED_COL: 1,
  MASKED_ROW: 2,

  // Seat height → seated mouth/head Y
  SEAT_Y:      0.45,
  TORSO_H:     0.50,
  MOUTH_Y:     1.20,  // above floor, seated
  HEAD_Y:      1.15,

  // ── Droplet parameters ──────────────────────────────────────────────────
  DROPLET_START_RADIUS:  0.12,   // game-world visual radius (medium droplet)
  DROPLET_MIN_RADIUS:    0.030,  // fully desiccated — bare virus
  DROPLET_COLOR_FULL:    0xaaddff,
  DROPLET_COLOR_DRY:     0xddeeff,
  DROPLET_OPACITY_FULL:  0.55,
  DROPLET_OPACITY_DRY:   0.10,

  VIRUS_RADIUS:    0.030,
  VIRUS_COLOR:     0xff6644,
  VIRUS_SPIKE_COUNT: 10,

  // ── Evaporation ─────────────────────────────────────────────────────────
  EVAP_BASE_RATE:        5.0,   // %/sec Droplet Integrity loss (normal conditions)
  EVAP_WARM_MULT:        1.30,  // × faster in warm zone (ceiling/lights)
  EVAP_COOL_MULT:        0.80,  // × slower near windows/floor
  EVAP_DRY_MULT:         1.50,  // × faster in HVAC dry zone
  EVAP_HUMID_RATE:      -2.0,   // %/sec (negative = recovery in humid zone)

  // ── Viral viability ─────────────────────────────────────────────────────
  VIAB_BASE_DECAY:       2.0,   // %/sec
  VIAB_UV_DAMAGE:        8.0,   // %/sec additional in UV/sunbeam zone
  VIAB_WARM_DAMAGE:      3.0,   // %/sec additional in warm zone
  VIAB_DESICCATED_MULT:  2.0,   // multiplier when Droplet Integrity = 0
  VIAB_COLLISION_DAMAGE: 3.0,   // % per furniture hit
  DROPLET_COLLISION_DAMAGE: 5.0,// % Droplet Integrity per hit

  // ── Player movement ─────────────────────────────────────────────────────
  BASE_FORWARD_SPEED:  0.5,
  MIN_FORWARD_SPEED:   0.5,
  LATERAL_ACCEL:       6.0,
  MAX_LATERAL_SPEED:   2.5,
  LATERAL_DRAG:        0.88,    // multiplier per frame
  ALTITUDE_ACCEL:      6.0,
  MAX_ALTITUDE_SPEED:  2.0,
  GRAVITY:             0.30,    // units/sec² downward pull
  MAX_TILT_DEG:        12,      // degrees of roll when steering

  // ── Air currents ────────────────────────────────────────────────────────
  HVAC_SUPPLY_POS:       { x: 0,    y: 2.95, z: 0    },
  HVAC_SUPPLY_FORCE_Y:  -1.0,   // downward force near supply vent
  HVAC_SUPPLY_FORCE_X:   0.5,   // outward radial force
  HVAC_SUPPLY_RADIUS:    2.0,   // sphere of influence (m)

  HVAC_RETURN_POS:       { x: 3.95, y: 2.5, z: 0    },
  HVAC_RETURN_FORCE_X:   0.8,   // rightward pull
  HVAC_RETURN_RADIUS:    2.0,

  WINDOW_DRAFT_FORCE_X:  0.3,   // rightward cross-breeze left half of room
  WINDOW_DRAFT_X_THRESH: 0.0,   // left of X=0

  THERMAL_CONVECT_FORCE: 0.1,   // gentle Y force near warm/cool zones
  STUDENT_THERMAL_FORCE: 0.2,
  STUDENT_THERMAL_RADIUS: 0.5,

  // ── Environment zones ───────────────────────────────────────────────────
  WARM_ZONE_Y_MIN:       2.30,  // ceiling warm layer
  COOL_ZONE_X_MAX:      -2.50,  // near left wall
  COOL_ZONE_Y_MAX:       0.80,  // near floor

  // Humidifier on teacher's desk (front-left)
  HUMID_ZONE_CENTER:     { x: -2.5, y: 1.0, z: 4.5 },
  HUMID_ZONE_RADIUS:     1.5,

  // HVAC dry cone extending down from supply vent
  DRY_CONE_HALF_ANGLE:   30,    // degrees
  DRY_CONE_LENGTH:        3.0,

  // UV / sunbeam zones — two angled volumes from left-wall windows
  // Each defined as { x0, y0, z0 } anchor (at window) and a unit direction + half-widths
  UV_ZONE_A: { anchorZ: -1.5, floorXStart: -4.0, floorXEnd: -0.5, yTop: 2.8, yBot: 0.0, zHalfWidth: 0.8 },
  UV_ZONE_B: { anchorZ:  1.5, floorXStart: -4.0, floorXEnd:  0.5, yTop: 2.8, yBot: 0.0, zHalfWidth: 0.8 },

  // ── Target approach ─────────────────────────────────────────────────────
  APPROACH_Z_THRESHOLD:  2.0,   // Z distance from target where approach begins
  INHALATION_ZONE_RADIUS: 0.40,
  BREATH_CYCLE_S:         4.0,  // seconds (2s inhale + 2s exhale)
  INHALE_SUCTION_FORCE:   1.5,  // units/sec at zone edge
  INHALE_SUCTION_MAX:     3.0,  // units/sec very close
  EXHALE_PUSH_FORCE:      1.0,

  // ── Camera ──────────────────────────────────────────────────────────────
  CAM_OFFSET:            { x: 0, y: 0.30, z: -1.2 },
  CAM_OFFSET_APPROACH:   { x: 0, y: 0.20, z: -0.6 },
  CAM_FOV_NORMAL:        65,
  CAM_FOV_APPROACH:      55,
  CAM_LERP:              0.06,
  CAM_ROLL_MAX_DEG:       5,

  // ── Scoring ─────────────────────────────────────────────────────────────
  SCORE_DISTANCE_PER_M:  10,
  SCORE_NEAR_MISS:       50,
  SCORE_UV_SURVIVAL:     100,
  SCORE_PERFECT_VIAB:    200,

  // ── Colors ──────────────────────────────────────────────────────────────
  // Room
  COL_WALL_BEIGE:    0xe8ddd0,
  COL_WALL_FRONT:    0xd4ddd4,
  COL_FLOOR:         0xc4b8a8,
  COL_CEILING:       0xf0eeea,
  COL_WINDOW_GLASS:  0xc8ddf0,
  COL_WHITEBOARD:    0xf8f8f8,
  COL_BOOKSHELF:     0x5c3a1a,
  COL_DOOR:          0x5c4033,
  COL_FLUORESCENT:   0xfffff0,

  // Furniture
  COL_DESK_WOOD:     0xc4a882,
  COL_CHAIR:         0x8a7b6b,
  COL_TEACHER_DESK:  0xa08060,

  // Lighting
  CEIL_LIGHT_INTENSITY: 0.40,
  CEIL_LIGHT_DIST:      12,
  SUN_INTENSITY:        0.50,
  AMB_INTENSITY:        0.25,
  HEMI_SKY_INT:         0.15,

  // ── Students ────────────────────────────────────────────────────────────
  SKIN_TONES: [0xf5d0b0, 0xd4a574, 0xa0704a, 0x6b4226, 0xf0c8a0, 0xc49060],
  HAIR_COLORS: [0x2a1a0a, 0x5c3a1a, 0x8a6a3a, 0x1a1a2a, 0xc4a060, 0x4a2a1a],
  SHIRT_COLORS: [0x3366cc, 0xcc3333, 0x33aa44, 0x888888, 0xeeeedd, 0xddcc22,
                 0x883399, 0xdd7722, 0x224488, 0x228888],

  // ── Particles budget ────────────────────────────────────────────────────
  COUGH_DROPLET_COUNT:  50,
  DUST_MOTE_COUNT:     100,
  VENT_PARTICLE_COUNT:  50,   // per vent
  MIST_PARTICLE_COUNT:  60,   // humidifier

  // ── Educational fact IDs ─────────────────────────────────────────────────
  EDU: {
    COUGH_EXPULSION:   'COUGH_EXPULSION',
    DROPLET_SIZES:     'DROPLET_SIZES',
    UV_DAMAGE:         'UV_DAMAGE',
    TEMPERATURE_WARM:  'TEMPERATURE_WARM',
    TEMPERATURE_COOL:  'TEMPERATURE_COOL',
    HUMIDITY_EFFECT:   'HUMIDITY_EFFECT',
    DRY_AIR_DANGER:    'DRY_AIR_DANGER',
    VENTILATION_ROLE:  'VENTILATION_ROLE',
    EVAPORATION_MID:   'EVAPORATION_MID',
    DROPLET_NUCLEUS:   'DROPLET_NUCLEUS',
    MASK_PROTECTION:   'MASK_PROTECTION',
    MASK_BLOCKED:      'MASK_BLOCKED',
    INHALATION_DOSE:   'INHALATION_DOSE',
    RESPIRATORY_DEPOS: 'RESPIRATORY_DEPOS',
    MUCUS_BARRIER:     'MUCUS_BARRIER',
    TRANSMISSION_DONE: 'TRANSMISSION_DONE',
    GRAVITY_WINS:      'GRAVITY_WINS',
    VIRAL_DECAY:       'VIRAL_DECAY',
  },

});
