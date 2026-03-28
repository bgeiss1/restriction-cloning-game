// vi_p3_config.js — Phase 3 Endosomal Escape: all tunable constants
// Every number that affects gameplay, physics, or aesthetics lives here.
'use strict';

const P3_CFG = {

  // ── Environment geometry ─────────────────────────────────────────────────
  ENDO_RADIUS:       20,    // inner sphere radius (the "room")
  VIRAL_RADIUS:      6,     // viral surface sphere radius
  CAMERA_HEIGHT:     6.5,   // camera Y above origin (just above viral surface)
  CYTOPLASM_RADIUS:  40,    // outer decorative sphere

  // ── Camera ───────────────────────────────────────────────────────────────
  MOUSE_SENSITIVITY: 0.002, // radians per pixel
  PITCH_MIN:        -0.52,  // −30°
  PITCH_MAX:         1.40,  // +80°
  CAM_LERP:          0.15,  // angle smoothing factor per frame
  IDLE_YAW_AMP:      0.008, // idle drift amplitude (radians)
  IDLE_YAW_PERIOD:  12.0,   // idle drift period (seconds)
  SHAKE_DECAY:       5.0,   // exponential decay coefficient for camera shake

  // ── pH dynamics ──────────────────────────────────────────────────────────
  PH_START:          7.4,
  PH_END:            4.8,   // game ends before pH can go lower
  PH_BASE_RATE:      0.024, // pH units per second at baseline
  // Piecewise rate multipliers — checked top-to-bottom, first match wins.
  // "above: X" means "use this mult when current pH > X"
  PH_RATE_BANDS: [
    { above: 7.0, mult: 0.9 },
    { above: 6.5, mult: 0.8 },
    { above: 6.0, mult: 1.0 },
    { above: 5.5, mult: 1.3 },
    { above: 5.0, mult: 1.6 },
    { above: 0.0, mult: 1.8 },
  ],

  // ── pH color keyframes ────────────────────────────────────────────────────
  // Lerped continuously. Each stop defines the color state AT that pH value.
  // Fields: ambient, fog, membrane (hex), memOpacity, fluidColor (hex)
  PH_COLORS: [
    { pH: 7.4, ambient: 0x1a2a4a, fog: 0x0a1628, membrane: 0x2244aa, memOpacity: 0.25, fluid: 0x4488cc },
    { pH: 6.5, ambient: 0x2a3a3a, fog: 0x0f1f20, membrane: 0x448866, memOpacity: 0.30, fluid: 0x44aa88 },
    { pH: 6.0, ambient: 0x3a2a1a, fog: 0x1a1208, membrane: 0xaa8844, memOpacity: 0.35, fluid: 0xcc8844 },
    { pH: 5.5, ambient: 0x4a1a1a, fog: 0x1a0808, membrane: 0xcc4422, memOpacity: 0.40, fluid: 0xff4422 },
    { pH: 5.0, ambient: 0x5a0a0a, fog: 0x200404, membrane: 0xff2200, memOpacity: 0.50, fluid: 0xff2200 },
  ],
  // pH thresholds that trigger a brief full-screen color wash (visual punctuation)
  PH_FLASH_THRESHOLDS: [6.5, 6.0, 5.5, 5.0],

  // ── HA activation thresholds (endosomal pH) ──────────────────────────────
  HA_PREACT_PH:       6.5,  // native → pre-activated
  HA_TRANS_PH:        6.0,  // pre-activated → transition (stalks extending)
  HA_ACT_PH:          5.5,  // transition → activated (fusion peptides exposed)
  HA_READY_PH:        5.0,  // activated → fusion-ready
  HA_FUSION_PH_HIGH:  5.3,  // fusion sweet spot upper bound
  HA_FUSION_PH_LOW:   4.8,  // fusion sweet spot lower bound

  // ── M2 ion channel system ─────────────────────────────────────────────────
  M2_COUNT:           5,
  M2_BURNOUT_TIME:    15,   // seconds continuous open before burnout
  M2_ACID_RATE:       0.05, // internal pH units dropped per second per open channel
  INTERNAL_PH_START:  7.0,
  INTERNAL_PH_MIN:    4.0,  // hard clamp floor
  INTERNAL_PH_DAMAGE: 4.5,  // below this, vRNP segments take damage
  VRNP_DAMAGE_RATE:   8,    // % health lost per second when below damage pH

  // vRNP release rate (% per second) — piecewise by internal pH.
  // Checked top-to-bottom; first match where internalPH > above wins.
  VRNP_RELEASE_RATES: [
    { above: 6.5, rate: 0.5  },
    { above: 6.0, rate: 1.5  },
    { above: 5.5, rate: 4.0  },
    { above: 5.0, rate: 8.0  },
    { above: 0.0, rate: 10.0 },
  ],

  // ── HA system ────────────────────────────────────────────────────────────
  HA_COUNT:              14,
  HA_PRIME_HOLD_TIME:    2.0, // seconds hold-click to pre-prime
  HA_PRIME_TIME_BONUS:   10,  // seconds added to lysosome timer per primed HA
  HA_FUSION_MIN_COUNT:   6,   // minimum aimed HAs to allow fusion
  HA_FUSION_SITE_RAD:    4,   // max spread radius (world units) for valid fusion site

  // ── Endosome integrity system ─────────────────────────────────────────────
  NS1_CHARGES:           8,
  TLR_COUNT:             4,
  TLR_SCAN_PERIOD:       8,   // seconds per complete scan cycle
  TLR_SCAN_MAX_RADIUS:   3,   // scan ring max world-unit radius
  TLR_COOLDOWN:          10,  // seconds of cooldown after NS1 jamming
  TLR_DETECT_ALERT:      15,  // immune alert % gained per detection event
  TLR_DETECT_VRNP_THR:   30,  // vRNP release % threshold before TLRs can detect
  LYSOSOME_TIME:         150, // base timer (seconds)
  LYSOSOME_BONUS_HIGH:   30,  // bonus seconds if p2Accuracy >= 80
  LYSOSOME_BONUS_MID:    15,  // bonus seconds if p2Accuracy >= 60
  IMMUNE_ALERT_MAX:      100,
  IFITM_THRESHOLDS:      [25, 50, 75], // alert % levels that each spawn 2 IFITM patches
  IFITM_RADIUS:          1.2,          // world units — patch blocking radius

  // ── Fusion conditions ─────────────────────────────────────────────────────
  FUSION_VRNP_MIN:       80,  // % vRNP release required

  // ── Fusion cinematic timing (seconds) ────────────────────────────────────
  FUSION_BEAT: [
    { name: 'PEPTIDE_LAUNCH', start: 0.0, end: 1.5 },
    { name: 'HA_JACKKNIFE',   start: 1.5, end: 3.5 },
    { name: 'HEMIFUSION',     start: 3.5, end: 4.5 },
    { name: 'PORE_FORMATION', start: 4.5, end: 6.0 },
    { name: 'TRANSITION',     start: 6.0, end: 7.0 },
  ],

  // ── vRNP targeting finale ─────────────────────────────────────────────────
  VRNP_COUNT:              8,
  PORE_STABILITY_START:    100,
  PORE_DECAY_RATE:         5,   // % per second
  VRNP_TRANSIT_TIME:       0.8, // seconds per segment to travel through pore
  ANTIBODY_DELAY:          2.0, // extra seconds added when antibody tags a segment

  // ── Particles ────────────────────────────────────────────────────────────
  PROTON_MAX:           300,    // max H⁺ particles in scene at once
  PROTON_SIZE:          0.08,   // Points material size (world units)
  PROTON_SPEED:         1.5,    // average travel speed toward origin
  PROTON_LIFE:          3.0,    // seconds lifetime

  // ── Lights ───────────────────────────────────────────────────────────────
  MAX_POINT_LIGHTS:     12,
  HEMI_PULSE_AMP:       0.05,  // hemisphere light intensity oscillation amplitude
  HEMI_PULSE_FREQ:      1.2,   // Hz

  // ── Structural colors (constant regardless of pH) ────────────────────────
  COL_HA_BASE:          0x00cc88,
  COL_HA_FUSION_PEP:    0xff44aa,
  COL_M2_CLOSED:        0x4488ff,
  COL_M2_OPEN:          0x00ffff,
  COL_M2_BURNOUT:       0x3a2a1a,
  COL_VRNP_BASE:        0xffcc44,  // individual segments get slight tint offsets
  COL_M1_MATRIX:        0x888899,
  COL_VATPASE:          0xff6644,
  COL_TLR:              0xaa44ff,
  COL_TLR_SCAN:         0x8833cc,
  COL_LYSOSOME:         0xff2200,
  COL_PROTON:           0xffffaa,
  COL_VIRAL_SURFACE:    0x336655,
  COL_CYTOPLASM_BG:     0x040810,
  COL_IFITM:            0x334466,
  COL_FUSION_LINE:      0x00ffcc,  // HA targeting laser line
  COL_FUSION_SITE:      0x00ffcc,  // fusion site indicator ring
  COL_HEMI_SKY:         0x1a2a4a,  // initial hemisphere sky color (shifts with pH)

  // per-segment vRNP gold tints (slight hue variation)
  COL_VRNP: [
    0xffcc44, 0xffbb33, 0xffdd55, 0xffaa22,
    0xffe066, 0xffc033, 0xffcf50, 0xffb840,
  ],

  // ── Objective text by game stage ─────────────────────────────────────────
  OBJ: {
    INTRO:    'Click to begin endosomal escape',
    EARLY:    'Open M2 ion channels — acidify the virion interior (M key)',
    MID_HA:   'Aim activated HA trimers at the endosome wall (F key)',
    LATE:     'Jam TLR sensors (Q key) — SPACE to trigger fusion when ready',
    FUSION:   'TRIGGER FUSION — Press SPACE when conditions are met',
    VRNP:     'Extract genome segments through the fusion pore! (SPACE)',
    COMPLETE: 'Endosomal escape complete',
  },

  // ── Educational fact IDs ─────────────────────────────────────────────────
  EDU: {
    M2_OPEN:     'M2_OPEN',
    M2_BURN:     'M2_BURN',
    VRNP_MID:    'VRNP_MID',
    VRNP_FREE:   'VRNP_FREE',
    TLR_SCAN:    'TLR_SCAN',
    NS1_USE:     'NS1_USE',
    NS1_OUT:     'NS1_OUT',
    IFITM:       'IFITM_APPEAR',
    HA_PREACT:   'HA_PREACT',
    HA_ACTIVE:   'HA_ACTIVE',
    HA_AIM:      'HA_AIM',
    FUSION_GO:   'FUSION_GO',
    HEMIFUSION:  'HEMIFUSION',
    PORE_OPEN:   'PORE_OPEN',
    SEG:         ['SEG_1','SEG_2','SEG_3','SEG_4','SEG_5','SEG_6','SEG_7','SEG_8'],
    ESCAPE_DONE: 'ESCAPE_DONE',
  },

  // ── vRNP segment educational text (shown on pore transit) ────────────────
  SEG_TEXT: [
    'Segment 1: PB2 — polymerase subunit, cap-snatching from host mRNA',
    'Segment 2: PB1 — RNA-dependent RNA polymerase catalytic subunit',
    'Segment 3: PA — polymerase subunit with endonuclease activity',
    'Segment 4: Hemagglutinin — the receptor-binding and fusion protein you just used',
    'Segment 5: Nucleoprotein — coats and protects the viral RNA',
    'Segment 6: Neuraminidase — cleaves sialic acid for viral release',
    'Segment 7: Matrix (M1) and ion channel (M2) — the structures you just manipulated',
    'Segment 8: NS1 (immune evasion / TLR jammer) and NEP (nuclear export)',
  ],

};
