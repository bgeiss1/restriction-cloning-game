/**
 * vi_p1_hud.js — Phase 1 HUD overlay.
 *
 * Two resource bars (Droplet Integrity + Viral Viability) centered at top,
 * a distance-to-target line below, and a zone indicator.
 *
 * API:
 *   P1HUD.init()
 *   P1HUD.update({ dropletIntegrity, viralViability, distToTarget, zoneName })
 *   P1HUD.destroy()
 */

const P1HUD = (() => {

  let _root   = null;
  let _diBar  = null;
  let _vvBar  = null;
  let _distEl = null;
  let _zoneEl = null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _bar(label, fillId, color) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
        <div style="font-size:0.58rem;color:#888;letter-spacing:0.14em;
                    text-transform:uppercase">${label}</div>
        <div style="width:120px;height:7px;background:rgba(0,0,0,0.55);
                    border-radius:4px;overflow:hidden;
                    border:1px solid rgba(255,255,255,0.10)">
          <div id="${fillId}" style="height:100%;width:100%;
                                     background:${color};border-radius:4px;
                                     transition:width 0.12s,background 0.3s"></div>
        </div>
      </div>`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init() {
    _root = document.createElement('div');
    _root.id = 'p1Hud';
    _root.style.cssText = [
      'position:fixed', 'top:14px', 'left:50%', 'transform:translateX(-50%)',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:5px',
      'pointer-events:none', 'z-index:300',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    _root.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-end">
        ${_bar('Droplet', 'p1DiFill', '#55bbff')}
        ${_bar('Viability', 'p1VvFill', '#ff7744')}
      </div>
      <div id="p1DistEl"
           style="font-size:0.65rem;color:#999;letter-spacing:0.12em;
                  text-transform:uppercase;margin-top:1px"></div>
      <div id="p1ZoneEl"
           style="font-size:0.60rem;letter-spacing:0.14em;text-transform:uppercase;
                  padding:2px 10px;border-radius:3px;min-height:15px;
                  background:transparent;transition:background 0.3s,color 0.3s"></div>
    `;

    document.body.appendChild(_root);
    _diBar  = document.getElementById('p1DiFill');
    _vvBar  = document.getElementById('p1VvFill');
    _distEl = document.getElementById('p1DistEl');
    _zoneEl = document.getElementById('p1ZoneEl');
  }

  function update(state) {
    if (!_root) return;
    const { dropletIntegrity, viralViability, distToTarget, zoneName } = state;

    // DI bar
    if (_diBar) {
      const di = Math.max(0, dropletIntegrity);
      _diBar.style.width = di.toFixed(1) + '%';
      _diBar.style.background = di > 60 ? '#55bbff'
                              : di > 30 ? '#ffaa33' : '#ff4444';
    }

    // VV bar
    if (_vvBar) {
      const vv = Math.max(0, viralViability);
      _vvBar.style.width = vv.toFixed(1) + '%';
      _vvBar.style.background = vv > 60 ? '#ff7744'
                              : vv > 30 ? '#ff5522' : '#ff2200';
    }

    // Distance
    if (_distEl) {
      if (distToTarget !== undefined && distToTarget > 0.1) {
        _distEl.textContent = distToTarget.toFixed(1) + ' m to target';
      } else if (distToTarget !== undefined) {
        _distEl.textContent = '▶ APPROACH';
      } else {
        _distEl.textContent = '';
      }
    }

    // Zone flash
    if (_zoneEl) {
      const ZONE_STYLE = {
        'UV ZONE':  { color: '#ffee44', bg: 'rgba(90,70,0,0.65)'  },
        'WARM AIR': { color: '#ffaa44', bg: 'rgba(70,35,0,0.65)'  },
        'COOL AIR': { color: '#88ccff', bg: 'rgba(0,25,70,0.65)'  },
        'DRY ZONE': { color: '#ffddaa', bg: 'rgba(70,55,15,0.65)' },
        'HUMID':    { color: '#aaffcc', bg: 'rgba(0,45,25,0.65)'  },
      };
      if (zoneName && ZONE_STYLE[zoneName]) {
        const s = ZONE_STYLE[zoneName];
        _zoneEl.textContent       = zoneName;
        _zoneEl.style.color       = s.color;
        _zoneEl.style.background  = s.bg;
      } else {
        _zoneEl.textContent      = '';
        _zoneEl.style.background = 'transparent';
      }
    }
  }

  function destroy() {
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    _root = _diBar = _vvBar = _distEl = _zoneEl = null;
  }

  return { init, update, destroy };

})();
