// vi_p3_fusion.js — P3FusionSequence: 5-beat HA-mediated membrane fusion cinematic
// Beats: PEPTIDE_LAUNCH → HA_JACKKNIFE → HEMIFUSION → PORE_FORMATION → TRANSITION
// Depends on: three.js r128, vi_p3_config.js, vi_p3_main.js
'use strict';

class P3FusionSequence {

  constructor(cfg) {
    this._cfg        = cfg;
    this._t          = 0;
    this._site       = null;    // THREE.Vector3 — fusion site on endosome wall
    this._trimers    = [];      // aimed HA trimer refs from P3HASystem
    this._onComplete = null;
    this._done       = false;
    this._beatIdx    = -1;      // index of the currently running beat

    // Three.js objects created / destroyed during the cinematic
    this._peptideParticles = [];  // [{mesh, startPos}]
    this._hemiSphere       = null;
    this._poreRing         = null;
    this._poreLight        = null;

    // DOM flash element
    this._flashEl = null;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Called from P3Escape.triggerFusion when all conditions are met.
  // trimers  — array from P3HASystem.getAimedTrimers()
  // site     — THREE.Vector3 fusion site centroid (on endosome wall)
  // onComplete — callback fired when the last beat finishes
  start(trimers, site, onComplete) {
    this._t          = 0;
    this._trimers    = trimers;
    this._site       = site.clone();
    this._onComplete = onComplete;
    this._done       = false;
    this._beatIdx    = -1;

    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;

    // Remove HA laser lines — they're done, the cinematic takes over visually
    if (scene) {
      trimers.forEach(t => {
        if (t.laserLine) {
          scene.remove(t.laserLine);
          t.laserLine.geometry.dispose();
          t.laserLine.material.dispose();
          t.laserLine = null;
        }
      });
    }

    this._buildPeptideParticles();
    this._buildHemiSphere();
    this._buildFlashEl();
  }

  // Called from P3Escape._tick during FUSION_CINEMATIC state.
  update(dt) {
    if (this._done || !this._site) return;
    this._t += dt;

    const beats = this._cfg.FUSION_BEAT;
    const totalDur = beats[beats.length - 1].end;

    if (this._t >= totalDur) {
      this._finish();
      return;
    }

    // Locate current beat
    let beat = null;
    let beatIdx = -1;
    for (let i = 0; i < beats.length; i++) {
      if (this._t >= beats[i].start && this._t < beats[i].end) {
        beat = beats[i]; beatIdx = i; break;
      }
    }
    if (!beat) return;

    // Fire beat-start hook exactly once per beat
    if (beatIdx !== this._beatIdx) {
      this._beatIdx = beatIdx;
      this._onBeatStart(beat.name);
    }

    // Normalised progress within this beat [0, 1)
    const f = (this._t - beat.start) / (beat.end - beat.start);
    this._animateBeat(beat.name, f);
  }

  // Returns the world-space pore position for P3VRNPTargeting.
  getPorePosition() {
    const fallback = new THREE.Vector3(0, this._cfg.ENDO_RADIUS * 0.9, 0);
    if (!this._site) return fallback;
    return this._site.clone().normalize()
           .multiplyScalar(this._cfg.ENDO_RADIUS - 0.5);
  }

  destroy() {
    this._cleanupAll();
  }

  // ── Beat lifecycle ────────────────────────────────────────────────────────────

  _onBeatStart(name) {
    // HUD subtitle
    const subtitles = {
      PEPTIDE_LAUNCH: 'Fusion peptides inserting into endosomal membrane…',
      HA_JACKKNIFE:   'HA jackknifing — pulling membranes together…',
      HEMIFUSION:     'Hemifusion stalk forming…',
      PORE_FORMATION: 'Fusion pore opening…',
      TRANSITION:     'Escape pathway established!',
    };
    const esc = typeof P3Escape !== 'undefined' ? P3Escape : null;
    if (esc && esc.hud) esc.hud.setObjective(subtitles[name] || '');

    // Beat-specific setup
    if (name === 'HA_JACKKNIFE') {
      // Particles have reached the wall — remove them
      this._removePeptideParticles();
    }
    if (name === 'HEMIFUSION') {
      if (esc && esc.edu) {
        esc.edu.trigger(this._cfg.EDU.HEMIFUSION,
          'Hemifusion Intermediate',
          'Hemifusion is the penultimate step of viral membrane fusion. The outer ' +
          'leaflets of the viral and endosomal membranes merge, forming a lipidic ' +
          'stalk, while the inner leaflets remain separate. The stalk expands into ' +
          'a hemifusion diaphragm before pore nucleation.');
      }
    }
    if (name === 'PORE_FORMATION') {
      this._buildPoreRing();
      if (esc && esc.edu) {
        esc.edu.trigger(this._cfg.EDU.PORE_OPEN,
          'Fusion Pore Formation',
          'The hemifusion diaphragm ruptures, opening a small proteinaceous pore ' +
          'lined by the transmembrane domains of multiple HA2 subunits. The pore ' +
          'expands irreversibly, driven by line tension, until it is large enough ' +
          'for vRNP segments to transit into the cytoplasm.');
      }
    }
    if (name === 'TRANSITION') {
      this._startFlash();
      if (esc && esc.audio) esc.audio.playPhaseComplete();
    }
  }

  // ── Per-beat animation ────────────────────────────────────────────────────────

  _animateBeat(name, f) {
    switch (name) {
      case 'PEPTIDE_LAUNCH':  this._animPeptideLaunch(f);   break;
      case 'HA_JACKKNIFE':    this._animJackknife(f);        break;
      case 'HEMIFUSION':      this._animHemifusion(f);       break;
      case 'PORE_FORMATION':  this._animPoreFormation(f);    break;
      case 'TRANSITION':      this._animTransition(f);       break;
    }
  }

  // Beat 1 — small magenta spheres fly from each trimer toward the fusion site
  _animPeptideLaunch(f) {
    const eased = _p3FuseEase(f);
    this._peptideParticles.forEach(p => {
      p.mesh.position.lerpVectors(p.startPos, this._site, eased);
      p.mesh.material.opacity = 0.25 + eased * 0.75;
      p.mesh.scale.setScalar(0.6 + Math.sin(f * Math.PI) * 0.6);
    });

    // Trimer fusion peptides blaze fully pink, heads pulse
    this._trimers.forEach(t => {
      const pulse = 0.5 + Math.sin(this._t * 9 + t.index * 0.8) * 0.5;
      t.headMats.forEach(m => {
        m.color.setHex(this._cfg.COL_HA_FUSION_PEP);
        m.emissiveIntensity = pulse;
      });
      t.pepMats.forEach(m => { m.opacity = 1.0; });
    });
  }

  // Beat 2 — stems extend (coiled-coil), heads fold to hairpin conformation
  _animJackknife(f) {
    const eased = _p3FuseEase(f);

    this._trimers.forEach(t => {
      // Stem extends along group's local +Y; keep base flush with viral surface
      const scaleY = 1.0 + eased * 1.80;          // 1.0 → 2.80
      t.stem.scale.y  = scaleY;
      t.stem.position.y = 0.44 * scaleY;           // base stays at y=0

      // Heads fold back toward the viral membrane in hairpin conformation
      t.heads.forEach((head, j) => {
        const a       = (j / 3) * Math.PI * 2;
        const r       = 0.34 + eased * 0.30;       // spread outward
        const yTarget = 0.95 - eased * 1.45;       // fold downward past origin
        head.position.set(Math.cos(a) * r, yTarget, Math.sin(a) * r);
      });

      // Color ramps from fusion-ready orange → deep jackknife red
      const jkCol = _p3LerpHex(0xff4400, 0xcc0000, eased);
      t.stemMat.color.setHex(jkCol);
      t.headMats.forEach(m => {
        m.color.setHex(jkCol);
        m.emissiveIntensity = 0.4 + eased * 0.5;
      });
    });
  }

  // Beat 3 — dark hemifusion stalk sphere appears and dissipates
  _animHemifusion(f) {
    if (!this._hemiSphere) return;
    // Envelope: rise then fall, like a stalk forming and widening
    const env = Math.sin(f * Math.PI);
    this._hemiSphere.scale.setScalar(env * 1.8);
    this._hemiSphere.material.opacity = env * 0.60;
  }

  // Beat 4 — pore ring scales up, inner light intensifies
  _animPoreFormation(f) {
    if (!this._poreRing) return;
    const eased = _p3FuseEase(f);
    this._poreRing.scale.setScalar(eased);
    this._poreRing.material.emissiveIntensity = 0.35 + Math.sin(this._t * 7) * 0.30;
    if (this._poreLight) this._poreLight.intensity = eased * 1.8;
  }

  // Beat 5 — brief screen flash, pore pulses brightly, then onComplete fires
  _animTransition(f) {
    if (this._poreRing) {
      this._poreRing.material.emissiveIntensity = 0.5 + Math.sin(this._t * 10) * 0.45;
    }
    if (this._flashEl) {
      // Flash envelope: ramp up then fade to black
      const alpha = f < 0.35 ? f / 0.35 : 1.0 - (f - 0.35) / 0.65;
      this._flashEl.style.opacity = String(alpha * 0.82);
    }
  }

  // ── Finalise ─────────────────────────────────────────────────────────────────

  _finish() {
    if (this._done) return;
    this._done = true;

    if (this._flashEl) this._flashEl.style.opacity = '0';

    // Leave pore ring in scene — visual anchor for VRNP_TARGETING phase
    this._removePeptideParticles();
    this._removeHemiSphere();

    const cb = this._onComplete;
    this._onComplete = null;
    if (cb) cb();
  }

  // ── Object builders ───────────────────────────────────────────────────────────

  _buildPeptideParticles() {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (!scene) return;
    const cfg = this._cfg;

    this._peptideParticles = this._trimers.map(t => {
      const geo = new THREE.SphereGeometry(0.13, 7, 5);
      const mat = new THREE.MeshBasicMaterial({
        color:       cfg.COL_HA_FUSION_PEP,   // 0xff44aa
        transparent: true,
        opacity:     0.25,
        depthWrite:  false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(t.group.position);
      scene.add(mesh);
      return { mesh, startPos: t.group.position.clone() };
    });
  }

  _buildHemiSphere() {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (!scene || !this._site) return;

    const wallPos = this._site.clone().normalize()
                    .multiplyScalar(this._cfg.ENDO_RADIUS - 0.5);
    const geo = new THREE.SphereGeometry(1.0, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x110022,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      side:        THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(wallPos);
    mesh.scale.setScalar(0);
    scene.add(mesh);
    this._hemiSphere = mesh;
  }

  _buildPoreRing() {
    if (this._poreRing) return;
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (!scene || !this._site) return;

    const cfg     = this._cfg;
    const wallPos = this._site.clone().normalize()
                    .multiplyScalar(cfg.ENDO_RADIUS - 0.2);

    const geo = new THREE.TorusGeometry(1.5, 0.14, 10, 48);
    const mat = new THREE.MeshPhongMaterial({
      color:             cfg.COL_FUSION_LINE,   // 0x00ffcc
      emissive:          cfg.COL_FUSION_LINE,
      emissiveIntensity: 0.5,
      transparent:       true,
      opacity:           0.90,
      depthWrite:        false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(wallPos);
    ring.lookAt(0, 0, 0);    // ring face points inward, toward camera
    ring.scale.setScalar(0);
    scene.add(ring);
    this._poreRing = ring;

    // Point light at pore center — illuminates approaching vRNP segments
    const light = new THREE.PointLight(cfg.COL_FUSION_LINE, 0, 9);
    light.position.copy(wallPos);
    scene.add(light);
    this._poreLight = light;
  }

  _buildFlashEl() {
    if (this._flashEl) return;
    const el = document.createElement('div');
    el.id = 'p3FusionFlash';
    Object.assign(el.style, {
      position:      'fixed',
      inset:         '0',
      background:    '#00ffcc',
      opacity:       '0',
      pointerEvents: 'none',
      zIndex:        '2500',
      transition:    'opacity 0.08s ease',
    });
    document.body.appendChild(el);
    this._flashEl = el;
  }

  // ── Object cleanup ────────────────────────────────────────────────────────────

  _removePeptideParticles() {
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    this._peptideParticles.forEach(p => {
      if (scene) scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    this._peptideParticles = [];
  }

  _removeHemiSphere() {
    if (!this._hemiSphere) return;
    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (scene) scene.remove(this._hemiSphere);
    this._hemiSphere.geometry.dispose();
    this._hemiSphere.material.dispose();
    this._hemiSphere = null;
  }

  _cleanupAll() {
    this._removePeptideParticles();
    this._removeHemiSphere();

    const scene = typeof P3Escape !== 'undefined' ? P3Escape.scene : null;
    if (this._poreRing) {
      if (scene) scene.remove(this._poreRing);
      this._poreRing.geometry.dispose();
      this._poreRing.material.dispose();
      this._poreRing = null;
    }
    if (this._poreLight) {
      if (scene) scene.remove(this._poreLight);
      this._poreLight = null;
    }
    if (this._flashEl) {
      this._flashEl.remove();
      this._flashEl = null;
    }
  }
}

// ── Smooth ease-in-out helper (local to this module) ──────────────────────────
function _p3FuseEase(f) {
  // Cubic ease-in-out
  return f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.fusion) {
  P3Escape.fusion = new P3FusionSequence(P3_CFG);
}
