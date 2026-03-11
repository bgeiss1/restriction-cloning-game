/**
 * cloning.js — CloningWorkspace
 *
 * Manages the primary drag-and-drop cloning game mode.
 *
 * Workflow:
 *   idle → vector_cut → donor_cut → both_cut → done
 *
 * Depends on: enzymes.js, plasmid.js  (loaded before this file)
 */

'use strict';

const CloningWorkspace = (function () {

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    const _ws = {
        state:              'idle',
        level:              null,
        vectorPlasmid:      null,
        donorPlasmid:       null,
        vectorCutSites:     [],       // sorted [{topStrandCut, enzymeName, ...}]
        vectorFragments:    [],       // Fragment[] from digestPlasmid() on vector
        donorFragments:     [],       // Fragment[] from digestPlasmid() on donor
        vectorEnzymes:      [],
        donorEnzymes:       [],
        trashedFragments:   new Set(),
        levelScore:         0
    };

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    function _emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }

    function _feedback(msg, type = 'info') {
        _emit('cloning:feedback', { message: msg, type });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Load a level definition object. Resets all workspace state. */
    function loadLevel(levelData) {
        Object.assign(_ws, {
            state:           'idle',
            level:           levelData,
            vectorCutSites:  [],
            vectorFragments: [],
            donorFragments:  [],
            vectorEnzymes:   [],
            donorEnzymes:    [],
            trashedFragments: new Set(),
            levelScore:      0
        });

        if (levelData.vector && levelData.vector.use_pUC19) {
            _ws.vectorPlasmid = Game.pUC19;
        } else {
            _ws.vectorPlasmid = new Plasmid(levelData.vector);
        }

        _ws.donorPlasmid = new Plasmid(levelData.donor);

        _emit('cloning:levelLoaded', { level: levelData, ws: _ws });
    }

    function setVectorEnzymes(names) {
        _ws.vectorEnzymes = names.filter(n => EnzymeDB[n]);
    }

    function setDonorEnzymes(names) {
        _ws.donorEnzymes = names.filter(n => EnzymeDB[n]);
    }

    /**
     * Cut the vector; computes both cut sites and digest fragments.
     * Emits cloning:vectorCut with { sites, fragments }.
     */
    function cutVector() {
        if (_ws.vectorEnzymes.length === 0) {
            _feedback('Select at least one enzyme for the vector.', 'warning');
            return false;
        }
        const sites = _ws.vectorPlasmid.findRestrictionSites(_ws.vectorEnzymes);
        if (sites.length === 0) {
            _feedback('No recognition site(s) found in vector for those enzymes.', 'error');
            return false;
        }
        _ws.vectorCutSites  = sites;
        _ws.vectorFragments = digestPlasmid(_ws.vectorPlasmid, _ws.vectorEnzymes);

        _ws.state = (_ws.state === 'donor_cut') ? 'both_cut' : 'vector_cut';

        _emit('cloning:vectorCut', { sites, fragments: _ws.vectorFragments, ws: _ws });
        return true;
    }

    /**
     * Cut the donor; computes digest fragments.
     * Emits cloning:donorCut with { fragments }.
     */
    function cutDonor() {
        if (_ws.donorEnzymes.length === 0) {
            _feedback('Select at least one enzyme for the donor plasmid.', 'warning');
            return false;
        }
        const fragments = digestPlasmid(_ws.donorPlasmid, _ws.donorEnzymes);
        if (fragments.length === 0) {
            _feedback('No recognition site(s) found in donor plasmid.', 'error');
            return false;
        }
        _ws.donorFragments = fragments;

        _ws.state = (_ws.state === 'vector_cut') ? 'both_cut' : 'donor_cut';

        _emit('cloning:donorCut', { fragments, ws: _ws });
        return true;
    }

    /**
     * Attempt to ligate an ordered list of fragments into a circular molecule.
     *
     * items: [{ fragment, orientation: 'forward'|'reverse', source: 'vector'|'donor' }]
     *
     * Returns a result object and emits cloning:ligationResult.
     * junctions[i] describes the junction between items[i] and items[(i+1)%n].
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
                left:  { enzyme: fragment.rightEnd.enzyme, overhang: reverseComplement(fragment.rightEnd.overhang), type: fragment.rightEnd.type },
                right: { enzyme: fragment.leftEnd.enzyme,  overhang: reverseComplement(fragment.leftEnd.overhang),  type: fragment.leftEnd.type  }
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

        // Orientation check vs level objective
        const obj = (_ws.level && _ws.level.objectives) || {};
        let orientationCorrect = true;
        if (obj.correct_orientation) {
            const donorItem = items.find(it => it.source === 'donor');
            if (donorItem) orientationCorrect = donorItem.orientation === obj.correct_orientation;
        }

        // Fragment combination check: must be vector backbone + donor insert
        let correctCombination = true;
        let wrongComboReason   = '';
        if (allCompatible) {
            const vectorItem = items.find(it => it.source === 'vector');
            const donorItem  = items.find(it => it.source === 'donor');

            if (!vectorItem || !donorItem) {
                correctCombination = false;
                wrongComboReason = vectorItem
                    ? 'Two vector fragments — no donor insert included.'
                    : 'Two donor fragments — no vector backbone included.';
            } else {
                // Vector fragment must be a backbone (contains ori or resistance marker)
                const vectorIsBackbone = vectorItem.fragment.features.some(
                    f => f.type === 'ori' || f.type === 'resistance'
                );
                // Donor fragment must contain the target gene (if specified)
                const targetGene = (obj.correct_fragment || '').toLowerCase();
                const donorHasInsert = !targetGene || donorItem.fragment.features.some(
                    f => f.name.toLowerCase().includes(targetGene)
                );

                if (!vectorIsBackbone) {
                    correctCombination = false;
                    wrongComboReason = 'Vector fragment is not the backbone — it lacks ori/resistance. Use the large vector fragment.';
                } else if (!donorHasInsert) {
                    correctCombination = false;
                    wrongComboReason = `Donor fragment does not contain the target gene (${obj.correct_fragment}). Pick the correct donor fragment.`;
                }
            }
        }

        let points = 0;
        if (allCompatible) {
            if (correctCombination) {
                points = orientationCorrect ? 100 : 40;
                _ws.state = 'done';
            }
            // Wrong combination: ends are compatible but biology is wrong — no points, allow retry
            _ws.levelScore += points;
        }

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
        get state()            { return _ws.state; },
        get ws()               { return _ws; },
        get vectorPlasmid()    { return _ws.vectorPlasmid; },
        get donorPlasmid()     { return _ws.donorPlasmid; },
        get vectorFragments()  { return _ws.vectorFragments; },
        get donorFragments()   { return _ws.donorFragments; },
        get vectorCutSites()   { return _ws.vectorCutSites; }
    };

}());

window.CloningWorkspace = CloningWorkspace;
