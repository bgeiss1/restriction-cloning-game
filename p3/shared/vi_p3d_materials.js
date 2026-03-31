'use strict';
const P3DMatLib = {
  // Populated by init(); all keys are THREE.Material instances.
  endosome:    null,
  clathrin:     null,  // LineBasicMaterial for edge lattice
  clathrinNode: null,  // MeshPhongMaterial for triskelion arms
  virus:       null,
  haHead:      null,
  haStalk:     null,
  fp:          null,
  m2Closed:    null,
  m2Open:      null,
  vrnp:        [],   // 8 materials, one per segment
  m1:          null,
  lysosome:    null,
  lysoDanger:  null,
  mito:        null,
  mitoWire:    null,
  er:          null,
  filament:    null,
  rab5:        null,
  rab7:        null,
  vtpase:      null,
  collectM2:   null,
  collectNS1:  null,
  collectHP:   null,
  nucleus:     null,
  npc:         null,
  proton:      null,
  importin:    null,
  ambientPts:  null,

  init() {
    const C = P3D_CFG;
    this.endosome   = new THREE.MeshPhongMaterial({ color: C.PH_KEYFRAMES[0].endo, emissive: 0x112255, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false });
    this.clathrin     = new THREE.LineBasicMaterial({ color: 0xddcc99, transparent: true, opacity: 0.70 });
    this.clathrinNode = new THREE.MeshPhongMaterial({ color: C.COL_CLATHRIN, emissive: 0x443322, emissiveIntensity: 0.45, shininess: 40, transparent: true, opacity: 0.65 });
    this.virus      = new THREE.MeshPhongMaterial({ color: C.COL_VIRUS, emissive: 0x441100, shininess: 80 });
    this.haHead     = new THREE.MeshPhongMaterial({ color: C.COL_HA, emissive: C.COL_HA_EM, emissiveIntensity: 0.1, shininess: 100 });
    this.haStalk    = new THREE.MeshPhongMaterial({ color: 0x009966, emissive: 0x003322, shininess: 60 });
    this.fp         = new THREE.MeshPhongMaterial({ color: C.COL_FP, emissive: C.COL_FP, emissiveIntensity: 0.6, transparent: true, opacity: 0 });
    this.m2Closed   = new THREE.MeshPhongMaterial({ color: C.COL_M2_CLOSED, emissive: 0x001144, shininess: 120 });
    this.m2Open     = new THREE.MeshPhongMaterial({ color: C.COL_M2_OPEN,   emissive: 0x004444, shininess: 120 });
    // 8 vRNP materials — slight color variations around warm gold
    this.vrnp = P3D_CFG.A3_VRNP_COLS.map(col =>
      new THREE.MeshPhongMaterial({ color: col, emissive: 0x221100, emissiveIntensity: 0.2, shininess: 60 })
    );
    this.m1         = new THREE.MeshBasicMaterial({ color: C.COL_M1, wireframe: true, transparent: true, opacity: 0.6 });
    this.lysosome   = new THREE.MeshPhongMaterial({ color: C.COL_LYSO, emissive: 0x550000, emissiveIntensity: 0.5, shininess: 40 });
    this.lysoDanger = new THREE.MeshBasicMaterial({ color: C.COL_LYSO, transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false });
    this.mito       = new THREE.MeshPhongMaterial({ color: C.COL_MITO, transparent: true, opacity: 0.85, shininess: 30 });
    this.mitoWire   = new THREE.MeshBasicMaterial({ color: 0x336644, wireframe: true, transparent: true, opacity: 0.3 });
    this.er         = new THREE.MeshPhongMaterial({ color: C.COL_ER,  transparent: true, opacity: 0.45, shininess: 40, side: THREE.DoubleSide, depthWrite: false });
    this.filament   = new THREE.MeshBasicMaterial({ color: C.COL_CYTO, transparent: true, opacity: 0.40 });
    this.rab5       = new THREE.MeshBasicMaterial({ color: C.COL_RAB5, transparent: true, opacity: 0.85 });
    this.rab7       = new THREE.MeshBasicMaterial({ color: C.COL_RAB7, transparent: true, opacity: 0.85 });
    this.vtpase     = new THREE.MeshPhongMaterial({ color: 0xcc4400, emissive: 0x441100, emissiveIntensity: 0.4, shininess: 60 });
    this.collectM2  = new THREE.MeshPhongMaterial({ color: C.COL_M2_TOK,    emissive: 0x112244, emissiveIntensity: 0.3, shininess: 100 });
    this.collectNS1 = new THREE.MeshPhongMaterial({ color: C.COL_NS1_TOK,   emissive: 0x220033, emissiveIntensity: 0.3, shininess: 100 });
    this.collectHP  = new THREE.MeshPhongMaterial({ color: C.COL_HEALTH_TOK, emissive: 0x004400, emissiveIntensity: 0.3, shininess: 100 });
    this.nucleus    = new THREE.MeshPhongMaterial({ color: C.COL_NUCLEUS, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, emissive: 0x221166, emissiveIntensity: 0.4 });
    this.npc        = new THREE.MeshPhongMaterial({ color: C.COL_NPC, emissive: C.COL_NPC, emissiveIntensity: 0.5, shininess: 80 });
    this.proton     = new THREE.PointsMaterial({ color: C.COL_PROTON, size: 0.08, transparent: true, opacity: 0.9, sizeAttenuation: true });
    this.importin   = new THREE.MeshPhongMaterial({ color: C.COL_IMPORTIN, shininess: 60 });
    this.ambientPts = new THREE.PointsMaterial({ color: 0xaabbcc, size: 0.06, transparent: true, opacity: 0.12, sizeAttenuation: true });
  },

  // Update pH-sensitive materials each frame
  applyPH(pH) {
    const col = P3DPHSystem.interpKF(pH, 'endo');
    if (this.endosome) this.endosome.color.setHex(col);
    // HA emissive intensity rises as pH drops toward fusion
    if (this.haHead) {
      const t = Math.max(0, Math.min(1, (7.4 - pH) / (7.4 - 5.3)));
      this.haHead.emissiveIntensity = 0.1 + t * 0.5;
    }
  },

  dispose() {
    const skip = new Set(['vrnp']);
    Object.entries(this).forEach(([k, v]) => {
      if (k === 'vrnp') { v.forEach(m => m && m.dispose()); return; }
      if (v && typeof v.dispose === 'function') v.dispose();
    });
    this.vrnp = [];
  },
};
