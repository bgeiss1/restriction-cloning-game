#!/usr/bin/env python3
"""
beat_extractor.py — Extract drum hit timestamps from an MP3 for Act 2 beatmap.

Separates the audio into a percussive component, then splits into three
frequency bands and runs onset detection on each:

  Kick   : 20–150 Hz  (low thump)
  Snare  : 150–800 Hz (body + crack)
  Hi-hat : 5000–16000 Hz (closed/open HH, cymbal edge)

Also estimates overall BPM and the first beat timestamp (downbeat offset),
both of which are needed by the boss card-snap logic in vi_p3d_a2_boss.js.

Usage:
  python beat_extractor.py track.mp3
  python beat_extractor.py track.mp3 --out beats.json --start 2.0 --end 120.0
  python beat_extractor.py track.mp3 --kick-delta 0.05 --snare-delta 0.08

Output:
  JSON file with fields: bpm, downbeat_offset, duration,
  kick[], snare[], hihat[], all_beats[]

  All timestamps are in seconds from the start of the file.

Dependencies (install once):
  pip install librosa numpy scipy soundfile
  MP3 decoding also requires one of:
    - ffmpeg in PATH  (recommended: sudo apt install ffmpeg)
    - pip install audioread
"""

import argparse
import json
import sys
import numpy as np
import scipy.signal

try:
    import librosa
except ImportError:
    sys.exit('librosa not found. Run:  pip install librosa soundfile')


# ── DSP helpers ───────────────────────────────────────────────────────────────

def bandpass(y, sr, lo_hz, hi_hz, order=4):
    """Zero-phase Butterworth bandpass filter using second-order sections (SOS).

    SOS form is far more numerically stable than ba coefficients, especially
    for extreme cutoffs like 20 Hz at 48 kHz where ba filtfilt produces NaN.
    """
    nyq = sr / 2.0
    lo  = max(lo_hz, 1.0)      # never 0 Hz
    hi  = min(hi_hz, nyq - 1)  # never above Nyquist
    if lo >= hi:
        return np.zeros_like(y)
    sos = scipy.signal.butter(order, [lo / nyq, hi / nyq], btype='band', output='sos')
    out = scipy.signal.sosfiltfilt(sos, y)
    # Safety clamp: replace any residual NaN/Inf (degenerate input) with 0
    return np.nan_to_num(out, nan=0.0, posinf=0.0, neginf=0.0)


def detect_onsets(y, sr, hop_length, delta, prominence, wait_frames, top_pct=None):
    """
    Return onset timestamps (seconds) for a single-band signal.

    Uses onset_strength envelope + find_peaks with prominence filtering,
    which is much more selective than the plain delta threshold approach.

    delta       — minimum absolute height of a peak in the onset envelope
    prominence  — how much a peak must stand out above its surroundings;
                  the primary knob for reducing false positives
    wait_frames — minimum gap between accepted peaks (frames)
    top_pct     — if set (e.g. 30), keep only the top N% strongest hits;
                  useful for kick/snare where real hits are the loudest events
    """
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

    # Normalize to [0, 1] so that delta/prominence are consistent across tracks
    env_max = env.max()
    if env_max > 0:
        env = env / env_max

    peaks, props = scipy.signal.find_peaks(
        env,
        height=delta,
        prominence=prominence,
        distance=wait_frames,
    )

    if top_pct is not None and len(peaks) > 1:
        cutoff = np.percentile(props['prominences'], 100.0 - top_pct)
        mask   = props['prominences'] >= cutoff
        peaks  = peaks[mask]

    # Backtrack each peak to the local energy minimum just before the attack
    peaks = librosa.onset.onset_backtrack(peaks, env)

    return librosa.frames_to_time(peaks, sr=sr, hop_length=hop_length)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Extract drum onset timestamps from an MP3 for Act 2 beatmap.'
    )
    parser.add_argument('mp3',
        help='Input MP3 (or WAV/FLAC) file path')
    parser.add_argument('--out', default=None,
        help='Output JSON path (default: <stem>_beats.json in same directory)')

    # Time window — useful for ignoring intros/outros
    parser.add_argument('--start', type=float, default=0.0,
        help='Ignore hits before this time in seconds (default: 0)')
    parser.add_argument('--end', type=float, default=None,
        help='Ignore hits after this time in seconds (default: end of file)')

    # Sensitivity tuning — lower delta = more hits detected, higher = fewer
    # Envelope is normalized 0–1, so these thresholds are always on the same scale.
    parser.add_argument('--kick-delta', type=float, default=0.15,
        help='Min normalized onset height for kick, 0–1 (default: 0.15)')
    parser.add_argument('--snare-delta', type=float, default=0.15,
        help='Min normalized onset height for snare, 0–1 (default: 0.15)')
    parser.add_argument('--hihat-delta', type=float, default=0.10,
        help='Min normalized onset height for hi-hat, 0–1 (default: 0.10)')

    # Prominence: how much a peak must stand out above its surroundings (0–1 scale).
    # This is the primary knob — raise it to get fewer, stronger hits.
    parser.add_argument('--kick-prominence', type=float, default=0.15,
        help='Peak prominence for kick, 0–1 — raise to reduce false positives (default: 0.15)')
    parser.add_argument('--snare-prominence', type=float, default=0.15,
        help='Peak prominence for snare, 0–1 (default: 0.15)')
    parser.add_argument('--hihat-prominence', type=float, default=0.10,
        help='Peak prominence for hi-hat, 0–1 (default: 0.10)')

    # Top-pct: after prominence filtering, keep only the strongest N% of hits.
    # e.g. --kick-top-pct 25 keeps only the loudest 25% of detected kicks.
    parser.add_argument('--kick-top-pct', type=float, default=None,
        help='Keep only top N%% strongest kick hits, e.g. 25 (default: keep all)')
    parser.add_argument('--snare-top-pct', type=float, default=None,
        help='Keep only top N%% strongest snare hits (default: keep all)')
    parser.add_argument('--hihat-top-pct', type=float, default=None,
        help='Keep only top N%% strongest hi-hat hits (default: keep all)')

    # Minimum gap between successive hits in the same band (seconds)
    parser.add_argument('--kick-gap', type=float, default=0.20,
        help='Minimum seconds between kick hits (default: 0.20)')
    parser.add_argument('--snare-gap', type=float, default=0.15,
        help='Minimum seconds between snare hits (default: 0.15)')
    parser.add_argument('--hihat-gap', type=float, default=0.05,
        help='Minimum seconds between hi-hat hits (default: 0.05)')

    args = parser.parse_args()

    # ── Load audio ────────────────────────────────────────────────────────────
    print(f'Loading: {args.mp3}')
    try:
        y, sr = librosa.load(args.mp3, sr=None, mono=True)
    except Exception as e:
        sys.exit(f'Failed to load audio: {e}\n'
                 'Make sure ffmpeg is installed (sudo apt install ffmpeg) or '
                 'pip install audioread')

    duration = len(y) / sr
    print(f'  Duration : {duration:.2f}s')
    print(f'  Sample rate: {sr} Hz')

    # ── HPSS — isolate percussive component ──────────────────────────────────
    # margin=3 gives strong percussion separation at cost of some bleed
    print('Separating percussive component (HPSS)...')
    _, y_perc = librosa.effects.hpss(y, margin=3.0)

    # ── Frequency band filtering ──────────────────────────────────────────────
    print('Filtering frequency bands...')
    y_kick  = bandpass(y_perc, sr,   20,  150)   # sub-bass thump
    y_snare = bandpass(y_perc, sr,  150,  800)   # snare body + crack
    y_hihat = bandpass(y_perc, sr, 5000, 16000)  # cymbal / hi-hat

    # ── Onset detection ───────────────────────────────────────────────────────
    # HOP = 256 samples → ~5.8 ms resolution at 44100 Hz
    HOP = 256

    def gap_to_frames(gap_s):
        return max(1, int(gap_s * sr / HOP))

    print('Detecting kick onsets...')
    kick_times  = detect_onsets(y_kick,  sr, HOP,
                                delta=args.kick_delta,
                                prominence=args.kick_prominence,
                                wait_frames=gap_to_frames(args.kick_gap),
                                top_pct=args.kick_top_pct)
    print(f'  {len(kick_times)} hits detected')

    print('Detecting snare onsets...')
    snare_times = detect_onsets(y_snare, sr, HOP,
                                delta=args.snare_delta,
                                prominence=args.snare_prominence,
                                wait_frames=gap_to_frames(args.snare_gap),
                                top_pct=args.snare_top_pct)
    print(f'  {len(snare_times)} hits detected')

    print('Detecting hi-hat onsets...')
    hihat_times = detect_onsets(y_hihat, sr, HOP,
                                delta=args.hihat_delta,
                                prominence=args.hihat_prominence,
                                wait_frames=gap_to_frames(args.hihat_gap),
                                top_pct=args.hihat_top_pct)
    print(f'  {len(hihat_times)} hits detected')

    # ── BPM + beat grid ───────────────────────────────────────────────────────
    print('Estimating tempo and beat positions...')
    tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr, hop_length=HOP)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)
    bpm = float(np.round(np.atleast_1d(tempo)[0], 1))
    downbeat_offset = float(beat_times[0]) if len(beat_times) > 0 else 0.0
    print(f'  Estimated BPM    : {bpm}')
    print(f'  First beat offset: {downbeat_offset:.4f}s')
    print()
    print('  NOTE: librosa BPM detection is approximate. Verify with Audacity')
    print('  (Analyze → Beat Finder) or a DAW for the exact BPM and downbeat.')

    # ── Trim to requested window ──────────────────────────────────────────────
    def trim(times):
        t = np.asarray(times)
        t = t[t >= args.start]
        if args.end is not None:
            t = t[t <= args.end]
        return [round(float(v), 4) for v in t]

    # ── Assemble output ───────────────────────────────────────────────────────
    result = {
        '_comment': (
            'All times in seconds from start of file. '
            'bpm and downbeat_offset are needed by the boss card-snap logic. '
            'kick/snare/hihat are candidate beatmap timestamps — review and prune '
            'before baking into A2MP3Beatmap nodes.'
        ),
        'bpm'             : bpm,
        'downbeat_offset' : round(downbeat_offset, 4),
        'duration'        : round(duration, 3),
        'window'          : {'start': args.start, 'end': args.end or round(duration, 3)},
        'kick'  : trim(kick_times),
        'snare' : trim(snare_times),
        'hihat' : trim(hihat_times),
        'all_beats': trim(beat_times),
    }

    # ── Write JSON ────────────────────────────────────────────────────────────
    if args.out:
        out_path = args.out
    else:
        stem = args.mp3.rsplit('.', 1)[0]
        out_path = stem + '_beats.json'

    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)

    # ── Write Audacity label track ────────────────────────────────────────────
    # Format: start<TAB>end<TAB>label  (start == end for point labels)
    # Import in Audacity: File → Import → Labels...
    lbl_path = out_path.replace('.json', '_labels.txt')
    labels = (
        [(t, 'K') for t in result['kick']] +
        [(t, 'S') for t in result['snare']] +
        [(t, 'H') for t in result['hihat']] +
        [(t, '|') for t in result['all_beats']]
    )
    labels.sort(key=lambda x: x[0])
    with open(lbl_path, 'w') as f:
        for t, lbl in labels:
            f.write(f'{t:.4f}\t{t:.4f}\t{lbl}\n')

    print(f'\nWrote: {out_path}')
    print(f'  kick   : {len(result["kick"])} hits')
    print(f'  snare  : {len(result["snare"])} hits')
    print(f'  hihat  : {len(result["hihat"])} hits')
    print(f'  beats  : {len(result["all_beats"])} beat positions')
    print(f'\nWrote Audacity labels: {lbl_path}')
    print('  Import in Audacity: File → Import → Labels...')
    print('  Labels: K=kick  S=snare  H=hi-hat  |=beat grid')
    print()
    print('Next steps:')
    print('  1. Open the MP3 in Audacity, then File → Import → Labels → <stem>_labels.txt')
    print('  2. Verify bpm and downbeat_offset visually against the waveform')
    print('  3. Adjust --kick-delta / --snare-delta / --hihat-delta and re-run if too many or too few hits')
    print('  4. Hand-author A2MP3Beatmap nodes in vi_p3d_a2_music.js from these timestamps')


if __name__ == '__main__':
    main()
