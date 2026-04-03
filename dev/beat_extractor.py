#!/usr/bin/env python3
"""
beat_extractor.py — Extract drum hit timestamps from an MP3 for Act 2 beatmap.

Pipeline:
  1. Demucs source separation → clean drum stem (removes vocals, bass, instruments)
  2. Onset detection on the full drum stem — no frequency-band assumptions
  3. Feature extraction per onset: MFCCs + spectral centroid + rolloff + ZCR + RMS
     over a 100 ms window starting at each onset
  4. K-means clustering into N groups (default 3 = kick / snare / hi-hat)
  5. Output cluster labels for Audacity inspection, with spectral hints

Two-phase workflow
──────────────────
Phase 1 — Explore (no cluster assignments):
  Run the script.  It writes Audacity labels C0 / C1 / C2 and prints a
  summary table showing each cluster's median spectral centroid and hit count.
  Open the labels in Audacity, listen to a few hits per cluster, and note which
  cluster number corresponds to kick, snare, and hi-hat.

Phase 2 — Assign (after you know which cluster is which):
  Re-run with --kick-cluster / --snare-cluster / --hihat-cluster.
  The script writes the final beats.json with proper kick[] / snare[] / hihat[]
  arrays for A2MP3Beatmap, and Audacity labels with K / S / H markers.
  Use --types to restrict which drum types appear in the JSON — e.g. --types K
  writes only the kick array; hits of other types are labeled I in the Audacity
  file but omitted from the JSON entirely.

Usage:
  # Phase 1: explore
  conda run -n demucs_env python beat_extractor.py track.mp3

  # Phase 2: assign (example — your cluster numbers may differ)
  conda run -n demucs_env python beat_extractor.py track.mp3 \\
    --drums-stem track_drums.mp3 \\
    --kick-cluster 1 --snare-cluster 0 --hihat-cluster 2

  # Skip Demucs if you already have the drum stem:
  conda run -n demucs_env python beat_extractor.py track.mp3 \\
    --drums-stem /path/to/drums.mp3

  # Use more clusters if the track has open/closed hi-hat etc.:
  conda run -n demucs_env python beat_extractor.py track.mp3 --n-clusters 4

Output:
  <stem>_beats.json        — bpm, downbeat_offset, clusters[] or kick/snare/hihat[]
  <stem>_beats_labels.txt  — Audacity label track
  <stem>_drums.mp3         — saved drum stem (reuse with --drums-stem)

Dependencies (demucs_env):
  conda create -n demucs_env python=3.11 -y
  conda run -n demucs_env pip install demucs librosa soundfile scipy scikit-learn
"""

import argparse
import json
import os
import sys
import tempfile

import numpy as np
import scipy.signal

try:
    import librosa
except ImportError:
    sys.exit('librosa not found.  Run: pip install librosa soundfile')

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
except ImportError:
    sys.exit('scikit-learn not found.  Run: pip install scikit-learn')


# ── Demucs source separation ──────────────────────────────────────────────────

def separate_drums(mp3_path, out_dir):
    """
    Run Demucs via subprocess, return path to drums.mp3.
    Uses --mp3 output to avoid torchcodec/WAV saving issues.
    """
    import subprocess
    import torch

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'  Device: {device}')

    subprocess.run([
        sys.executable, '-m', 'demucs',
        '--two-stems', 'drums',
        '--mp3',
        '--out', out_dir,
        '--device', device,
        mp3_path,
    ], check=True)

    track_name = os.path.splitext(os.path.basename(mp3_path))[0]
    drums_path = os.path.join(out_dir, 'htdemucs', track_name, 'drums.mp3')
    if not os.path.exists(drums_path):
        for root, _, files in os.walk(out_dir):
            for f in files:
                if f.startswith('drums'):
                    drums_path = os.path.join(root, f)
                    break
    if not os.path.exists(drums_path):
        sys.exit(f'Demucs finished but drums stem not found under {out_dir}')
    return drums_path


# ── Onset detection ───────────────────────────────────────────────────────────

def detect_all_onsets(y, sr, delta, prominence, min_gap_s):
    """
    Detect all onsets in a drum stem without any frequency-band assumptions.
    Returns array of onset times in seconds.
    """
    HOP = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    env_max = env.max()
    if env_max > 0:
        env = env / env_max

    wait = max(1, int(min_gap_s * sr / HOP))
    peaks, _ = scipy.signal.find_peaks(env, height=delta, prominence=prominence,
                                        distance=wait)
    peaks = librosa.onset.onset_backtrack(peaks, env)
    return librosa.frames_to_time(peaks, sr=sr, hop_length=HOP)


# ── Feature extraction ────────────────────────────────────────────────────────

def extract_features(y, sr, onset_times, window_s=0.100):
    """
    Extract a feature vector from a window_s-wide window at each onset.

    Features (17 total):
      13 MFCCs       — timbre / tonal character
       1 spec centroid — brightness (kick=low, hihat=high)
       1 spec rolloff  — high-frequency content
       1 zero-crossing rate — noisiness (hihat/snare > kick)
       1 RMS energy    — loudness

    Returns float32 array shape (n_onsets, 17).
    """
    hop   = 256
    n_fft = 512
    win   = int(window_s * sr)
    feats = []

    for t in onset_times:
        start = int(t * sr)
        end   = min(len(y), start + win)
        chunk = y[start:end]

        # Pad if the onset is near the end of the track
        if len(chunk) < n_fft:
            chunk = np.pad(chunk, (0, n_fft - len(chunk)))

        S = np.abs(librosa.stft(chunk, n_fft=n_fft, hop_length=hop))

        mfcc      = librosa.feature.mfcc(y=chunk, sr=sr, n_mfcc=13, hop_length=hop)
        centroid  = librosa.feature.spectral_centroid(S=S, sr=sr)
        rolloff   = librosa.feature.spectral_rolloff(S=S, sr=sr, roll_percent=0.85)
        zcr       = librosa.feature.zero_crossing_rate(chunk, hop_length=hop)
        rms       = librosa.feature.rms(y=chunk, hop_length=hop)

        vec = np.concatenate([
            np.mean(mfcc, axis=1),
            [np.mean(centroid)],
            [np.mean(rolloff)],
            [np.mean(zcr)],
            [np.mean(rms)],
        ]).astype(np.float32)

        feats.append(vec)

    return np.array(feats)


# ── Clustering ────────────────────────────────────────────────────────────────

def cluster_onsets(features, n_clusters, random_state=42):
    """
    Standardise features and run K-means.
    Returns cluster labels array (int, shape n_onsets).
    """
    scaler = StandardScaler()
    X      = scaler.fit_transform(features)
    km     = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=20)
    km.fit(X)
    return km.labels_


def cluster_summary(onset_times, labels, features, n_clusters):
    """
    Print a summary table with hit count and median spectral centroid per cluster.
    Spectral centroid is feature index 13.
    Returns a list of (cluster_idx, median_centroid) sorted by centroid ascending
    so the caller can suggest kick/snare/hihat order.
    """
    print(f'\n  {"Cluster":>8}  {"Hits":>6}  {"Med centroid":>14}  Hint')
    print(f'  {"───────":>8}  {"────":>6}  {"────────────":>14}  ────')

    rows = []
    for c in range(n_clusters):
        mask      = labels == c
        count     = int(mask.sum())
        centroids = features[mask, 13]
        med_c     = float(np.median(centroids)) if count > 0 else 0.0
        rows.append((c, count, med_c))

    rows_sorted = sorted(rows, key=lambda r: r[2])
    hints = ['← lowest centroid (likely KICK)',
             '← mid centroid (likely SNARE)',
             '← highest centroid (likely HI-HAT)']

    for rank, (c, count, med_c) in enumerate(rows_sorted):
        hint = hints[rank] if rank < len(hints) else ''
        print(f'  C{c:>7}  {count:>6}  {med_c:>11.0f} Hz  {hint}')

    return rows_sorted


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Extract drum onset timestamps via Demucs + K-means clustering.'
    )
    parser.add_argument('mp3',
        help='Input MP3 (or WAV/FLAC) file')
    parser.add_argument('--out', default=None,
        help='Output JSON path (default: <stem>_beats.json next to input)')
    parser.add_argument('--drums-stem', default=None,
        help='Path to an existing Demucs drum stem — skips separation step. '
             'A saved stem is written to <stem>_drums.mp3 on each run.')

    parser.add_argument('--start', type=float, default=0.0,
        help='Ignore hits before this time (seconds, default: 0)')
    parser.add_argument('--end', type=float, default=None,
        help='Ignore hits after this time (seconds, default: end of file)')

    # Clustering
    parser.add_argument('--n-clusters', type=int, default=3,
        help='Number of K-means clusters (default: 3). Use 4+ if the track has '
             'open and closed hi-hat as separate sounds.')

    # Cluster assignment (Phase 2)
    parser.add_argument('--kick-cluster',  type=int, default=None,
        help='Cluster index to label as kick (from Phase 1 inspection)')
    parser.add_argument('--snare-cluster', type=int, default=None,
        help='Cluster index to label as snare')
    parser.add_argument('--hihat-cluster', type=int, default=None,
        help='Cluster index to label as hi-hat. With --n-clusters 4+ any '
             'unassigned clusters are written as extra[] in the JSON.')

    # Output type filter
    parser.add_argument('--types', default='K,S,H',
        help='Comma-separated drum types to include in the output JSON: '
             'K=kick  S=snare  H=hihat  (default: K,S,H). '
             'Omitted types and unassigned clusters are labeled I in the '
             'Audacity labels file but are not written to the JSON.')

    # Onset detection sensitivity
    parser.add_argument('--onset-delta',      type=float, default=0.10,
        help='Min normalised onset height 0–1 (default: 0.10). '
             'Raise to reduce false positives; lower for quiet hits.')
    parser.add_argument('--onset-prominence', type=float, default=0.10,
        help='Min peak prominence 0–1 (default: 0.10)')
    parser.add_argument('--onset-gap',        type=float, default=0.04,
        help='Min seconds between onsets (default: 0.04 = 40 ms)')

    # Feature window
    parser.add_argument('--feature-window', type=float, default=0.100,
        help='Audio window in seconds used for feature extraction (default: 0.100)')

    args = parser.parse_args()

    # Parse --types
    raw_types = [t.strip().upper() for t in args.types.split(',') if t.strip()]
    invalid_types = set(raw_types) - {'K', 'S', 'H'}
    if invalid_types:
        sys.exit(f'--types contains unknown values: {", ".join(sorted(invalid_types))}. '
                 f'Valid values are K, S, H.')
    types_set = set(raw_types)   # subset of {'K','S','H'} to include in JSON

    TYPE_KEY = {'K': 'kick', 'S': 'snare', 'H': 'hihat'}   # symbol → JSON key

    # Validate cluster assignments if provided
    assigned = {name: val for name, val in [
        ('kick',  args.kick_cluster),
        ('snare', args.snare_cluster),
        ('hihat', args.hihat_cluster),
    ] if val is not None}

    if assigned:
        if 'kick' not in assigned or 'snare' not in assigned:
            sys.exit('--kick-cluster and --snare-cluster are required together. '
                     '--hihat-cluster is optional.')
        if len(set(assigned.values())) != len(assigned):
            sys.exit('Cluster indices must be distinct.')
        for v in assigned.values():
            if v < 0 or v >= args.n_clusters:
                sys.exit(f'Cluster index {v} out of range for --n-clusters '
                         f'{args.n_clusters}')

    # ── Step 1: Demucs separation ─────────────────────────────────────────────
    stem_base = args.mp3.rsplit('.', 1)[0]
    saved_stem_path = stem_base + '_drums.mp3'

    if args.drums_stem:
        drums_path = args.drums_stem
        print(f'Using drum stem: {drums_path}')
    else:
        print(f'Loading: {args.mp3}')
        tmp_dir = tempfile.mkdtemp(prefix='demucs_')
        print(f'Running Demucs source separation...')
        drums_path = separate_drums(args.mp3, tmp_dir)
        # Save stem next to input for reuse
        import shutil
        shutil.copy2(drums_path, saved_stem_path)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print(f'  Drum stem saved → {saved_stem_path}')
        print(f'  (Re-use with: --drums-stem {saved_stem_path})')
        drums_path = saved_stem_path

    # ── Step 2: Load drum stem ────────────────────────────────────────────────
    print('\nLoading drum stem...')
    y_drums, sr = librosa.load(drums_path, sr=None, mono=True)

    # Load original for duration + beat tracking
    y_orig, sr_orig = librosa.load(args.mp3, sr=None, mono=True)
    duration = len(y_orig) / sr_orig
    print(f'  Duration: {duration:.2f}s   sr: {sr} Hz')

    # ── Step 3: Onset detection ───────────────────────────────────────────────
    print('\nDetecting onsets on drum stem...')
    onset_times = detect_all_onsets(
        y_drums, sr,
        delta      = args.onset_delta,
        prominence = args.onset_prominence,
        min_gap_s  = args.onset_gap,
    )
    print(f'  {len(onset_times)} total onsets detected')

    if len(onset_times) < args.n_clusters:
        sys.exit(f'Only {len(onset_times)} onsets detected — too few to cluster '
                 f'into {args.n_clusters} groups.  Lower --onset-delta.')

    # ── Step 4: Feature extraction ────────────────────────────────────────────
    print(f'Extracting features ({args.feature_window*1000:.0f} ms window per onset)...')
    features = extract_features(y_drums, sr, onset_times, window_s=args.feature_window)
    print(f'  Feature matrix: {features.shape}')

    # ── Step 5: Clustering ────────────────────────────────────────────────────
    print(f'\nClustering into {args.n_clusters} groups (K-means, n_init=20)...')
    labels = cluster_onsets(features, args.n_clusters)

    print('\nCluster summary (sorted by spectral centroid):')
    rows_sorted = cluster_summary(onset_times, labels, features, args.n_clusters)

    # ── Step 6: Trim to window ────────────────────────────────────────────────
    def trim(times):
        t = np.asarray(list(times), dtype=float)
        t = t[t >= args.start]
        if args.end is not None:
            t = t[t <= args.end]
        return [round(float(v), 4) for v in sorted(t)]

    # ── Step 7: Beat tracking ─────────────────────────────────────────────────
    print('\nEstimating BPM and downbeat (librosa)...')
    _, y_perc = librosa.effects.hpss(y_drums, margin=3.0)
    tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr, hop_length=256)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=256)
    bpm = float(np.round(np.atleast_1d(tempo)[0], 1))
    downbeat_offset = float(beat_times[0]) if len(beat_times) > 0 else 0.0
    print(f'  BPM: {bpm}   first beat: {downbeat_offset:.4f}s')

    # ── Step 8: Assemble output ───────────────────────────────────────────────
    out_path = args.out or (stem_base + '_beats.json')
    lbl_path = out_path.replace('.json', '_labels.txt')

    if assigned:
        # Phase 2: named output
        cluster_map = {v: k for k, v in assigned.items()}   # cluster_idx → 'kick'/'snare'/'hihat'
        named = {k: [] for k in assigned}

        for t, lbl in zip(onset_times, labels):
            name = cluster_map.get(int(lbl))
            if name:
                named[name].append(t)

        # Build JSON — only include types requested via --types
        result = {
            '_comment': (
                'All times in seconds from start of file. '
                'Generated by Demucs + K-means clustering.'
            ),
            'bpm'            : bpm,
            'downbeat_offset': round(downbeat_offset, 4),
            'duration'       : round(duration, 3),
            'window'         : {'start': args.start,
                                'end'  : args.end or round(duration, 3)},
        }
        # Only include all_beats when all three drum types are requested
        if types_set == {'K', 'S', 'H'}:
            result['all_beats'] = trim(beat_times)
        for sym in ('K', 'S', 'H'):
            if sym in types_set:
                key = TYPE_KEY[sym]
                result[key] = trim(named.get(key, []))

        # Audacity labels: K/S/H for requested types only; excluded hits omitted
        key_sym = {'kick': 'K', 'snare': 'S', 'hihat': 'H'}
        cluster_to_sym = {v: key_sym[k] for k, v in assigned.items()}
        audit_labels = (
            [(t, cluster_to_sym[int(lbl)])
             for t, lbl in zip(onset_times, labels)
             if int(lbl) in cluster_to_sym and cluster_to_sym[int(lbl)] in types_set] +
            [(t, '|') for t in beat_times]
        )

        print(f'\nFinal hit counts (types filter: {", ".join(sorted(types_set))}):')
        for sym in ('K', 'S', 'H'):
            key = TYPE_KEY[sym]
            if sym in types_set and key in result:
                print(f'  {key:5s} [{sym}]: {len(result[key])}')
            elif key in named:
                print(f'  {key:5s} [{sym}]: {len(named[key])}  (excluded — not in --types)')

    else:
        # Phase 1: exploration output — use C0/C1/C2 labels
        clusters_out = {}
        for c in range(args.n_clusters):
            times_c = [t for t, lbl in zip(onset_times, labels) if lbl == c]
            clusters_out[f'C{c}'] = trim(times_c)

        result = {
            '_comment': (
                'Phase 1 exploration output. '
                'Load the _labels.txt in Audacity, listen to each cluster, '
                'then re-run with --kick-cluster N --snare-cluster N --hihat-cluster N.'
            ),
            'bpm'            : bpm,
            'downbeat_offset': round(downbeat_offset, 4),
            'duration'       : round(duration, 3),
            'window'         : {'start': args.start,
                                'end'  : args.end or round(duration, 3)},
            'all_beats': trim(beat_times),
        }
        result.update(clusters_out)

        audit_labels = (
            [(t, f'C{lbl}') for t, lbl in zip(onset_times, labels)] +
            [(t, '|') for t in beat_times]
        )

        print(f'\nNext step — load labels in Audacity and listen to each cluster:')
        print(f'  Audacity → File → Import → Labels → {lbl_path}')
        print(f'\nThen re-run with cluster assignments, e.g.:')
        # Use the centroid-sorted order as the suggested assignment
        c_order = [r[0] for r in rows_sorted]  # lowest→highest centroid
        suggestion = (f'--kick-cluster {c_order[0]} '
                      f'--snare-cluster {c_order[1]}')
        if len(c_order) > 2:
            suggestion += f' --hihat-cluster {c_order[2]}'
        print(f'  {suggestion}')
        print(f'  (adjust if your listening reveals a different mapping)')

    # ── Write JSON ────────────────────────────────────────────────────────────
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)

    # ── Write Audacity label track ────────────────────────────────────────────
    audit_labels.sort(key=lambda x: x[0])
    with open(lbl_path, 'w') as f:
        for t, lbl in audit_labels:
            f.write(f'{t:.4f}\t{t:.4f}\t{lbl}\n')

    print(f'\nWrote: {out_path}')
    print(f'Wrote: {lbl_path}')
    print(f'  BPM: {bpm}   downbeat: {downbeat_offset:.4f}s')


if __name__ == '__main__':
    main()
