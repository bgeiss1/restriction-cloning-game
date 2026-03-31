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
// Funk-breakbeat engine for Act 2.  118 BPM, G major / Em.
//
// Architecture:
//   _mainGain  →  ctx.destination  (kicks + stabs + hi-hats + horns; muted during cards)
//   _bassGain  →  ctx.destination  (slap bass; attenuated but alive during cards)
//
// Percussion is pre-scheduled via _scheduleRange() with 8 s lookahead.
// kickAt() fires an additional accent kick on gameplay node activations.
class A2ElectroswingSynth {
  constructor() {
    this._snd            = null;
    this._ctx            = null;
    this._mainGain       = null;
    this._bassGain       = null;
    this._reverb         = null;
    this._brassWave      = null;   // cached PeriodicWave for brass voices
    this._sched          = [];
    this._startAt        = 0;
    this._scheduledUntil = 0;
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

    // ── Reverb — tight room (funk is drier than electroswing) ───────────
    if (!this._reverb) {
      this._reverb = ctx.createConvolver();
      this._reverb.buffer = this._makeReverbIR(ctx);
      const revHpf = ctx.createBiquadFilter();
      revHpf.type = 'highpass'; revHpf.frequency.value = 300;
      const revLpf = ctx.createBiquadFilter();
      revLpf.type = 'lowpass';  revLpf.frequency.value = 5500;
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.12;   // drier than electroswing
      this._reverb.connect(revHpf); revHpf.connect(revLpf);
      revLpf.connect(wetGain);     wetGain.connect(ctx.destination);
      this._sched.push(this._reverb, revHpf, revLpf, wetGain);
      this._mainGain.connect(this._reverb);
      const bassRevSend = ctx.createGain();
      bassRevSend.gain.value = 0.22;
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
    this._schedKickPattern(from, to);
    this._schedHornCalls(from, to);
    this._scheduledUntil = to;
  }

  // ── Kick accent: public — called by boss at node-activation time ──────────
  kickAt(audioTime) {
    if (!this._ctx || !this._mainGain) return;
    this._schedKick(audioTime, 0.52);   // accent on gameplay hit
  }

  // ── Pre-scheduled breakbeat kick grid ─────────────────────────────────────
  _schedKickPattern(from, to) {
    const BEAT   = 60 / 118;
    const SIX    = BEAT / 4;
    const BAR    = BEAT * 4;
    const JITTER = 0.004;  // ±4 ms human feel
    // Syncopated breakbeat: slots in 16th-note grid (0 = beat 1)
    const KICK_SLOTS = [0, 3, 6, 8, 10, 14];
    const refT = this._startAt;
    const startBar = Math.floor((from - refT + 1e-9) / BAR);
    for (let bi = startBar; ; bi++) {
      const barBase = refT + bi * BAR;
      if (barBase >= to) break;
      for (const slot of KICK_SLOTS) {
        const t = barBase + slot * SIX;
        if (t >= from && t < to) {
          const jT = t + (Math.random() - 0.5) * 2 * JITTER;
          this._schedKick(jT, 0.38);
        }
      }
    }
  }

  // ── Kick: pitched sub-thump + attack click ────────────────────────────────
  _schedKick(t, gain = 0.42) {
    const ctx = this._ctx;
    const oscK = ctx.createOscillator();
    const gK   = ctx.createGain();
    oscK.type = 'sine';
    oscK.frequency.setValueAtTime(90, t);
    oscK.frequency.exponentialRampToValueAtTime(32, t + 0.15);
    gK.gain.setValueAtTime(gain, t);
    gK.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    oscK.connect(gK);  gK.connect(this._mainGain);
    oscK.start(t);  oscK.stop(t + 0.20);
    this._sched.push(oscK, gK);
    // Attack click
    const bufLen = Math.ceil(ctx.sampleRate * 0.012);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d      = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * (1 - i/bufLen);
    const src = ctx.createBufferSource();
    const lpf = ctx.createBiquadFilter();
    const gN  = ctx.createGain();
    src.buffer = buf;
    lpf.type = 'lowpass';  lpf.frequency.value = 240;
    gN.gain.value = 0.18;
    src.connect(lpf);  lpf.connect(gN);  gN.connect(this._mainGain);
    src.start(t);
    this._sched.push(src, lpf, gN);
  }

  // ── Slap bass: Karplus-Strong pluck, 2-bar syncopated pattern, G major/Em ──
  _schedBass(from, to) {
    const BEAT = 60 / 118;
    const SIX  = BEAT / 4;
    const ctx  = this._ctx;
    const G2=98.00, D2=73.42, E2=82.41, C2=65.41, B2=123.47, A2=110.00;
    const PAT = [
       [0,  G2, 3.0],  [3,  D2, 2.0],  [6,  G2, 1.8],
       [8,  G2, 3.0],  [11, E2, 2.0],  [14, D2, 1.8],
      [16,  G2, 3.0],  [19, A2, 2.0],  [22, C2, 1.8],
      [24,  G2, 3.0],  [27, B2, 2.0],  [30, D2, 1.8],
    ];
    const CYCLE = 32 * SIX;
    const refT  = this._startAt;
    const startC = Math.floor((from - refT + 1e-9) / CYCLE);
    for (let c = startC; c <= startC + Math.ceil((to - from) / CYCLE) + 1; c++) {
      const base = refT + c * CYCLE;
      for (const [slot, freq, gm] of PAT) {
        const t = base + slot * SIX;
        if (t < from || t >= to) continue;
        const noteDur = SIX * gm * 0.55;
        const f   = freq * Math.pow(2, ((Math.random()-0.5)*6) / 1200);
        const vel = 0.80 + Math.random() * 0.40;
        this._ksPluck(t, f, noteDur, vel);
        // Slap click — bandpass noise burst simulating string snap
        const bLen = Math.ceil(ctx.sampleRate * 0.009);
        const sbuf = ctx.createBuffer(1, bLen, ctx.sampleRate);
        const sd   = sbuf.getChannelData(0);
        for (let i = 0; i < bLen; i++) sd[i] = (Math.random()*2-1)*(1-i/bLen);
        const slapSrc = ctx.createBufferSource();
        const bpf     = ctx.createBiquadFilter();
        const gN      = ctx.createGain();
        slapSrc.buffer = sbuf;
        bpf.type = 'bandpass';  bpf.frequency.value = 900;  bpf.Q.value = 1.2;
        gN.gain.value = 0.025 * vel;
        slapSrc.connect(bpf);  bpf.connect(gN);  gN.connect(this._bassGain);
        slapSrc.start(t);
        this._sched.push(slapSrc, bpf, gN);
      }
    }
  }

  // ── Karplus-Strong string pluck ────────────────────────────────────────────
  _ksPluck(t, freq, noteDur, vel) {
    const ctx    = this._ctx;
    const SR     = ctx.sampleRate;
    const period = Math.round(SR / freq);
    // Seed buffer: one period of 1-pole LP-filtered white noise
    const seedBuf = ctx.createBuffer(1, period, SR);
    const sd = seedBuf.getChannelData(0);
    for (let i = 0; i < period; i++) sd[i] = Math.random() * 2 - 1;
    let prev = 0;
    for (let i = 0; i < period; i++) {
      sd[i] = 0.5 * sd[i] + 0.5 * prev;
      prev  = sd[i];
    }
    const seed  = ctx.createBufferSource();
    seed.buffer = seedBuf;
    const delay = ctx.createDelay(0.025);
    delay.delayTime.value = period / SR;
    const lpf   = ctx.createBiquadFilter();
    lpf.type    = 'lowpass';
    lpf.frequency.value = Math.min(freq * 11, SR * 0.45);
    const fb    = ctx.createGain();
    fb.gain.value = 0.992;
    const out   = ctx.createGain();
    out.gain.setValueAtTime(0.001, t);
    out.gain.linearRampToValueAtTime(0.085 * vel, t + 0.003);
    out.gain.setValueAtTime(0.085 * vel, t + noteDur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.001, t + noteDur);
    // Feedback loop: seed→delay→lpf→fb→delay; output tap from delay
    seed.connect(delay);
    delay.connect(lpf);
    lpf.connect(fb);
    fb.connect(delay);
    delay.connect(out);
    out.connect(this._bassGain);
    seed.start(t);
    seed.stop(t + period / SR + 0.003);
    this._sched.push(seed, delay, lpf, fb, out);
  }

  // ── Brass stabs: PeriodicWave triads on funky upbeats (G major cycle) ───────
  _schedStabs(from, to) {
    const BEAT = 60 / 118;
    const SIX  = BEAT / 4;
    const BAR  = BEAT * 4;
    const ctx  = this._ctx;
    const wave = this._getBrassWave();
    const CHORDS = [
      [392.00, 493.88, 587.33],   // G:  G4 B4 D5
      [329.63, 392.00, 493.88],   // Em: E4 G4 B4
      [261.63, 329.63, 392.00],   // C:  C4 E4 G4
      [293.66, 369.99, 440.00],   // D:  D4 F#4 A4
    ];
    // Stabs on "+" of beat 2 (slot 6) and "+" of beat 4 (slot 14)
    const STAB_SLOTS = [6, 14];
    const refT = this._startAt;
    const startBar = Math.floor((from - refT + 1e-9) / BAR);
    for (let bi = startBar; ; bi++) {
      const barBase = refT + bi * BAR;
      if (barBase >= to) break;
      const chord = CHORDS[bi % CHORDS.length];
      for (const slot of STAB_SLOTS) {
        const t = barBase + slot * SIX;
        if (t < from || t >= to) continue;
        for (const freq of chord) {
          const osc = ctx.createOscillator();
          const lpf = ctx.createBiquadFilter();
          const g   = ctx.createGain();
          if (wave) osc.setPeriodicWave(wave); else osc.type = 'sawtooth';
          osc.frequency.value = freq;
          lpf.type = 'lowpass';
          // Brightness envelope: open on attack, darken by end
          lpf.frequency.setValueAtTime(4000, t);
          lpf.frequency.exponentialRampToValueAtTime(1600, t + 0.070);
          lpf.Q.value = 0.5;
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.020, t + 0.007);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.070);
          osc.connect(lpf);  lpf.connect(g);  g.connect(this._mainGain);
          osc.start(t);  osc.stop(t + 0.08);
          this._sched.push(osc, lpf, g);
        }
      }
    }
  }

  // ── Hi-hats: straight 16th closed HH, open HH on beat upbeats ────────────
  _schedHiHats(from, to) {
    const BEAT = 60 / 118;
    const SIX  = BEAT / 4;
    const ctx  = this._ctx;
    const SR   = ctx.sampleRate;
    const bufLen   = Math.ceil(SR * 0.22);
    const noiseBuf = ctx.createBuffer(1, bufLen, SR);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random()*2-1;
    // Open HH on "+" of beats 2 and 4 (16th slots 6 and 14)
    const OPEN = new Set([6, 14]);
    // Skip closed HH on beats 1 and 3 (give kick space)
    const SKIP = new Set([0, 8]);
    const refT = this._startAt;
    const startSlot = Math.floor((from - refT + 1e-9) / SIX);
    for (let si = startSlot; ; si++) {
      const t = refT + si * SIX;
      if (t >= to) break;
      if (t < from) continue;
      const barSlot = ((si % 16) + 16) % 16;
      const isOpen  = OPEN.has(barSlot);
      if (!isOpen && SKIP.has(barSlot)) continue;
      const vel    = 0.70 + Math.random() * 0.60;
      const jitter = isOpen ? 0.005 : 0.007;  // ±5 ms open, ±7 ms closed
      const jT     = t + (Math.random() - 0.5) * 2 * jitter;
      if (isOpen) {
        const src = ctx.createBufferSource();
        const hpf = ctx.createBiquadFilter();
        const g   = ctx.createGain();
        src.buffer = noiseBuf;
        hpf.type = 'highpass';  hpf.frequency.value = 5500;
        g.gain.setValueAtTime(0.050 * vel, jT);
        g.gain.exponentialRampToValueAtTime(0.001, jT + 0.16);
        src.connect(hpf);  hpf.connect(g);  g.connect(this._mainGain);
        src.start(jT);  src.stop(jT + 0.18);
        this._sched.push(src, hpf, g);
      } else {
        const src = ctx.createBufferSource();
        const bpf = ctx.createBiquadFilter();
        const g   = ctx.createGain();
        src.buffer = noiseBuf;
        bpf.type = 'bandpass';  bpf.frequency.value = 10000;  bpf.Q.value = 0.7;
        g.gain.setValueAtTime(0.030 * vel, jT);
        g.gain.exponentialRampToValueAtTime(0.001, jT + 0.018);
        src.connect(bpf);  bpf.connect(g);  g.connect(this._mainGain);
        src.start(jT);  src.stop(jT + 0.022);
        this._sched.push(src, bpf, g);
      }
    }
  }

  // ── Snare: main hits beats 2 & 4, ghost notes, snare wire buzz ───────────
  _schedSnare(from, to) {
    const BEAT = 60 / 118;
    const SIX  = BEAT / 4;
    const BAR  = BEAT * 4;
    const ctx  = this._ctx;
    const SR   = ctx.sampleRate;
    const bufLen = Math.ceil(SR * 0.15);
    const snBuf  = ctx.createBuffer(1, bufLen, SR);
    const sd = snBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) sd[i] = Math.random()*2-1;

    const playSnare = (t, ghost) => {
      const jT  = t + (Math.random() - 0.5) * (ghost ? 0.018 : 0.012);
      const vel = ghost ? 0.15 + Math.random()*0.12 : 0.82 + Math.random()*0.18;
      const src = ctx.createBufferSource();
      const bpf = ctx.createBiquadFilter();
      const gN  = ctx.createGain();
      src.buffer = snBuf;
      bpf.type = 'bandpass';  bpf.frequency.value = 260;  bpf.Q.value = 0.9;
      gN.gain.setValueAtTime(0.068 * vel, jT);
      gN.gain.exponentialRampToValueAtTime(0.001, ghost ? jT+0.055 : jT+0.105);
      src.connect(bpf);  bpf.connect(gN);  gN.connect(this._mainGain);
      src.start(jT);  src.stop(ghost ? jT+0.065 : jT+0.12);
      this._sched.push(src, bpf, gN);
      if (!ghost) {
        // Body thump
        const osc = ctx.createOscillator();
        const gS  = ctx.createGain();
        osc.type = 'sine';  osc.frequency.value = 188;
        gS.gain.setValueAtTime(0.052 * vel, jT);
        gS.gain.exponentialRampToValueAtTime(0.001, jT + 0.072);
        osc.connect(gS);  gS.connect(this._mainGain);
        osc.start(jT);  osc.stop(jT + 0.09);
        this._sched.push(osc, gS);
        // Snare wire buzz — HP noise layer (rattling bottom-head wires)
        const wireBufLen = Math.ceil(SR * 0.032);
        const wireBuf  = ctx.createBuffer(1, wireBufLen, SR);
        const wd = wireBuf.getChannelData(0);
        for (let i = 0; i < wireBufLen; i++) wd[i] = Math.random()*2-1;
        const wireSrc = ctx.createBufferSource();
        const wireHpf = ctx.createBiquadFilter();
        const wireG   = ctx.createGain();
        wireSrc.buffer = wireBuf;
        wireHpf.type = 'highpass';  wireHpf.frequency.value = 2500;
        wireG.gain.setValueAtTime(0.035 * vel, jT);
        wireG.gain.exponentialRampToValueAtTime(0.001, jT + 0.030);
        wireSrc.connect(wireHpf);  wireHpf.connect(wireG);  wireG.connect(this._mainGain);
        wireSrc.start(jT);  wireSrc.stop(jT + 0.035);
        this._sched.push(wireSrc, wireHpf, wireG);
      }
    };

    const refT = this._startAt;
    const startBar = Math.floor((from - refT + 1e-9) / BAR);
    for (let bi = startBar; ; bi++) {
      const barBase = refT + bi * BAR;
      if (barBase >= to) break;
      // Main snare: beat 2 (slot 4) and beat 4 (slot 12)
      for (const slot of [4, 12]) {
        const t = barBase + slot * SIX;
        if (t >= from && t < to) playSnare(t, false);
      }
      // Ghost notes: slots 2, 10, 14 (before/after main hits)
      for (const slot of [2, 10, 14]) {
        const t = barBase + slot * SIX;
        if (t >= from && t < to) playSnare(t, true);
      }
    }
  }

  // ── Horn hits: short 2-note punches every 2 bars (G major voicings) ───────
  _schedHornCalls(from, to) {
    const BEAT = 60 / 118;
    const BAR  = BEAT * 4;
    const ctx  = this._ctx;
    // [freq_Hz, bar_offset_in_seconds]
    const LICKS = [
      [[392.00, 0], [493.88, BEAT*0.5]],   // G4 → B4
      [[440.00, 0], [523.25, BEAT*0.5]],   // A4 → C5
      [[329.63, 0], [392.00, BEAT*0.5]],   // E4 → G4
      [[293.66, 0], [369.99, BEAT*0.5]],   // D4 → F#4
    ];
    const TWO_BAR = BAR * 2;
    const refT = this._startAt;
    const startPhrase = Math.max(0, Math.floor((from - refT - BAR + 1e-9) / TWO_BAR));
    for (let pi = startPhrase; ; pi++) {
      const phraseT = refT + pi * TWO_BAR;
      if (phraseT >= to) break;
      const lick = LICKS[pi % LICKS.length];
      for (const [freq, off] of lick) {
        const t = phraseT + off;
        if (t < from || t >= to) continue;
        this._playHorn(t, freq, 0.14);
      }
    }
  }

  // ── Horn voice: PeriodicWave brass harmonics + time-varying brightness ────
  _playHorn(t, freq, dur) {
    const ctx  = this._ctx;
    const wave = this._getBrassWave();
    const vel  = 0.85 + Math.random() * 0.30;
    const lpf  = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    // Brightness envelope: opens bright on attack, darkens toward release
    lpf.frequency.setValueAtTime(4000, t);
    lpf.frequency.exponentialRampToValueAtTime(1600, t + dur);
    lpf.Q.value = 0.5;
    lpf.connect(this._mainGain);
    this._sched.push(lpf);
    for (const [detuneC, basePeak] of [[0, 0.040], [7, 0.018]]) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      const f   = freq * Math.pow(2, (detuneC + (Math.random()-0.5)*8) / 1200);
      if (wave) osc.setPeriodicWave(wave); else osc.type = 'sawtooth';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(basePeak * vel, t + 0.009);
      g.gain.setValueAtTime(basePeak * vel, Math.max(t+0.010, t + dur - 0.025));
      g.gain.linearRampToValueAtTime(0.001, t + dur);
      osc.connect(g);  g.connect(lpf);
      osc.start(t);  osc.stop(t + dur + 0.01);
      this._sched.push(osc, g);
    }
  }

  // ── PeriodicWave: brass harmonic series (lazy cache) ─────────────────────
  _getBrassWave() {
    if (this._brassWave) return this._brassWave;
    const ctx = this._ctx;
    if (!ctx) return null;
    const real = new Float32Array(9);
    const imag = new Float32Array(9);
    // Brass harmonic amplitudes (fundamental + overtones)
    imag[1] = 1.00;
    imag[2] = 0.60;
    imag[3] = 0.42;
    imag[4] = 0.26;
    imag[5] = 0.16;
    imag[6] = 0.10;
    imag[7] = 0.07;
    imag[8] = 0.04;
    this._brassWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return this._brassWave;
  }

  // ── Reverb impulse response — tight room (0.7 s, drier than before) ───────
  _makeReverbIR(ctx) {
    const SR  = ctx.sampleRate;
    const dur = 0.7;
    const len = Math.ceil(SR * dur);
    const PRE = Math.ceil(SR * 0.008);
    const buf = ctx.createBuffer(2, len, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = PRE; i < len; i++) {
        const t = (i - PRE) / SR;
        d[i] = (Math.random()*2-1) * Math.pow(1 - t/dur, 3.2);
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
