'use strict';

const P3D_FACTS = {
  ENDOCYTOSIS_START: 'Receptor-mediated endocytosis — the cell has engulfed the virus in a clathrin-coated vesicle. This is how many viruses enter cells: they trick the cell into swallowing them.',
  CLATHRIN_SHED:     'The clathrin coat disassembles within seconds of vesicle formation. Clathrin is recycled back to the plasma membrane for reuse.',
  RAB5_EARLY:        'Early endosome — Rab5 GTPase is active on the vesicle surface. Rab proteins act as molecular address labels, directing vesicle trafficking.',
  RAB7_LATE:         'Late endosome — Rab5 has been replaced by Rab7 through the Rab conversion process. The vesicle is now committed to the degradative pathway unless the virus escapes.',
  LYSO_THREAT:       'Lysosomes contain over 60 types of hydrolytic enzymes at pH ~4.5. If one fuses with your endosome, the virus is digested. This is a major cellular defense.',
  LYSO_NEAR:         'Close call! The cell is actively directing lysosomes toward endosomes. The virus must escape before lysosomal fusion occurs.',
  LYSO_HOMING:       'This lysosome is tracking your vesicle. Late endosomes and lysosomes are both directed by Rab7 and motor proteins — they\'re on a collision course.',
  MITO_BUMP:         'Mitochondria — the cell\'s powerhouses, generating ATP through oxidative phosphorylation. They\'re densely packed in the cytoplasm.',
  ER_PASS:           'The endoplasmic reticulum — a continuous membrane network where proteins are synthesized and folded. It occupies a huge fraction of the cytoplasm volume.',
  M2_PREP:           'M2 ion channel preparation — at low pH, the M2 proton channel will let H⁺ ions into the virion, acidifying its interior and loosening the genome from the M1 matrix protein.',
  NS1_STOCKPILE:     'NS1 — influenza\'s multifunctional immune evasion protein. It suppresses interferon signaling, inhibits host mRNA processing, and sequesters dsRNA from innate immune sensors.',
  VATPASE:           'V-ATPases are proton pumps embedded in the endosomal membrane. They actively pump H⁺ ions into the lumen, driving acidification. The virus exploits this normal cellular process.',
  HA_LOOSEN:         'The HA globular heads are loosening. At pH ~6.0, acid-sensitive contacts between HA1 subunits weaken, allowing the heads to separate and expose the HA2 stalk beneath.',
  FP_EXPOSED:        'The fusion peptide is exposed — a ~20 amino acid hydrophobic sequence that was buried inside the HA trimer. It\'s a molecular harpoon: once deployed, it embeds in the target membrane.',
  CC_EXTEND:         'The coiled-coil has extended. The HA2 spring-loaded mechanism has fired — the fusion peptide now sits atop a dramatically elongated stalk, reaching toward the endosomal membrane.',
  FP_INSERT:         'Fusion peptide inserted into the endosomal membrane. The HA trimer is now a molecular bridge anchored in both the viral envelope and the endosomal membrane.',
  FUSION_DONE:       'HA-mediated membrane fusion is complete. The conformational change is irreversible — the trimer has snapped into its lowest energy state, pulling both membranes together.',
  AB_BLOCK:          'Neutralizing antibodies can bind HA and physically block the conformational change. This is exactly how flu vaccines work — they generate antibodies that prevent fusion.',
  HEMIFUSION:        'Hemifusion stalk — the outer lipid leaflets of both membranes have merged, but the inner leaflets remain intact. This is a real intermediate state in membrane fusion.',
  PORE_FORM:         'A fusion pore has opened. The endosome lumen is now continuous with the cytoplasm. The viral genome can escape.',
  VRNP_EXIT:         'The vRNP complex — viral RNA wrapped in nucleoprotein (NP) with the polymerase complex (PB1, PB2, PA) attached — is escaping into the cytoplasm.',
  DYNEIN:            'The vRNP complexes hijack the cell\'s dynein motor proteins for transport along microtubules toward the nucleus. Nuclear localization signals on NP direct this trafficking.',
  NPC_APPROACH:      'The nuclear pore complex (NPC) — a massive ~125 MDa structure with 8-fold symmetry. It controls all traffic in and out of the nucleus.',
  NPC_IMPORT:        'Nuclear import — importin-α recognizes the nuclear localization signal on NP protein. The importin-α/β heterodimer mediates transport through the NPC. Inside, RanGTP releases the cargo.',
  ALL_IN_NUCLEUS:    'All vRNP segments have entered the nucleus. The viral RNA-dependent RNA polymerase will now begin transcribing and replicating the viral genome using the host cell\'s machinery.',
  // Edge-case educational notes
  PARTIAL_GENOME:    'Note: fewer than 8 segments reached the nucleus. Influenza requires all 8 RNA segments for a complete replication cycle. Reassortment with co-infecting strains could compensate.',
  IMMUNE_FAIL:       'Membrane fusion was blocked by IFITM restriction factors and neutralizing antibodies. The virus remains trapped in the endosome and will be degraded.',
};

class P3DEducationSystem {
  constructor() {
    this._seen   = new Set();
    this._queue  = [];
    this._hud    = null;
    this._log    = [];  // ordered list of triggered factIds (for debrief)
  }

  setHUD(hud) { this._hud = hud; }

  trigger(factId) {
    if (this._seen.has(factId)) return;
    const text = P3D_FACTS[factId];
    if (!text) return;
    this._seen.add(factId);
    this._log.push(factId);
    if (this._hud) this._hud.showEduTicker(text);
    // Fire the external callback if set
    if (window.P3Descent && typeof P3Descent._onEduTrigger === 'function') {
      P3Descent._onEduTrigger(factId);
    }
  }

  getLog() { return this._log.slice(); }

  reset() { this._seen.clear(); this._log = []; }
}
