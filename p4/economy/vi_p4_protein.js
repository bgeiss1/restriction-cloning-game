/**
 * vi_p4_protein.js — Phase 4 translation pipeline (Chunk 6).
 *
 * Listens for mRNA export events (via P4NPCExport.setExportCallback).
 * Each exported mRNA starts a per-segment delay timer; on completion the
 * appropriate products are added:
 *
 *   Seg 0 (PB2) → +1 PB2 subunit
 *   Seg 1 (PB1) → +1 PB1 subunit
 *   Seg 2 (PA)  → +1 PA  subunit
 *   Seg 3 (HA)  → score +10 (surface protein — scored for Chunk 7)
 *   Seg 4 (NP)  → +TRANS_NP_YIELD NP
 *   Seg 5 (NA)  → score +10
 *   Seg 6 (M)   → score +5
 *   Seg 7 (NS1) → +1 NS1 charge
 *
 * API:
 *   P4ProteinProduction.init()
 *   P4ProteinProduction.tick(dt)
 *   P4ProteinProduction.destroy()
 *   P4ProteinProduction.onMRNAExported(mrna)   — called by P4NPCExport callback
 *   P4ProteinProduction.getSubunits()          → { pb2, pb1, pa }
 *   P4ProteinProduction.consumeSubunits()      → bool (false if any < 1)
 *   P4ProteinProduction.getActiveJobs()        → job[]
 *
 * Educational triggers (CustomEvent 'p4EduTrigger'):
 *   NP_PRODUCTION  — when NP mRNA completes translation
 *   RDRP_SUBUNIT   — when PB2/PB1/PA subunit produced
 */

/* global P4_CFG, P4Resources */

const P4ProteinProduction = (() => {

  // Subunit inventory
  let _pb2 = 0;
  let _pb1 = 0;
  let _pa  = 0;

  // Active translation jobs: { segIdx, delay, elapsed, efficiency }
  let _jobs = [];

  // Pipeline pill HUD
  let _pipeEl = null;

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── Pipeline pill HUD ─────────────────────────────────────────────────────

  // Segment accent colors for pill display
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

  const SEG_SHORT = ['PB2','PB1','PA','HA','NP','NA','M','NS1'];

  function _createPipeHUD() {
    _pipeEl = document.createElement('div');
    _pipeEl.id = 'p4PipelineHUD';
    _pipeEl.style.cssText = [
      'position:fixed;bottom:56px;left:50%',
      'transform:translateX(-50%)',
      'pointer-events:none;z-index:310',
      'display:flex;gap:5px;align-items:flex-end',
      'min-height:32px',
    ].join(';');
    document.body.appendChild(_pipeEl);
    _updatePipeHUD();
  }

  function _destroyPipeHUD() {
    if (_pipeEl && _pipeEl.parentNode) _pipeEl.parentNode.removeChild(_pipeEl);
    _pipeEl = null;
  }

  function _updatePipeHUD() {
    if (!_pipeEl) return;
    if (_jobs.length === 0) {
      _pipeEl.innerHTML = '';
      return;
    }
    _pipeEl.innerHTML = _jobs.map(job => {
      const pct = Math.min(100, Math.round((job.elapsed / job.delay) * 100));
      const col = SEG_COLORS[job.segIdx] || '#aaaaaa';
      const label = SEG_SHORT[job.segIdx] || '?';
      return `<div style="
        background:rgba(10,8,24,0.88);
        border:1px solid ${col}66;
        border-radius:5px;padding:3px 7px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        font-size:0.60rem;letter-spacing:0.05em;
        color:${col};min-width:36px;text-align:center">
        <div>${label}</div>
        <div style="width:100%;height:3px;background:rgba(255,255,255,0.10);
          border-radius:2px;margin-top:2px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:2px"></div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Translation completion ────────────────────────────────────────────────

  function _completeJob(job) {
    const seg = job.segIdx;

    if (seg === 0) {
      // PB2 subunit
      _pb2++;
      _dispatchEdu('RDRP_SUBUNIT', { subunit: 'PB2' });
    } else if (seg === 1) {
      // PB1 subunit
      _pb1++;
      _dispatchEdu('RDRP_SUBUNIT', { subunit: 'PB1' });
    } else if (seg === 2) {
      // PA subunit
      _pa++;
      _dispatchEdu('RDRP_SUBUNIT', { subunit: 'PA' });
    } else if (seg === 3) {
      // HA — surface protein score
      P4Resources.addScore(10);
    } else if (seg === 4) {
      // NP — yield is fixed regardless of cap efficiency (efficiency affects speed, not output)
      const yield_ = P4_CFG.TRANS_NP_YIELD;
      P4Resources.addNP(yield_);
      _dispatchEdu('NP_PRODUCTION', { amount: yield_ });
    } else if (seg === 5) {
      // NA — surface protein score
      P4Resources.addScore(10);
    } else if (seg === 6) {
      // M1/M2 — structural score
      P4Resources.addScore(5);
    } else if (seg === 7) {
      // NS1/NEP
      P4Resources.addNS1(1);
    }

    // Refresh HUD after any pool change
    P4Resources.updateHUD();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    _pb2   = 0;
    _pb1   = 0;
    _pa    = 0;
    _jobs  = [];
    _createPipeHUD();
  }

  function tick(dt) {
    // Advance all jobs
    for (let i = _jobs.length - 1; i >= 0; i--) {
      const job = _jobs[i];
      job.elapsed += dt;
      if (job.elapsed >= job.delay) {
        _jobs.splice(i, 1);
        _completeJob(job);
      }
    }
    _updatePipeHUD();
  }

  function destroy() {
    _destroyPipeHUD();
    _jobs = [];
    _pb2  = 0;
    _pb1  = 0;
    _pa   = 0;
  }

  /**
   * Called by P4NPCExport export callback for each successful mRNA export.
   * mrna.templateIdx (0-7) identifies the gene.
   * mrna.efficiency (0-1) scales NP yield.
   */
  function onMRNAExported(mrna) {
    const segIdx = mrna.templateIdx;
    if (segIdx === undefined || segIdx < 0 || segIdx > 7) return;

    const delay = P4_CFG.TRANS_DELAY_S[segIdx] || 15;
    _jobs.push({
      segIdx,
      delay,
      elapsed:    0,
      efficiency: mrna.efficiency,   // string label: 'optimal'|'short'|'long'
    });
  }

  function getSubunits() { return { pb2: _pb2, pb1: _pb1, pa: _pa }; }

  function consumeSubunits() {
    if (_pb2 < 1 || _pb1 < 1 || _pa < 1) return false;
    _pb2--;
    _pb1--;
    _pa--;
    P4Resources.updateHUD();
    return true;
  }

  function getActiveJobs() { return _jobs; }

  return {
    init, tick, destroy,
    onMRNAExported,
    getSubunits, consumeSubunits,
    getActiveJobs,
  };

})();
