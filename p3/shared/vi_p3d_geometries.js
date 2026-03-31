'use strict';
const P3DGeoLib = {
  // Populated by init(). All values are THREE.BufferGeometry.
  virusSphere:    null,
  endoSphere:     null,  // kept non-indexed for vertex animation in EndosomeVehicle
  endoSpherePos:  null,  // Float32Array: original vertex positions (copied at init)
  clathrin:       null,
  clathrinArm:    null,  // small cylinder — one arm of a triskelion node
  lysosomeSphere: null,
  lysoDanger:     null,
  octaM2:         null,
  boxNS1:         null,
  boxHP:          null,
  coneSpikeHA:    null,
  sphereSmall:    null,
  sphereMid:      null,
  torusRab:       null,
  torusNPC:       null,
  cylinderThin:   null,  // V-ATPase body, HA stalk segment
  cylinderFP:     null,  // fusion peptide
  capsuleMito:    null,  // mitochondrion body (cylinder + hemispheres)

  init() {
    this.virusSphere    = new THREE.SphereGeometry(0.5, 16, 16);
    // Endosome: 32×32 for smooth vertex animation
    this.endoSphere     = new THREE.SphereGeometry(P3D_CFG.A1_ENDO_RADIUS, 32, 32);
    // Copy base positions for displacement animation
    const pos = this.endoSphere.attributes.position;
    this.endoSpherePos = new Float32Array(pos.array);

    this.clathrin       = new THREE.IcosahedronGeometry(P3D_CFG.A1_ENDO_RADIUS + 0.2, 2);
    this.clathrinArm    = new THREE.CylinderGeometry(0.025, 0.025, 0.20, 5);
    this.lysosomeSphere = new THREE.SphereGeometry(1.75, 14, 14);
    this.lysoDanger     = new THREE.SphereGeometry(P3D_CFG.A1_LYSO_DANGER_R, 8, 8);
    this.octaM2         = new THREE.OctahedronGeometry(0.3);
    this.boxNS1         = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this.boxHP          = new THREE.BoxGeometry(0.25, 0.5, 0.25); // cross bar — second box added in code
    this.coneSpikeHA    = new THREE.ConeGeometry(0.07, 0.38, 6);
    this.sphereSmall    = new THREE.SphereGeometry(0.10, 6, 6);
    this.sphereMid      = new THREE.SphereGeometry(0.40, 10, 10);
    this.torusRab       = new THREE.TorusGeometry(0.20, 0.04, 8, 16);
    this.torusNPC       = new THREE.TorusGeometry(0.30, 0.08, 8, 16);
    this.cylinderThin   = new THREE.CylinderGeometry(0.07, 0.07, 0.88, 8);
    this.cylinderFP     = new THREE.CylinderGeometry(0.04, 0.04, 0.6,  6);
    // Mitochondrion: cylinder with rounded caps approximated by a stretched sphere
    this.capsuleMito    = new THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.6, 2.5, 6, 12)  // Three r128 may lack CapsuleGeometry
      : new THREE.SphereGeometry(0.7, 10, 10);       // fallback
  },

  dispose() {
    Object.values(this).forEach(v => {
      if (v && typeof v.dispose === 'function') v.dispose();
    });
  },
};

// Small helper: CapsuleGeometry shim for Three r128 which lacks it natively
if (!THREE.CapsuleGeometry) {
  THREE.CapsuleGeometry = function(radius, length, capSegs, radSegs) {
    // Build from a cylinder + two hemisphere caps
    const cyl = new THREE.CylinderGeometry(radius, radius, length, radSegs, 1, true);
    const top = new THREE.SphereGeometry(radius, radSegs, capSegs, 0, Math.PI * 2, 0, Math.PI / 2);
    const bot = new THREE.SphereGeometry(radius, radSegs, capSegs, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    // Translate top/bot caps
    top.translate(0,  length / 2, 0);
    bot.translate(0, -length / 2, 0);
    return THREE.BufferGeometryUtils
      ? THREE.BufferGeometryUtils.mergeBufferGeometries([cyl, top, bot])
      : cyl; // ultra-fallback: just the cylinder
  };
}
