/**
 * cloning.js — CloningWorkspace (multi-donor edition)
 *
 * Manages the primary drag-and-drop cloning game mode.
 *
 * Workflow:
 *   idle → vector_cut → donor_cut → both_cut → done
 *
 * Level format supports both legacy single-donor:
 *   { donor: {...} }
 * and new multi-donor:
 *   { donors: [{...}, {...}] }
 *
 * Depends on: enzymes.js, plasmid.js
 */

'use strict';

const CloningWorkspace = (function () {

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    const _ws = {
        state:                'idle',
        level:                null,
        vectorPlasmid:        null,
        donorPlasmids:        [],     // Array<Plasmid>  — one per donor
        vectorCutSites:       [],
        vectorFragments:      [],
        donorFragmentsByIdx:  [],     // Array<Fragment[]> — per donor
        vectorEnzymes:        [],
        donorEnzymesByIdx:    [],     // Array<string[]>  — per donor
        trashedFragments:     new Set(),
        levelScore:           0,
    };

    // Flat convenience accessor (all donor fragments across all donors)
    function _allDonorFragments() {
        return _ws.donorFragmentsByIdx.flat();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    function _emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }

    function _feedback(msg, type = 'info', side = null) {
        _emit('cloning:feedback', { message: msg, type, side });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Load a level definition object. Resets all workspace state. */
    function loadLevel(levelData) {
        // Normalise: support both  { donor: {...} }  and  { donors: [...] }
        const donorDefs = levelData.donors
            ? levelData.donors
            : (levelData.donor ? [levelData.donor] : []);

        const donorCount = donorDefs.length;

        Object.assign(_ws, {
            state:                'idle',
            level:                levelData,
            vectorCutSites:       [],
            vectorFragments:      [],
            donorFragmentsByIdx:  Array.from({ length: donorCount }, () => []),
            vectorEnzymes:        [],
            donorEnzymesByIdx:    Array.from({ length: donorCount }, () => []),
            trashedFragments:     new Set(),
            levelScore:           0,
        });

        if (levelData.vector && levelData.vector.use_pUC19) {
            _ws.vectorPlasmid = Game.pUC19;
        } else {
            _ws.vectorPlasmid = new Plasmid(levelData.vector || {});
        }

        _ws.donorPlasmids = donorDefs.map(d => new Plasmid(d));

        _emit('cloning:levelLoaded', { level: levelData, ws: _ws });
    }

    function setVectorEnzymes(names) {
        _ws.vectorEnzymes = names.filter(n => EnzymeDB[n]);
    }

    /**
     * Set enzymes for a specific donor (0-indexed).
     * Backward-compat: if idx omitted, sets donor 0.
     */
    function setDonorEnzymes(names, idx = 0) {
        if (idx < 0 || idx >= _ws.donorEnzymesByIdx.length) return;
        _ws.donorEnzymesByIdx[idx] = names.filter(n => EnzymeDB[n]);
    }

    /**
     * Cut the vector.
     * Emits cloning:vectorCut with { sites, fragments }.
     */
    function cutVector() {
        if (_ws.vectorEnzymes.length === 0) {
            _feedback('Select at least one enzyme for the vector.', 'warning', 'vector');
            return false;
        }
        const sites = _ws.vectorPlasmid.findRestrictionSites(_ws.vectorEnzymes);
        if (sites.length === 0) {
            _feedback('No recognition site(s) found in vector.', 'error', 'vector');
            return false;
        }
        _ws.vectorCutSites  = sites;
        _ws.vectorFragments = digestPlasmid(_ws.vectorPlasmid, _ws.vectorEnzymes);

        _updateState();
        _emit('cloning:vectorCut', { sites, fragments: _ws.vectorFragments, ws: _ws });
        return true;
    }

    /**
     * Cut a specific donor by index (default 0).
     * Emits cloning:donorCut with { fragments, donorIdx }.
     */
    function cutDonor(idx = 0) {
        if (idx < 0 || idx >= _ws.donorPlasmids.length) {
            _feedback('Invalid donor index.', 'error', 'donor');
            return false;
        }
        const enzymes = _ws.donorEnzymesByIdx[idx] || [];
        if (enzymes.length === 0) {
            const label = _ws.donorPlasmids.length > 1 ? `donor ${idx + 1}` : 'donor plasmid';
            _feedback(`Select at least one enzyme for ${label}.`, 'warning', 'donor');
            return false;
        }
        const plasmid   = _ws.donorPlasmids[idx];
        const fragments = digestPlasmid(plasmid, enzymes);
        if (fragments.length === 0) {
            _feedback('No recognition site(s) found in donor plasmid.', 'error', 'donor');
            return false;
        }
        // Tag every fragment with its source donor index
        fragments.forEach(f => { f.donorIndex = idx; });
        _ws.donorFragmentsByIdx[idx] = fragments;

        _updateState();
        _emit('cloning:donorCut', { fragments, donorIdx: idx, ws: _ws });
        return true;
    }

    /** Recompute state after a cut. */
    function _updateState() {
        const vecDone  = _ws.vectorFragments.length > 0;
        const allDonors = _ws.donorFragmentsByIdx.every(arr => arr.length > 0);
        if (vecDone && allDonors) {
            _ws.state = 'both_cut';
        } else if (vecDone) {
            _ws.state = 'vector_cut';
        } else if (allDonors) {
            _ws.state = 'donor_cut';
        }
    }

    /**
     * Attempt to ligate an ordered list of fragments into a circular molecule.
     *
     * items: [{ fragment, orientation: 'forward'|'reverse', source: 'vector'|'donor' }]
     *
     * For multi-donor levels the objectives.correct_fragments array defines the
     * expected ordered inserts: [{ name, donor, orientation }].
     *
     * Returns a result object and emits cloning:ligationResult.
     */
    function ligateFragments(items) {
        if (!items || items.length < 2) {
            _feedback('Add at least 2 fragments to the ligation panel.', 'warning');
            return null;
        }

        // Compute oriented ends for each fragment
        const oriented = items.map(({ fragment, orientation }) => {
            if (orientation === 'forward') {
                return { left: fragment.leftEnd, right: fragment.rightEnd };
            }
            return {
                left:  { enzyme: fragment.rightEnd.enzyme, overhangSeq: reverseComplement(fragment.rightEnd.overhangSeq), type: fragment.rightEnd.type },
                right: { enzyme: fragment.leftEnd.enzyme,  overhangSeq: reverseComplement(fragment.leftEnd.overhangSeq),  type: fragment.leftEnd.type  }
            };
        });

        const n = oriented.length;
        const junctions = [];
        let allCompatible = true;

        for (let i = 0; i < n; i++) {
            const right  = oriented[i].right;
            const left   = oriented[(i + 1) % n].left;
            const compat = areEndsCompatible(right, left);
            junctions.push({ fromIdx: i, toIdx: (i + 1) % n, ...compat });
            if (!compat.compatible) allCompatible = false;
        }

        const obj = (_ws.level && _ws.level.objectives) || {};
        let orientationCorrect  = true;
        let correctCombination  = true;
        let wrongComboReason    = '';

        if (allCompatible) {
            const vectorItem  = items.find(it => it.source === 'vector');
            const donorItems  = items.filter(it => it.source === 'donor');

            // Must have exactly one vector backbone
            if (!vectorItem) {
                correctCombination = false;
                wrongComboReason = 'No vector backbone in assembly.';
            } else {
                const vectorIsBackbone = vectorItem.fragment.features.some(
                    f => f.type === 'ori' || f.type === 'resistance'
                );
                if (!vectorIsBackbone) {
                    correctCombination = false;
                    wrongComboReason = 'Vector fragment is not the backbone — lacks ori/resistance.';
                }
            }

            if (correctCombination) {
                if (obj.correct_fragments && obj.correct_fragments.length > 0) {
                    // ---- Multi-donor ordered check ----
                    const expected = obj.correct_fragments;
                    if (donorItems.length !== expected.length) {
                        correctCombination = false;
                        wrongComboReason = `Expected ${expected.length} insert fragment(s), got ${donorItems.length}.`;
                    } else {
                        for (let i = 0; i < expected.length; i++) {
                            const exp  = expected[i];
                            const act  = donorItems[i];
                            const hasName = act.fragment.features.some(
                                f => f.name.toLowerCase().includes(exp.name.toLowerCase())
                            );
                            if (!hasName) {
                                correctCombination = false;
                                wrongComboReason = `Fragment ${i + 1}: expected "${exp.name}" — wrong fragment selected or wrong order.`;
                                break;
                            }
                            if (exp.orientation && act.orientation !== exp.orientation) {
                                orientationCorrect = false;
                            }
                        }
                    }
                } else {
                    // ---- Legacy single-donor check ----
                    const donorItem = donorItems[0];
                    if (!donorItem) {
                        correctCombination = false;
                        wrongComboReason = 'No donor insert in assembly.';
                    } else {
                        const targetGene = obj.correct_fragment != null
                            ? String(obj.correct_fragment).toLowerCase().trim()
                            : null;
                        let donorHasInsert;
                        if (targetGene === null) {
                            // objective not set — no fragment constraint
                            donorHasInsert = true;
                        } else if (targetGene === '') {
                            // objective set but empty — require at least one non-backbone feature
                            donorHasInsert = donorItem.fragment.features.some(
                                f => !['ori', 'resistance', 'mcs'].includes(f.type)
                            );
                            if (!donorHasInsert) wrongComboReason = 'Donor fragment appears to be a backbone — no insert gene detected.';
                        } else {
                            donorHasInsert = donorItem.fragment.features.some(
                                f => f.name.toLowerCase().includes(targetGene)
                            );
                            if (!donorHasInsert) wrongComboReason = `Donor fragment does not contain "${obj.correct_fragment}".`;
                        }
                        if (!donorHasInsert) {
                            correctCombination = false;
                        }
                        if (obj.correct_orientation && donorItem.orientation !== obj.correct_orientation) {
                            orientationCorrect = false;
                        }
                    }
                }
            }
        }

        let points = 0;
        if (allCompatible && correctCombination) {
            points = orientationCorrect ? 100 : 40;
            _ws.state = 'done';
        }
        _ws.levelScore += points;

        const result = { success: allCompatible, isCircular: allCompatible, junctions,
                         orientationCorrect, correctCombination, wrongComboReason, points };
        _emit('cloning:ligationResult', { result, items, points, ws: _ws });
        return result;
    }

    /** Mark a fragment as trashed. */
    function trashFragment(fragmentId) {
        _ws.trashedFragments.add(fragmentId);
        _emit('cloning:fragmentTrashed', { fragmentId, ws: _ws });
    }

    /** Reset the current level without advancing. */
    function resetLevel() {
        if (_ws.level) loadLevel(_ws.level);
    }

    return {
        loadLevel,
        setVectorEnzymes,
        setDonorEnzymes,
        cutVector,
        cutDonor,
        ligateFragments,
        trashFragment,
        resetLevel,
        get state()             { return _ws.state; },
        get ws()                { return _ws; },
        get vectorPlasmid()     { return _ws.vectorPlasmid; },
        get donorPlasmids()     { return _ws.donorPlasmids; },
        // Legacy compat accessors
        get donorPlasmid()      { return _ws.donorPlasmids[0] || null; },
        get vectorFragments()   { return _ws.vectorFragments; },
        get donorFragments()    { return _allDonorFragments(); },
        get vectorCutSites()    { return _ws.vectorCutSites; }
    };

}());

window.CloningWorkspace = CloningWorkspace;
