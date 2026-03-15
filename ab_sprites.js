/**
 * ab_sprites.js — Canvas drawing library for Antibody Attack
 *
 * All drawing is pure canvas 2D; no images required.
 * Exports a single global: ABSprites
 */

const ABSprites = (() => {

  /* ── Cam the Ram sprite sheets ────────────────────────────────────── */
  // 4-frame throw animation: 1=rest, 2=wind-up, 3=mid-throw, 4=follow-through
  const _camFrames = [1, 2, 3, 4].map(i => {
    const img = new Image();
    img.src = `ab_runner_sprites/Cam_throw_${i}.png`;
    return img;
  });

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
  /*  IgM PENTAMER                                                       */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw an IgM pentamer: 5 IgG monomers arranged in a ring with Fab arms
   * pointing outward and Fc regions facing inward (linked by J-chain).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx  center x
   * @param {number} cy  center y
   * @param {number} size  overall scale
   * @param {string} color
   * @param {number} alpha
   */
  /**
   * @param {string|null} epitopeType  if set, draws the target epitope at all Fab tips
   */
  function drawIgMPentamer(ctx, cx, cy, size, color, alpha = 1, epitopeType = null) {
    ctx.save();
    ctx.translate(cx, cy);

    const n     = 5;
    const ringR = size * 0.48;
    const arm   = size * 0.37;
    const lw    = Math.max(1, size * 0.08);

    // J-chain: faint spokes from center to each Fc region
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw * 0.45;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = alpha * 0.28;
    for (let i = 0; i < n; i++) {
      const a  = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ex = Math.cos(a) * ringR * 0.72;
      const ey = Math.sin(a) * ringR * 0.72;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // 5 IgG monomers: Fab arms point outward, Fc stalk points inward
    for (let i = 0; i < n; i++) {
      const a  = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ux = Math.cos(a) * ringR;
      const uy = Math.sin(a) * ringR;
      drawYShape(ctx, ux, uy, arm, color, a, alpha, epitopeType);
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
   * Draw a virus-like pathogen with spinning spikes and epitope shapes at tips.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} p  { x, y, r, colorIdx, spikes[], spikeEpitopes[],
   *                      rotation, hp, maxHp, hitFlash, scale }
   */
  function drawPathogen(ctx, p) {
    const { x, y, r } = p;
    const pal = PATHOGEN_COLORS[p.colorIdx % PATHOGEN_COLORS.length];
    const sc  = p.scale ?? 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);

    // ── HP bar — drawn BEFORE rotation so it stays horizontal ─────────
    // Skip for neutralized pathogens (hp=0, no need to show bar)
    if (p.hp < p.maxHp && !p.neutralized) {
      ctx.save();
      const bw = r * 1.9, bh = 5;
      const bx = -bw / 2, by = -(r * sc + 18);
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 2); ctx.fill();
      ctx.fillStyle = hpColor(p.hp / p.maxHp);
      ctx.beginPath(); ctx.roundRect(bx, by, bw * (p.hp / p.maxHp), bh, 2); ctx.fill();
      ctx.restore();
    }

    // ── Apply rotation (spins spikes + body together) ─────────────────
    ctx.rotate(p.rotation ?? 0);

    // ── Spike proteins — epitope shape replaces the ball cap ──────────
    ctx.lineCap = 'round';
    for (let i = 0; i < p.spikes.length; i++) {
      const a        = p.spikes[i];
      const spikeLen = r * 0.5;
      const sx1 = Math.cos(a) * r;
      const sy1 = Math.sin(a) * r;
      const sx2 = Math.cos(a) * (r + spikeLen);
      const sy2 = Math.sin(a) * (r + spikeLen);

      // Stalk
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = r * 0.11;
      ctx.stroke();

      // Epitope shape at tip
      const ep = p.spikeEpitopes?.[i];
      if (ep) {
        const eR = r * 0.24;
        drawEpitope(ctx, sx2, sy2, ep.type, eR, ep.isDecoy ? 0.42 : 1, ep.isDecoy);
      }
    }

    // ── Body ──────────────────────────────────────────────────────────
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

    // ── Surface texture (subtle internal markings) ────────────────────
    ctx.save();
    ctx.globalAlpha = 0.1;
    for (let k = 0; k < 4; k++) {
      const ta = (k / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ta) * r * 0.35, Math.sin(ta) * r * 0.35, r * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = pal.rim;
      ctx.fill();
    }
    ctx.restore();

    // ── White hit-flash overlay ───────────────────────────────────────
    if (p.hitFlash > 0 && !p.neutralized) {
      ctx.save();
      ctx.globalAlpha = p.hitFlash * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Neutralized: dark overlay + antibodies latched onto spikes ────
    if (p.neutralized) {
      // Dark desaturation overlay
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Antibodies bound at spike-tip epitopes
      if (p.attachedAbs && p.attachedAbs.length > 0) {
        const ab       = p.attachedAbs[0];
        const abColor  = ab.type === 'igg' ? '#C8A951' : '#4D96FF';
        const spikeLen = r * 0.5;
        const abSize   = r * 0.27;
        // Draw a Y-shape at every other spike pointing outward
        for (let i = 0; i < p.spikes.length; i += 2) {
          const a  = p.spikes[i];
          const sx = Math.cos(a) * (r + spikeLen);
          const sy = Math.sin(a) * (r + spikeLen);
          // angle = a → Fc stem points inward, Fab tips point outward (grasping spike)
          drawYShape(ctx, sx, sy, abSize, abColor, a, 0.9, ab.epitopeType);
        }
      }
    }

    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  PROJECTILE                                                         */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw a flying antibody projectile.
   * IgM → pentamer (compact rotating ring of 5 Y-shapes)
   * IgG → monomer (single Y-shape with gold glow)
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} proj  { x, y, vx, vy, type:'igm'|'igg', alpha, trail[], spin }
   */
  function drawProjectile(ctx, proj) {
    const { x, y, vx, vy } = proj;
    const isIgG = proj.type === 'igg';
    const color = isIgG ? '#C8A951' : '#4D96FF';
    const size  = isIgG ? 13 : 16;   // pentamer is slightly larger
    const angle = Math.atan2(vy, vx);

    // Trail (dots)
    if (proj.trail) {
      for (let i = 0; i < proj.trail.length; i++) {
        const t = proj.trail[i];
        const a = (i / proj.trail.length) * 0.3;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(t.x, t.y, size * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }
    }

    if (isIgG) {
      // Soft gold glow
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
      // IgG monomer: single Y pointing in travel direction
      drawYShape(ctx, x, y, size, color, angle, proj.alpha ?? 1, null);
    } else {
      // IgM pentamer: spins slowly as it flies
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(proj.spin ?? 0);
      ctx.translate(-x, -y);
      drawIgMPentamer(ctx, x, y, size, color, proj.alpha ?? 1, proj.epitopeType);
      ctx.restore();
    }
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
   * IgM → pentamer (blue), IgG → monomer (gold).
   * Both show the current epitope specificity shape at the Fab tips.
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} isIgG
   * @param {string}  epitopeType  current specificity key
   */
  function drawSelector(ctx, isIgG, epitopeType) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (isIgG) {
      drawYShape(ctx, W * 0.5, H * 0.5, W * 0.33, '#C8A951', 0, 1, epitopeType);
    } else {
      drawIgMPentamer(ctx, W * 0.5, H * 0.5, W * 0.44, '#4D96FF', 1, epitopeType);
    }
  }

  /**
   * Draw just the epitope shape centered and large on its canvas.
   * Used for the dedicated epitope-picker button.
   */
  function drawEpitopeOnly(ctx, epitopeType) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawEpitope(ctx, W * 0.5, H * 0.5, epitopeType, Math.min(W, H) * 0.38, 1, false);
  }

  /**
   * Draw one small IgG Y-shape per charge in a left-to-right row.
   * Used for the IgG powerup tracker in the control bar.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} count  current IgG charges
   */
  /**
   * Draw one upright IgG Y-shape per charge in a left-to-right row.
   * Resizes the canvas width to exactly fit the content (prevents CSS-stretch
   * artefacts when the element is in a flex container).
   */
  function drawIgGTracker(ctx, count) {
    const H       = ctx.canvas.height;
    const size    = 9;          // fixed arm-length in px — consistent on all screen sizes
    const spacing = 20;         // px between shape centers
    const pad     = 10;         // left padding — must be > size*sin(fabAngle)≈5.3 to avoid clipping

    // Resize canvas to content width so it never gets bitmap-stretched
    ctx.canvas.width = count > 0 ? pad + count * spacing : pad;

    ctx.clearRect(0, 0, ctx.canvas.width, H);
    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      // -Math.PI/2 rotates the Y 90° counter-clockwise → Fab arms up, Fc stem down
      drawYShape(ctx, pad + i * spacing, H * 0.5, size, '#C8A951', -Math.PI / 2, 0.9, null);
    }
  }

  /* ─────────────────────────────────────────────────────────────────── */
  /*  CAM THE RAM                                                        */
  /* ─────────────────────────────────────────────────────────────────── */

  /**
   * Draw Cam the Ram using the pre-loaded PNG sprite sheets.
   * Frame selection maps armSwing (0=rest → 1=throw) to the 4-frame sequence.
   * Each frame is scaled to height h and left-anchored so the body stays planted.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx      left-anchor x position (e.g. 4)
   * @param {number} footY   y-coordinate of the feet
   * @param {number} h       draw height in pixels
   * @param {number} armSwing  0 = rest, 1 = peak throw
   */
  function drawCam(ctx, cx, footY, h, armSwing) {
    // Select frame: armSwing 0→1 maps to frames index 0→3
    const frameIdx = Math.min(3, Math.round(armSwing * 3));
    const img = _camFrames[frameIdx];
    if (!img.complete || !img.naturalWidth) return;

    const drawH = h;
    const drawW = h * (img.naturalWidth / img.naturalHeight);
    // Flip horizontally so Cam faces right (toward pathogens)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -(cx + drawW), footY - drawH, drawW, drawH);
    ctx.restore();
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
    drawIgMPentamer,
    drawPathogen,
    drawProjectile,
    drawParticle,
    drawParticles,
    drawBackground,
    drawSelector,
    drawMissX,
    drawNeutralizeBurst,
    drawFireRing,
    drawEpitopeOnly,
    drawIgGTracker,
    drawCam,
  };

})();
