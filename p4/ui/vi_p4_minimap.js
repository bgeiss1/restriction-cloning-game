/**
 * vi_p4_minimap.js — Phase 4 minimap (Chunk 9).
 *
 * A 160 × 160 px canvas fixed to the bottom-right corner of the screen.
 * Renders at 10 fps (every 6 render frames).  Shows all game objects
 * projected onto the X-Z plane.  Click to pan the camera.
 *
 * Layers (back to front):
 *   Background + nuclear envelope ring
 *   Heterochromatin blobs
 *   Pol II sites (gold dots)
 *   Templates (amber squares)
 *   cRNAs (teal dots)
 *   mRNA products (orange dots)
 *   Polymerases (colour by state)
 *   IFIT cubes (red squares)   — if P4Antiviral exposes them
 *   OAS rings  (orange rings)  — if P4Antiviral exposes them
 *   Camera viewport indicator (white rect)
 *
 * Click on minimap → pan camera to corresponding world position.
 *
 * API:
 *   P4Minimap.init()
 *   P4Minimap.tick(dt)
 *   P4Minimap.destroy()
 */

/* global P4_CFG, P4Camera, P4Templates, P4Polymerases, P4PolIISites,
          P4MRNAProduct, P4CRNAIntermediate, P4Antiviral, P4NuclearFactory */

const P4Minimap = (() => {

  const RADIUS  = 76;           // canvas half-size (actual is 2×RADIUS px)
  const SIZE    = RADIUS * 2;
  const SCALE   = RADIUS / 30; // world units → canvas px  (nucleus r=30)

  let _canvas   = null;
  let _ctx2d    = null;
  let _wrapEl   = null;
  let _frame    = 0;

  // ── World → minimap canvas coords ────────────────────────────────────────

  function _wx(x) { return RADIUS + x * SCALE; }
  function _wz(z) { return RADIUS + z * SCALE; }

  // ── Build DOM ─────────────────────────────────────────────────────────────

  function _build() {
    _wrapEl = document.createElement('div');
    _wrapEl.id = 'p4Minimap';
    _wrapEl.style.cssText = [
      'position:fixed;bottom:14px;right:14px',
      'pointer-events:auto;z-index:310',
      `width:${SIZE}px;height:${SIZE}px`,
      'border-radius:50%',
      'border:1.5px solid rgba(100,80,200,0.50)',
      'overflow:hidden',
      'cursor:crosshair',
    ].join(';');

    _canvas = document.createElement('canvas');
    _canvas.width  = SIZE;
    _canvas.height = SIZE;
    _canvas.style.display = 'block';
    _ctx2d = _canvas.getContext('2d');

    _wrapEl.appendChild(_canvas);
    document.body.appendChild(_wrapEl);

    _wrapEl.addEventListener('click', _onClick);
  }

  // ── Click → pan ───────────────────────────────────────────────────────────

  function _onClick(e) {
    const rect = _wrapEl.getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    const wx   = (cx - RADIUS) / SCALE;
    const wz   = (cy - RADIUS) / SCALE;
    P4Camera.panTo(wx, wz, 0.3);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  function _draw() {
    const c = _ctx2d;
    c.clearRect(0, 0, SIZE, SIZE);

    // Circular clip
    c.save();
    c.beginPath();
    c.arc(RADIUS, RADIUS, RADIUS, 0, Math.PI * 2);
    c.clip();

    // Background
    c.fillStyle = 'rgba(8,5,20,0.94)';
    c.fillRect(0, 0, SIZE, SIZE);

    // Nuclear envelope ring
    c.beginPath();
    c.arc(RADIUS, RADIUS, RADIUS - 3, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(68,34,170,0.55)';
    c.lineWidth   = 3;
    c.stroke();

    // Heterochromatin blobs
    for (const blob of P4_CFG.HETERO_BLOBS) {
      const bx = _wx(blob.x), bz = _wz(blob.z);
      const rx = blob.rx * SCALE, rz = blob.rz * SCALE;
      c.save();
      c.translate(bx, bz);
      c.scale(rx, rz);
      c.beginPath();
      c.arc(0, 0, 1, 0, Math.PI * 2);
      c.fillStyle = 'rgba(34,24,51,0.80)';
      c.fill();
      c.restore();
    }

    // Pol II sites
    if (typeof P4PolIISites !== 'undefined') {
      for (const site of P4PolIISites.getSites()) {
        const alpha = site.state === 'suppressed' ? 0.25 : 0.85;
        c.fillStyle = `rgba(255,220,136,${alpha})`;
        c.beginPath();
        c.arc(_wx(site.x), _wz(site.z), 3.5, 0, Math.PI * 2);
        c.fill();
      }
    }

    // NPC positions (on envelope ring)
    const npcAngleStep = (Math.PI * 2) / P4_CFG.NPC_COUNT;
    const npcR = 29;
    for (let i = 0; i < P4_CFG.NPC_COUNT; i++) {
      const a = i * npcAngleStep;
      const nx = _wx(Math.cos(a) * npcR);
      const nz = _wz(Math.sin(a) * npcR);
      c.fillStyle = 'rgba(255,170,68,0.70)';
      c.beginPath();
      c.arc(nx, nz, 2.5, 0, Math.PI * 2);
      c.fill();
    }

    // Templates
    if (typeof P4Templates !== 'undefined') {
      for (const tmpl of P4Templates.getAll()) {
        const tx = _wx(tmpl.group.position.x);
        const tz = _wz(tmpl.group.position.z);
        const health = tmpl.health / 100;
        const col = health > 0.6 ? '#ccaa33' : health > 0.3 ? '#ee8822' : '#cc2222';
        c.fillStyle = tmpl.health <= 0 ? 'rgba(80,0,0,0.5)' : col;
        c.fillRect(tx - 3, tz - 2, 6, 4);
        // Segment number
        c.fillStyle = 'rgba(255,255,200,0.65)';
        c.font = '5px monospace';
        c.fillText(tmpl.idx + 1, tx + 4, tz + 2);
      }
    }

    // cRNAs
    if (typeof P4CRNAIntermediate !== 'undefined') {
      for (const crna of P4CRNAIntermediate.getAll()) {
        if (crna._remove) continue;
        c.fillStyle = crna.busy ? '#44dd99' : '#44ccaa';
        c.beginPath();
        c.arc(_wx(crna.group.position.x), _wz(crna.group.position.z), 2.5, 0, Math.PI * 2);
        c.fill();
      }
    }

    // mRNA products
    if (typeof P4MRNAProduct !== 'undefined') {
      for (const mrna of P4MRNAProduct.getAll()) {
        const col = mrna.state === 'routed' ? '#ffaa44' : '#ff8844';
        c.fillStyle = col;
        c.beginPath();
        c.arc(_wx(mrna.group.position.x), _wz(mrna.group.position.z), 2.5, 0, Math.PI * 2);
        c.fill();
      }
    }

    // Polymerases
    if (typeof P4Polymerases !== 'undefined') {
      for (const poly of P4Polymerases.getAll()) {
        const px = _wx(poly.group.position.x);
        const pz = _wz(poly.group.position.z);
        let col;
        if (poly.destroyed)             col = '#441111';
        else if (poly.state === 'busy') col = '#88ccff';
        else if (poly.state === 'selected') col = '#ffffff';
        else                            col = '#cc9966';
        c.fillStyle = col;
        c.beginPath();
        c.arc(px, pz, 3, 0, Math.PI * 2);
        c.fill();
        // White outline for selected
        if (poly.state === 'selected') {
          c.strokeStyle = 'white';
          c.lineWidth   = 1;
          c.stroke();
        }
      }
    }

    // IFIT and OAS (from P4Antiviral)
    if (typeof P4Antiviral !== 'undefined') {
      if (P4Antiviral.getIFITs) {
        for (const ifit of P4Antiviral.getIFITs()) {
          const ix = _wx(ifit.mesh.position.x);
          const iz = _wz(ifit.mesh.position.z);
          c.fillStyle = '#ff3311';
          c.fillRect(ix - 2.5, iz - 2.5, 5, 5);
        }
      }
      if (P4Antiviral.getOASRings) {
        for (const oas of P4Antiviral.getOASRings()) {
          const ox = _wx(oas.mesh.position.x);
          const oz = _wz(oas.mesh.position.z);
          c.strokeStyle = '#ff8833';
          c.lineWidth   = 1.5;
          c.beginPath();
          c.arc(ox, oz, 3.5, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }

    // Camera viewport indicator
    const lt  = P4Camera.getLookTarget ? P4Camera.getLookTarget() : { x: 0, z: 0 };
    const zd  = P4Camera.getZoomDist();
    const vw  = zd * 0.40 * SCALE;   // approx world-units visible
    const vh  = zd * 0.28 * SCALE;
    const vx  = _wx(lt.x) - vw;
    const vz  = _wz(lt.z) - vh;
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth   = 1;
    c.strokeRect(vx, vz, vw * 2, vh * 2);

    c.restore();

    // Label
    c.fillStyle = 'rgba(180,160,255,0.55)';
    c.font      = '8px -apple-system,sans-serif';
    c.textAlign = 'left';
    c.fillText('MAP', 5, 12);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    _build();
    _frame = 0;
    _draw();
  }

  function tick(dt) {
    _frame++;
    if (_frame % 6 === 0) _draw();   // ~10 fps at 60 fps render
  }

  function destroy() {
    if (_wrapEl) {
      _wrapEl.removeEventListener('click', _onClick);
      if (_wrapEl.parentNode) _wrapEl.parentNode.removeChild(_wrapEl);
    }
    _wrapEl = null;
    _canvas = null;
    _ctx2d  = null;
  }

  return { init, tick, destroy };

})();
