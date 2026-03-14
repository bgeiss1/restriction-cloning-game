/**
 * ab_sprites.js — Canvas drawing library for Antibody Rush
 *
 * All drawing is pure canvas 2D; no images required.
 * Exports a single global: ABSprites
 */

const ABSprites = (() => {

  /* ── Epitope type palette ─────────────────────────────────────────── */
  // Each epitope type has a unique shape + color pair
  const EPITOPE = {
    tri:  { color: '#FF6B6B', label: '▲' },
    circ: { color: '#4ECDC4', label: '●' },
    sq:   { color: '#45B7D1', label: '■' },
    dia:  { color: '#FFA726', label: '◆' },
    hex:  { color: '#A78BFA', label: '⬡' },
  };
  const EPITOPE_KEYS = Object.keys(EPITOPE);

  /* ── Pathogen body colors (distinct strains) ─────────────────────── */
  const PATHOGEN_COLORS = [
    { body: '#3B1054', rim: '#9B59B6' },  // purple
    { body: '#5C1010', rim: '#E74C3C' },  // red
    { body: '#0A3D2B', rim: '#1ABC9C' },  // teal
    { body: '#4A2800', rim: '#E67E22' },  // orange
    { body: '#1A2060', rim: '#3498DB' },  // blue
  ];

  /* ─────────────────────────────────────────────────────────────────── */
  /*  EPITOPE SHAPES                                                     */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a single epitope shape centered at (cx, cy).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx  center x
   * @param {number} cy  center y
   * @param {string} type  key of EPITOPE
   * @param {number} r  bounding radius
   * @param {number} alpha  0–1
   * @param {boolean} outline  if true draw outline only (decoy hint)
   */
  function drawEpitope(ctx, cx, cy, type, r, alpha = 1, outline = false) {
    const ep = EPITOPE[type];
    if (!ep) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    if (outline) {
      ctx.strokeStyle = ep.color;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'transparent';
    } else {
      ctx.fillStyle = ep.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
    }

    ctx.beginPath();
    switch (type) {
      case 'tri': {
        const h = r * 1.6;
        ctx.moveTo(0, -h * 0.6);
        ctx.lineTo( h * 0.55,  h * 0.4);
        ctx.lineTo(-h * 0.55,  h * 0.4);
        ctx.closePath();
        break;
      }
      case 'circ':
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        break;
      case 'sq': {
        const s = r * 1.1;
        ctx.rect(-s, -s, s * 2, s * 2);
        break;
      }
      case 'dia': {
        const d = r * 1.2;
        ctx.moveTo(0, -d);
        ctx.lineTo(d * 0.7, 0);
        ctx.lineTo(0, d);
        ctx.lineTo(-d * 0.7, 0);
        ctx.closePath();
        break;
      }
      case 'hex': {
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
    }

    if (outline) {
      ctx.stroke();
    } else {
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  Y-SHAPE ANTIBODY (reused for selector, projectile, overlay)       */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a Y-shaped antibody centered at (cx, cy), pointing right by default.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} size  overall scale (arm length)
   * @param {string} color  hex color
   * @param {number} angle  rotation in radians (0 = pointing right)
   * @param {number} alpha
   * @param {string|null} epitopeType  if set, draw small epitope at both tips
   */
  function drawYShape(ctx, cx, cy, size, color, angle = 0, alpha = 1, epitopeType = null) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const arm  = size;          // length of each Fab arm
    const stem = size * 1.1;    // length of Fc stem
    const lw   = Math.max(2, size * 0.22);

    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;

    // Hinge point (center of the Y)
    const hx = 0, hy = 0;

    // Fc stem — points LEFT (toward player)
    const fcX = -stem, fcY = 0;

    // Fab arms — point RIGHT and up/down
    const fabAngle = 0.62; // ~35°
    const fabTopX =  Math.cos(-fabAngle) * arm;
    const fabTopY =  Math.sin(-fabAngle) * arm;
    const fabBotX =  Math.cos( fabAngle) * arm;
    const fabBotY =  Math.sin( fabAngle) * arm;

    // Draw Fc stem
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(fcX, fcY);
    ctx.stroke();

    // Draw Fab arms
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(fabTopX, fabTopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(fabBotX, fabBotY);
    ctx.stroke();

    // Hinge dot
    ctx.beginPath();
    ctx.arc(hx, hy, lw * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Fc tip dot
    ctx.beginPath();
    ctx.arc(fcX, fcY, lw * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Epitope shapes at Fab tips
    if (epitopeType) {
      const eR = size * 0.32;
      drawEpitope(ctx, fabTopX, fabTopY, epitopeType, eR, 1, false);
      drawEpitope(ctx, fabBotX, fabBotY, epitopeType, eR, 1, false);
    } else {
      // Plain binding tips
      ctx.beginPath();
      ctx.arc(fabTopX, fabTopY, lw * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fabBotX, fabBotY, lw * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PATHOGEN                                                           */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a virus-like pathogen.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} p  pathogen data:
   *   { x, y, r, colorIdx, spikes[], epitopes[{type, angle, isDecoy}],
   *     hp, maxHp, hitFlash, scale }
   */
  function drawPathogen(ctx, p) {
    const { x, y, r } = p;
    const pal = PATHOGEN_COLORS[p.colorIdx % PATHOGEN_COLORS.length];
    const sc = p.scale ?? 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);

    // ── Hit flash ────────────────────────────────────────────────────
    if (p.hitFlash > 0) {
      ctx.globalAlpha = 0.4 + 0.6 * (p.hitFlash);
    }

    // ── Spike proteins (corona-style) ────────────────────────────────
    const spikeCount = p.spikes.length;
    for (let i = 0; i < spikeCount; i++) {
      const a = p.spikes[i];
      const sx1 = Math.cos(a) * r;
      const sy1 = Math.sin(a) * r;
      const spikeLen = r * 0.45;
      const sx2 = Math.cos(a) * (r + spikeLen);
      const sy2 = Math.sin(a) * (r + spikeLen);

      // Spike stalk
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Spike head (small ball)
      ctx.beginPath();
      ctx.arc(sx2, sy2, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = pal.rim;
      ctx.fill();
    }

    // ── Body ─────────────────────────────────────────────────────────
    // Radial gradient — lighter rim
    const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    grad.addColorStop(0, lighten(pal.body, 0.35));
    grad.addColorStop(0.6, pal.body);
    grad.addColorStop(1, darken(pal.body, 0.2));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Surface texture (subtle) ──────────────────────────────────────
    ctx.globalAlpha = (p.hitFlash > 0 ? 0.3 : 0.12);
    for (let k = 0; k < 4; k++) {
      const ta = (k / 4) * Math.PI * 2;
      const tr = r * 0.35;
      ctx.beginPath();
      ctx.arc(Math.cos(ta) * tr, Math.sin(ta) * tr, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = pal.rim;
      ctx.fill();
    }
    ctx.globalAlpha = p.hitFlash > 0 ? 0.4 + 0.6 * p.hitFlash : 1;

    // ── HP bar (above pathogen) ───────────────────────────────────────
    if (p.hp < p.maxHp) {
      const bw = r * 1.8;
      const bh = 5;
      const bx = -bw / 2;
      const by = -(r + 16);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 2);
      ctx.fill();
      ctx.fillStyle = hpColor(p.hp / p.maxHp);
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * (p.hp / p.maxHp), bh, 2);
      ctx.fill();
      ctx.globalAlpha = p.hitFlash > 0 ? 0.4 + 0.6 * p.hitFlash : 1;
    }

    // ── Epitopes (mounted on surface) ────────────────────────────────
    for (const ep of p.epitopes) {
      const ea = ep.angle;
      const eDist = r + r * 0.3;  // sit on the surface
      const ex = Math.cos(ea) * eDist;
      const ey = Math.sin(ea) * eDist;
      const eR = r * 0.28;

      if (ep.isDecoy) {
        // Decoy: drawn outline only (appears in later waves, drawn differently)
        drawEpitope(ctx, ex, ey, ep.type, eR, 0.6, true);
      } else {
        drawEpitope(ctx, ex, ey, ep.type, eR, 1, false);
      }
    }

    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PROJECTILE                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a flying antibody projectile.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} proj  { x, y, vx, vy, type:'igm'|'igg', epitopeType, alpha, trail[] }
   */
  function drawProjectile(ctx, proj) {
    const { x, y, vx, vy } = proj;
    const color = proj.type === 'igg' ? '#C8A951' : '#4D96FF';
    const size  = proj.type === 'igg' ? 13 : 10;
    const angle = Math.atan2(vy, vx);  // point in travel direction

    // Trail
    if (proj.trail) {
      for (let i = 0; i < proj.trail.length; i++) {
        const t = proj.trail[i];
        const a = (i / proj.trail.length) * 0.35;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(t.x, t.y, size * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }
    }

    // IgG gets a soft glow
    if (proj.type === 'igg') {
      ctx.save();
      ctx.globalAlpha = 0.25;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.5);
      glow.addColorStop(0, '#C8A951');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawYShape(ctx, x, y, size, color, angle, proj.alpha ?? 1, proj.epitopeType);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PARTICLES                                                          */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a single particle (generic — engine manages particle arrays).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} p  { x, y, vx, vy, r, color, alpha, shape:'circle'|'star'|'ring' }
   */
  function drawParticle(ctx, p) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;

    switch (p.shape) {
      case 'ring':
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'star': {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot ?? 0);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a1 = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const a2 = a1 + Math.PI / 5;
          const ox = Math.cos(a1) * p.r;
          const oy = Math.sin(a1) * p.r;
          const ix = Math.cos(a2) * p.r * 0.4;
          const iy = Math.sin(a2) * p.r * 0.4;
          i === 0 ? ctx.moveTo(ox, oy) : ctx.lineTo(ox, oy);
          ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: // circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draw all particles in an array.
   */
  function drawParticles(ctx, particles) {
    for (const p of particles) drawParticle(ctx, p);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  BACKGROUND                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  // Pre-computed drifting orbs (seeded so they're stable across frames)
  const _bgOrbs = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 1731 % 1000) / 1000,   // fractional 0–1
    y: (i * 997  % 1000) / 1000,
    r: 18 + (i * 337 % 28),
    speed: 0.00012 + (i % 5) * 0.000035,
    phase: (i * 421 % 628) / 100,
  }));

  /**
   * Draw the scrolling biological background.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W  canvas width
   * @param {number} H  canvas height
   * @param {number} tick  monotonically increasing frame counter
   */
  function drawBackground(ctx, W, H, tick) {
    // Dark gradient base
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d1a10');
    bg.addColorStop(1, '#0a1509');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Drifting semi-transparent cell-like orbs
    ctx.save();
    for (const orb of _bgOrbs) {
      const t = tick * orb.speed;
      const ox = ((orb.x + t) % 1.0) * W;
      const oy = (orb.y + Math.sin(t * 0.8 + orb.phase) * 0.04) * H;

      ctx.globalAlpha = 0.04;
      ctx.beginPath();
      ctx.arc(ox, oy, orb.r, 0, Math.PI * 2);
      ctx.strokeStyle = '#4D8B5A';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 0.015;
      ctx.fillStyle = '#66BB6A';
      ctx.fill();
    }
    ctx.restore();

    // Subtle vertical scan lines (gives a "microscope field" feel)
    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = '#a8c5a0';
    ctx.lineWidth = 1;
    const lineSpacing = 40;
    for (let lx = 0; lx < W; lx += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  SELECTOR PANEL                                                     */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw the antibody selector onto its dedicated 56×56 canvas.
   * @param {CanvasRenderingContext2D} ctx  (from #abSelectorCanvas)
   * @param {string} epitopeType  current epitope key
   * @param {boolean} isIgG  true = IgG power-up active
   */
  function drawSelector(ctx, epitopeType, isIgG) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const color = isIgG ? '#C8A951' : '#4D96FF';
    // Y-shape pointing right, centered
    drawYShape(ctx, W * 0.52, H * 0.5, W * 0.33, color, 0, 1, epitopeType);
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  MISS INDICATOR                                                     */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw an X miss indicator at (x, y).
   */
  function drawMissX(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#EF5350';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  NEUTRALIZE BURST (big success ring)                                */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw the expanding ring for a neutralize burst.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x, y  center
   * @param {number} progress  0→1
   * @param {string} color  ring color
   */
  function drawNeutralizeBurst(ctx, x, y, progress, color) {
    const r = progress * 80;
    const alpha = 1 - progress;
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4 * (1 - progress * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  FIRE BUTTON INDICATOR                                              */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a tap-to-fire ring on the right side of the game area.
   * Pulses when the player can fire a matching shot.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx, cy  center
   * @param {number} r  radius
   * @param {boolean} canFire  green = can fire, dim = cannot
   * @param {number} pulse  0–1 sin wave for animation
   */
  function drawFireRing(ctx, cx, cy, r, canFire, pulse) {
    ctx.save();
    if (canFire) {
      ctx.strokeStyle = '#66BB6A';
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  UTILITY                                                            */
  /* ─────────────────────────────────────────────────────────────────── */

  function lighten(hex, amt) {
    return shiftColor(hex, amt);
  }
  function darken(hex, amt) {
    return shiftColor(hex, -amt);
  }
  function shiftColor(hex, amt) {
    const n = parseInt(hex.replace('#',''), 16);
    let r = (n >> 16) & 0xFF;
    let g = (n >> 8)  & 0xFF;
    let b =  n        & 0xFF;
    r = Math.min(255, Math.max(0, Math.round(r + r * amt)));
    g = Math.min(255, Math.max(0, Math.round(g + g * amt)));
    b = Math.min(255, Math.max(0, Math.round(b + b * amt)));
    return `rgb(${r},${g},${b})`;
  }

  function hpColor(frac) {
    if (frac > 0.6) return '#66BB6A';
    if (frac > 0.3) return '#FFA726';
    return '#EF5350';
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PUBLIC API                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  return {
    EPITOPE,
    EPITOPE_KEYS,
    PATHOGEN_COLORS,
    drawEpitope,
    drawYShape,
    drawPathogen,
    drawProjectile,
    drawParticle,
    drawParticles,
    drawBackground,
    drawSelector,
    drawMissX,
    drawNeutralizeBurst,
    drawFireRing,
  };

})();
