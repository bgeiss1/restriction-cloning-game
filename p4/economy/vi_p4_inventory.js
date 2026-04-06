/**
 * vi_p4_inventory.js — Phase 4 segment inventory + win condition (Chunk 7).
 *
 * Tracks vRNP counts per segment (0-based, 8 segments).
 * A "complete set" = one copy of every segment = Math.min(...counts).
 * Win condition: complete sets ≥ WIN_COMPLETE_SETS (8).
 *
 * Balance warning: fires BALANCE_WARN edu trigger whenever
 * max_count − min_count > 3 (imbalanced production detected).
 *
 * HUD: right-side panel showing per-segment counts, progress bars,
 * complete-set counter, and balance warning indicator.
 *
 * API:
 *   P4SegmentInventory.init()
 *   P4SegmentInventory.addSegment(idx)
 *   P4SegmentInventory.tick(dt)           — for HUD update throttle
 *   P4SegmentInventory.destroy()
 *   P4SegmentInventory.setCompleteCallback(fn)  — fn() called on win
 *   P4SegmentInventory.getCounts()        → number[8]
 *   P4SegmentInventory.getCompleteSets()  → number
 *
 * Educational triggers:
 *   BALANCE_WARN — when max_count − min_count > 3
 */

/* global P4_CFG */

const P4SegmentInventory = (() => {

  let _counts      = new Array(8).fill(0);
  let _completeCb  = null;
  let _panelEl     = null;
  let _winFired    = false;

  // Balance warning: track edge crossings to avoid spamming
  let _balanceWarnActive = false;

  // Segment display colors + abbreviations
  const SEG_COLORS = [
    '#cc6644',   // PB2
    '#4466cc',   // PB1
    '#44aa66',   // PA
    '#ff6688',   // HA
    '#ffcc44',   // NP
    '#66ccff',   // NA
    '#ccccaa',   // M
    '#8844cc',   // NS1
  ];
  const SEG_SHORT = ['PB2', 'PB1', 'PA', 'HA', 'NP', 'NA', 'M', 'NS1'];

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── Right-side inventory panel ────────────────────────────────────────────

  function _createPanel() {
    _panelEl = document.createElement('div');
    _panelEl.id = 'p4InventoryPanel';
    _panelEl.style.cssText = [
      'position:fixed;top:54px;right:14px',
      'pointer-events:none;z-index:310',
      'background:rgba(10,8,24,0.88)',
      'border:1px solid rgba(100,80,200,0.30)',
      'border-radius:6px;padding:8px 14px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:0.68rem;letter-spacing:0.05em',
      'color:#aaaacc;min-width:160px',
    ].join(';');
    document.body.appendChild(_panelEl);
    _updatePanel();
  }

  function _destroyPanel() {
    if (_panelEl && _panelEl.parentNode) _panelEl.parentNode.removeChild(_panelEl);
    _panelEl = null;
  }

  function _updatePanel() {
    if (!_panelEl) return;

    const sets    = _getCompleteSets();
    const goal    = P4_CFG.WIN_COMPLETE_SETS;
    const pctSets = Math.min(100, Math.round((sets / goal) * 100));
    const max     = _counts.length ? Math.max(..._counts) : 0;
    const min     = _counts.length ? Math.min(..._counts) : 0;
    const imbal   = (max - min) > 3 && max > 0;

    const rows = _counts.map((cnt, i) => {
      const col  = SEG_COLORS[i];
      const pct  = goal > 0 ? Math.min(100, Math.round((cnt / goal) * 100)) : 0;
      return `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">
        <span style="color:${col};min-width:28px">${SEG_SHORT[i]}</span>
        <div style="flex:1;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:2px"></div>
        </div>
        <span style="color:${col};min-width:16px;text-align:right;font-weight:700">${cnt}</span>
      </div>`;
    }).join('');

    const balWarn = imbal
      ? `<div style="color:#ffaa44;margin-top:4px;font-size:0.62rem">⚠ IMBALANCED (+${max - min})</div>`
      : '';

    _panelEl.innerHTML = `
      <div style="color:#ccbbee;font-weight:600;font-size:0.72rem;margin-bottom:4px">vRNP SEGMENTS</div>
      ${rows}
      <div style="border-top:1px solid rgba(100,80,200,0.20);padding-top:5px;margin-top:5px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>Complete sets</span>
          <span style="color:#88ee88;font-weight:700">${sets}/${goal}</span>
        </div>
        <div style="width:100%;height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;margin-top:3px">
          <div style="width:${pctSets}%;height:100%;background:#66dd88;border-radius:3px"></div>
        </div>
        ${balWarn}
      </div>`;
  }

  // ── Balance check ─────────────────────────────────────────────────────────

  function _checkBalance() {
    const max = Math.max(..._counts);
    const min = Math.min(..._counts);
    const imbal = (max - min) > 3 && max > 0;
    if (imbal && !_balanceWarnActive) {
      _balanceWarnActive = true;
      _dispatchEdu('BALANCE_WARN', { max, min, spread: max - min });
    } else if (!imbal) {
      _balanceWarnActive = false;
    }
  }

  // ── Win condition ─────────────────────────────────────────────────────────

  function _getCompleteSets() {
    return Math.min(..._counts);
  }

  function _checkWin() {
    if (_winFired) return;
    if (_getCompleteSets() >= P4_CFG.WIN_COMPLETE_SETS) {
      _winFired = true;
      if (_completeCb) _completeCb();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    _counts            = new Array(8).fill(0);
    _winFired          = false;
    _balanceWarnActive = false;
    _createPanel();
  }

  function addSegment(idx) {
    if (idx < 0 || idx > 7) return;
    _counts[idx]++;
    _updatePanel();
    _checkBalance();
    _checkWin();
  }

  function tick(dt) {
    // Panel updates are driven by addSegment; nothing to tick actively.
    // Hook point for future animation (e.g., count-up effects).
  }

  function destroy() {
    _destroyPanel();
    _counts   = new Array(8).fill(0);
    _winFired = false;
  }

  function setCompleteCallback(fn) { _completeCb = fn; }
  function getCounts()             { return [..._counts]; }
  function getCompleteSets()       { return _getCompleteSets(); }

  return {
    init, addSegment, tick, destroy,
    setCompleteCallback, getCounts, getCompleteSets,
  };

})();
