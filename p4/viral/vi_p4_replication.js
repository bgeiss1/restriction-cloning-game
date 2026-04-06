/**
 * vi_p4_replication.js — Phase 4 genome replication (Chunk 7).
 *
 * Two-step replication:
 *   Step 1  vRNA → cRNA  : startReplication(poly, templateIdx)
 *     - Requires NP ≥ NP_REPLICATION_THRESH (30).
 *     - 0.5 s PB1-grip initiation, then full-length traversal.
 *     - NP consumed at NP_PER_UNIT per unit traversed (fractional accumulator).
 *     - Stall (NP=0) → 5 s → fail (particles, poly freed).
 *     - Complete → P4CRNAIntermediate.spawnCRNA(), edu CRNA_PRODUCED.
 *
 *   Step 2  cRNA → vRNA  : startCRNAtoVRNA(poly, crna)
 *     - Same traversal mechanics; strand is amber-gold (vRNA color).
 *     - Complete → P4SegmentInventory.addSegment(), remove cRNA.
 *     - Edu CRNA_TO_VRNA, FULL_REPLICATION.
 *
 * API:
 *   P4Replication.init(scene)
 *   P4Replication.startReplication(poly, templateIdx)
 *   P4Replication.startCRNAtoVRNA(poly, crna)
 *   P4Replication.tick(dt)
 *   P4Replication.destroy()
 *   P4Replication.isUnlocked()          → bool
 *
 * Educational triggers:
 *   REPLICATION_START, CRNA_PRODUCED, CRNA_TO_VRNA, FULL_REPLICATION,
 *   NP_DEPLETED, REPLICATION_UNLOCK
 */

/* global THREE, P4_CFG, P4Resources, P4Templates, P4SteeringBehavior,
          P4CRNAIntermediate, P4SegmentInventory */

const P4Replication = (() => {

  let _scene = null;
  let _jobs  = [];
  let _mats  = [];
  let _unlockFired = false;

  const INIT_DUR        = 0.5;    // PB1 grip animation duration
  const STALL_FAIL_TIME = 5.0;    // seconds before stall → fail

  function _mat(m) { _mats.push(m); return m; }

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── Lock / unlock toast ───────────────────────────────────────────────────

  let _toastEl  = null;
  let _toastT   = 0;
  const TOAST_DUR = 2.2;

  function _showToast(msg, col) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.style.cssText = [
        'position:fixed;bottom:110px;left:50%;transform:translateX(-50%)',
        'pointer-events:none;z-index:500',
        'background:rgba(10,8,24,0.92)',
        'border-radius:6px;padding:8px 22px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'font-size:0.82rem;font-weight:600;letter-spacing:0.10em',
        'text-align:center;display:none',
      ].join(';');
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent     = msg;
    _toastEl.style.color     = col || '#ff8888';
    _toastEl.style.border    = `1px solid ${col || '#ff8888'}66`;
    _toastEl.style.display   = 'block';
    _toastEl.style.opacity   = '1';
    _toastT = TOAST_DUR;
  }

  function _tickToast(dt) {
    if (_toastT <= 0 || !_toastEl) return;
    _toastT -= dt;
    if (_toastT <= 0) {
      _toastEl.style.display = 'none';
    } else if (_toastT < 0.5) {
      _toastEl.style.opacity = (_toastT / 0.5).toFixed(3);
    }
  }

  // ── Fail particles ────────────────────────────────────────────────────────

  let _particles = [];
  let _pGeo      = null;

  function _spawnFailParticles(wx, wz) {
    if (!_pGeo) _pGeo = new THREE.SphereGeometry(0.07, 4, 3);
    const N = 6;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 1.5 + Math.random() * 1.5;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff3311, transparent: true, opacity: 0.85,
      });
      const mesh = new THREE.Mesh(_pGeo, mat);
      mesh.position.set(wx, 0.5, wz);
      _scene.add(mesh);
      _particles.push({
        mesh, mat,
        ox: wx, oz: wz,
        vx: Math.cos(ang) * spd,
        vy: 1.0 + Math.random() * 0.8,
        vz: Math.sin(ang) * spd,
        t: 0,
        dur: 0.5 + Math.random() * 0.3,
      });
    }
  }

  function _tickParticles(dt) {
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      p.t += dt;
      p.mesh.position.set(
        p.ox + p.vx * p.t,
        0.5 + p.vy * p.t - 4.9 * p.t * p.t,
        p.oz + p.vz * p.t
      );
      p.mat.opacity = Math.max(0, 1 - p.t / p.dur);
      if (p.t >= p.dur) {
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        p.mat.dispose();
        _particles.splice(i, 1);
      }
    }
  }

  // ── Strand rebuild (teal-green for cRNA, amber for vRNA) ──────────────────

  function _rebuildStrand(job) {
    const px    = job.poly.group.position.x;
    const pz    = job.poly.group.position.z;
    const perpX = -Math.sin(job.tmplAngle);
    const perpZ =  Math.cos(job.tmplAngle);
    const dist  = Math.hypot(px - job.sx, pz - job.sz);

    if (dist < 0.08) { job.strandMesh.visible = false; return; }

    const mx = (job.sx + px) * 0.5 + perpX * Math.min(0.55, dist * 0.25);
    const my = 0.72 + dist * 0.05;
    const mz = (job.sz + pz) * 0.5 + perpZ * Math.min(0.55, dist * 0.25);

    const curve  = new THREE.CatmullRomCurve3([
      new THREE.Vector3(job.sx, 0.44, job.sz),
      new THREE.Vector3(mx, my, mz),
      new THREE.Vector3(px, 0.44, pz),
    ]);
    const segs   = Math.max(4, Math.round(dist * 4));
    const newGeo = new THREE.TubeGeometry(curve, segs, 0.032, 4, false);
    if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();
    job.strandMesh.geometry = newGeo;
    job.strandMesh.visible  = true;
  }

  // ── Job completion ────────────────────────────────────────────────────────

  function _completeJob(job) {
    if (job.strandMesh.parent) job.strandMesh.parent.remove(job.strandMesh);
    if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();

    if (job.step === 'vrnaToCrna') {
      // Spawn cRNA intermediate near poly's final position (5' end)
      P4CRNAIntermediate.spawnCRNA(
        job.templateIdx,
        job.poly.group.position.x,
        job.poly.group.position.z,
        job.tmplAngle
      );
      _dispatchEdu('CRNA_PRODUCED', {
        templateIdx: job.templateIdx,
        gene: P4_CFG.SEGMENT_GENES[job.templateIdx],
      });
    } else {
      // cRNA → vRNA: add to segment inventory
      P4SegmentInventory.addSegment(job.templateIdx);
      P4CRNAIntermediate.remove(job.crna);
      _dispatchEdu('CRNA_TO_VRNA', {
        templateIdx: job.templateIdx,
        gene: P4_CFG.SEGMENT_GENES[job.templateIdx],
      });
      _dispatchEdu('FULL_REPLICATION', {
        templateIdx: job.templateIdx,
        gene: P4_CFG.SEGMENT_GENES[job.templateIdx],
      });
    }

    // Free the poly
    job.poly.state = 'idle';
    job._done = true;
  }

  // ── Job failure (NP stall timeout) ────────────────────────────────────────

  function _failJob(job) {
    if (job.strandMesh.parent) job.strandMesh.parent.remove(job.strandMesh);
    if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();

    // Red flash on poly lobes
    for (const m of job.poly.lobeMats) {
      m.emissive.set(0xff2222);
      m.emissiveIntensity = 0.9;
    }
    const poly = job.poly;
    setTimeout(() => {
      if (poly.lobeMats) {
        for (const m of poly.lobeMats) {
          m.emissive.set(m.color);
          m.emissiveIntensity = 0.22;
        }
      }
    }, 800);

    _spawnFailParticles(job.poly.group.position.x, job.poly.group.position.z);

    if (job.crna) job.crna.busy = false;   // release cRNA for step 2 failures
    job.poly.state = 'idle';

    _dispatchEdu('NP_DEPLETED', {
      templateIdx: job.templateIdx,
      step: job.step,
    });

    job._done = true;
  }

  // ── Per-job tick ──────────────────────────────────────────────────────────

  function _tickJob(job, dt) {
    if (job.phase === 'transit') return;   // steering handles movement

    if (job.phase === 'initiation') {
      job.initT += dt;
      // PB1 lobe (lobeMats[1]) pulsing emissive
      const pulse = 0.35 + Math.abs(Math.sin(job.initT * Math.PI / INIT_DUR * 3)) * 0.55;
      job.poly.lobeMats[1].emissiveIntensity = pulse;

      if (job.initT >= INIT_DUR) {
        job.poly.lobeMats[1].emissiveIntensity = 0.22;
        job.phase = 'traversing';
      }
      return;
    }

    if (job.phase === 'traversing') {
      const np = P4Resources.getNP();

      if (np <= 0) {
        // Stall
        job.stallT += dt;
        job.strandMat.color.set(0xffaa44);    // amber stall indicator
        if (job.stallT >= STALL_FAIL_TIME) _failJob(job);
        return;
      }

      // Reset stall timer and restore strand color
      job.stallT = 0;
      job.strandMat.color.set(
        job.step === 'vrnaToCrna' ? P4_CFG.COL_CRNA : P4_CFG.COL_VRNA
      );

      const prevProg = job.progress;
      const advance  = P4_CFG.SYNTH_TRAVERSE_SPEED * dt / P4_CFG.TEMPLATE_LENGTH;
      job.progress   = Math.min(1, job.progress + advance);
      const distMoved = (job.progress - prevProg) * P4_CFG.TEMPLATE_LENGTH;

      // Fractional NP consumption
      job.npDebt += distMoved * P4_CFG.NP_PER_UNIT;
      const toConsume = Math.floor(job.npDebt);
      if (toConsume >= 1) {
        P4Resources.consumeNP(toConsume);
        job.npDebt -= toConsume;
      }

      // Move poly along template/cRNA
      const t = job.progress;
      job.poly.group.position.x = job.sx + (job.ex - job.sx) * t;
      job.poly.group.position.z = job.sz + (job.ez - job.sz) * t;
      job.poly.group.rotation.y =
        Math.atan2(job.ez - job.sz, job.ex - job.sx) + Math.PI * 0.5;

      job.frameN++;
      if (job.frameN % 5 === 0) _rebuildStrand(job);

      if (job.progress >= 1) _completeJob(job);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene        = scene;
    _unlockFired  = false;
    _jobs         = [];
  }

  /**
   * Step 1: vRNA template → cRNA intermediate.
   * Called by P4PolymeraseManager's template arrival handler when mode='replication'.
   */
  function startReplication(poly, templateIdx) {
    const np = P4Resources.getNP();
    if (np < P4_CFG.NP_REPLICATION_THRESH) {
      poly.state = 'idle';
      _showToast(`REPLICATION LOCKED — NP < ${P4_CFG.NP_REPLICATION_THRESH}`);
      return;
    }

    const tmpl = P4Templates.getByIndex(templateIdx);
    if (!tmpl) { poly.state = 'idle'; return; }

    const halfLen = P4_CFG.TEMPLATE_LENGTH * 0.5;
    const sx = tmpl.group.position.x + Math.cos(tmpl.angle) * halfLen;
    const sz = tmpl.group.position.z + Math.sin(tmpl.angle) * halfLen;
    const ex = tmpl.group.position.x - Math.cos(tmpl.angle) * halfLen;
    const ez = tmpl.group.position.z - Math.sin(tmpl.angle) * halfLen;

    poly.state = 'busy';

    const strandMat  = _mat(new THREE.MeshLambertMaterial({
      color:       new THREE.Color(P4_CFG.COL_CRNA),
      transparent: true,
      opacity:     0.82,
    }));
    const strandMesh = new THREE.Mesh(new THREE.BufferGeometry(), strandMat);
    strandMesh.visible = false;
    strandMesh.name    = `repl_strand_${poly.idx}`;
    _scene.add(strandMesh);

    const job = {
      poly, templateIdx,
      step: 'vrnaToCrna',
      crna: null,
      tmplAngle: tmpl.angle,
      sx, sz, ex, ez,
      phase:    'transit',
      initT:    0,
      progress: 0,
      stallT:   0,
      npDebt:   0,
      frameN:   0,
      strandMesh, strandMat,
      _done: false,
    };
    _jobs.push(job);

    P4SteeringBehavior.setTarget(poly, sx, sz, () => {
      if (!job._done) {
        job.phase = 'initiation';
        _dispatchEdu('REPLICATION_START', {
          templateIdx,
          gene: P4_CFG.SEGMENT_GENES[templateIdx],
          step: 'vrnaToCrna',
        });
      }
    });
  }

  /**
   * Step 2: cRNA intermediate → new vRNA (vRNP).
   * Called when player clicks a cRNA with a poly selected in R mode.
   */
  function startCRNAtoVRNA(poly, crna) {
    if (crna.busy) return;
    const np = P4Resources.getNP();
    if (np < P4_CFG.NP_REPLICATION_THRESH) {
      poly.state = 'idle';
      _showToast(`REPLICATION LOCKED — NP < ${P4_CFG.NP_REPLICATION_THRESH}`);
      return;
    }

    crna.busy  = true;
    poly.state = 'busy';

    // Use cRNA's stored center position + angle for traversal endpoints
    const halfLen = P4_CFG.TEMPLATE_LENGTH * 0.5;
    const cx = crna.group.position.x;
    const cz = crna.group.position.z;
    const sx = cx + Math.cos(crna.angle) * halfLen;
    const sz = cz + Math.sin(crna.angle) * halfLen;
    const ex = cx - Math.cos(crna.angle) * halfLen;
    const ez = cz - Math.sin(crna.angle) * halfLen;

    const strandMat  = _mat(new THREE.MeshLambertMaterial({
      color:       new THREE.Color(P4_CFG.COL_VRNA),
      transparent: true,
      opacity:     0.82,
    }));
    const strandMesh = new THREE.Mesh(new THREE.BufferGeometry(), strandMat);
    strandMesh.visible = false;
    strandMesh.name    = `repl2_strand_${poly.idx}`;
    _scene.add(strandMesh);

    const job = {
      poly,
      templateIdx: crna.templateIdx,
      step: 'crnaToVrna',
      crna,
      tmplAngle: crna.angle,
      sx, sz, ex, ez,
      phase:    'transit',
      initT:    0,
      progress: 0,
      stallT:   0,
      npDebt:   0,
      frameN:   0,
      strandMesh, strandMat,
      _done: false,
    };
    _jobs.push(job);

    P4SteeringBehavior.setTarget(poly, sx, sz, () => {
      if (!job._done) {
        job.phase = 'initiation';
        _dispatchEdu('REPLICATION_START', {
          templateIdx: crna.templateIdx,
          gene: P4_CFG.SEGMENT_GENES[crna.templateIdx],
          step: 'crnaToVrna',
        });
      }
    });
  }

  function tick(dt) {
    _tickToast(dt);
    _tickParticles(dt);

    // First-time unlock notification
    if (!_unlockFired && P4Resources.getNP() >= P4_CFG.NP_REPLICATION_THRESH) {
      _unlockFired = true;
      _showToast('★ REPLICATION UNLOCKED — switch to R mode', '#88ccff');
      _dispatchEdu('REPLICATION_UNLOCK', {});
    }

    for (const job of _jobs) {
      if (!job._done) _tickJob(job, dt);
    }

    // Prune done jobs
    for (let i = _jobs.length - 1; i >= 0; i--) {
      if (_jobs[i]._done) _jobs.splice(i, 1);
    }
  }

  function destroy() {
    for (const job of _jobs) {
      if (job.strandMesh.parent)   job.strandMesh.parent.remove(job.strandMesh);
      if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();
      if (!job._done) {
        job.poly.state = 'idle';
        if (job.crna) job.crna.busy = false;
      }
    }
    _jobs = [];

    for (const m of _mats) m.dispose();
    _mats = [];

    if (_pGeo) { _pGeo.dispose(); _pGeo = null; }
    for (const p of _particles) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mat.dispose();
    }
    _particles = [];

    if (_toastEl && _toastEl.parentNode) _toastEl.parentNode.removeChild(_toastEl);
    _toastEl = null;

    _scene = null;
  }

  function isUnlocked() {
    return P4Resources.getNP() >= P4_CFG.NP_REPLICATION_THRESH;
  }

  return {
    init, startReplication, startCRNAtoVRNA, tick, destroy,
    isUnlocked,
  };

})();
