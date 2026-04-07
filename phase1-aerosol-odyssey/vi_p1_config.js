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

  // ── 2D Side-Scroller ────────────────────────────────────────────────────────
  WORLD_HEIGHT_2D: 12,          // orthographic world height (meters)
  WORLD_WIDTH_2D:  1000,        // total level width (meters) - 10x longer
  VIEW_HEIGHT_2D:  24,          // orthographic view height (2X zoom out)

  SCROLL_SPEED_INIT_2D: 3.5,    // initial auto-scroll speed (m/s)
  SCROLL_SPEED_MAX_2D:  8.0,    // maximum auto-scroll speed (m/s)
  SCROLL_RAMP_2D:       0.22,   // scroll acceleration rate (delta/s)

  DROPLET_VIEW_FRAC_2D: 0.25,   // droplet x = scrollX + viewW × 0.25
  FLOOR_Y_2D:           0.0,    // floor level (y coordinate)
  CEIL_Y_2D:            24.0,   // ceiling level (y coordinate) - matches new view height

  DROPLET_START_Y_2D:      12.0, // droplet spawn altitude (y coordinate) - centered in new view
  DROPLET_RADIUS_2D:       0.55,// droplet visual radius (meters)
  DROPLET_RADIUS_MIN_2D:   0.12,// minimum radius when desiccated

  DROPLET_GRAVITY_2D:      3.0, // base gravity (m/s²)
  DROPLET_GRAVITY_SIZE_2D: 1.5, // gravity multiplier = 1 + size²×this
  DROPLET_THRUST_UP_2D:    12.0, // upward thrust force (m/s²) - increased for responsiveness
  DROPLET_THRUST_DOWN_2D:  10.0, // downward thrust force (m/s²) - balanced with up
  DROPLET_THRUST_LR_2D:    4.0,  // lateral nudge force (m/s²) - increased
  DROPLET_VY_MAX_2D:       9.0,  // max vertical velocity (m/s) - increased range
  DROPLET_VX_NUDGE_MAX_2D: 3.0,  // max lateral nudge velocity (m/s) - increased
  DROPLET_DRAG_2D:         0.94, // velocity drag coefficient - reduced drag for responsiveness

  EVAP_RATE_2D:            0.008,// evaporation rate (%/s)
  VIAB_DECAY_BASE_2D:      0.4, // viral viability base decay (%/s)
  VIAB_DESICCATED_MULT_2D: 4.0, // viability decay multiplier when dry

  MOUTH_WORLD_X_2D:        950.0,// Cam's mouth x-coordinate (world) - near end of 1000m level
  MOUTH_WORLD_Y_2D:        10.0, // Cam's mouth y-coordinate (world) - repositioned for 24m view
  WIN_DIST_2D:             2.0, // win distance to mouth (meters)

  BREATH_CYCLE_2D:         4.0, // breath cycle duration (seconds)
  INHALE_FRAC_2D:          0.45,// fraction of cycle spent inhaling
  EXHALE_FRAC_2D:          0.45,// fraction of cycle spent exhaling
  INHALE_PULL_RANGE_2D:    10.0,// inhale effect range (meters)
  INHALE_PULL_FORCE_2D:    4.0, // inhale pull force (m/s²)
  EXHALE_PUSH_FORCE_2D:    2.5, // exhale push force (m/s²)

  PLATFORMS_2D: [
    // Floor obstacles (spread across 1000m)
    { x:  80, y: 0,    w: 5, h: 2.2 },
    { x: 180, y: 0,    w: 4, h: 3.5 },
    { x: 280, y: 0,    w: 6, h: 2.8 },
    { x: 380, y: 0,    w: 5, h: 4.0 },
    { x: 480, y: 0,    w: 7, h: 3.2 },
    { x: 580, y: 0,    w: 4, h: 2.8 },
    { x: 680, y: 0,    w: 6, h: 3.8 },
    { x: 780, y: 0,    w: 5, h: 5.0 },

    // Ceiling obstacles (spread across 1000m)
    { x: 120, y: 19.0, w: 5, h: 2.5 },
    { x: 220, y: 15.0, w: 5, h: 4.5 },
    { x: 320, y: 16.0, w: 5, h: 4.0 },
    { x: 420, y: 18.0, w: 6, h: 3.0 },
    { x: 520, y: 17.0, w: 4, h: 3.5 },
    { x: 620, y: 19.5, w: 5, h: 2.5 },
    { x: 720, y: 16.5, w: 5, h: 4.0 },
    { x: 820, y: 20.0, w: 5, h: 2.0 },
  ],

  // ── Hazard Zones ───────────────────────────────────────────────────────────
  HAZARD_ZONES_2D: [
    // UV Light zones (increase viral decay significantly) - scaled for 1000m level
    { type: 'UV', x: 350, y: 8, w: 80, h: 4, intensity: 1.0 },
    { type: 'UV', x: 450, y: 2, w: 60, h: 5, intensity: 0.8 },
    { type: 'UV', x: 720, y: 6, w: 100, h: 6, intensity: 1.2 },

    // Heat zones (increase evaporation rate) - scaled for 1000m level
    { type: 'HEAT', x: 250, y: 0, w: 120, h: 8, intensity: 1.0 },
    { type: 'HEAT', x: 600, y: 8, w: 80, h: 4, intensity: 0.7 },

    // Dry Air zones (increase evaporation + lateral wind force) - scaled for 1000m level
    { type: 'DRY_AIR', x: 350, y: 0, w: 150, h: 12, intensity: 1.0, windX: -2.0 },
    { type: 'DRY_AIR', x: 850, y: 2, w: 80, h: 8, intensity: 0.8, windX: 1.5 },

    // Humidity zones (BENEFICIAL - decrease evaporation) - scaled for 1000m level
    { type: 'HUMID', x: 20, y: 4, w: 60, h: 6, intensity: 0.8 },
    { type: 'HUMID', x: 150, y: 6, w: 80, h: 4, intensity: 1.0 },
    { type: 'HUMID', x: 520, y: 1, w: 60, h: 4, intensity: 0.6 },
  ],

  // Zone effect multipliers
  ZONE_UV_VIAB_MULT_2D:     5.0,  // UV increases viral decay by 5x
  ZONE_HEAT_EVAP_MULT_2D:   3.0,  // Heat increases evaporation by 3x
  ZONE_DRY_EVAP_MULT_2D:    2.5,  // Dry air increases evaporation by 2.5x
  ZONE_HUMID_EVAP_MULT_2D:  0.3,  // Humidity reduces evaporation to 30%

  DRY_AIR_WIND_SCALE_2D:    1.0,  // Wind force scaling for dry air zones

  // ── Companion Droplets ─────────────────────────────────────────────────────
  COMPANION_DROPLETS_2D: [
    // Early game companions (smaller benefits) - scaled for 1000m level
    { x: 120, y: 6.5, size: 0.35, viralContent: 15, benefit: 'size' },
    { x: 280, y: 4.0, size: 0.40, viralContent: 20, benefit: 'viability' },
    { x: 380, y: 8.5, size: 0.32, viralContent: 12, benefit: 'size' },

    // Mid-game companions (moderate benefits) - scaled for 1000m level
    { x: 480, y: 3.5, size: 0.45, viralContent: 25, benefit: 'both' },
    { x: 580, y: 7.0, size: 0.38, viralContent: 18, benefit: 'viability' },
    { x: 670, y: 5.5, size: 0.42, viralContent: 22, benefit: 'size' },

    // Late game companions (larger benefits, riskier positions) - scaled for 1000m level
    { x: 760, y: 9.0, size: 0.50, viralContent: 30, benefit: 'both' },
    { x: 840, y: 2.5, size: 0.38, viralContent: 20, benefit: 'viability' },
    { x: 910, y: 6.8, size: 0.45, viralContent: 28, benefit: 'both' },
  ],

  COMPANION_FUSION_RANGE_2D:   1.2,   // Fusion trigger distance
  COMPANION_SIZE_BOOST_2D:     0.15,  // Radius increase per fusion
  COMPANION_VIAB_BOOST_2D:     8.0,   // Viability increase per fusion
  COMPANION_INTEGRITY_BOOST_2D: 12.0, // Droplet integrity increase per fusion

  COMPANION_DRIFT_SPEED_2D:    0.8,   // Slow lateral drift speed
  COMPANION_BOB_AMPLITUDE_2D:  0.12,  // Vertical bobbing amplitude
  COMPANION_BOB_FREQUENCY_2D:  1.8,   // Bobbing cycles per second

  // ── Advanced Level Design ──────────────────────────────────────────────────
  MOVING_OBSTACLES_2D: [
    // Early game - simple vertical movers - scaled for 1000m level
    { id: 'early_1', x: 200, startY: 2, endY: 6, w: 3, h: 1.5, speed: 1.2, phase: 0 },
    { id: 'early_2', x: 320, startY: 8, endY: 11, w: 4, h: 1.0, speed: 0.8, phase: Math.PI },

    // Mid game - faster, more complex patterns - scaled for 1000m level
    { id: 'mid_1', x: 460, startY: 1, endY: 5, w: 2.5, h: 2.0, speed: 1.8, phase: Math.PI/2 },
    { id: 'mid_2', x: 540, startY: 7, endY: 10.5, w: 3.5, h: 1.2, speed: 1.5, phase: 0 },
    { id: 'mid_3', x: 620, startY: 3, endY: 8, w: 3, h: 1.8, speed: 2.0, phase: Math.PI/3 },

    // Late game - narrow gaps with synchronized movement - scaled for 1000m level
    { id: 'late_1', x: 740, startY: 2, endY: 6, w: 2, h: 2.5, speed: 2.2, phase: 0 },
    { id: 'late_2', x: 740, startY: 8, endY: 10, w: 2, h: 2.0, speed: 2.2, phase: Math.PI },
    { id: 'late_3', x: 810, startY: 4, endY: 9, w: 2.5, h: 2.2, speed: 1.9, phase: Math.PI/4 },
  ],

  // Combined hazard zones (late game challenge areas)
  COMBINED_HAZARDS_2D: [
    // UV + Heat combination (extreme viral decay + evaporation) - scaled for 1000m level
    { x: 700, y: 4, w: 80, h: 6, types: ['UV', 'HEAT'], intensity: 1.2 },

    // Dry Air + Heat (extreme evaporation with wind) - scaled for 1000m level
    { x: 870, y: 6, w: 60, h: 5, types: ['DRY_AIR', 'HEAT'], intensity: 1.0, windX: -2.5 },
  ],

  // Difficulty progression multipliers (applied based on x position)
  DIFFICULTY_PROGRESSION_2D: {
    // Hazard intensity scaling (multiplier increases with distance)
    hazardIntensityStart: 0.7,    // 70% intensity at start
    hazardIntensityEnd: 1.4,      // 140% intensity at end

    // Evaporation base rate scaling
    evaporationStart: 0.8,        // 80% evaporation rate early
    evaporationEnd: 1.3,          // 130% evaporation rate late

    // Scroll speed scaling points - scaled for 1000m level
    speedBoostPoints: [250, 500, 750], // x positions where speed increases
    speedBoostAmount: 0.5,              // m/s increase per boost point
  },

  // Advanced air currents (more complex patterns)
  ADVANCED_AIR_CURRENTS_2D: [
    // Swirling current near start - scaled for 1000m level
    { x: 150, y: 6, w: 80, h: 8, type: 'VORTEX', strength: 1.5, radius: 4 },

    // Downdraft near middle - scaled for 1000m level
    { x: 500, y: 8, w: 60, h: 4, type: 'DOWNDRAFT', strength: 2.0 },

    // Chaotic turbulence near end - scaled for 1000m level
    { x: 850, y: 2, w: 100, h: 8, type: 'TURBULENCE', strength: 1.8 },
  ],

  // ── Polish & Visual Effects ────────────────────────────────────────────────
  // Performance settings
  PARTICLE_LOD_DISTANCE_2D: 15.0,    // Reduce particles beyond this scroll distance
  PARTICLE_LOD_REDUCTION_2D: 0.6,    // Multiply particle count by this when far away
  MAX_PARTICLES_PER_ZONE_2D: 50,     // Performance cap per hazard zone

  // Enhanced visual effects
  FUSION_FLASH_DURATION_2D: 0.3,     // Duration of fusion flash effect
  FUSION_PARTICLE_COUNT_2D: 15,      // Particles spawned on fusion
  HAZARD_ENTRY_FLASH_2D: 0.2,        // Flash duration when entering dangerous zones
  SPEED_BOOST_EFFECT_2D: 0.4,        // Visual effect duration for scroll speed boosts

  // Damage indication
  DAMAGE_FLASH_DURATION_2D: 0.15,    // Red flash duration when taking damage
  CRITICAL_HEALTH_THRESHOLD_2D: 25,  // Health % that triggers critical warnings

  // Enhanced particle effects
  TRAIL_PARTICLE_COUNT_2D: 8,        // Number of trail particles behind droplet
  TRAIL_PARTICLE_LIFETIME_2D: 1.2,   // How long trail particles persist

  // Audio feedback constants
  AUDIO_FUSION_VOLUME_2D: 0.7,       // Volume for fusion sound
  AUDIO_DAMAGE_VOLUME_2D: 0.5,       // Volume for damage sounds
  AUDIO_ZONE_VOLUME_2D: 0.3,         // Volume for ambient zone sounds

  // Balance refinements (Chunk F adjustments)
  EVAP_RATE_BALANCED_2D: 0.006,      // Reduced from 0.008 (was too harsh)
  VIAB_DECAY_BALANCED_2D: 0.005,     // ~0.5%/sec - balanced for 1000m level length
  COMPANION_SIZE_BALANCED_2D: 0.12,  // Reduced from 0.15 (less OP size growth)
  COMPANION_VIAB_BALANCED_2D: 6.0,   // Reduced from 8.0 (balanced healing)

  // Visual polish constants
  MATERIAL_SHININESS_ENHANCED_2D: 100, // Enhanced shininess for water droplets
  EMISSIVE_PULSE_SPEED_2D: 2.0,       // Speed of emissive pulsing effects
  PARTICLE_ALPHA_FADE_2D: 0.95,       // Alpha decay rate for fading particles

});
