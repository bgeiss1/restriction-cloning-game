#!/usr/bin/env python3
"""
import_plasmid.py — Import an exported plasmid JSON into a cloning.json level.

Usage:
    python3 import_plasmid.py <plasmid.json> <level_id> <slot>

Arguments:
    plasmid.json   Path to the JSON exported from plasmid_editor.py
    level_id       The "id" field of the target level (e.g. clone_01)
    slot           Either  donor  or  vector

Examples:
    python3 import_plasmid.py my_donor.json clone_01 donor
    python3 import_plasmid.py my_vector.json clone_02 vector

Notes:
    - The levels file is levels/cloning.json (relative to this script).
    - A timestamped backup of cloning.json is written before any changes.
    - For the vector slot, "use_pUC19" is automatically removed so the
      game uses the imported plasmid instead of the built-in pUC19.
    - The imported object is merged with any existing fields in the slot
      so that game-specific keys (e.g. mcs_enzymes, sequence_note) that
      are not produced by the editor are preserved unless overwritten.
"""

import sys
import json
import shutil
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR  = Path(__file__).parent
LEVELS_FILE = SCRIPT_DIR / 'levels' / 'cloning.json'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> object:
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def save_json(path: Path, data: object):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f'  Wrote {path}')

def backup(path: Path) -> Path:
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    dest  = path.with_suffix(f'.{stamp}.bak.json')
    shutil.copy2(path, dest)
    print(f'  Backup → {dest.name}')
    return dest

# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

def main():
    # ---- Parse args --------------------------------------------------------
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    plasmid_path = Path(sys.argv[1])
    level_id     = sys.argv[2]
    slot         = sys.argv[3].lower()

    if slot not in ('donor', 'vector'):
        print(f"ERROR: slot must be 'donor' or 'vector', got '{slot}'")
        sys.exit(1)

    if not plasmid_path.exists():
        print(f'ERROR: file not found: {plasmid_path}')
        sys.exit(1)

    if not LEVELS_FILE.exists():
        print(f'ERROR: levels file not found: {LEVELS_FILE}')
        sys.exit(1)

    # ---- Load files --------------------------------------------------------
    plasmid_data = load_json(plasmid_path)
    levels       = load_json(LEVELS_FILE)

    # ---- Find level --------------------------------------------------------
    target = next((lv for lv in levels if lv.get('id') == level_id), None)
    if target is None:
        ids = [lv.get('id', '?') for lv in levels]
        print(f"ERROR: level '{level_id}' not found in {LEVELS_FILE.name}")
        print(f"  Available IDs: {', '.join(ids)}")
        sys.exit(1)

    # ---- Merge plasmid into slot -------------------------------------------
    existing = target.get(slot, {})

    # Keep game-specific keys the editor doesn't produce
    merged = {**existing, **plasmid_data}

    # If importing a custom vector, remove use_pUC19 so the game uses it
    if slot == 'vector' and 'use_pUC19' in merged:
        del merged['use_pUC19']
        print('  Removed use_pUC19 (using imported vector instead of built-in pUC19)')

    target[slot] = merged

    # ---- Preview -----------------------------------------------------------
    feat_count = len(plasmid_data.get('features', []))
    site_count = len(plasmid_data.get('cut_sites', []))
    print(f"\nImporting '{plasmid_data.get('name', '?')}' "
          f"({plasmid_data.get('length', '?')} bp, "
          f"{feat_count} feature(s), {site_count} restriction site(s))")
    print(f"  → level '{level_id}' / slot '{slot}'")
    print(f"  → {LEVELS_FILE}")

    # ---- Write (with backup) -----------------------------------------------
    backup(LEVELS_FILE)
    save_json(LEVELS_FILE, levels)
    print('\nDone. Reload the game in your browser to see the changes.')


if __name__ == '__main__':
    main()
