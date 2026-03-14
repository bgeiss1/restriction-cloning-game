/**
 * enzymes.js — Restriction enzyme database and cut/ligation logic
 * for Sticky Ends.
 *
 * All exports are attached to window globals (no ES modules).
 * Usage:  <script src="enzymes.js"></script>
 *         EnzymeDB, findCutSites, cutDNA, areEndsCompatible,
 *         predictVariants, reverseComplement
 */

'use strict';

// ---------------------------------------------------------------------------
// Utility: reverse-complement a DNA string (A↔T, G↔C, 5'→3')
// ---------------------------------------------------------------------------
function reverseComplement(seq) {
    const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
    return seq
        .toUpperCase()
        .split('')
        .reverse()
        .map(b => comp[b] || 'N')
        .join('');
}

// ---------------------------------------------------------------------------
// Enzyme database
//
// Each entry:
//   name              — enzyme name string
//   recognitionSeq    — recognition sequence (top strand, 5'→3')
//   cutPositionTop    — 0-based index WITHIN the recognition sequence where
//                       the top strand is cut (between index-1 and index)
//   cutPositionBottom — 0-based index within the recognition sequence where
//                       the bottom strand is cut (read 3'→5', so this is
//                       counted from the 5' end of the bottom strand =
//                       from the RIGHT end of the top-strand recognition seq)
//   overhangType      — '5prime' | '3prime' | 'blunt'
//   overhangLength    — number of unpaired bases in the overhang
//   overhangSeq       — the single-stranded overhang sequence (5'→3' top
//                       strand convention for 5' overhangs; 3'→5' for 3')
//   compatibleWith    — optional array of enzyme names whose overhangs can
//                       ligate with this one (including self)
//   destroysSiteWith  — optional array: ligation with these partners destroys
//                       BOTH original recognition sites
// ---------------------------------------------------------------------------
const EnzymeDB = {

    EcoRI: {
        name: 'EcoRI',
        recognitionSeq: 'GAATTC',
        // G^AATTC  — cut after position 1 on top strand
        cutPositionTop: 1,      // cut between G and A
        cutPositionBottom: 5,   // cut between G and AATT (complement side)
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'AATT',
        compatibleWith: ['EcoRI'],
        destroysSiteWith: []
    },

    BamHI: {
        name: 'BamHI',
        recognitionSeq: 'GGATCC',
        // G^GATCC
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'GATC',
        compatibleWith: ['BamHI', 'BclI', 'MboI', 'Sau3AI'],
        destroysSiteWith: []
    },

    HindIII: {
        name: 'HindIII',
        recognitionSeq: 'AAGCTT',
        // A^AGCTT
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'AGCT',
        compatibleWith: ['HindIII'],
        destroysSiteWith: []
    },

    SalI: {
        name: 'SalI',
        recognitionSeq: 'GTCGAC',
        // G^TCGAC
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'TCGA',
        // Ligation of SalI + XhoI destroys both recognition sites
        compatibleWith: ['SalI', 'XhoI'],
        destroysSiteWith: ['XhoI']
    },

    XhoI: {
        name: 'XhoI',
        recognitionSeq: 'CTCGAG',
        // C^TCGAG
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'TCGA',
        compatibleWith: ['XhoI', 'SalI'],
        destroysSiteWith: ['SalI']
    },

    PstI: {
        name: 'PstI',
        recognitionSeq: 'CTGCAG',
        // CTGCA^G — 3' overhang
        cutPositionTop: 5,      // cut between A and G on top strand
        cutPositionBottom: 1,   // cut between C and TGCA on bottom strand
        overhangType: '3prime',
        overhangLength: 4,
        overhangSeq: 'TGCA',   // 3' overhang, top strand (read 3'→5')
        compatibleWith: ['PstI'],
        destroysSiteWith: []
    },

    KpnI: {
        name: 'KpnI',
        recognitionSeq: 'GGTACC',
        // GGTAC^C — 3' overhang
        cutPositionTop: 5,
        cutPositionBottom: 1,
        overhangType: '3prime',
        overhangLength: 4,
        overhangSeq: 'GTAC',
        compatibleWith: ['KpnI', 'Acc65I'],
        destroysSiteWith: []
    },

    SmaI: {
        name: 'SmaI',
        recognitionSeq: 'CCCGGG',
        // CCC^GGG — blunt
        cutPositionTop: 3,
        cutPositionBottom: 3,
        overhangType: 'blunt',
        overhangLength: 0,
        overhangSeq: '',
        compatibleWith: ['SmaI', 'EcoRV', 'StuI', 'ScaI', 'PvuII', 'SspI', 'HincII'],
        destroysSiteWith: []
    },

    EcoRV: {
        name: 'EcoRV',
        recognitionSeq: 'GATATC',
        // GAT^ATC — blunt
        cutPositionTop: 3,
        cutPositionBottom: 3,
        overhangType: 'blunt',
        overhangLength: 0,
        overhangSeq: '',
        compatibleWith: ['EcoRV', 'SmaI', 'StuI', 'ScaI', 'PvuII', 'SspI', 'HincII'],
        destroysSiteWith: []
    },

    NotI: {
        name: 'NotI',
        recognitionSeq: 'GCGGCCGC',
        // GC^GGCCGC — 5' overhang GGCC
        cutPositionTop: 2,
        cutPositionBottom: 6,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'GGCC',
        compatibleWith: ['NotI'],
        destroysSiteWith: []
    },

    XbaI: {
        name: 'XbaI',
        recognitionSeq: 'TCTAGA',
        // T^CTAGA
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'CTAG',
        // XbaI + SpeI ligation destroys both sites; XbaI + NheI destroys both
        compatibleWith: ['XbaI', 'SpeI', 'NheI'],
        destroysSiteWith: ['SpeI', 'NheI']
    },

    SpeI: {
        name: 'SpeI',
        recognitionSeq: 'ACTAGT',
        // A^CTAGT
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'CTAG',
        compatibleWith: ['SpeI', 'XbaI', 'NheI'],
        destroysSiteWith: ['XbaI', 'NheI']
    },

    NheI: {
        name: 'NheI',
        recognitionSeq: 'GCTAGC',
        // G^CTAGC
        cutPositionTop: 1,
        cutPositionBottom: 5,
        overhangType: '5prime',
        overhangLength: 4,
        overhangSeq: 'CTAG',
        compatibleWith: ['NheI', 'XbaI', 'SpeI'],
        destroysSiteWith: ['XbaI', 'SpeI']
    }
};

// ---------------------------------------------------------------------------
// findCutSites(sequence, enzymeName[, circular])
//
// Searches a DNA sequence for all occurrences of the recognition sequence
// (both strands). Returns an array of cut-site descriptor objects.
//
// Each returned object:
//   {
//     position      : absolute 0-based start of the recognition seq in `sequence`
//     strand        : 1 (top) or -1 (bottom / complement strand found)
//     enzyme        : enzyme name string
//     recognitionSeq: the match as found
//     overhangSeq   : the overhang sequence
//     overhangType  : '5prime' | '3prime' | 'blunt'
//     topStrandCut  : absolute position in `sequence` where top strand is cut
//     bottomStrandCut: absolute position where bottom strand is cut
//   }
//
// For circular DNA, pass circular=true and the function will wrap around.
// ---------------------------------------------------------------------------
function findCutSites(sequence, enzymeName, circular = false) {
    const enzyme = EnzymeDB[enzymeName];
    if (!enzyme) {
        console.warn(`findCutSites: unknown enzyme "${enzymeName}"`);
        return [];
    }

    const seq       = sequence.toUpperCase();
    const recog     = enzyme.recognitionSeq.toUpperCase();
    const recogRC   = reverseComplement(recog);
    const seqLen    = seq.length;
    const sites     = [];

    // Helper: search for `pattern` in `str` from position `start`
    function searchLinear(str, pattern, startPos) {
        const hits = [];
        let idx = str.indexOf(pattern, startPos);
        while (idx !== -1) {
            hits.push(idx);
            idx = str.indexOf(pattern, idx + 1);
        }
        return hits;
    }

    // --- Top-strand search ---
    for (const pos of searchLinear(seq, recog, 0)) {
        sites.push({
            position:        pos,
            strand:          1,
            enzyme:          enzyme.name,
            recognitionSeq:  recog,
            overhangSeq:     enzyme.overhangSeq,
            overhangType:    enzyme.overhangType,
            overhangLength:  enzyme.overhangLength,
            // absolute cut positions
            topStrandCut:    pos + enzyme.cutPositionTop,
            bottomStrandCut: pos + enzyme.cutPositionBottom
        });
    }

    // --- Bottom-strand search (= reverse complement of top strand) ---
    // Only add if the reverse complement differs from the recognition seq
    // (palindromes would double-count)
    if (recogRC !== recog) {
        for (const pos of searchLinear(seq, recogRC, 0)) {
            // On the bottom strand, cut positions are mirrored
            // The recognition seq spans [pos, pos+len), so the "top-strand cut"
            // and "bottom-strand cut" are measured from the 5' end of the hit
            const len = recog.length;
            sites.push({
                position:        pos,
                strand:          -1,
                enzyme:          enzyme.name,
                recognitionSeq:  recogRC,
                overhangSeq:     reverseComplement(enzyme.overhangSeq),
                overhangType:    enzyme.overhangType,
                overhangLength:  enzyme.overhangLength,
                // For bottom-strand hit, swap cut positions (mirror around centre)
                topStrandCut:    pos + (len - enzyme.cutPositionBottom),
                bottomStrandCut: pos + (len - enzyme.cutPositionTop)
            });
        }
    }

    // --- Circular wrap-around ---
    if (circular && recog.length > 1) {
        // Build the wrap-around segment: last (recogLen-1) bases + first (recogLen-1) bases
        const tail  = seq.slice(-(recog.length - 1));
        const head  = seq.slice(0, recog.length - 1);
        const wrap  = tail + head;

        for (const pos of searchLinear(wrap, recog, 0)) {
            // Only record if the match actually crosses the origin
            const absPos = (seqLen - (recog.length - 1) + pos) % seqLen;
            // Avoid duplicates of sites already found
            const alreadyFound = sites.some(s => s.position === absPos && s.strand === 1);
            if (!alreadyFound) {
                sites.push({
                    position:        absPos,
                    strand:          1,
                    enzyme:          enzyme.name,
                    recognitionSeq:  recog,
                    overhangSeq:     enzyme.overhangSeq,
                    overhangType:    enzyme.overhangType,
                    overhangLength:  enzyme.overhangLength,
                    topStrandCut:    (absPos + enzyme.cutPositionTop)    % seqLen,
                    bottomStrandCut: (absPos + enzyme.cutPositionBottom) % seqLen,
                    crossesOrigin:   true
                });
            }
        }

        if (recogRC !== recog) {
            for (const pos of searchLinear(wrap, recogRC, 0)) {
                const len    = recog.length;
                const absPos = (seqLen - (len - 1) + pos) % seqLen;
                const alreadyFound = sites.some(s => s.position === absPos && s.strand === -1);
                if (!alreadyFound) {
                    sites.push({
                        position:        absPos,
                        strand:          -1,
                        enzyme:          enzyme.name,
                        recognitionSeq:  recogRC,
                        overhangSeq:     reverseComplement(enzyme.overhangSeq),
                        overhangType:    enzyme.overhangType,
                        overhangLength:  enzyme.overhangLength,
                        topStrandCut:    (absPos + (len - enzyme.cutPositionBottom)) % seqLen,
                        bottomStrandCut: (absPos + (len - enzyme.cutPositionTop))    % seqLen,
                        crossesOrigin:   true
                    });
                }
            }
        }
    }

    // Sort by top-strand cut position
    sites.sort((a, b) => a.topStrandCut - b.topStrandCut);
    return sites;
}

// ---------------------------------------------------------------------------
// cutDNA(sequence, cutSite)
//
// Cuts a linear DNA string at a given cut site descriptor (as returned by
// findCutSites). Returns an object describing the two resulting fragments:
//
//   {
//     left: {
//       sequence    : string — full sequence of the left fragment (including
//                     any 3' overhang bases that are part of this strand)
//       topEnd      : { type, overhangSeq, strand }  — the RIGHT end of left frag
//       bottomEnd   : { type, overhangSeq, strand }  — same end, bottom strand
//     },
//     right: { sequence, topEnd, bottomEnd }
//   }
//
// For simplicity we model the sequence as the top strand only and track
// the ends as metadata. The bottom strand is inferred via reverseComplement.
// ---------------------------------------------------------------------------
function cutDNA(sequence, cutSite) {
    const seq          = sequence.toUpperCase();
    const topCut       = cutSite.topStrandCut;
    const bottomCut    = cutSite.bottomStrandCut;
    const overhangType = cutSite.overhangType;
    const overhangSeq  = cutSite.overhangSeq;

    // Split on the top-strand cut position
    const leftSeq  = seq.slice(0, topCut);
    const rightSeq = seq.slice(topCut);

    // Determine end descriptors — each fragment gets a "right end" and "left end"
    // Left fragment: its rightmost end is the cut end
    // Right fragment: its leftmost end is the cut end

    let leftRightEnd, rightLeftEnd;

    if (overhangType === '5prime') {
        // 5' overhang on the right fragment's left end
        // The top strand of the right fragment starts with the overhang bases
        leftRightEnd = {
            type:       '5prime',
            overhangSeq: overhangSeq,        // recessed 3' end on left frag
            strand:      'top_recessed'
        };
        rightLeftEnd = {
            type:       '5prime',
            overhangSeq: overhangSeq,        // protruding 5' end on right frag
            strand:      'bottom_recessed'
        };
    } else if (overhangType === '3prime') {
        // 3' overhang on the left fragment's right end
        leftRightEnd = {
            type:       '3prime',
            overhangSeq: overhangSeq,
            strand:      'top_protruding'
        };
        rightLeftEnd = {
            type:       '3prime',
            overhangSeq: overhangSeq,
            strand:      'bottom_protruding'
        };
    } else {
        // Blunt
        leftRightEnd  = { type: 'blunt', overhangSeq: '', strand: 'blunt' };
        rightLeftEnd  = { type: 'blunt', overhangSeq: '', strand: 'blunt' };
    }

    return {
        enzyme: cutSite.enzyme,
        cutPosition: topCut,
        left: {
            sequence:   leftSeq,
            length:     leftSeq.length,
            rightEnd:   leftRightEnd,   // the cut end
            leftEnd:    null            // original terminus (undefined for fragments from longer cuts)
        },
        right: {
            sequence:   rightSeq,
            length:     rightSeq.length,
            leftEnd:    rightLeftEnd,   // the cut end
            rightEnd:   null
        }
    };
}

// ---------------------------------------------------------------------------
// areEndsCompatible(end1, end2)
//
// Determines whether two DNA ends can be ligated.
// Each `end` object should have:
//   { type: '5prime'|'3prime'|'blunt', overhangSeq: string, enzyme: string }
//
// Returns:
//   {
//     compatible:    boolean,
//     destroysSite:  boolean,   // ligation regenerates a mutant/hybrid site
//     note:          string     // human-readable explanation
//   }
// ---------------------------------------------------------------------------
function areEndsCompatible(end1, end2) {
    const seq1  = (end1.overhangSeq || '').toUpperCase();
    const seq2  = (end2.overhangSeq || '').toUpperCase();
    const type1 = end1.type === '5prime' ? "5'" : end1.type === '3prime' ? "3'" : 'blunt';
    const type2 = end2.type === '5prime' ? "5'" : end2.type === '3prime' ? "3'" : 'blunt';

    // Human-readable end label: "EcoRI (5' AATT)"
    function endLabel(name, type, seq) {
        if (!name) return seq ? `${type} ${seq}` : type;
        return seq ? `${name} (${type} ${seq})` : `${name} (${type})`;
    }
    const label1 = endLabel(end1.enzyme, type1, seq1);
    const label2 = endLabel(end2.enzyme, type2, seq2);

    // Both must be the same overhang type
    if (end1.type !== end2.type) {
        return {
            compatible:   false,
            destroysSite: false,
            note: `${label1} cannot ligate with ${label2} — mismatched overhang types (${type1} vs ${type2}).`
        };
    }

    // Blunt ends are always compatible with each other
    if (end1.type === 'blunt') {
        return {
            compatible:   true,
            destroysSite: false,
            note: 'Blunt ends are compatible (ligation efficiency is low without complementary overhangs).'
        };
    }

    // For sticky ends: overhangs must be reverse complements of each other
    const rc2   = reverseComplement(seq2);
    const anneal = (seq1 === rc2) || (reverseComplement(seq1) === seq2);

    if (!anneal) {
        return {
            compatible:   false,
            destroysSite: false,
            note: `${label1} and ${label2} — overhangs are not complementary and cannot ligate.`
        };
    }

    // Check whether ligation destroys the recognition site
    let destroysSite = false;
    let destroyNote  = '';

    const enz1 = end1.enzyme ? EnzymeDB[end1.enzyme] : null;
    const enz2 = end2.enzyme ? EnzymeDB[end2.enzyme] : null;

    if (enz1 && enz2 && enz1.name !== enz2.name) {
        if (
            (enz1.destroysSiteWith && enz1.destroysSiteWith.includes(enz2.name)) ||
            (enz2.destroysSiteWith && enz2.destroysSiteWith.includes(enz1.name))
        ) {
            destroysSite = true;
            destroyNote  = ` Note: ligation of ${enz1.name} + ${enz2.name} ends creates a hybrid site not cut by either enzyme.`;
        }
    }

    return {
        compatible:   true,
        destroysSite: destroysSite,
        note: `${label1} anneals with ${label2}.` + destroyNote
    };
}

// ---------------------------------------------------------------------------
// predictVariants(vectorEnds, insertEnds)
//
// Given two ends of a linearised vector and two ends of an insert fragment,
// predicts the possible ligation products.
//
// Parameters:
//   vectorEnds : { left: endObj, right: endObj }  — left/right ends of vector
//   insertEnds : { left: endObj, right: endObj }  — left/right ends of insert
//
// Each endObj: { type, overhangSeq, enzyme }
//
// Returns:
//   {
//     count:       number of distinct ligation products,
//     variants:    [ {description, orientation, selfLigation}, … ],
//     explanation: string
//   }
// ---------------------------------------------------------------------------
function predictVariants(vectorEnds, insertEnds) {
    const variants = [];

    // Helper: check both pairings for a given insert orientation
    function checkOrientation(iLeft, iRight, label) {
        const leftOK  = areEndsCompatible(vectorEnds.left,  iLeft);
        const rightOK = areEndsCompatible(vectorEnds.right, iRight);

        if (leftOK.compatible && rightOK.compatible) {
            const destroys = leftOK.destroysSite || rightOK.destroysSite;
            variants.push({
                description:  `Insert in ${label} orientation`,
                orientation:  label,
                selfLigation: false,
                destroysSite: destroys,
                notes: [leftOK.note, rightOK.note].filter(Boolean).join(' | ')
            });
        }
    }

    // Orientation 1: insert left → vector left, insert right → vector right
    checkOrientation(insertEnds.left, insertEnds.right, 'forward');

    // Orientation 2: insert in reverse (right end pairs with vector left)
    // Overhang sequences are the same object but "seen from the other side"
    const revInsertLeft  = {
        type:        insertEnds.right.type,
        overhangSeq: reverseComplement(insertEnds.right.overhangSeq || ''),
        enzyme:      insertEnds.right.enzyme
    };
    const revInsertRight = {
        type:        insertEnds.left.type,
        overhangSeq: reverseComplement(insertEnds.left.overhangSeq || ''),
        enzyme:      insertEnds.left.enzyme
    };
    checkOrientation(revInsertLeft, revInsertRight, 'reverse');

    // Self-ligation of vector (no insert)
    const selfLig = areEndsCompatible(vectorEnds.left, vectorEnds.right);
    if (selfLig.compatible) {
        variants.push({
            description:  'Vector self-ligation (no insert)',
            orientation:  'none',
            selfLigation: true,
            destroysSite: selfLig.destroysSite,
            notes:        selfLig.note
        });
    }

    // Self-ligation of insert
    const insertSelf = areEndsCompatible(insertEnds.left, insertEnds.right);
    if (insertSelf.compatible) {
        variants.push({
            description:  'Insert self-ligation (circularised insert)',
            orientation:  'none',
            selfLigation: true,
            destroysSite: insertSelf.destroysSite,
            notes:        insertSelf.note
        });
    }

    // Build a human-readable explanation
    const lines = [`Predicted ligation variants (${variants.length} total):`];
    variants.forEach((v, i) => {
        lines.push(
            `  ${i + 1}. ${v.description}` +
            (v.destroysSite ? ' [site destroyed on ligation]' : '') +
            (v.selfLigation ? ' [background product]' : '')
        );
        if (v.notes) lines.push(`       ${v.notes}`);
    });

    if (variants.length === 0) {
        lines.push('  None — ends are not compatible.');
    }

    // Directional cloning flag
    const directional = variants.some(v => v.orientation === 'forward') &&
                        !variants.some(v => v.orientation === 'reverse');
    if (directional) {
        lines.push('\n  Directional cloning: insert can only ligate in one orientation.');
    } else if (
        variants.some(v => v.orientation === 'forward') &&
        variants.some(v => v.orientation === 'reverse')
    ) {
        lines.push('\n  Non-directional: insert can ligate in both orientations — use directional strategy (different enzymes) for predictable results.');
    }

    return {
        count:       variants.length,
        variants:    variants,
        explanation: lines.join('\n'),
        directional: directional
    };
}

// ---------------------------------------------------------------------------
// Attach everything to window so other scripts can use these without modules
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// digestPlasmid(plasmid, enzymeNames)
//
// Cut a circular plasmid with one or more enzymes and return an array of
// Fragment objects sorted by cut position.
//
// Fragment: { id, size, sequence, features[], leftEnd, rightEnd,
//             angleStart, angleEnd, midAngle }
// leftEnd / rightEnd: { enzyme, overhang, type }
// ---------------------------------------------------------------------------
function digestPlasmid(plasmid, enzymeNames) {
    const allSites = [];
    for (const name of enzymeNames) {
        if (!EnzymeDB[name]) continue;
        const sites = findCutSites(plasmid.sequence, name, /* circular= */ true);
        for (const site of sites) allSites.push({ ...site, enzymeName: name });
    }
    allSites.sort((a, b) => a.topStrandCut - b.topStrandCut);

    const n      = allSites.length;
    const seqLen = plasmid.length;
    if (n === 0) return [];

    const toAngle = bp => (bp / seqLen) * 2 * Math.PI - Math.PI / 2;

    const fragments = [];
    for (let i = 0; i < n; i++) {
        const lSite = allSites[i];
        const rSite = allSites[(i + 1) % n];

        const cutStart = lSite.topStrandCut;
        const cutEnd   = rSite.topStrandCut;

        let seq;
        if (cutEnd > cutStart) {
            seq = plasmid.sequence.slice(cutStart, cutEnd);
        } else {
            seq = plasmid.sequence.slice(cutStart) + plasmid.sequence.slice(0, cutEnd);
        }

        // Features whose midpoint falls within this fragment
        const fragFeatures = plasmid.features.filter(f => {
            const mid = ((f.start + f.end) / 2 + seqLen) % seqLen;
            if (cutEnd > cutStart) return mid >= cutStart && mid <= cutEnd;
            return mid >= cutStart || mid <= cutEnd;
        });

        const lEnz = EnzymeDB[lSite.enzymeName] || {};
        const rEnz = EnzymeDB[rSite.enzymeName] || {};

        const aStart = toAngle(cutStart);
        // If fragment wraps around, aEnd > 2π — keep it continuous for arc math
        const aEnd   = cutEnd > cutStart
            ? toAngle(cutEnd)
            : toAngle(cutEnd) + 2 * Math.PI;
        const midAngle = (aStart + aEnd) / 2;

        fragments.push({
            id:        i,
            sequence:  seq,
            size:      seq.length,
            features:  fragFeatures,
            cutStartBp: cutStart,
            cutEndBp:   cutEnd,
            origSeqLen: seqLen,
            leftEnd:  {
                enzyme:      lSite.enzymeName,
                overhangSeq: lEnz.overhangSeq  || '',
                type:        lEnz.overhangType || 'blunt'
            },
            rightEnd: {
                enzyme:      rSite.enzymeName,
                overhangSeq: rEnz.overhangSeq  || '',
                type:        rEnz.overhangType || 'blunt'
            },
            angleStart: aStart,
            angleEnd:   aEnd,
            midAngle:   midAngle
        });
    }
    return fragments;
}

window.EnzymeDB          = EnzymeDB;
window.reverseComplement = reverseComplement;
window.findCutSites      = findCutSites;
window.cutDNA            = cutDNA;
window.areEndsCompatible = areEndsCompatible;
window.predictVariants   = predictVariants;
window.digestPlasmid     = digestPlasmid;
