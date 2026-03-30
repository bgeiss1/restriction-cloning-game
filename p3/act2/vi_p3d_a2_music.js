'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// vi_p3d_a2_music.js
// Sub-chunk 2a: SMB_NOTES constant + A2SMBSynth class
// Sub-chunk 2b (A2SMBBeatmap) is appended separately.
//
// Tempo: 200 BPM  →  quarter = 0.300 s, 8th = 0.150 s, 16th = 0.075 s
// Frequencies: equal temperament, A4 = 440 Hz
//
// Voice 0 = melody (square, upper register)
// Voice 1 = bass  (square, one octave below chord root, walking pattern)
//
// Staccato melody notes use dur 0.070 s (NES percussive hit feel).
// Held melody notes use rhythmic value − 0.030 s gap.
// Bass notes use dur 0.110 s (slightly longer than staccato, still punchy).
// ─────────────────────────────────────────────────────────────────────────────

// ── Frequency reference (Hz) ─────────────────────────────────────────────────
// G3=196.00  A3=220.00  B3=246.94  C4=261.63  D4=293.66  E4=329.63
// F4=349.23  F#4=369.99 G4=392.00  Ab4=415.30 A4=440.00  Bb4=466.16  B4=493.88
// C5=523.25  C#5=554.37 D5=587.33  Eb5=622.25 E5=659.25  F5=698.46
// F#5=739.99 G5=783.99  Ab5=830.61 A5=880.00  Bb5=932.33 B5=987.77
// C6=1046.50 D6=1174.66 E6=1318.51 G6=1567.98

const SMB_NOTES = [

  // ════════════════════════════════════════════════════════════════════════
  // INTRO RIFF  (t = 0.000 – 1.350)
  // E5 E5 . E5 . C5 E5 . G5 . . . G4 . . .
  // ════════════════════════════════════════════════════════════════════════

  // bar 1 — E5 E5 (rest) E5 (rest) C5 E5 (rest)
  { t: 0.000, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  { t: 0.150, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  // 0.300 rest
  { t: 0.450, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  // 0.600 rest
  { t: 0.750, freq: 523.25, dur: 0.070, voice: 0 },   // C5
  { t: 0.900, freq: 659.25, dur: 0.070, voice: 0 },   // E5

  // bar 1 bass (C major feel: C roots)
  { t: 0.000, freq: 261.63, dur: 0.110, voice: 1 },   // C4 bass
  { t: 0.300, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 0.600, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 0.900, freq: 261.63, dur: 0.110, voice: 1 },

  // bar 2 — G5 . . . G4 . . .
  { t: 1.050, freq: 783.99, dur: 0.070, voice: 0 },   // G5
  // big rest 0.300
  // G4 lower register hit
  { t: 1.500, freq: 392.00, dur: 0.070, voice: 0 },   // G4
  // rest to t=2.100

  // bar 2 bass
  { t: 1.050, freq: 392.00, dur: 0.110, voice: 1 },   // G3 (392/2 = 196 = G3)
  { t: 1.350, freq: 196.00, dur: 0.110, voice: 1 },
  { t: 1.650, freq: 196.00, dur: 0.110, voice: 1 },
  { t: 1.950, freq: 196.00, dur: 0.110, voice: 1 },

  // ════════════════════════════════════════════════════════════════════════
  // MELODY A — PHRASE 1  (t ≈ 2.100 – 6.000)
  // C5 . G4 . E4 . A4 . B4 . Bb4 A4 .
  // G4 E5 G5   A5 . F5 G5 . E5 . C5 D5 B4 .
  // ════════════════════════════════════════════════════════════════════════

  // phrase 1a
  { t: 2.100, freq: 523.25, dur: 0.070, voice: 0 },   // C5
  // rest 0.150
  { t: 2.400, freq: 392.00, dur: 0.070, voice: 0 },   // G4
  // rest 0.150
  { t: 2.700, freq: 329.63, dur: 0.070, voice: 0 },   // E4
  // rest 0.150
  { t: 3.000, freq: 440.00, dur: 0.070, voice: 0 },   // A4
  // rest 0.150
  { t: 3.300, freq: 493.88, dur: 0.070, voice: 0 },   // B4
  // rest 0.150
  { t: 3.600, freq: 466.16, dur: 0.070, voice: 0 },   // Bb4
  { t: 3.750, freq: 440.00, dur: 0.070, voice: 0 },   // A4

  // phrase 1a bass (C – G – Am – F walk)
  { t: 2.100, freq: 261.63, dur: 0.110, voice: 1 },   // C4
  { t: 2.400, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 2.700, freq: 196.00, dur: 0.110, voice: 1 },   // G3
  { t: 3.000, freq: 220.00, dur: 0.110, voice: 1 },   // A3
  { t: 3.300, freq: 220.00, dur: 0.110, voice: 1 },
  { t: 3.600, freq: 174.61, dur: 0.110, voice: 1 },   // F3
  { t: 3.750, freq: 174.61, dur: 0.110, voice: 1 },

  // phrase 1b — G4 E5 G5  A5 . F5 G5 . E5 . C5 D5 B4 .
  { t: 4.050, freq: 392.00, dur: 0.070, voice: 0 },   // G4
  { t: 4.200, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  { t: 4.350, freq: 783.99, dur: 0.070, voice: 0 },   // G5
  // 8th rest
  { t: 4.650, freq: 880.00, dur: 0.070, voice: 0 },   // A5
  // 8th rest
  { t: 4.950, freq: 698.46, dur: 0.070, voice: 0 },   // F5
  { t: 5.100, freq: 783.99, dur: 0.070, voice: 0 },   // G5
  // 8th rest
  { t: 5.400, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  // 8th rest
  { t: 5.700, freq: 523.25, dur: 0.070, voice: 0 },   // C5
  { t: 5.850, freq: 587.33, dur: 0.070, voice: 0 },   // D5
  { t: 6.000, freq: 493.88, dur: 0.070, voice: 0 },   // B4
  // 8th rest → t=6.300

  // phrase 1b bass
  { t: 4.050, freq: 261.63, dur: 0.110, voice: 1 },   // C4
  { t: 4.350, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 4.650, freq: 220.00, dur: 0.110, voice: 1 },   // A3
  { t: 4.950, freq: 174.61, dur: 0.110, voice: 1 },   // F3
  { t: 5.250, freq: 196.00, dur: 0.110, voice: 1 },   // G3
  { t: 5.550, freq: 261.63, dur: 0.110, voice: 1 },   // C4
  { t: 5.850, freq: 293.66, dur: 0.110, voice: 1 },   // D4
  { t: 6.150, freq: 246.94, dur: 0.110, voice: 1 },   // B3

  // ════════════════════════════════════════════════════════════════════════
  // MELODY A — PHRASE 2  (repeat of phrase 1, t ≈ 6.300 – 10.200)
  // ════════════════════════════════════════════════════════════════════════

  // phrase 2a
  { t: 6.300, freq: 523.25, dur: 0.070, voice: 0 },   // C5
  { t: 6.600, freq: 392.00, dur: 0.070, voice: 0 },   // G4
  { t: 6.900, freq: 329.63, dur: 0.070, voice: 0 },   // E4
  { t: 7.200, freq: 440.00, dur: 0.070, voice: 0 },   // A4
  { t: 7.500, freq: 493.88, dur: 0.070, voice: 0 },   // B4
  { t: 7.800, freq: 466.16, dur: 0.070, voice: 0 },   // Bb4
  { t: 7.950, freq: 440.00, dur: 0.070, voice: 0 },   // A4

  { t: 6.300, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 6.600, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 6.900, freq: 196.00, dur: 0.110, voice: 1 },
  { t: 7.200, freq: 220.00, dur: 0.110, voice: 1 },
  { t: 7.500, freq: 220.00, dur: 0.110, voice: 1 },
  { t: 7.800, freq: 174.61, dur: 0.110, voice: 1 },
  { t: 7.950, freq: 174.61, dur: 0.110, voice: 1 },

  // phrase 2b — same as 1b
  { t: 8.250, freq: 392.00, dur: 0.070, voice: 0 },   // G4
  { t: 8.400, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  { t: 8.550, freq: 783.99, dur: 0.070, voice: 0 },   // G5
  { t: 8.850, freq: 880.00, dur: 0.070, voice: 0 },   // A5
  { t: 9.150, freq: 698.46, dur: 0.070, voice: 0 },   // F5
  { t: 9.300, freq: 783.99, dur: 0.070, voice: 0 },   // G5
  { t: 9.600, freq: 659.25, dur: 0.070, voice: 0 },   // E5
  { t: 9.900, freq: 523.25, dur: 0.070, voice: 0 },   // C5
  { t: 10.050, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  { t: 10.200, freq: 493.88, dur: 0.070, voice: 0 },  // B4

  { t: 8.250, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 8.550, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 8.850, freq: 220.00, dur: 0.110, voice: 1 },
  { t: 9.150, freq: 174.61, dur: 0.110, voice: 1 },
  { t: 9.450, freq: 196.00, dur: 0.110, voice: 1 },
  { t: 9.750, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 10.050, freq: 293.66, dur: 0.110, voice: 1 },
  { t: 10.350, freq: 246.94, dur: 0.110, voice: 1 },

  // ════════════════════════════════════════════════════════════════════════
  // MELODY B — "Underground bridge"  (t ≈ 10.500 – 18.900)
  // This is the contrasting section with the descending chromatic feel.
  //
  // B-section phrase 1:
  //   E5 C5 . [oct-up] C5 C5 D5 . E5 . C5 D5 E5 [half held]
  //   C5 A4 . A4 B4 . C5 [half held]
  //
  // B-section phrase 2 (sequence, step up):
  //   E5 C5 . C5 C5 D5 . E5 . G5 . G5(hold)
  //   E5 C5 D5 B4 [half held]
  //
  // B-section phrase 3 (descending run):
  //   Bb4 A4 G4  Ab4 A4 C5 A4 C5 D5
  //   Bb4 A4 G4  Ab4 A4 F5 . F5 F5 G5 E5 Eb5 D5 Db5
  //   C5 D5 B4 . Bb4 A4 Ab4 G4 F4 E4 Eb4 D4 Db4 [end riff → loop]
  // ════════════════════════════════════════════════════════════════════════

  // B-phrase 1  (t=10.500)
  { t: 10.500, freq: 659.25, dur: 0.270, voice: 0 },  // E5 dotted-quarter
  { t: 10.800, freq: 523.25, dur: 0.070, voice: 0 },  // C5 8th

  { t: 11.100, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 11.250, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 11.400, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  // 8th rest
  { t: 11.700, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  // 8th rest
  { t: 12.000, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 12.150, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  { t: 12.300, freq: 659.25, dur: 0.270, voice: 0 },  // E5 hold (dotted)

  { t: 12.600, freq: 523.25, dur: 0.270, voice: 0 },  // C5 hold
  { t: 12.900, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  // 8th rest
  { t: 13.200, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  { t: 13.350, freq: 493.88, dur: 0.070, voice: 0 },  // B4
  // 8th rest
  { t: 13.650, freq: 523.25, dur: 0.420, voice: 0 },  // C5 half-note hold

  // B-phrase 1 bass
  { t: 10.500, freq: 261.63, dur: 0.110, voice: 1 },  // C4
  { t: 10.800, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 11.100, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 11.400, freq: 293.66, dur: 0.110, voice: 1 },  // D4
  { t: 11.700, freq: 261.63, dur: 0.110, voice: 1 },  // C4
  { t: 12.000, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 12.300, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 12.600, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 12.900, freq: 220.00, dur: 0.110, voice: 1 },  // A3
  { t: 13.200, freq: 220.00, dur: 0.110, voice: 1 },
  { t: 13.500, freq: 220.00, dur: 0.110, voice: 1 },
  { t: 13.800, freq: 261.63, dur: 0.110, voice: 1 },  // C4

  // B-phrase 2  (t=14.100)
  { t: 14.100, freq: 659.25, dur: 0.270, voice: 0 },  // E5 dotted-quarter
  { t: 14.400, freq: 523.25, dur: 0.070, voice: 0 },  // C5

  { t: 14.700, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 14.850, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 15.000, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  // 8th rest
  { t: 15.300, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  // 8th rest
  { t: 15.600, freq: 783.99, dur: 0.070, voice: 0 },  // G5
  // 8th rest
  { t: 15.900, freq: 783.99, dur: 0.420, voice: 0 },  // G5 half-hold

  { t: 16.500, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  { t: 16.650, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 16.800, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  { t: 16.950, freq: 493.88, dur: 0.420, voice: 0 },  // B4 half-hold

  // B-phrase 2 bass
  { t: 14.100, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 14.400, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 14.700, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 15.000, freq: 293.66, dur: 0.110, voice: 1 },
  { t: 15.300, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 15.600, freq: 196.00, dur: 0.110, voice: 1 },  // G3
  { t: 15.900, freq: 196.00, dur: 0.110, voice: 1 },
  { t: 16.200, freq: 196.00, dur: 0.110, voice: 1 },
  { t: 16.500, freq: 261.63, dur: 0.110, voice: 1 },  // C4
  { t: 16.800, freq: 293.66, dur: 0.110, voice: 1 },  // D4
  { t: 17.100, freq: 246.94, dur: 0.110, voice: 1 },  // B3

  // B-phrase 3 — chromatic descending run  (t=17.400)
  // Bb4 A4 G4 — Ab4 A4 C5 A4 C5 D5
  { t: 17.400, freq: 466.16, dur: 0.070, voice: 0 },  // Bb4
  { t: 17.550, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  { t: 17.700, freq: 392.00, dur: 0.070, voice: 0 },  // G4

  { t: 17.850, freq: 415.30, dur: 0.070, voice: 0 },  // Ab4
  { t: 18.000, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  { t: 18.150, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 18.300, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  { t: 18.450, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 18.600, freq: 587.33, dur: 0.070, voice: 0 },  // D5

  // B-phrase 3 bass
  { t: 17.400, freq: 174.61, dur: 0.110, voice: 1 },  // F3
  { t: 17.700, freq: 196.00, dur: 0.110, voice: 1 },  // G3
  { t: 18.000, freq: 220.00, dur: 0.110, voice: 1 },  // A3
  { t: 18.300, freq: 261.63, dur: 0.110, voice: 1 },  // C4
  { t: 18.600, freq: 293.66, dur: 0.110, voice: 1 },  // D4

  // ════════════════════════════════════════════════════════════════════════
  // MELODY B — second half of B-section  (t ≈ 18.900 – 24.900)
  // Bb4 A4 G4  Ab4 A4 F5 . F5 F5 G5 E5 Eb5 D5 Db5
  // C5 D5 B4 . Bb4 A4 Ab4 G4 F4 E4 Eb4 D4 Db4
  // ════════════════════════════════════════════════════════════════════════

  { t: 18.900, freq: 466.16, dur: 0.070, voice: 0 },  // Bb4
  { t: 19.050, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  { t: 19.200, freq: 392.00, dur: 0.070, voice: 0 },  // G4

  { t: 19.350, freq: 415.30, dur: 0.070, voice: 0 },  // Ab4
  { t: 19.500, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  // 8th rest
  { t: 19.800, freq: 698.46, dur: 0.070, voice: 0 },  // F5
  // 8th rest
  { t: 20.100, freq: 698.46, dur: 0.070, voice: 0 },  // F5
  { t: 20.250, freq: 698.46, dur: 0.070, voice: 0 },  // F5
  { t: 20.400, freq: 783.99, dur: 0.070, voice: 0 },  // G5
  { t: 20.550, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  { t: 20.700, freq: 622.25, dur: 0.070, voice: 0 },  // Eb5
  { t: 20.850, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  { t: 21.000, freq: 554.37, dur: 0.070, voice: 0 },  // C#5/Db5

  // bass
  { t: 18.900, freq: 174.61, dur: 0.110, voice: 1 },  // F3
  { t: 19.200, freq: 196.00, dur: 0.110, voice: 1 },  // G3
  { t: 19.500, freq: 220.00, dur: 0.110, voice: 1 },  // A3
  { t: 19.800, freq: 174.61, dur: 0.110, voice: 1 },  // F3
  { t: 20.100, freq: 174.61, dur: 0.110, voice: 1 },
  { t: 20.400, freq: 196.00, dur: 0.110, voice: 1 },  // G3
  { t: 20.700, freq: 261.63, dur: 0.110, voice: 1 },  // C4
  { t: 21.000, freq: 246.94, dur: 0.110, voice: 1 },  // B3

  // descending chromatic run to close
  { t: 21.150, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 21.300, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  { t: 21.450, freq: 493.88, dur: 0.070, voice: 0 },  // B4
  // 8th rest
  { t: 21.750, freq: 466.16, dur: 0.070, voice: 0 },  // Bb4
  { t: 21.900, freq: 440.00, dur: 0.070, voice: 0 },  // A4
  { t: 22.050, freq: 415.30, dur: 0.070, voice: 0 },  // Ab4
  { t: 22.200, freq: 392.00, dur: 0.070, voice: 0 },  // G4
  { t: 22.350, freq: 349.23, dur: 0.070, voice: 0 },  // F4
  { t: 22.500, freq: 329.63, dur: 0.070, voice: 0 },  // E4
  { t: 22.650, freq: 311.13, dur: 0.070, voice: 0 },  // Eb4
  { t: 22.800, freq: 293.66, dur: 0.070, voice: 0 },  // D4
  { t: 22.950, freq: 277.18, dur: 0.070, voice: 0 },  // Db4/C#4

  // bass for descending run
  { t: 21.150, freq: 261.63, dur: 0.110, voice: 1 },  // C4
  { t: 21.450, freq: 246.94, dur: 0.110, voice: 1 },  // B3
  { t: 21.750, freq: 233.08, dur: 0.110, voice: 1 },  // Bb3
  { t: 22.050, freq: 220.00, dur: 0.110, voice: 1 },  // A3
  { t: 22.350, freq: 207.65, dur: 0.110, voice: 1 },  // Ab3
  { t: 22.650, freq: 196.00, dur: 0.110, voice: 1 },  // G3
  { t: 22.950, freq: 174.61, dur: 0.110, voice: 1 },  // F3

  // ════════════════════════════════════════════════════════════════════════
  // ENDING / LOOP TAIL  (t ≈ 23.100 – 25.920)
  // Return to C-major landing, then brief turnaround back to intro riff
  // C4 E4 G4 → E5 D5 C5 [hold] … then silence to loop point ≈ 26.0
  // ════════════════════════════════════════════════════════════════════════

  // octave-up arrival
  { t: 23.100, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 23.250, freq: 329.63, dur: 0.070, voice: 0 },  // E4
  { t: 23.400, freq: 392.00, dur: 0.070, voice: 0 },  // G4

  // ascending fill to next phrase start
  { t: 23.700, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  { t: 23.850, freq: 587.33, dur: 0.070, voice: 0 },  // D5
  { t: 24.000, freq: 523.25, dur: 0.570, voice: 0 },  // C5 held ~2 beats

  // tail bass
  { t: 23.100, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 23.400, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 23.700, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 24.000, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 24.300, freq: 261.63, dur: 0.110, voice: 1 },

  // short turnaround riff back to intro (mirrors opening E5 hits)
  { t: 24.750, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  { t: 24.900, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  // 0.150 rest
  { t: 25.200, freq: 659.25, dur: 0.070, voice: 0 },  // E5
  // 0.150 rest
  { t: 25.500, freq: 523.25, dur: 0.070, voice: 0 },  // C5
  { t: 25.650, freq: 659.25, dur: 0.070, voice: 0 },  // E5

  { t: 24.750, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 25.050, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 25.350, freq: 261.63, dur: 0.110, voice: 1 },
  { t: 25.650, freq: 261.63, dur: 0.110, voice: 1 },

  // final note before loop — G5 lands, then silence back to t=0
  { t: 25.800, freq: 783.99, dur: 0.120, voice: 0 },  // G5 → loop

];

// ─────────────────────────────────────────────────────────────────────────────
// A2SMBSynth
// Pre-schedules all oscillators for N loop iterations using Web Audio API.
// Connects to its own GainNode (NOT through P3DSoundManager master gain) so
// that pauseForCard() / resumeFromCard() can ramp + suspend independently.
// ─────────────────────────────────────────────────────────────────────────────

class A2SMBSynth {
  constructor() {
    this._snd      = null;   // P3DSoundManager ref
    this._ctx      = null;   // AudioContext (from snd.audioCtx)
    this._gainNode = null;   // dedicated GainNode for all music output
    this._oscs     = [];     // all scheduled OscillatorNode refs
    this._startAt  = 0;      // AudioContext time when music started
    this._loopDur  = 0;      // computed from SMB_NOTES
    this._loops    = 3;      // number of pre-scheduled loop iterations
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  init(snd) {
    this._snd = snd;
    // audioCtx may be null if context not yet unlocked — start() will retry
    const ctx = snd.audioCtx;
    this._ctx = ctx;

    // Compute loop duration from note data
    let maxEnd = 0;
    for (const n of SMB_NOTES) {
      const end = n.t + n.dur;
      if (end > maxEnd) maxEnd = end;
    }
    this._loopDur = maxEnd;  // ~25.92 s; close enough to 26 s

    if (ctx) {
      this._gainNode = ctx.createGain();
      this._gainNode.gain.value = 0.07;
      // Connect directly to destination — bypasses P3DSoundManager master gain
      this._gainNode.connect(ctx.destination);
    }
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  start(startAt) {
    // Re-acquire ctx in case it wasn't ready during init()
    if (!this._ctx && this._snd) {
      this._ctx = this._snd.audioCtx;
      if (this._ctx && !this._gainNode) {
        this._gainNode = this._ctx.createGain();
        this._gainNode.gain.value = 0.07;
        this._gainNode.connect(this._ctx.destination);
      }
    }
    const ctx = this._ctx;
    if (!ctx || !this._gainNode) return;

    this._startAt = startAt;

    for (let i = 0; i < this._loops; i++) {
      const loopOffset = i * this._loopDur;
      for (const n of SMB_NOTES) {
        const absT = startAt + loopOffset + n.t;
        const osc  = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = n.freq;
        osc.connect(this._gainNode);
        osc.start(absT);
        osc.stop(absT + n.dur);
        this._oscs.push(osc);
      }
    }
  }

  // ── Pause / Resume (for info cards) ──────────────────────────────────────

  pauseForCard() {
    if (!this._ctx || !this._gainNode) return;
    const now = this._ctx.currentTime;
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
    this._gainNode.gain.linearRampToValueAtTime(0, now + 0.12);
    // Suspend context after ramp completes
    setTimeout(() => {
      if (this._ctx && this._ctx.state === 'running') this._ctx.suspend();
    }, 150);
  }

  resumeFromCard() {
    if (!this._ctx || !this._gainNode) return;
    this._ctx.resume().then(() => {
      const now = this._ctx.currentTime;
      this._gainNode.gain.cancelScheduledValues(now);
      this._gainNode.gain.setValueAtTime(0, now);
      this._gainNode.gain.linearRampToValueAtTime(0.07, now + 0.12);
    });
  }

  // ── Stop ─────────────────────────────────────────────────────────────────

  stop() {
    if (this._gainNode && this._ctx) {
      const now = this._ctx.currentTime;
      this._gainNode.gain.cancelScheduledValues(now);
      this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);
      this._gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
    }
    this._oscs.forEach(o => {
      try { o.stop(); o.disconnect(); } catch (e) { /* already stopped */ }
    });
    this._oscs = [];
    if (this._gainNode) {
      try { this._gainNode.disconnect(); } catch (e) {}
      this._gainNode = null;
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get loopDur() { return this._loopDur; }

  // Seconds elapsed since music started (based on AudioContext clock)
  get elapsed() { return this._ctx ? this._ctx.currentTime - this._startAt : 0; }
}

// Singleton — available globally as window.A2SMBSynth
window.A2SMBSynth = new A2SMBSynth();

// ─────────────────────────────────────────────────────────────────────────────
// A2SMBBeatmap — builds the node pool for P3DAct2BossBattle from SMB_NOTES.
// Sub-chunk 2b.
// ─────────────────────────────────────────────────────────────────────────────

class A2SMBBeatmap {
  constructor() {}

  /**
   * build(phaseStartT, totalDur) → sorted node array
   *
   * phaseStartT : [0, 15, 30, 50, 60]  (game-time seconds for each phase A–E)
   * totalDur    : 75  (total Act 2 duration in seconds)
   */
  build(phaseStartT, totalDur) {
    // ── Step 1: setup ────────────────────────────────────────────────────────
    const loopDur = SMB_NOTES.reduce((mx, n) => Math.max(mx, n.t + n.dur), 0);
    const nLoops  = Math.ceil(totalDur / loopDur) + 1;
    const out     = [];
    let   syncId  = 0;

    // ── Step 2: phase helper ─────────────────────────────────────────────────
    function phaseOf(t) {
      for (let i = phaseStartT.length - 1; i >= 0; i--)
        if (t >= phaseStartT[i]) return i;
      return 0;
    }

    // ── Step 3: density gate ─────────────────────────────────────────────────
    function densityPass(phase, noteT) {
      const eighth = 0.150, sixteenth = 0.075;
      if (phase <= 1) {
        // 8th-note-aligned only (±20 ms tolerance)
        return Math.abs((noteT % eighth)) < 0.020 ||
               Math.abs((noteT % eighth) - eighth) < 0.020;
      }
      if (phase <= 3) {
        // 8th boundaries always pass; every-other 16th passes
        const slot = Math.round(noteT / sixteenth);
        return slot % 2 === 0 || Math.abs(noteT % eighth) < 0.020;
      }
      return true; // Phase E: all pass
    }

    // ── Step 4: SYNC detection helpers ──────────────────────────────────────
    const bassOnsets = new Set(
      SMB_NOTES.filter(n => n.voice === 1).map(n => Math.round(n.t * 1000))
    );

    function isSyncCandidate(n) {
      const tms = Math.round(n.t * 1000);
      if (bassOnsets.has(tms)) return true;
      for (let d = -15; d <= 15; d++)
        if (bassOnsets.has(tms + d)) return true;
      return false;
    }

    // ── Step 5: lane from frequency ──────────────────────────────────────────
    function laneFromFreq(freq) {
      if (freq < 330) return 0;
      if (freq < 660) return 1;
      return 2;
    }

    // ── Node factory (exact shape required by P3DAct2BossBattle._mkNode) ────
    function mkNode(type, lane, hitTime, extra) {
      return Object.assign({
        type, lane, hitTime,
        state: 'waiting', judgement: null, flashT: -1,
        holdProgress: 0, holdDur: 0, syncId: null,
      }, extra);
    }

    // ── Step 6: main loop ────────────────────────────────────────────────────
    // consumed[loopIdx][Math.round(noteT*1000)] = true → bass note used by SYNC
    const consumed = {};

    function markConsumed(loopIdx, noteT) {
      if (!consumed[loopIdx]) consumed[loopIdx] = {};
      consumed[loopIdx][Math.round(noteT * 1000)] = true;
    }
    function isConsumed(loopIdx, noteT) {
      return !!(consumed[loopIdx] && consumed[loopIdx][Math.round(noteT * 1000)]);
    }

    for (let loopIdx = 0; loopIdx < nLoops; loopIdx++) {
      const loopBase = loopIdx * loopDur;

      // ── Melody notes (voice 0) ───────────────────────────────────────────
      for (const n of SMB_NOTES) {
        if (n.voice !== 0) continue;
        const hitTime = loopBase + n.t;
        if (hitTime >= totalDur) continue;
        const phase = phaseOf(hitTime);
        if (!densityPass(phase, n.t)) continue;

        const lane = laneFromFreq(n.freq);

        if (isSyncCandidate(n)) {
          // Find closest bass note within 15 ms
          const bassNote = SMB_NOTES
            .filter(b => b.voice === 1 && Math.abs(b.t - n.t) <= 0.015)
            .sort((a, b) => Math.abs(a.t - n.t) - Math.abs(b.t - n.t))[0];

          if (bassNote) {
            const sid = syncId++;
            out.push(mkNode('SYNC', lane, hitTime,       { syncId: sid }));
            out.push(mkNode('SYNC', 0,    loopBase + bassNote.t, { syncId: sid }));
            markConsumed(loopIdx, bassNote.t);
            continue;
          }
        }

        // HOLD if note duration > 0.22 s, else TAP
        if (n.dur > 0.22) {
          out.push(mkNode('HOLD', lane, hitTime, { holdDur: n.dur - 0.030 }));
        } else {
          out.push(mkNode('TAP', lane, hitTime));
        }
      }

      // ── Solo bass notes not consumed by SYNC (phases C/D/E only) ─────────
      for (const n of SMB_NOTES) {
        if (n.voice !== 1) continue;
        if (isConsumed(loopIdx, n.t)) continue;
        const hitTime = loopBase + n.t;
        if (hitTime >= totalDur) continue;
        const phase = phaseOf(hitTime);
        if (phase < 2) continue;                  // skip phases A/B
        if (!densityPass(phase, n.t)) continue;
        out.push(mkNode('TAP', 0, hitTime));
      }
    }

    // ── Step 7: sort by hitTime ──────────────────────────────────────────────
    out.sort((a, b) => a.hitTime - b.hitTime);
    return out;
  }
}

// Singleton — available globally as window.A2SMBBeatmap
window.A2SMBBeatmap = new A2SMBBeatmap();

// ── A2ElectroswingBeatmap ───────────────────────────────────────────────────
// Hand-crafted 120 BPM swing beatmap: ~1 hit/sec, 2-second lead-in,
// builds from TAPs → HOLDs → SYNCs across five phases.
class A2ElectroswingBeatmap {
  static get LEAD_IN() { return 2.0; }

  build(phaseStartT, totalDur) {
    const mkNode = (type, lane, hitTime, holdDur=0, syncId=null) => ({
      type, lane, hitTime, holdDur, syncId,
      state:'waiting', judgement:null, flashT:-1, holdProgress:0
    });

    const out = [];
    let nextSyncId = 0;
    const LEAD_IN = A2ElectroswingBeatmap.LEAD_IN;

    // ── Phase A (0–15s): TAPs only, 2s lead-in ──────────────────────────
    {
      const base     = phaseStartT[0];
      const dur      = 15;
      const laneSeq  = [1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1];
      for (let i = 0; i < laneSeq.length; i++) {
        const t = base + LEAD_IN + i * 1.0;
        if (t >= base + dur) break;
        out.push(mkNode('TAP', laneSeq[i], t));
      }
    }

    // ── Phase B (15–30s): TAPs + HOLDs every 5th beat ───────────────────
    {
      const base    = phaseStartT[1];
      const dur     = 15;
      const laneSeq = [0, 1, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2];
      for (let i = 0; i < laneSeq.length; i++) {
        const t    = base + i * 1.0;
        if (t >= base + dur) break;
        const type = (i % 5 === 2) ? 'HOLD' : 'TAP';
        const hd   = type === 'HOLD' ? 0.5 : 0;
        out.push(mkNode(type, laneSeq[i], t, hd));
      }
    }

    // ── Phase C (30–50s): TAPs + SYNC every 4th beat ────────────────────
    {
      const base    = phaseStartT[2];
      const dur     = 20;
      const laneSeq = [0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2];
      for (let i = 0; i < laneSeq.length; i++) {
        const t = base + i * 1.0;
        if (t >= base + dur) break;
        if (i > 0 && i % 4 === 0) {
          const sid = nextSyncId++;
          out.push(mkNode('SYNC', 0, t, 0, sid));
          out.push(mkNode('SYNC', 2, t, 0, sid));
        } else {
          out.push(mkNode('TAP', laneSeq[i], t));
        }
      }
    }

    // ── Phase D (50–60s): explicit high-drama table ──────────────────────
    {
      const base    = phaseStartT[3];
      const dur     = 10;
      const entries = [
        { type:'SYNC', lanes:[0,1], off:0 },
        { type:'TAP',  lane:2,      off:1 },
        { type:'HOLD', lane:1,      off:2, hd:0.5 },
        { type:'SYNC', lanes:[1,2], off:3 },
        { type:'TAP',  lane:0,      off:4 },
        { type:'SYNC', lanes:[0,2], off:5 },
        { type:'HOLD', lane:0,      off:6, hd:0.5 },
        { type:'TAP',  lane:1,      off:7 },
        { type:'SYNC', lanes:[0,1], off:8 },
        { type:'TAP',  lane:2,      off:9 },
      ];
      for (const e of entries) {
        const t = base + e.off;
        if (t >= base + dur) continue;
        if (e.type === 'SYNC') {
          const sid = nextSyncId++;
          for (const l of e.lanes) out.push(mkNode('SYNC', l, t, 0, sid));
        } else {
          out.push(mkNode(e.type, e.lane, t, e.hd || 0));
        }
      }
    }

    // ── Phase E (60–75s): full energy, SYNC + HOLD every beat ───────────
    {
      const base    = phaseStartT[4];
      const dur     = 15;
      const entries = [
        { type:'SYNC', lanes:[0,1] },
        { type:'TAP',  lane:2 },
        { type:'SYNC', lanes:[1,2] },
        { type:'HOLD', lane:0, hd:0.5 },
        { type:'SYNC', lanes:[0,2] },
        { type:'TAP',  lane:1 },
        { type:'HOLD', lane:2, hd:0.5 },
        { type:'SYNC', lanes:[0,1] },
        { type:'TAP',  lane:2 },
        { type:'SYNC', lanes:[1,2] },
        { type:'TAP',  lane:0 },
        { type:'HOLD', lane:1, hd:0.5 },
        { type:'SYNC', lanes:[0,2] },
        { type:'TAP',  lane:2 },
        { type:'SYNC', lanes:[0,1] },
      ];
      for (let i = 0; i < entries.length; i++) {
        const t = base + i * 1.0;
        if (t >= base + dur) break;
        const e = entries[i];
        if (e.type === 'SYNC') {
          const sid = nextSyncId++;
          for (const l of e.lanes) out.push(mkNode('SYNC', l, t, 0, sid));
        } else {
          out.push(mkNode(e.type, e.lane, t, e.hd || 0));
        }
      }
    }

    out.sort((a, b) => a.hitTime - b.hitTime);
    return out;
  }

  /**
   * buildPhaseLoop(phaseIdx, startT, syncIdStart) → { nodes, nextSyncId }
   *
   * Generates one 8-second repeating pattern for the given phase, starting
   * at startT. Used by the boss for score-threshold looping phases.
   *
   * phaseIdx  : 0–4  (A–E)
   * startT    : absolute game-time for first node
   * syncIdStart : next available syncId integer
   */
  buildPhaseLoop(phaseIdx, startT, syncIdStart = 0) {
    const mkNode = (type, lane, hitTime, holdDur = 0, syncId = null) => ({
      type, lane, hitTime, holdDur, syncId,
      state: 'waiting', judgement: null, flashT: -1, holdProgress: 0,
    });

    const out = [];
    let sid = syncIdStart;

    // Patterns are defined as arrays of {type, lane(s), off, hd?} within 8 seconds.
    // off = seconds from startT.
    const mkSync = (l1, l2, off) => {
      const id = sid++;
      out.push(mkNode('SYNC', l1, startT + off, 0, id));
      out.push(mkNode('SYNC', l2, startT + off, 0, id));
    };
    const mkTap  = (lane, off) => out.push(mkNode('TAP',  lane, startT + off));
    const mkHold = (lane, off, hd) => out.push(mkNode('HOLD', lane, startT + off, hd));

    switch (phaseIdx) {
      case 0: // Phase A — TAP only, 1 hit/s, easy lane sequence
        [1,0,2,1,0,2,1,0].forEach((l, i) => mkTap(l, i));
        break;

      case 1: // Phase B — TAP + HOLD every 3rd beat
        [0,1,2,1,0,2,1,0].forEach((l, i) => {
          if (i === 2 || i === 6) mkHold(l, i, 0.5);
          else                    mkTap(l, i);
        });
        break;

      case 2: // Phase C — TAP + SYNC every 4th beat
        [0,2,1,0,2,1,0,2].forEach((l, i) => {
          if (i === 0) mkSync(0, 2, 0);
          else if (i === 4) mkSync(1, 2, 4);
          else              mkTap(l, i);
        });
        break;

      case 3: // Phase D — SYNC + HOLD mix, denser
        mkSync(0, 1, 0);
        mkTap(2, 1);
        mkHold(1, 2, 0.5);
        mkSync(1, 2, 3);
        mkTap(0, 4);
        mkSync(0, 2, 5);
        mkHold(0, 6, 0.5);
        mkTap(1, 7);
        break;

      case 4: // Phase E — max intensity, SYNC-heavy, hits every ~0.8s
        mkSync(0, 1, 0.0);
        mkTap(2,   0.8);
        mkSync(1, 2, 1.6);
        mkHold(0,  2.4, 0.5);
        mkSync(0, 2, 3.2);
        mkTap(1,   4.0);
        mkSync(0, 1, 4.8);
        mkHold(2,  5.6, 0.5);
        mkTap(0,   6.4);
        mkSync(1, 2, 7.2);
        break;
    }

    out.sort((a, b) => a.hitTime - b.hitTime);
    return { nodes: out, nextSyncId: sid };
  }
}

// Singleton — available globally as window.A2ElectroswingBeatmap
window.A2ElectroswingBeatmap = new A2ElectroswingBeatmap();

// ── A2ElectroswingSynth ───────────────────────────────────────────────────────
// Electroswing percussion engine for Act 2.
//
// Architecture:
//   _mainGain  →  ctx.destination  (kicks + chord stabs; muted during cards)
//   _bassGain  →  ctx.destination  (walking bass; attenuated but alive during cards)
//
// All audio is pre-scheduled on start() so the boss clock drives placement;
// card-mode fading is done by GainNode ramps — ctx is NOT suspended, letting
// the baseline carry through phase cards.
class A2ElectroswingSynth {
  constructor() {
    this._snd            = null;
    this._ctx            = null;
    this._mainGain       = null;
    this._bassGain       = null;
    this._reverb         = null;
    this._sched          = [];     // AudioNodes for bulk disconnect on stop()
    this._startAt        = 0;     // audioCtx time at which music began
    this._scheduledUntil = 0;     // audioCtx time scheduled up to so far
  }

  // ── Init ────────────────────────────────────────────────────────────────
  init(snd) {
    this._snd = snd;
    const ctx = snd.audioCtx;
    this._ctx = ctx;
    if (!ctx) return;
    this._mainGain = ctx.createGain();
    this._mainGain.gain.value = 1.0;
    this._mainGain.connect(ctx.destination);
    this._bassGain = ctx.createGain();
    this._bassGain.gain.value = 1.0;
    this._bassGain.connect(ctx.destination);
    this._sched.push(this._mainGain, this._bassGain);
  }

  // ── Start — takes the node array so kicks fire at button hitTimes ────────
  // ── Start — ambient only (bass + stabs).  Kicks are fired by the boss
  // tick loop via kickAt() so they stay perfectly in sync with game time.
  start(startAt) {
    // Re-acquire ctx if it wasn't ready at init time
    if (!this._ctx && this._snd) {
      this._ctx = this._snd.audioCtx;
      if (this._ctx) {
        this._mainGain = this._ctx.createGain();
        this._mainGain.gain.value = 1.0;
        this._mainGain.connect(this._ctx.destination);
        this._bassGain = this._ctx.createGain();
        this._bassGain.gain.value = 1.0;
        this._bassGain.connect(this._ctx.destination);
        this._sched.push(this._mainGain, this._bassGain);
      }
    }
    const ctx = this._ctx;
    if (!ctx || !this._mainGain) return;

    // ── Reverb — parallel wet/dry via synthetic IR ───────────────────────
    if (!this._reverb) {
      this._reverb = ctx.createConvolver();
      this._reverb.buffer = this._makeReverbIR(ctx);
      // Darken the tail (real reverb rolls off high frequencies)
      const revHpf = ctx.createBiquadFilter();
      revHpf.type = 'highpass'; revHpf.frequency.value = 220;
      const revLpf = ctx.createBiquadFilter();
      revLpf.type = 'lowpass';  revLpf.frequency.value = 4800;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.20;   // wet level
      this._reverb.connect(revHpf); revHpf.connect(revLpf);
      revLpf.connect(wetGain);     wetGain.connect(ctx.destination);
      this._sched.push(this._reverb, revHpf, revLpf, wetGain);
      // Main signal (kicks, stabs, hi-hats, horns) → reverb
      this._mainGain.connect(this._reverb);
      // Bass → reverb at reduced level (avoids low-end mud)
      const bassRevSend = ctx.createGain();
      bassRevSend.gain.value = 0.38;
      this._bassGain.connect(bassRevSend);
      bassRevSend.connect(this._reverb);
      this._sched.push(bassRevSend);
    }

    // Record start time and kick off the first 20 seconds.
    // Further chunks are added by extendIfNeeded(), called each boss tick.
    this._startAt        = startAt;
    this._scheduledUntil = startAt;
    this._scheduleRange(startAt, startAt + 20);
  }

  // ── Lookahead scheduler — called every tick by the boss ─────────────────
  extendIfNeeded(audioNow) {
    if (!this._ctx || !this._scheduledUntil) return;
    const LOOKAHEAD = 8.0;   // keep at least 8s buffered
    const EXTEND_BY = 16.0;  // schedule one full chord cycle (Am–C–F–G) at a time
    while (audioNow + LOOKAHEAD > this._scheduledUntil) {
      const from = this._scheduledUntil;
      this._scheduleRange(from, from + EXTEND_BY);
    }
  }

  _scheduleRange(from, to) {
    this._schedBass(from, to);
    this._schedStabs(from, to);
    this._schedHiHats(from, to);
    this._schedSnare(from, to);
    this._schedHornCalls(from, to);
    this._scheduledUntil = to;
  }

  // ── Kick: public — called by boss at node-activation time ────────────────
  // audioTime is ctx.currentTime + seconds_until_hit_zone
  kickAt(audioTime) {
    if (!this._ctx || !this._mainGain) return;
    this._schedKick(audioTime);
  }

  // ── Kick: sine sub-thump + filtered noise click ──────────────────────────
  _schedKick(t) {
    const ctx = this._ctx;

    // Sub-bass thump
    const oscK = ctx.createOscillator();
    const gK   = ctx.createGain();
    oscK.type = 'sine';
    oscK.frequency.setValueAtTime(85, t);
    oscK.frequency.exponentialRampToValueAtTime(28, t + 0.18);
    gK.gain.setValueAtTime(0.42, t);
    gK.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    oscK.connect(gK);  gK.connect(this._mainGain);
    oscK.start(t);  oscK.stop(t + 0.25);
    this._sched.push(oscK, gK);

    // Attack click — short white-noise burst, low-pass filtered
    const bufLen = Math.ceil(ctx.sampleRate * 0.018);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d      = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    const src = ctx.createBufferSource();
    const lpf = ctx.createBiquadFilter();
    const gN  = ctx.createGain();
    src.buffer = buf;
    lpf.type = 'lowpass';  lpf.frequency.value = 220;
    gN.gain.value = 0.22;
    src.connect(lpf);  lpf.connect(gN);  gN.connect(this._mainGain);
    src.start(t);
    this._sched.push(src, lpf, gN);
  }

  // ── Walking bass: square-wave quarter notes, C major / A minor walk ──────
  _schedBass(from, to) {
    // 16-note cycle = 4 bars; chord tones in C / Am (Hz at 2nd octave)
    const WALK = [
       65,  82,  98, 110,  98,  82,  87,  98,
      110,  82,  98, 110, 123, 110,  98,  82,
    ];
    const BEAT = 0.5;
    const ctx  = this._ctx;
    // Align to beat grid from _startAt
    const niStart = Math.floor((from - this._startAt + 1e-9) / BEAT);
    for (let ni = niStart; ; ni++) {
      const t = this._startAt + ni * BEAT;
      if (t >= to) break;
      const prevNiNom = ((( ni - 1) % WALK.length) + WALK.length) % WALK.length;
      const prevFreq  = WALK[prevNiNom];   // nominal (no humanization) for portamento
      const cents   = (Math.random() - 0.5) * 6;
      const freq    = WALK[ni % WALK.length] * Math.pow(2, cents / 1200);
      const noteDur = BEAT * 0.78;
      const peak    = 0.052 * (0.86 + Math.random() * 0.28);
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type  = 'square';
      osc.frequency.setValueAtTime(prevFreq, t);
      osc.frequency.linearRampToValueAtTime(freq, t + 0.012);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.012);
      g.gain.setValueAtTime(peak, t + noteDur - 0.025);
      g.gain.linearRampToValueAtTime(0.001, t + noteDur);
      osc.connect(g);  g.connect(this._bassGain);
      osc.start(t);  osc.stop(t + noteDur + 0.01);
      this._sched.push(osc, g);
    }
  }

  // ── Chord stabs: sawtooth triads, short attack / quick decay ────────────
  _schedStabs(from, to) {
    const CHORDS = [
      [220, 262, 330],   // Am
      [262, 330, 392],   // C
      [175, 220, 262],   // F
      [196, 247, 294],   // G
    ];
    const ctx      = this._ctx;
    const stabBase = this._startAt + 4.0;
    const ciStart  = Math.max(0, Math.floor((from - stabBase + 1e-9) / 4.0));
    for (let ci = ciStart; ; ci++) {
      const t = stabBase + ci * 4.0;
      if (t >= to) break;
      for (const freq of CHORDS[ci % CHORDS.length]) {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.022, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.connect(g);  g.connect(this._mainGain);
        osc.start(t);  osc.stop(t + 0.38);
        this._sched.push(osc, g);
      }
    }
  }

  // ── Hi-hats: closed on beats, open on swing-8th upbeats ─────────────────
  _schedHiHats(from, to) {
    const ctx     = this._ctx;
    const SR      = ctx.sampleRate;
    const bufLen  = Math.ceil(SR * 0.25);
    const noiseBuf = ctx.createBuffer(1, bufLen, SR);
    const nd       = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;

    const BEAT  = 0.5;
    const SWING = 0.333;

    const closedHH = (t) => {
      const src  = ctx.createBufferSource();
      const bpf  = ctx.createBiquadFilter();
      const g    = ctx.createGain();
      const peak = 0.060 * (0.92 + Math.random() * 0.16);
      src.buffer = noiseBuf;
      bpf.type = 'bandpass';  bpf.frequency.value = 9000;  bpf.Q.value = 0.8;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.030);
      src.connect(bpf);  bpf.connect(g);  g.connect(this._mainGain);
      src.start(t);  src.stop(t + 0.035);
      this._sched.push(src, bpf, g);
    };

    const openHH = (t) => {
      const src  = ctx.createBufferSource();
      const bpf  = ctx.createBiquadFilter();
      const hpf  = ctx.createBiquadFilter();
      const g    = ctx.createGain();
      const peak = 0.045 * (0.92 + Math.random() * 0.16);
      src.buffer = noiseBuf;
      bpf.type = 'bandpass';  bpf.frequency.value = 6500;  bpf.Q.value = 0.6;
      hpf.type = 'highpass';  hpf.frequency.value = 4000;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.180);
      src.connect(bpf);  bpf.connect(hpf);  hpf.connect(g);  g.connect(this._mainGain);
      src.start(t);  src.stop(t + 0.200);
      this._sched.push(src, bpf, hpf, g);
    };

    // Align to beat grid from _startAt
    const biStart = Math.floor((from - this._startAt + 1e-9) / BEAT);
    for (let bi = biStart; ; bi++) {
      const t = this._startAt + bi * BEAT;
      if (t >= to) break;
      closedHH(t);
      if (t + SWING < to) openHH(t + SWING);
    }
  }

  // ── Snare: white-noise body + sine thump on beats 2 and 4 ────────────────
  _schedSnare(from, to) {
    const ctx    = this._ctx;
    const SR     = ctx.sampleRate;
    const bufLen = Math.ceil(SR * 0.18);
    const snBuf  = ctx.createBuffer(1, bufLen, SR);
    const sd     = snBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) sd[i] = Math.random() * 2 - 1;

    const BAR  = 2.0;
    const BEAT = 0.5;

    // Align to bar grid from _startAt
    const biStart = Math.floor((from - this._startAt + 1e-9) / BAR);
    for (let bi = biStart; ; bi++) {
      const bar = this._startAt + bi * BAR;
      if (bar >= to) break;
      for (const beatOff of [BEAT, BEAT * 3]) {
        const t = bar + beatOff;
        if (t < from || t >= to) continue;

        // ±6% velocity humanization per hit
        const vel = 0.94 + Math.random() * 0.12;

        // Noise body
        const src = ctx.createBufferSource();
        const bpf = ctx.createBiquadFilter();
        const gN  = ctx.createGain();
        src.buffer = snBuf;
        bpf.type = 'bandpass';  bpf.frequency.value = 260;  bpf.Q.value = 0.9;
        gN.gain.setValueAtTime(0.065 * vel, t);
        gN.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        src.connect(bpf);  bpf.connect(gN);  gN.connect(this._mainGain);
        src.start(t);  src.stop(t + 0.14);
        this._sched.push(src, bpf, gN);

        // Sine body thump
        const osc = ctx.createOscillator();
        const gS  = ctx.createGain();
        osc.type = 'sine';  osc.frequency.value = 185;
        gS.gain.setValueAtTime(0.055 * vel, t);
        gS.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gS);  gS.connect(this._mainGain);
        osc.start(t);  osc.stop(t + 0.10);
        this._sched.push(osc, gS);
      }
    }
  }

  // ── Horn phrases: 4-note run + resolution, one phrase per chord stab ───────
  _schedHornCalls(from, to) {
    const PHRASES = [
      [ {f:329.63, o:-1.50, d:0.22}, {f:392.00, o:-1.00, d:0.20},
        {f:440.00, o:-0.55, d:0.22}, {f:392.00, o:-0.22, d:0.15},
        {f:440.00, o: 0.00, d:0.45} ],
      [ {f:392.00, o:-1.50, d:0.22}, {f:440.00, o:-1.00, d:0.20},
        {f:493.88, o:-0.55, d:0.22}, {f:523.25, o:-0.22, d:0.15},
        {f:659.25, o: 0.00, d:0.45} ],
      [ {f:261.63, o:-1.50, d:0.22}, {f:293.66, o:-1.00, d:0.20},
        {f:329.63, o:-0.55, d:0.22}, {f:349.23, o:-0.22, d:0.15},
        {f:523.25, o: 0.00, d:0.45} ],
      [ {f:293.66, o:-1.50, d:0.22}, {f:329.63, o:-1.00, d:0.20},
        {f:369.99, o:-0.55, d:0.22}, {f:392.00, o:-0.22, d:0.15},
        {f:392.00, o: 0.00, d:0.45} ],
    ];

    const stabBase = this._startAt + 4.0;
    // Start from one stab before `from` so horn pickups (-1.5s) aren't clipped
    const ciStart  = Math.max(0, Math.floor((from - stabBase - 1.5 + 1e-9) / 4.0));
    for (let ci = ciStart; ; ci++) {
      const stabT = stabBase + ci * 4.0;
      if (stabT - 1.5 >= to) break;  // even earliest note past range
      for (const note of PHRASES[ci % PHRASES.length]) {
        const t = stabT + note.o;
        if (t < from || t >= to) continue;
        this._playHorn(t, note.f, note.d);
      }
    }
  }

  // ── Horn voice: 2 detuned sawtooths + vibrato LFO + warm lowpass ─────────
  _playHorn(t, freq, dur) {
    const ctx = this._ctx;

    // ±5 cent intonation variation — players don't hit exact pitch every time
    const intonation = (Math.random() - 0.5) * 10;         // cents
    const targetFreq = freq * Math.pow(2, intonation / 1200);

    // Lip-attack: start 14 cents sharp, settle to pitch over 22 ms
    // (brass players overshoot slightly on attack before settling)
    const attackFreq = targetFreq * Math.pow(2, 14 / 1200);

    // ±10% velocity humanization
    const vel = 0.90 + Math.random() * 0.20;

    // Vibrato LFO: 5.5 Hz, ramps from 0 to ±9 cents over first 80 ms
    const lfo  = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    lfoG.gain.setValueAtTime(0, t);
    lfoG.gain.linearRampToValueAtTime(9, t + 0.08);   // cents
    lfo.connect(lfoG);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
    this._sched.push(lfo, lfoG);

    // Shared lowpass — warm brass body, cuts harsh high partials
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 2600;
    lpf.Q.value = 0.4;
    lpf.connect(this._mainGain);
    this._sched.push(lpf);

    // Two sawtooth voices: fundamental (louder) + 9 cents sharp (width)
    for (const [detuneC, basePeak] of [[0, 0.042], [9, 0.020]]) {
      const peak = basePeak * vel;
      const osc  = ctx.createOscillator();
      const g    = ctx.createGain();
      osc.type   = 'sawtooth';
      // Lip attack: start sharp, slide to target pitch
      osc.frequency.setValueAtTime(attackFreq * Math.pow(2, detuneC / 1200), t);
      osc.frequency.linearRampToValueAtTime(targetFreq * Math.pow(2, detuneC / 1200), t + 0.022);
      lfoG.connect(osc.detune);   // vibrato modulates detune in cents
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.015);
      g.gain.setValueAtTime(peak, Math.max(t + 0.016, t + dur - 0.040));
      g.gain.linearRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(lpf);
      osc.start(t);
      osc.stop(t + dur + 0.01);
      this._sched.push(osc, g);
    }
  }

  // ── Reverb impulse response — synthetic small-club room ─────────────────
  _makeReverbIR(ctx) {
    const SR  = ctx.sampleRate;
    const dur = 1.4;                          // tail length (s)
    const len = Math.ceil(SR * dur);
    const PRE = Math.ceil(SR * 0.015);        // 15 ms pre-delay
    const buf = ctx.createBuffer(2, len, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = PRE; i < len; i++) {
        const t   = (i - PRE) / SR;
        const env = Math.pow(1 - t / dur, 2.8);   // exponential-ish decay
        d[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buf;
  }

  // ── Card transitions ─────────────────────────────────────────────────────
  // Mute kicks/stabs; attenuate (not silence) bass so baseline is audible.
  pauseForCard() {
    const ctx = this._ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this._mainGain) {
      this._mainGain.gain.cancelScheduledValues(now);
      this._mainGain.gain.setValueAtTime(this._mainGain.gain.value, now);
      this._mainGain.gain.linearRampToValueAtTime(0.0, now + 0.12);
    }
    if (this._bassGain) {
      this._bassGain.gain.cancelScheduledValues(now);
      this._bassGain.gain.setValueAtTime(this._bassGain.gain.value, now);
      this._bassGain.gain.linearRampToValueAtTime(0.28, now + 0.15);
    }
  }

  resumeFromCard() {
    const ctx = this._ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this._mainGain) {
      this._mainGain.gain.cancelScheduledValues(now);
      this._mainGain.gain.setValueAtTime(0.0, now);
      this._mainGain.gain.linearRampToValueAtTime(1.0, now + 0.18);
    }
    if (this._bassGain) {
      this._bassGain.gain.cancelScheduledValues(now);
      this._bassGain.gain.setValueAtTime(this._bassGain.gain.value, now);
      this._bassGain.gain.linearRampToValueAtTime(1.0, now + 0.18);
    }
  }

  // ── Stop: disconnect all scheduled nodes ─────────────────────────────────
  stop() {
    for (const n of this._sched) {
      try { n.disconnect(); } catch (_) {}
    }
    this._sched    = [];
    this._mainGain = null;
    this._bassGain = null;
  }
}

// Singleton — available globally as window.A2ElectroswingSynth
window.A2ElectroswingSynth = new A2ElectroswingSynth();
