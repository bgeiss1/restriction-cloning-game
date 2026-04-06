/**
 * vi_p4_npc.js — Phase 4 NPC (nuclear pore complex) export manager (Chunk 5).
 *
 * Each of the 8 NPCs on the nuclear envelope can receive and export mRNA
 * products.  Clicking an NPC while an mRNA is selected routes that mRNA to
 * the NPC's export queue.
 *
 * Per-NPC behaviour:
 *   - Queue: mRNAs wait in FIFO order.
 *   - Cooldown: NPC_EXPORT_COOLDOWN_S between consecutive exports.
 *   - Export animation (EXPORT_ANIM_DUR s):
 *       0 → 0.65 frac  : mRNA slides from spawn position to NPC ring
 *       0.65 frac       : particle burst + green screen flash + edu trigger
 *       0.65 → 1.0 frac : mRNA shoots outward past envelope, scales to 0
 *   - Queue badge: HTML element projected to screen above each NPC, showing
 *     queue depth when > 0.  Updated every BADGE_FRAME_RATE frames.
 *
 * API:
 *   P4NPCExport.init(scene, camera)
 *   P4NPCExport.routeMRNA(mrna, npcIdx)    — add mrna to npc queue
 *   P4NPCExport.tick(dt)
 *   P4NPCExport.destroy()
 *   P4NPCExport.getNPCCount()             → number
 *   P4NPCExport.getQueueLength(npcIdx)    → number
 *
 * Educational trigger (CustomEvent 'p4EduTrigger' on window):
 *   MRNA_EXPORT   — fired when export animation reaches burst point
 */

/* global THREE, P4_CFG, P4Nucleus, P4Interaction, P4MRNAProduct */

const P4NPCExport = (() => {

  let _scene          = null;
  let _camera         = null;
  let _npcs           = [];
  let _exportCallback = null;   // fn(mrna) — called on each successful export

  let _geos = [];
  let _mats = [];

  let _t     = 0;
  let _frame = 0;

  function _geo(g) { _geos.push(g); return g; }
  function _mat(m) { _mats.push(m); return m; }

  const EXPORT_ANIM_DUR    = 1.4;   // seconds
  const BURST_FRAC         = 0.65;  // fraction at which burst fires
  const BADGE_FRAME_RATE   = 8;     // update badges every N frames
  const PARTICLE_N         = 9;
  const PARTICLE_SPEED_MIN = 2.5;
  const PARTICLE_SPEED_MAX = 5.0;

  // ── Educational trigger ───────────────────────────────────────────────────

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── World → screen ────────────────────────────────────────────────────────

  function _worldToScreen(v3) {
    if (!_camera) return { x: -9999, y: -9999 };
    const ndc = v3.clone().project(_camera);
    return {
      x: (ndc.x + 1) * 0.5 * window.innerWidth,
      y: (1 - ndc.y) * 0.5 * window.innerHeight,
    };
  }

  // ── Queue badges ──────────────────────────────────────────────────────────

  function _createBadge() {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed;pointer-events:none;z-index:305',
      'background:rgba(10,8,24,0.82)',
      'border:1px solid rgba(255,170,68,0.40)',
      'border-radius:10px;padding:1px 7px',
      'color:#ffaa44;font-size:0.60rem;font-weight:700;letter-spacing:0.05em',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'transform:translate(-50%,-120%)',
      'display:none',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function _updateBadges() {
    for (const npc of _npcs) {
      const depth = npc.queue.length + (npc.activeExport ? 1 : 0);
      if (depth === 0) {
        npc.badge.style.display = 'none';
      } else {
        npc.badge.style.display  = 'block';
        npc.badge.textContent    = '\u25b2' + depth;
        const sc = _worldToScreen(new THREE.Vector3(npc.x, 2.5, npc.z));
        npc.badge.style.left = sc.x + 'px';
        npc.badge.style.top  = sc.y + 'px';
      }
    }
  }

  // ── Particle burst ────────────────────────────────────────────────────────

  // Active particles: {mesh, mat, ox, oy, oz, vx, vy, vz, t, dur}
  const _particles = [];
  let   _pGeo = null;   // shared geometry for all particles

  function _spawnBurst(x, z) {
    if (!_pGeo) _pGeo = _geo(new THREE.SphereGeometry(0.07, 4, 3));
    for (let i = 0; i < PARTICLE_N; i++) {
      const ang  = (i / PARTICLE_N) * Math.PI * 2 + Math.random() * 0.4;
      const spd  = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN);
      const mat  = new THREE.MeshBasicMaterial({
        color:       0x55ffaa,
        transparent: true,
        opacity:     0.90,
      });
      const mesh = new THREE.Mesh(_pGeo, mat);
      const oy   = 1.4;
      mesh.position.set(x, oy, z);
      _scene.add(mesh);
      _particles.push({
        mesh, mat,
        ox: x, oy, oz: z,
        vx: Math.cos(ang) * spd,
        vy: 0.8 + Math.random() * 1.2,
        vz: Math.sin(ang) * spd,
        t:  0,
        dur: 0.55 + Math.random() * 0.25,
      });
    }
  }

  function _tickParticles(dt) {
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      p.t += dt;
      const frac = p.t / p.dur;
      p.mesh.position.set(
        p.ox + p.vx * p.t,
        p.oy + p.vy * p.t - 4.9 * p.t * p.t,
        p.oz + p.vz * p.t
      );
      p.mat.opacity = Math.max(0, 1 - frac * frac);
      if (p.t >= p.dur) {
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        p.mat.dispose();
        _particles.splice(i, 1);
      }
    }
  }

  // ── Green flash ───────────────────────────────────────────────────────────

  let _flashEl = null;
  let _flashT  = 0;
  const FLASH_DUR   = 0.40;
  const FLASH_ALPHA = 0.14;

  function _triggerFlash() {
    if (!_flashEl) {
      _flashEl = document.createElement('div');
      _flashEl.style.cssText = [
        'position:fixed;top:0;left:0;right:0;bottom:0',
        'pointer-events:none;z-index:398',
        'background:rgba(50,255,120,0)',
      ].join(';');
      document.body.appendChild(_flashEl);
    }
    _flashEl.style.background = `rgba(50,255,120,${FLASH_ALPHA})`;
    _flashT = FLASH_DUR;
  }

  function _tickFlash(dt) {
    if (_flashT <= 0 || !_flashEl) return;
    _flashT -= dt;
    const alpha = Math.max(0, (_flashT / FLASH_DUR)) * FLASH_ALPHA;
    _flashEl.style.background = `rgba(50,255,120,${alpha.toFixed(3)})`;
  }

  // ── Export animation ──────────────────────────────────────────────────────

  function _startExport(npc) {
    const mrna = npc.queue.shift();
    npc.activeExport   = mrna;
    npc.exportT        = 0;
    npc.burstFired     = false;
    npc.state          = 'exporting';
    npc.fromX          = mrna.group.position.x;
    npc.fromY          = mrna.group.position.y;
    npc.fromZ          = mrna.group.position.z;
    mrna.state         = 'exporting';
  }

  function _tickExport(npc, dt) {
    npc.exportT += dt;
    const frac  = Math.min(1, npc.exportT / EXPORT_ANIM_DUR);
    const mrna  = npc.activeExport;

    // Eased fraction for travel phase (0 → BURST_FRAC)
    if (frac <= BURST_FRAC) {
      const tf = frac / BURST_FRAC;
      // Ease-in-out quadratic
      const s  = tf < 0.5 ? 2 * tf * tf : 1 - Math.pow(-2 * tf + 2, 2) * 0.5;
      mrna.group.position.set(
        npc.fromX + (npc.x - npc.fromX) * s,
        npc.fromY + (P4_CFG.NPC_HEIGHT  - npc.fromY) * s,
        npc.fromZ + (npc.z - npc.fromZ) * s
      );
      mrna.group.scale.setScalar(1);

    } else {
      // Shoot outward past envelope + shrink
      const tf2     = (frac - BURST_FRAC) / (1 - BURST_FRAC);
      const overshoot = tf2 * 6;
      const outX    = Math.cos(npc.angle);
      const outZ    = Math.sin(npc.angle);
      mrna.group.position.set(
        npc.x + outX * overshoot,
        P4_CFG.NPC_HEIGHT + tf2 * 0.5,
        npc.z + outZ * overshoot
      );
      mrna.group.scale.setScalar(Math.max(0, 1 - tf2 * 1.2));
    }

    // Fire burst + flash once
    if (!npc.burstFired && frac >= BURST_FRAC - 0.02) {
      npc.burstFired = true;
      _spawnBurst(npc.x, npc.z);
      _triggerFlash();
      _dispatchEdu('MRNA_EXPORT', {
        npcIdx:      npc.idx,
        templateIdx: mrna.templateIdx,
        gene:        P4_CFG.SEGMENT_GENES[mrna.templateIdx],
        efficiency:  mrna.efficiency,
      });
    }

    // Export complete
    if (frac >= 1) {
      if (_exportCallback) _exportCallback(mrna);   // notify translation system
      P4MRNAProduct.remove(mrna);
      npc.activeExport = null;
      npc.burstFired   = false;
      npc.state        = 'cooldown';
      npc.cooldownT    = P4_CFG.NPC_EXPORT_COOLDOWN_S;
    }
  }

  // ── Build one NPC manager ─────────────────────────────────────────────────

  function _buildNPC(idx, data) {
    return {
      idx,
      x: data.x, z: data.z,
      angle: data.angle,
      mesh:  data.mesh,
      badge: _createBadge(),
      queue:        [],
      state:        'ready',    // 'ready' | 'cooldown' | 'exporting'
      cooldownT:    0,
      activeExport: null,
      exportT:      0,
      burstFired:   false,
      fromX: 0, fromY: 0, fromZ: 0,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene, camera) {
    _scene  = scene;
    _camera = camera;

    const npcData = P4Nucleus.getNPCPositions();
    for (let i = 0; i < npcData.length; i++) {
      _npcs.push(_buildNPC(i, npcData[i]));
    }

    // Register NPC meshes for click → route selected mRNA
    for (const npc of _npcs) {
      if (!npc.mesh) continue;
      const capturedNpc = npc;
      P4Interaction.register(npc.mesh, {
        onHover(mesh, sx, sy) {
          const qd = capturedNpc.queue.length + (capturedNpc.activeExport ? 1 : 0);
          const qStr = qd > 0 ? ` (queue: ${qd})` : '';
          P4Interaction.showTooltip(
            `<strong>NPC ${capturedNpc.idx + 1}</strong>${qStr}<br>`
            + `<span style="color:#aaaaaa;font-size:0.68rem">Nuclear pore complex<br>`
            + `Click while mRNA selected to export</span>`,
            sx, sy
          );
        },
        onHoverEnd() { P4Interaction.hideTooltip(); },
        onClick(mesh, wp) {
          P4MRNAProduct.routeSelectedToNPC(capturedNpc.idx);
        },
      });
    }
  }

  function routeMRNA(mrna, npcIdx) {
    const npc = _npcs[npcIdx];
    if (!npc) return;
    mrna.state = 'routed';
    npc.queue.push(mrna);
  }

  function tick(dt) {
    _t    += dt;
    _frame++;

    _tickParticles(dt);
    _tickFlash(dt);

    for (const npc of _npcs) {
      if (npc.state === 'cooldown') {
        npc.cooldownT -= dt;
        if (npc.cooldownT <= 0) npc.state = 'ready';
      } else if (npc.state === 'ready' && npc.queue.length > 0) {
        _startExport(npc);
      } else if (npc.state === 'exporting' && npc.activeExport) {
        _tickExport(npc, dt);
      }
    }

    if (_frame % BADGE_FRAME_RATE === 0) _updateBadges();
  }

  function destroy() {
    // Unregister NPC meshes
    for (const npc of _npcs) {
      if (npc.mesh) P4Interaction.unregister(npc.mesh);
      if (npc.badge && npc.badge.parentNode) npc.badge.parentNode.removeChild(npc.badge);
    }
    _npcs = [];

    // Dispose particles
    for (const p of _particles) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mat.dispose();
    }
    _particles.length = 0;

    if (_flashEl && _flashEl.parentNode) _flashEl.parentNode.removeChild(_flashEl);
    _flashEl = null;

    for (const g of _geos) g.dispose();
    for (const m of _mats) m.dispose();
    _geos  = [];
    _mats  = [];
    _scene  = null;
    _camera = null;
  }

  function getNPCCount()         { return _npcs.length; }
  function getQueueLength(idx)   { return _npcs[idx] ? _npcs[idx].queue.length : 0; }
  function setExportCallback(fn) { _exportCallback = fn; }

  return {
    init, routeMRNA, tick, destroy,
    getNPCCount, getQueueLength, setExportCallback,
  };

})();
