// vi_p3_interaction.js — P3Interaction: raycaster crosshair targeting
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js
'use strict';

class P3Interaction {

  // camera          — THREE.PerspectiveCamera owned by P3Escape
  // interactiveList — flat array of THREE.Object3D (groups for HA/M2, groups for TLR)
  // cfg             — P3_CFG reference
  constructor(camera, interactiveList, cfg) {
    this._camera = camera;
    this._list   = interactiveList;
    this._cfg    = cfg;

    this._raycaster = new THREE.Raycaster();
    this._raycaster.near = 0.05;
    this._raycaster.far  = 45;   // endosome radius + buffer

    this._current = null;   // { type, index, object } or null

    this._buildCrosshair();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Returns the currently targeted interactive object, or null.
  // Updated every frame by update().
  getTargeted() { return this._current; }

  // Called every frame from P3Escape._updateSubSystems
  update(/* dt */) {
    // Crosshair is only meaningful during active gameplay
    const state = typeof P3Escape !== 'undefined' ? P3Escape.state : '';
    const isActive = (state === 'PLAYING' || state === 'VRNP_TARGETING');

    const root = document.getElementById('p3CrosshairRoot');
    if (root) root.style.visibility = isActive ? 'visible' : 'hidden';

    if (!isActive) {
      this._current = null;
      return;
    }

    this._castRay();
    this._updateCrosshair();
  }

  destroy() {
    const root  = document.getElementById('p3CrosshairRoot');
    const style = document.getElementById('p3InteractionStyle');
    if (root)  root.remove();
    if (style) style.remove();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _castRay() {
    // NDC (0,0) = exact screen center
    this._raycaster.setFromCamera({ x: 0, y: 0 }, this._camera);
    const hits = this._raycaster.intersectObjects(this._list, true /* recursive */);

    if (!hits.length) {
      this._current = null;
      return;
    }

    this._current = this._identifyHit(hits[0].object);
  }

  // Walk the parent chain until we find an object tagged with p3type userData.
  // This lets us tag a THREE.Group and hit any of its children to target the group.
  _identifyHit(obj) {
    while (obj) {
      const ud = obj.userData;
      if (ud && ud.p3type) {
        return { type: ud.p3type, index: ud.p3index, object: ud.p3ref };
      }
      obj = obj.parent;
    }
    return null;
  }

  // ── Crosshair DOM ────────────────────────────────────────────────────────────

  _buildCrosshair() {
    const style = document.createElement('style');
    style.id    = 'p3InteractionStyle';
    style.textContent = `
      #p3CrosshairRoot {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 1500;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 7px;
        visibility: hidden;
      }
      #p3CrosshairRing {
        width: 28px; height: 28px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.45);
        box-sizing: border-box;
        display: flex; align-items: center; justify-content: center;
        transition: border-color 0.10s ease, transform 0.10s ease;
      }
      #p3CrosshairRoot.targeted #p3CrosshairRing {
        transform: scale(1.25);
      }
      #p3CrosshairDot {
        width: 4px; height: 4px;
        border-radius: 50%;
        background: rgba(255,255,255,0.80);
        transition: background 0.10s ease;
      }
      #p3CrosshairLabel {
        font-family: -apple-system, BlinkMacSystemFont, 'Courier New', monospace;
        font-size: 0.62rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.65);
        text-shadow: 0 1px 4px rgba(0,0,0,0.85);
        min-height: 1em;
        white-space: nowrap;
        transition: color 0.10s ease;
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'p3CrosshairRoot';
    root.innerHTML = `
      <div id="p3CrosshairRing"><div id="p3CrosshairDot"></div></div>
      <div id="p3CrosshairLabel"></div>
    `;
    document.body.appendChild(root);
  }

  _updateCrosshair() {
    const ring  = document.getElementById('p3CrosshairRing');
    const dot   = document.getElementById('p3CrosshairDot');
    const label = document.getElementById('p3CrosshairLabel');
    const root  = document.getElementById('p3CrosshairRoot');
    if (!ring || !dot || !label) return;

    const t = this._current;

    if (!t) {
      ring.style.borderColor = 'rgba(255,255,255,0.4)';
      dot.style.background   = 'rgba(255,255,255,0.7)';
      label.textContent      = '';
      label.style.color      = 'rgba(255,255,255,0.55)';
      root.classList.remove('targeted');
      return;
    }

    root.classList.add('targeted');

    // Per-type accent colors and key-hint labels
    const COLORS = { ha: '#00cc88', m2: '#4499ff', tlr: '#cc66ff' };
    const LABELS = {
      ha:  `HA Trimer ${t.index + 1}  ·  [F] Aim`,
      m2:  `M2 Channel ${t.index + 1}  ·  [M] Toggle`,
      tlr: `TLR Sensor ${t.index + 1}  ·  [Q] Jam`,
    };

    const col  = COLORS[t.type] || '#ffffff';
    const text = LABELS[t.type] || t.type.toUpperCase();

    ring.style.borderColor = col;
    dot.style.background   = col;
    label.textContent      = text;
    label.style.color      = col;
  }
}

// Self-register if P3Escape is already running (dynamic load scenario)
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.interaction) {
  P3Escape.interaction = new P3Interaction(
    P3Escape.camera,
    P3Escape._buildInteractiveList(),
    P3_CFG
  );
}
