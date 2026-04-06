# Phase 0: Antibody Gauntlet — Backup

This module was removed from the Viral Infiltration game on 2026-04-06 because the
Antibody Gauntlet is set in the bloodstream and is not appropriate for the influenza
respiratory transmission narrative.  It is preserved here for reuse in a future
blood-borne virus variant (e.g. HIV, HBV).

## What was removed from viral_infiltration.html

### CSS (removed from <style> block, was ~lines 337–373)
  #abGauntletHUD, .abg-label, #abgSites, .abs, .abs-free, .abs-igm, .abs-igg, .abg-tip

### Constants (was ~lines 2926–2952)
  AB_FIELD_OUTER, AB_RECT_XMIN/XMAX/ZMIN/ZMAX, AB_BIND_DIST, AB_IgM_DURATION,
  AB_SITES, RBC_BIND_DIST, RBC_BIND_DURATION, RBC_BIND_COOLDOWN, RBC_SPEED_MULT,
  RBC_MAX_BINDS, AB_NON_COLORS, AB_IgG_COUNT, AB_IgM_COUNT, AB_NEUTRAL_FRAC

### Functions (was ~lines 2954–3609)
  computePhase0Bounds()     — viewport-filling extracellular bounds for Phase 0 camera
  _phase0SpawnPos()         — random spawn on outer ring
  _abIgGMesh(color, s)      — builds a Y-shaped IgG antibody mesh
  _abIgMMesh(color)         — builds a pentameric IgM snowflake mesh
  buildPhase1AntibodyField()— spawns field, binding sites, crowd, erythrocytes, HUD
  updatePhase1Antibodies(dt)— moves antibodies, binding/release logic, reinforcements
  buildPhase1HUD()          — creates the binding-site indicator HUD element
  updatePhase1HUD()         — updates the HUD site colors each frame
  clearPhase1HUD()          — removes the HUD DOM element
  buildAntibodyCrowd()      — non-neutralizing antibody InstancedMesh crowd (250 abs)
  updateCrowdAntibodies(dt) — tumble and bounce the crowd each frame
  buildErythrocytes()/updateErythrocytes(dt)/clearErythrocytes()
                            — biconcave RBC InstancedMesh with HA-sialic acid binding
  clearPhase1Field()        — disposes all gauntlet geometry and HUD
  triggerPhase1Fail()       — bounces player, schedules rebuild after 2.5s
  phaseCheck_Penetration()  — Phase 0 completion check (reach receptor with ≥1 free site)

### Game-loop wiring (removed)
  Main loop: if (G.phase === 0) { updatePhase1Antibodies(dt); updateCrowdAntibodies(dt);
                                   updateErythrocytes(dt); }
  setupPhaseTarget() case 0: buildPhase1AntibodyField()
  checkPhaseCompletion() case 0: phaseCheck_Penetration(px, pz)
  completePhase() completedPhase===0: gauntlet→P2Attachment transition
  Player boundary for phase 0: extracellular rect bounds + membrane wall
  Camera for phase 0: G.camera.position.set(0, 180, 56) static overview
  RBC speed drag: speed *= Math.pow(RBC_SPEED_MULT, rbcBinds)
  badgeRBC HUD badge
  Fog density: baseDensity = G.phase === 0 ? 0.0015 : 0.008

## How to reuse

1. Re-add the CSS block in viral_infiltration.html <style>
2. Insert `antibody_gauntlet.js` as a <script> after the Three.js include
3. Restore the game-loop wiring noted above
4. Add PHASE_DATA entry for "Antibody Gauntlet" before Attachment
5. Wire G.phase indices to match the restored position in PHASE_DATA

All the extracted code is in antibody_gauntlet.js.  RBCManager.js contains the
vi_p2_world.js RBC drift code if you need the visual RBC drift in the 3D world
(separate from the hemagglutination binding mechanics in the gauntlet).
