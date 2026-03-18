# MIP Molecular Madness

Browser-based educational game suite for the Department of Microbiology, Immunology & Pathology at Colorado State University. All games run as static pages on GitHub Pages — no server required.

**Live site:** https://bgeiss1.github.io/restriction-cloning-game/

---

## Games

| Game | URL |
|------|-----|
| Clone It! | `clone_it_mobile.html` |
| Antisense | `rc_game.html` |
| Fragment Forge | `fragment_forge.html` |
| Antibody Attack | `ab_runner.html` |
| Ribosome Rush | `ribosome_rush.html` |
| Serial Simulator | `serial_sim.html` |
| Micro ID | `microid.html` |
| Signal Path | `immune_pathway.html` |
| PCR Master Mix | `pcr_game.html` |
| **Jeopardy! – PCR Edition** | `pcr_jeopardy.html` |

---

## Jeopardy! – PCR Edition

A Jeopardy-style quiz game where students earn **dNTPs** by answering PCR questions and must reach a configurable target to "start their reaction."

### Features
- 5×5 board (configurable 3–6 × 3–6) with category headers and value tiers
- CSS 3D card flip animation on question reveal
- Short-answer input with fuzzy text matching (≤25% edit distance); exact match mode for numeric answers
- Two attempts per question before the correct answer and explanation are shown
- Countdown timer per question (instructor-configurable)
- 🔥 **Hot Start** cells — wager dNTPs before the clue flips (configurable count)
- ⚗️ **The Reaction** — final round with wager, double timer, and one attempt
- Wrong-answer penalty (0%, 50%, or 100% of question value)
- Scores auto-submitted to GitHub at game end; local export fallback

### Score auto-submission
Student scores are automatically saved to `pcr_jeopardy_scores/` in this repository when a run completes. The embedded PAT (`SCORE_PAT` in `pcr_jeopardy.html`) is a fine-grained token with **Contents read+write** access scoped to this repository only.

**If the token expires**, generate a new fine-grained PAT at:
`https://github.com/settings/tokens?type=beta`
→ Only select repositories: `restriction-cloning-game`
→ Repository permissions → Contents → **Read and write**
Then replace the `SCORE_PAT` constant in `pcr_jeopardy.html` and push.

---

## Jeopardy Editor

**URL:** `https://bgeiss1.github.io/restriction-cloning-game/pcr_jeopardy_editor.html`

Instructor-only tool for customizing the Jeopardy question bank and game settings. Requires a GitHub Personal Access Token with **Contents read+write** on this repository.

### What you can configure

**⚙️ Game Settings**
- Target dNTPs students must reach to "start PCR"
- Timer duration per question (seconds)
- Board size (3–6 columns × 3–6 rows)
- Row values (dNTP amounts per tier, comma-separated)
- Wrong-answer penalty (none / 50% / 100%)
- Number of Hot Start cells (0–5)
- Enable/disable The Reaction final question
- Allow/prevent students from skipping the final

**📋 Categories**
- Add, rename, recolor, and delete categories
- Color picker sets the board header color
- Coverage summary shows how many questions exist per category vs. how many the board needs

**❓ Questions**
- Filter by category using the pill selector
- Each question card: clue (HTML supported), primary answer, accepted alternatives (comma-separated), exact-match toggle for numeric answers, explanation shown after reveal
- Add or delete questions per category

**⚗️ The Reaction**
- Set the final question clue, answer, accepted alternatives, and explanation

### Saving changes
- **Save to GitHub** — publishes `pcr_jeopardy.json` to the repo; the live game picks it up within ~1 minute
- **Download** — saves a local JSON backup
- **Open JSON** — load a previously downloaded JSON file

### Notes
- The game falls back to 25 built-in PCR questions if `pcr_jeopardy.json` has an empty `questions` array
- The board uses the **first N categories** (where N = board columns setting); order your categories accordingly
- Each (category × value tier) combination needs exactly one question; the coverage table in the Categories tab shows gaps

---

## Jeopardy Monitor

**URL:** `https://bgeiss1.github.io/restriction-cloning-game/pcr_jeopardy_monitor.html`

Instructor-only dashboard for viewing student performance. Requires a GitHub Personal Access Token with **Contents read+write** on this repository.

### Connecting
Enter your PAT in the connect overlay. The token is stored in `sessionStorage` for the browser tab — you will need to re-enter it if you open a new tab or close the browser. An **offline mode** is available if you only need to import files without saving to GitHub.

### Workflow

**Automatic (recommended)**
1. Students play the game — scores auto-submit to `pcr_jeopardy_scores/` on GitHub
2. Open the monitor → connect with PAT → create or select a session
3. Click **☁ Sync from GitHub** — new scores are pulled into the active session
4. Click **💾 Save Session** to consolidate into a named session file

**Manual fallback**
If a student has no network, they can click **⬇ Export Score** on the game end screen and download their score file. Collect those files and use **📂 Import Files** in the monitor toolbar.

### Sessions
Organize runs into named sessions (e.g. "Lab 3 — March 18"). Each session is saved as `pcr_jeopardy_s_[id].json` in the repository root and is loaded automatically on connect.

- Create a session before syncing so records have a home
- Deduplication: importing the same player file twice (same name + timestamp) is safe — it won't double-count
- Delete a session to remove it from the monitor (does not delete the individual score files from `pcr_jeopardy_scores/`)

### Dashboard tabs

**👥 Class Overview**
- Sortable player roster: score, target met/missed, correct/wrong/struggled counts, Hot Start and Final badges
- Click any row to open the **player detail drawer** showing every question result, attempt-by-attempt typed answers (color-coded correct / wrong / timed out), and Final Reaction outcome

**❓ Question Analysis**
- Per-question success rate bar (green ≥ 80%, amber 50–79%, red < 50%)
- Correct count, struggled count (correct on attempt 2), average attempts
- Most common wrong answers typed by students
- Sorted hardest-first; ⚠ focus-area callout lists any question below 60% success

**📈 Learning Trends**
- Groups records by student name across all sessions
- Shows score and correct-rate trajectory run by run, with session-over-session delta
- Appears once a student has played in at least two sessions

---

## Other Editors

| Editor | File | Question bank |
|--------|------|---------------|
| Clone It! | `editor.html` | GitHub |
| Micro ID | `microid_editor.html` | `microid_questions.json` |
| Signal Path | `immune_pathway_editor.html` | GitHub |
| PCR Master Mix Part 3 | `pcr_p3_editor.html` | `pcr_p3_questions.json` |
| Jeopardy! PCR | `pcr_jeopardy_editor.html` | `pcr_jeopardy.json` |

All editors follow the same pattern: connect with a GitHub PAT → edit → Save to GitHub. Changes are live within ~1 minute via GitHub Pages.

---

## Development

```bash
# Serve locally
python3 serve.py
# → http://localhost:8080/index.html
```

All games are single-file vanilla HTML/CSS/JS. No build step, no dependencies.
