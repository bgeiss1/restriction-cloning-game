/**
 * vi_p4_transcription.js — Phase 4 viral mRNA transcription (Chunk 5).
 *
 * When an RdRp complex arrives at its home vRNP template after a successful
 * cap-snatch, P4Transcription drives the polymerase along the template strand,
 * growing a TubeGeometry mRNA in real time.
 *
 * Mechanics:
 *   - Poly navigates to the 3′ end of its assigned template (via steering).
 *   - Traverses the full TEMPLATE_LENGTH at SYNTH_TRAVERSE_SPEED u/s
 *     (SHORT efficiency = 30 % slower; OPTIMAL / LONG = full speed).
 *   - NTP consumed at NTP_TRANSCR_RATE per active job; regenerates at
 *     NTP_REGEN_RATE.  When NTP = 0 all jobs stall (strand turns amber).
 *   - At the final POLYA_REGION_FRAC of the template, POLYA_STUTTER_N bounce
 *     oscillations play at POLYA_STUTTER_PERIOD each before mRNA detaches.
 *   - On completion: spawns an mRNA product (P4MRNAProduct.spawnMRNA) and
 *     frees the poly.
 *
 * API:
 *   P4Transcription.init(scene)
 *   P4Transcription.startTranscription(poly, templateIdx, efficiency)
 *   P4Transcription.tick(dt)
 *   P4Transcription.destroy()
 *   P4Transcription.getNTP()          → number
 *   P4Transcription.addNTP(n)         — called by economy (Chunk 6)
 *   P4Transcription.getActiveCount()  → number (jobs not in transit)
 *
 * Educational triggers (CustomEvent 'p4EduTrigger' on window):
 *   TRANSCRIPTION_START  — poly begins traversing template
 *   POLYA_STUTTER        — poly-A region entered
 */

/* global THREE, P4_CFG, P4Templates, P4SteeringBehavior, P4MRNAProduct */

const P4Transcription = (() => {

  let _scene = null;
  let _jobs  = [];
  let _ntp   = 0;
  let _mats  = [];      // for disposal in destroy()

  function _mat(m) { _mats.push(m); return m; }

  function _dispatchEdu(type, extra) {
    window.dispatchEvent(new CustomEvent('p4EduTrigger', {
      detail: Object.assign({ type }, extra || {}),
    }));
  }

  // ── NTP pool ──────────────────────────────────────────────────────────────

  function _tickNTP(dt, activeCount) {
    _ntp = Math.min(_ntp + P4_CFG.NTP_REGEN_RATE * dt, P4_CFG.NTP_START);
    if (activeCount > 0) {
      _ntp = Math.max(0, _ntp - P4_CFG.NTP_TRANSCR_RATE * activeCount * dt);
    }
  }

  // ── mRNA strand tube ──────────────────────────────────────────────────────

  function _rebuildStrand(job) {
    const px = job.poly.group.position.x;
    const pz = job.poly.group.position.z;

    // Perpendicular to the template (for arching the curve sideways + up)
    const perpX = -Math.sin(job.tmpl.angle);
    const perpZ =  Math.cos(job.tmpl.angle);
    const dist  = Math.hypot(px - job.sx, pz - job.sz);

    if (dist < 0.08) {
      job.strandMesh.visible = false;
      return;
    }

    const mx = (job.sx + px) * 0.5 + perpX * Math.min(0.55, dist * 0.25);
    const my = 0.75 + dist * 0.05;
    const mz = (job.sz + pz) * 0.5 + perpZ * Math.min(0.55, dist * 0.25);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(job.sx, 0.44, job.sz),
      new THREE.Vector3(mx, my, mz),
      new THREE.Vector3(px, 0.44, pz),
    ]);

    const segments = Math.max(4, Math.round(dist * 4));
    const newGeo   = new THREE.TubeGeometry(curve, segments, 0.030, 4, false);
    if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();
    job.strandMesh.geometry   = newGeo;
    job.strandMesh.visible    = true;
  }

  // ── Phase transitions ─────────────────────────────────────────────────────

  function _beginTraversal(job) {
    job.phase = 'transcribing';
    _dispatchEdu('TRANSCRIPTION_START', {
      templateIdx: job.tmpl.idx,
      gene:        P4_CFG.SEGMENT_GENES[job.tmpl.idx],
      efficiency:  job.efficiency,
    });
  }

  function _completeTranscription(job) {
    job._done = true;

    // Remove growing tube immediately
    if (job.strandMesh.parent) job.strandMesh.parent.remove(job.strandMesh);
    if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();

    // Detach cap mesh from poly
    if (job.poly.capMesh) {
      if (job.poly.capMesh.parent) {
        job.poly.capMesh.parent.remove(job.poly.capMesh);
      }
      if (job.poly.capMesh.geometry) job.poly.capMesh.geometry.dispose();
      if (job.poly.capMesh.material) job.poly.capMesh.material.dispose();
      job.poly.capMesh = null;
    }

    // Spawn the finished mRNA product near the 5′ end of the template
    P4MRNAProduct.spawnMRNA(
      job.tmpl.idx,
      job.efficiency,
      job.poly.group.position.x,
      job.poly.group.position.z
    );

    // Free the poly
    job.poly.state          = 'idle';
    job.poly.assignedTarget = null;
    job.poly.capEfficiency  = null;
    job.poly.capScore       = 0;
  }

  // ── Per-job tick ──────────────────────────────────────────────────────────

  function _tickJob(job, dt, stalled) {
    if (job.phase === 'transit') return;   // steering handles movement
    if (stalled) {
      // Visual stall indicator: amber strand
      job.strandMat.color.set(0xffaa44);
      return;
    }
    job.strandMat.color.set(P4_CFG.COL_MRNA_PROD);

    if (job.phase === 'transcribing') {
      const advance = job.baseSpeed * dt / P4_CFG.TEMPLATE_LENGTH;
      job.progress  = Math.min(1, job.progress + advance);

      // Move poly along template (X and Z; Y managed by P4Polymerases.tick)
      const t = job.progress;
      job.poly.group.position.x = job.sx + (job.ex - job.sx) * t;
      job.poly.group.position.z = job.sz + (job.ez - job.sz) * t;
      // Face along the template (inward direction)
      job.poly.group.rotation.y = Math.atan2(
        job.ez - job.sz,
        job.ex - job.sx
      ) + Math.PI * 0.5;

      // Rebuild strand every 5 frames
      job.frameN++;
      if (job.frameN % 5 === 0) _rebuildStrand(job);

      // Enter poly-A stutter region
      const stutterThreshold = 1 - P4_CFG.POLYA_REGION_FRAC;
      if (job.progress >= stutterThreshold && !job.polyAStarted) {
        job.polyAStarted  = true;
        job.phase         = 'polya';
        job.progress      = stutterThreshold;   // freeze progress position
        job.stutterT      = 0;
        job.stutterTotal  = P4_CFG.POLYA_STUTTER_N * P4_CFG.POLYA_STUTTER_PERIOD;
        _dispatchEdu('POLYA_STUTTER', {
          templateIdx: job.tmpl.idx,
          gene:        P4_CFG.SEGMENT_GENES[job.tmpl.idx],
        });
      }

    } else if (job.phase === 'polya') {
      job.stutterT += dt;

      // Oscillate ±0.06 u along the template direction around the stutter point
      const osc  = Math.sin(job.stutterT * Math.PI / P4_CFG.POLYA_STUTTER_PERIOD) * 0.06;
      const t    = 1 - P4_CFG.POLYA_REGION_FRAC;
      const radX = Math.cos(job.tmpl.angle);
      const radZ = Math.sin(job.tmpl.angle);
      job.poly.group.position.x = job.sx + (job.ex - job.sx) * t + radX * osc;
      job.poly.group.position.z = job.sz + (job.ez - job.sz) * t + radZ * osc;

      job.frameN++;
      if (job.frameN % 5 === 0) _rebuildStrand(job);

      if (job.stutterT >= job.stutterTotal) {
        _completeTranscription(job);
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(scene) {
    _scene = scene;
    _ntp   = P4_CFG.NTP_START;
  }

  /**
   * Start transcription for a poly that has successfully cap-snatched.
   * The poly is navigated to the 3′ end of its assigned template, then
   * traverses toward the 5′ end while the mRNA tube grows.
   */
  function startTranscription(poly, templateIdx, efficiency) {
    const tmpl = P4Templates.getByIndex(templateIdx);
    if (!tmpl) {
      poly.state = 'idle';
      return;
    }

    // Enforce max concurrent polys per template
    const onTemplate = _jobs.filter(j => j.tmpl.idx === templateIdx && !j._done).length;
    if (onTemplate >= P4_CFG.TEMPLATE_MAX_POLYS) {
      poly.state          = 'idle';
      poly.assignedTarget = null;
      return;
    }

    poly.state = 'busy';

    // 3′ end (outer, where poly starts) and 5′ end (inner, where mRNA detaches)
    const halfLen = P4_CFG.TEMPLATE_LENGTH * 0.5;
    const sx = tmpl.group.position.x + Math.cos(tmpl.angle) * halfLen;
    const sz = tmpl.group.position.z + Math.sin(tmpl.angle) * halfLen;
    const ex = tmpl.group.position.x - Math.cos(tmpl.angle) * halfLen;
    const ez = tmpl.group.position.z - Math.sin(tmpl.angle) * halfLen;

    // SHORT efficiency = 30 % slower
    const baseSpeed = (efficiency === 'short')
      ? P4_CFG.SYNTH_TRAVERSE_SPEED * 0.70
      : P4_CFG.SYNTH_TRAVERSE_SPEED;

    // Growing mRNA tube (starts invisible; rebuilt each 5 frames during traversal)
    const strandMat  = _mat(new THREE.MeshLambertMaterial({
      color:       new THREE.Color(P4_CFG.COL_MRNA_PROD),
      transparent: true,
      opacity:     0.78,
    }));
    const strandMesh = new THREE.Mesh(new THREE.BufferGeometry(), strandMat);
    strandMesh.visible = false;
    strandMesh.name    = `trans_strand_${poly.idx}`;
    _scene.add(strandMesh);

    const job = {
      poly, tmpl,
      sx, sz, ex, ez,
      efficiency,
      baseSpeed,
      progress:     0,
      phase:        'transit',    // 'transit' | 'transcribing' | 'polya'
      strandMesh,
      strandMat,
      frameN:       0,
      polyAStarted: false,
      stutterT:     0,
      stutterTotal: 0,
      _done:        false,
    };

    _jobs.push(job);

    // Navigate to 3′ end, then begin traversal
    P4SteeringBehavior.setTarget(poly, sx, sz, () => {
      if (!job._done) _beginTraversal(job);
    });
  }

  function tick(dt) {
    // Count actively transcribing jobs (for NTP consumption)
    const activeCount = _jobs.filter(j => !j._done && j.phase !== 'transit').length;
    _tickNTP(dt, activeCount);

    const stalled = (_ntp <= 0);

    for (const job of _jobs) {
      if (!job._done) _tickJob(job, dt, stalled);
    }

    // Remove completed jobs
    for (let i = _jobs.length - 1; i >= 0; i--) {
      if (_jobs[i]._done) _jobs.splice(i, 1);
    }
  }

  function destroy() {
    for (const job of _jobs) {
      if (job.strandMesh.parent)   job.strandMesh.parent.remove(job.strandMesh);
      if (job.strandMesh.geometry) job.strandMesh.geometry.dispose();
      // Free any in-progress poly
      if (!job._done) {
        job.poly.state          = 'idle';
        job.poly.assignedTarget = null;
      }
    }
    _jobs = [];
    for (const m of _mats) m.dispose();
    _mats  = [];
    _scene = null;
    _ntp   = 0;
  }

  function getNTP()         { return _ntp; }
  function addNTP(n)        { _ntp = Math.min(_ntp + n, P4_CFG.NTP_START * 2); }
  function getActiveCount() {
    return _jobs.filter(j => !j._done && j.phase !== 'transit').length;
  }

  return {
    init, startTranscription, tick, destroy,
    getNTP, addNTP, getActiveCount,
  };

})();
