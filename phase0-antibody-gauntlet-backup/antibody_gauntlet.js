/**
 * antibody_gauntlet.js — Phase 0 Antibody Gauntlet (backup, removed 2026-04-06)
 *
 * Extracted from viral_infiltration.html.  See README.md for re-integration notes.
 * Requires: Three.js r128, G global game state, showToast(), disposeObject(),
 *           createBeacon(), clearBeacon(), flashScreen() from viral_infiltration.html.
 */

// ── Constants ────────────────────────────────────────────────────────────────
const AB_FIELD_OUTER  = 74;
const AB_RECT_XMIN    = -80;
const AB_RECT_XMAX    =  80;
const AB_RECT_ZMIN    = -44;
const AB_RECT_ZMAX    =  44;
const AB_BIND_DIST    = 2.4;
const AB_IgM_DURATION = 5.0;
const AB_SITES        = 4;
const RBC_BIND_DIST     = 6.5;
const RBC_BIND_DURATION = 8.0;
const RBC_BIND_COOLDOWN = 8.0;
const RBC_SPEED_MULT    = 0.30;
const RBC_MAX_BINDS     = 2;
const AB_NON_COLORS   = [0x2196f3, 0xaaaaaa, 0xe91e63, 0x00bcd4, 0x8bc34a];
const AB_IgG_COUNT    = 54;
const AB_IgM_COUNT    = 120;
const AB_NEUTRAL_FRAC = 0.42;

// ── computePhase0Bounds ──────────────────────────────────────────────────────
function computePhase0Bounds(padding) {
  padding = padding || 8;
  const cam = G.camera;
  cam.updateProjectionMatrix();
  const camPos = cam.position;
  const ndcCorners = [
    new THREE.Vector3(-1, -1, 0.5),
    new THREE.Vector3( 1, -1, 0.5),
    new THREE.Vector3(-1,  1, 0.5),
    new THREE.Vector3( 1,  1, 0.5),
  ];
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  ndcCorners.forEach(ndc => {
    const world = ndc.unproject(cam);
    const dir   = world.sub(camPos).normalize();
    if (dir.y >= 0) return;
    const t  = -camPos.y / dir.y;
    const wx = camPos.x + t * dir.x;
    const wz = camPos.z + t * dir.z;
    xmin = Math.min(xmin, wx); xmax = Math.max(xmax, wx);
    zmin = Math.min(zmin, wz); zmax = Math.max(zmax, wz);
  });
  if (!isFinite(xmin)) return { xmin: AB_RECT_XMIN - padding, xmax: AB_RECT_XMAX + padding, zmin: AB_RECT_ZMIN - padding, zmax: AB_RECT_ZMAX + padding };
  return { xmin: xmin - padding, xmax: xmax + padding, zmin: zmin - padding, zmax: zmax + padding };
}

function _phase0SpawnPos() {
  const ang = Math.random() * Math.PI * 2;
  const r   = 66 + Math.random() * 6;
  return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
}

// ── Antibody mesh builders ───────────────────────────────────────────────────
function _abIgGMesh(color, s) {
  s = s || 1;
  const g = new THREE.Group();
  const m = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13*s, 0.13*s, 1.6*s, 6), m);
  const aL = new THREE.Mesh(new THREE.CylinderGeometry(0.09*s, 0.09*s, 1.0*s, 6), m.clone());
  const aR = new THREE.Mesh(new THREE.CylinderGeometry(0.09*s, 0.09*s, 1.0*s, 6), m.clone());
  aL.rotation.z =  Math.PI / 4; aL.position.set(-0.48*s, 1.08*s, 0);
  aR.rotation.z = -Math.PI / 4; aR.position.set( 0.48*s, 1.08*s, 0);
  const tM = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.1 });
  const tL = new THREE.Mesh(new THREE.SphereGeometry(0.14*s, 6, 6), tM);
  const tR = new THREE.Mesh(new THREE.SphereGeometry(0.14*s, 6, 6), tM.clone());
  tL.position.set(-0.82*s, 1.42*s, 0); tR.position.set( 0.82*s, 1.42*s, 0);
  g.add(stem, aL, aR, tL, tR);
  return g;
}

function _abIgMMesh(color) {
  const g = new THREE.Group();
  const mat    = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
  const tipMat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 1.1 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10), mat.clone());
  g.add(hub);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const mono = new THREE.Group();
    mono.rotation.y = a;
    const fcLen = 0.72;
    const fc = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, fcLen, 6), mat.clone());
    fc.rotation.z = Math.PI / 2; fc.position.x = 0.24 + fcLen / 2;
    mono.add(fc);
    const hingeX = 0.24 + fcLen;
    const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), mat.clone());
    hinge.position.x = hingeX;
    mono.add(hinge);
    const fabLen = 0.75, fabAng = 0.61;
    [-1, 1].forEach(sign => {
      const fg = new THREE.Group();
      fg.position.x = hingeX; fg.rotation.y = sign * fabAng;
      const fab = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, fabLen, 6), mat.clone());
      fab.rotation.z = Math.PI / 2; fab.position.x = fabLen / 2;
      fg.add(fab);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), tipMat.clone());
      tip.position.x = fabLen;
      fg.add(tip);
      mono.add(fg);
    });
    g.add(mono);
  }
  return g;
}

// ── buildPhase1AntibodyField ─────────────────────────────────────────────────
function buildPhase1AntibodyField() {
  clearPhase1Field();
  const neutColor = G.virusType ? G.virusType.playerColor : 0xff6f00;
  G._abField = { antibodies: [], sites: new Array(AB_SITES).fill(null), siteMeshes: [], active: true, failPending: false };
  for (let i = 0; i < AB_SITES; i++) {
    const geo = new THREE.SphereGeometry(0.18, 6, 6);
    const mat = new THREE.MeshPhongMaterial({ color: 0x88ffcc, emissive: 0x00ff88, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
    const sm = new THREE.Mesh(geo, mat);
    sm.userData.worldObject = true;
    G.scene.add(sm);
    G._abField.siteMeshes.push({ mesh: sm, baseAngle: (i / AB_SITES) * Math.PI * 2 });
  }
  G.abBounds = computePhase0Bounds(8);
  const spawnAb = (type, neutralizing) => {
    const b = G.abBounds;
    let x, z;
    do { x = b.xmin + Math.random() * (b.xmax - b.xmin); z = b.zmin + Math.random() * (b.zmax - b.zmin); }
    while (Math.sqrt(x*x + z*z) < 52);
    const y = 0.5 + Math.random() * 3.0;
    const color = neutralizing ? neutColor : AB_NON_COLORS[Math.floor(Math.random() * AB_NON_COLORS.length)];
    const mesh = type === 'IgG' ? _abIgGMesh(color) : _abIgMMesh(color);
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2);
    mesh.userData.worldObject = true;
    G.scene.add(mesh);
    G._abField.antibodies.push({ mesh, type, neutralizing, pos:{x,y,z}, vel:{x:(Math.random()-0.5)*2.8,y:(Math.random()-0.5)*0.4,z:(Math.random()-0.5)*2.8}, rotVel:{x:(Math.random()-0.5)*2.0,y:(Math.random()-0.5)*2.0,z:(Math.random()-0.5)*2.0}, boundSite:null, bindTimer:0, releaseCooldown:0 });
  };
  const nIgG = Math.round(AB_IgG_COUNT * AB_NEUTRAL_FRAC);
  for (let i = 0; i < AB_IgG_COUNT; i++) spawnAb('IgG', i < nIgG);
  const nIgM = Math.round(AB_IgM_COUNT * AB_NEUTRAL_FRAC);
  for (let i = 0; i < AB_IgM_COUNT; i++) spawnAb('IgM', i < nIgM);
  G._abField.spawnAb = spawnAb; G._abField.spawnTimer = 0;
  buildAntibodyCrowd();
  buildErythrocytes();
  const rec = G.receptors && G.receptors[0];
  if (rec) { G._beaconGroup = createBeacon(rec.pos.x, rec.pos.z, 0x00e676); rec.mesh.material.emissiveIntensity = 2.5; rec.mesh.material.opacity = 1.0; }
  buildPhase1HUD();
}

// ── updatePhase1Antibodies ───────────────────────────────────────────────────
function updatePhase1Antibodies(dt) {
  if (!G._abField || !G._abField.active || G._abField.failPending) return;
  const px = G.player.pos.x, pz = G.player.pos.z, t = G.totalTime;
  if (G._abField.spawnAb) {
    if (!G._abField.elapsed) G._abField.elapsed = 0;
    G._abField.elapsed += dt; G._abField.spawnTimer += dt;
    const late = G._abField.elapsed >= 15;
    while (G._abField.spawnTimer >= 1.0) {
      G._abField.spawnTimer -= 1.0;
      if (!late) { G._abField.spawnAb('IgM',true); G._abField.spawnAb('IgM',true); G._abField.spawnAb('IgM',true); G._abField.spawnAb('IgG',true); }
      else { for (let i=0;i<6;i++) G._abField.spawnAb('IgG',true); }
    }
  }
  G._abField.antibodies.forEach(ab => {
    if (ab.boundSite !== null) {
      if (ab.type === 'IgM') {
        ab.bindTimer -= dt;
        if (ab.bindTimer <= 0) {
          G._abField.sites[ab.boundSite] = null; ab.boundSite = null; ab.releaseCooldown = 7.0;
          const ang = Math.atan2(ab.pos.z - pz, ab.pos.x - px);
          ab.vel.x = Math.cos(ang) * 10; ab.vel.z = Math.sin(ang) * 10;
          showToast('IgM released — binding site freed!', 'good'); return;
        }
      }
      const orbitAngle = (ab.boundSite / AB_SITES) * Math.PI * 2 + t * 0.25;
      const r = 1.7;
      ab.pos.x = px + Math.cos(orbitAngle) * r; ab.pos.z = pz + Math.sin(orbitAngle) * r;
      ab.pos.y = 0.8 + 0.25 * Math.sin(t * 2.2 + ab.boundSite);
      ab.mesh.position.set(ab.pos.x, ab.pos.y, ab.pos.z);
    } else {
      ab.pos.x += ab.vel.x * dt; ab.pos.y += ab.vel.y * dt; ab.pos.z += ab.vel.z * dt;
      if (ab.pos.y < 0.3) { ab.pos.y = 0.3; ab.vel.y =  Math.abs(ab.vel.y)*0.6; }
      if (ab.pos.y > 4.8) { ab.pos.y = 4.8; ab.vel.y = -Math.abs(ab.vel.y)*0.6; }
      const r = Math.sqrt(ab.pos.x**2 + ab.pos.z**2), ang = Math.atan2(ab.pos.z, ab.pos.x);
      if (r < 49) { ab.vel.x += Math.cos(ang)*4*dt; ab.vel.z += Math.sin(ang)*4*dt; }
      const ab_b = G.abBounds || { xmin:AB_RECT_XMIN, xmax:AB_RECT_XMAX, zmin:AB_RECT_ZMIN, zmax:AB_RECT_ZMAX };
      if (ab.pos.x < ab_b.xmin+3) ab.vel.x += 4*dt; if (ab.pos.x > ab_b.xmax-3) ab.vel.x -= 4*dt;
      if (ab.pos.z < ab_b.zmin+3) ab.vel.z += 4*dt; if (ab.pos.z > ab_b.zmax-3) ab.vel.z -= 4*dt;
      const spd = Math.sqrt(ab.vel.x**2 + ab.vel.z**2);
      if (spd > 5) { ab.vel.x = ab.vel.x/spd*5; ab.vel.z = ab.vel.z/spd*5; }
      ab.mesh.position.set(ab.pos.x, ab.pos.y, ab.pos.z);
      if (ab.releaseCooldown > 0) ab.releaseCooldown -= dt;
      if (ab.neutralizing && ab.releaseCooldown <= 0) {
        const dx = ab.pos.x - px, dz = ab.pos.z - pz;
        if (dx*dx + dz*dz < AB_BIND_DIST * AB_BIND_DIST) {
          const freeSite = G._abField.sites.indexOf(null);
          if (freeSite !== -1) {
            G._abField.sites[freeSite] = ab; ab.boundSite = freeSite;
            if (ab.type === 'IgM') { ab.bindTimer = AB_IgM_DURATION; const left = G._abField.sites.filter(s=>s===null).length; showToast(`IgM bound — temporary! (${left} sites free)`,'warn'); }
            else { const left = G._abField.sites.filter(s=>s===null).length; showToast(`IgG locked site! (${left} sites free)`,'danger'); }
          }
        }
      }
    }
    const tumbleMult = ab.boundSite !== null ? 0.3 : 1.0;
    ab.mesh.rotation.x += ab.rotVel.x * dt * tumbleMult;
    ab.mesh.rotation.y += ab.rotVel.y * dt * tumbleMult;
    ab.mesh.rotation.z += ab.rotVel.z * dt * tumbleMult;
  });
  G._abField.siteMeshes.forEach((s, i) => {
    const a = s.baseAngle + t * 0.35;
    s.mesh.position.set(px + Math.cos(a)*1.5, 0.8, pz + Math.sin(a)*1.5);
    const bound = G._abField.sites[i];
    if (!bound) { s.mesh.material.color.setHex(0x88ffcc); s.mesh.material.emissive.setHex(0x00ff88); s.mesh.material.emissiveIntensity = 1.2; }
    else if (bound.type === 'IgM') { s.mesh.material.color.setHex(0xff9800); s.mesh.material.emissive.setHex(0xff6f00); s.mesh.material.emissiveIntensity = 1.6; }
    else { s.mesh.material.color.setHex(0xf44336); s.mesh.material.emissive.setHex(0xb71c1c); s.mesh.material.emissiveIntensity = 1.9; }
  });
  updatePhase1HUD();
}

// ── HUD ──────────────────────────────────────────────────────────────────────
function buildPhase1HUD() {
  clearPhase1HUD();
  const hud = document.createElement('div');
  hud.id = 'abGauntletHUD';
  hud.innerHTML = '<div class="abg-label">Binding Sites</div><div id="abgSites"></div><div class="abg-tip">Reach the glowing receptor with \u22651 free site</div>';
  document.getElementById('hud').appendChild(hud);
  G._abField.hudEl = hud;
  updatePhase1HUD();
}
function updatePhase1HUD() {
  if (!G._abField || !G._abField.hudEl) return;
  const el = document.getElementById('abgSites'); if (!el) return;
  el.innerHTML = G._abField.sites.map(s => { const st = s===null?'free':s.type==='IgM'?'igm':'igg'; const title = st==='free'?'Open':st==='igm'?'IgM (temporary)':'IgG (locked)'; return '<span class="abs abs-'+st+'" title="'+title+'"></span>'; }).join('');
}
function clearPhase1HUD() {
  const el = document.getElementById('abGauntletHUD'); if (el) el.remove();
}

// ── Non-neutralizing antibody crowd ─────────────────────────────────────────
const AB_CROWD_PER_COLOR = 25;
function buildAntibodyCrowd() {
  const igGGeo = new THREE.OctahedronGeometry(0.38, 0);
  const igMGeo = new THREE.TorusGeometry(0.68, 0.09, 4, 8);
  const crowd = { groups: [], dummy: new THREE.Object3D() };
  G._abField.crowd = crowd;
  AB_NON_COLORS.forEach(color => {
    const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.82 });
    [{ geo: igGGeo, label: 'IgG' }, { geo: igMGeo, label: 'IgM' }].forEach(({ geo }) => {
      const n = AB_CROWD_PER_COLOR;
      const inst = new THREE.InstancedMesh(geo, mat.clone(), n);
      inst.userData.worldObject = true;
      G.scene.add(inst);
      const pos=[], vel=[], rot=[], rotV=[];
      const cb = G.abBounds;
      for (let i=0;i<n;i++) {
        let cx,cz; do { cx=cb.xmin+Math.random()*(cb.xmax-cb.xmin); cz=cb.zmin+Math.random()*(cb.zmax-cb.zmin); } while (Math.sqrt(cx*cx+cz*cz)<52);
        pos.push({x:cx,y:0.5+Math.random()*3.5,z:cz}); vel.push({x:(Math.random()-0.5)*3,y:(Math.random()-0.5)*0.4,z:(Math.random()-0.5)*3});
        rot.push({x:Math.random()*Math.PI*2,y:Math.random()*Math.PI*2,z:Math.random()*Math.PI*2}); rotV.push({x:(Math.random()-0.5)*2.2,y:(Math.random()-0.5)*2.2,z:(Math.random()-0.5)*2.2});
        crowd.dummy.position.set(pos[i].x,pos[i].y,pos[i].z); crowd.dummy.rotation.set(rot[i].x,rot[i].y,rot[i].z); crowd.dummy.updateMatrix(); inst.setMatrixAt(i,crowd.dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      crowd.groups.push({ inst, pos, vel, rot, rotV });
    });
  });
}
function updateCrowdAntibodies(dt) {
  if (!G._abField || !G._abField.crowd) return;
  const { groups, dummy } = G._abField.crowd;
  groups.forEach(({ inst, pos, vel, rot, rotV }) => {
    for (let i=0;i<pos.length;i++) {
      const p=pos[i],v=vel[i],r=rot[i],rv=rotV[i];
      p.x+=v.x*dt; p.y+=v.y*dt; p.z+=v.z*dt;
      if (p.y<0.3){p.y=0.3;v.y=Math.abs(v.y)*0.6;} if(p.y>4.8){p.y=4.8;v.y=-Math.abs(v.y)*0.6;}
      const rad=Math.sqrt(p.x*p.x+p.z*p.z),ang=Math.atan2(p.z,p.x);
      if(rad<49){v.x+=Math.cos(ang)*4*dt;v.z+=Math.sin(ang)*4*dt;}
      const cw_b=G.abBounds||{xmin:AB_RECT_XMIN,xmax:AB_RECT_XMAX,zmin:AB_RECT_ZMIN,zmax:AB_RECT_ZMAX};
      if(p.x<cw_b.xmin+3)v.x+=4*dt; if(p.x>cw_b.xmax-3)v.x-=4*dt; if(p.z<cw_b.zmin+3)v.z+=4*dt; if(p.z>cw_b.zmax-3)v.z-=4*dt;
      const spd=Math.sqrt(v.x*v.x+v.z*v.z); if(spd>5){v.x=v.x/spd*5;v.z=v.z/spd*5;}
      r.x+=rv.x*dt;r.y+=rv.y*dt;r.z+=rv.z*dt;
      dummy.position.set(p.x,p.y,p.z); dummy.rotation.set(r.x,r.y,r.z); dummy.updateMatrix(); inst.setMatrixAt(i,dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
}

// ── Erythrocytes ─────────────────────────────────────────────────────────────
function buildErythrocytes() {
  const N = 80;
  const profile = [
    new THREE.Vector2(0.00, 0.56), new THREE.Vector2(1.20, 0.28), new THREE.Vector2(2.20, 0.08),
    new THREE.Vector2(3.40, 0.84), new THREE.Vector2(4.00, 1.00), new THREE.Vector2(4.40, 0.60),
    new THREE.Vector2(4.40,-0.60), new THREE.Vector2(4.00,-1.00), new THREE.Vector2(3.40,-0.84),
    new THREE.Vector2(2.20,-0.08), new THREE.Vector2(1.20,-0.28), new THREE.Vector2(0.00,-0.56),
  ];
  const geo = new THREE.LatheGeometry(profile, 18);
  const mat = new THREE.MeshPhongMaterial({ color:0xcc1a00, emissive:0x5a0000, emissiveIntensity:0.25, transparent:true, opacity:0.80 });
  const inst = new THREE.InstancedMesh(geo, mat, N);
  inst.userData.worldObject = true;
  G.scene.add(inst);
  const dummy = new THREE.Object3D();
  const pos=[],vel=[],rotY=[],tiltX=[],tiltZ=[],bound=[],bindTimer=[],rbcCooldown=[];
  const b = G.abBounds||{xmin:AB_RECT_XMIN,xmax:AB_RECT_XMAX,zmin:AB_RECT_ZMIN,zmax:AB_RECT_ZMAX};
  for (let i=0;i<N;i++) {
    let x,z; do { x=b.xmin+Math.random()*(b.xmax-b.xmin); z=b.zmin+Math.random()*(b.zmax-b.zmin); } while(Math.sqrt(x*x+z*z)<54);
    const y=0.5+Math.random()*2.8;
    pos.push({x,y,z}); vel.push({x:(Math.random()-0.5)*1.0,z:(Math.random()-0.5)*1.0});
    rotY.push(Math.random()*Math.PI*2); tiltX.push(Math.PI*(0.2+Math.random()*0.6)); tiltZ.push((Math.random()-0.5)*0.6);
    bound.push(false); bindTimer.push(0); rbcCooldown.push(0);
    dummy.position.set(x,y,z); dummy.rotation.set(tiltX[i],rotY[i],tiltZ[i]); dummy.scale.set(1,1,1); dummy.updateMatrix(); inst.setMatrixAt(i,dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  G._erythrocytes = { inst, dummy:new THREE.Object3D(), pos, vel, rotY, tiltX, tiltZ, bound, bindTimer, rbcCooldown };
}
function updateErythrocytes(dt) {
  if (!G._erythrocytes) return;
  const { inst,dummy,pos,vel,rotY,tiltX,tiltZ,bound,bindTimer,rbcCooldown } = G._erythrocytes;
  const b = G.abBounds||{xmin:AB_RECT_XMIN,xmax:AB_RECT_XMAX,zmin:AB_RECT_ZMIN,zmax:AB_RECT_ZMAX};
  const pp = G.player.pos;
  let totalBound=0; for(let i=0;i<bound.length;i++) if(bound[i]) totalBound++;
  let newBind=false, newRelease=false;
  for(let i=0;i<pos.length;i++) {
    const p=pos[i],v=vel[i];
    if(rbcCooldown[i]>0) rbcCooldown[i]=Math.max(0,rbcCooldown[i]-dt);
    if(bound[i]) {
      bindTimer[i]-=dt;
      const dx=pp.x-p.x,dz=pp.z-p.z,d=Math.sqrt(dx*dx+dz*dz);
      if(d>0.1){p.x+=dx*Math.min(1,5*dt);p.z+=dz*Math.min(1,5*dt);}
      v.x*=Math.max(0,1-5*dt); v.z*=Math.max(0,1-5*dt); rotY[i]+=0.08*dt;
      if(bindTimer[i]<=0){bound[i]=false;rbcCooldown[i]=RBC_BIND_COOLDOWN;totalBound--;const ang=Math.atan2(p.z-pp.z,p.x-pp.x);v.x=Math.cos(ang)*1.2;v.z=Math.sin(ang)*1.2;newRelease=true;}
    } else {
      p.x+=v.x*dt; p.z+=v.z*dt;
      const r=Math.sqrt(p.x*p.x+p.z*p.z); if(r<54){const a=Math.atan2(p.z,p.x);v.x+=Math.cos(a)*2*dt;v.z+=Math.sin(a)*2*dt;}
      if(p.x<b.xmin+5)v.x+=2*dt; if(p.x>b.xmax-5)v.x-=2*dt; if(p.z<b.zmin+5)v.z+=2*dt; if(p.z>b.zmax-5)v.z-=2*dt;
      const spd=Math.sqrt(v.x*v.x+v.z*v.z); if(spd>1.2){v.x=v.x/spd*1.2;v.z=v.z/spd*1.2;}
      rotY[i]+=0.25*dt;
      if(rbcCooldown[i]<=0&&totalBound<RBC_MAX_BINDS){const dx=pp.x-p.x,dz=pp.z-p.z;if(dx*dx+dz*dz<RBC_BIND_DIST*RBC_BIND_DIST){bound[i]=true;bindTimer[i]=RBC_BIND_DURATION;totalBound++;newBind=true;}}
    }
    dummy.position.set(p.x,p.y,p.z); dummy.rotation.set(tiltX[i],rotY[i],tiltZ[i]); dummy.scale.set(1,1,1); dummy.updateMatrix(); inst.setMatrixAt(i,dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  G.player.rbcBindCount = totalBound;
  if(newBind&&!G._rbcBindToastShown){showToast('RBC captured by HA — neuraminidase cleaving…','warn',3200);G._rbcBindToastShown=true;}
  if(newRelease&&totalBound===0){showToast('NA cleaved sialic acid — released!','info',2000);G._rbcBindToastShown=false;}
}
function clearErythrocytes() {
  if (!G._erythrocytes) return;
  disposeObject(G._erythrocytes.inst); G.scene.remove(G._erythrocytes.inst); G._erythrocytes = null;
}

// ── clearPhase1Field / triggerPhase1Fail / phaseCheck_Penetration ─────────────
function clearPhase1Field() {
  if (!G._abField) return;
  G._abField.antibodies.forEach(ab => { disposeObject(ab.mesh); G.scene.remove(ab.mesh); });
  G._abField.siteMeshes.forEach(s  => { disposeObject(s.mesh);  G.scene.remove(s.mesh); });
  if (G._abField.crowd) { G._abField.crowd.groups.forEach(cg => { disposeObject(cg.inst); G.scene.remove(cg.inst); }); }
  clearBeacon(); clearPhase1HUD(); clearErythrocytes(); G._abField = null;
}
function triggerPhase1Fail() {
  if (!G._abField || G._abField.failPending) return;
  G._abField.failPending = true;
  flashScreen('rgba(244,67,54,0.55)', 500);
  showToast('Neutralized! All 4 binding sites blocked — virion repelled.', 'danger');
  const ang = Math.atan2(G.player.pos.z, G.player.pos.x), bounce = 56;
  G.player.pos.x = Math.cos(ang)*bounce; G.player.pos.z = Math.sin(ang)*bounce;
  if (G.player.mesh)    G.player.mesh.position.set(G.player.pos.x, 0.8, G.player.pos.z);
  if (G.player.envelope) G.player.envelope.position.set(G.player.pos.x, 0.8, G.player.pos.z);
  setTimeout(() => {
    if (G.state === 'PLAYING' && G.phase === 0) {
      clearPhase1Field();
      const _rsp = _phase0SpawnPos();
      G.player.pos.x = _rsp.x; G.player.pos.z = _rsp.z;
      if (G.player.mesh)    G.player.mesh.position.set(_rsp.x, 0.8, _rsp.z);
      if (G.player.envelope) G.player.envelope.position.set(_rsp.x, 0.8, _rsp.z);
      buildPhase1AntibodyField();
      showToast('Approach again — find a gap in the antibody cloud!', 'info');
    }
  }, 2500);
}
function phaseCheck_Penetration(px, pz) {
  if (!G._abField || !G._abField.active || G._abField.failPending) return;
  const rec = G.receptors && G.receptors[0]; if (!rec) return;
  const dx = px - rec.pos.x, dz = pz - rec.pos.z;
  if (dx*dx + dz*dz > 9) return;
  const boundCount = G._abField.sites.filter(Boolean).length;
  if (boundCount >= AB_SITES) { triggerPhase1Fail(); }
  else { G.stats.abGauntletFree = AB_SITES - boundCount; completePhase(); }
}

// ── PHASE_DATA entry (for re-integration) ────────────────────────────────────
// Insert at PHASE_DATA[0] when restoring:
/*
  {
    index: 0,
    name: 'Antibody Gauntlet',
    shortName: 'Evade',
    objective: 'Navigate the extracellular antibody cloud and reach the cell surface with ≥1 binding site free',
    bio: 'The humoral immune response deploys antibodies into extracellular fluids to intercept virions before they reach host cells. IgG antibodies bind tightly and permanently block receptor-binding sites — this is neutralization. Pentameric IgM antibodies also neutralize but bind transiently. Non-matching antibodies are non-neutralizing and pass harmlessly. A virion must reach the cell surface with at least one receptor-binding site unoccupied to initiate entry.',
  },
*/
