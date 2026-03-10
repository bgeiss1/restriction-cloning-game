/**
 * cloning.js — CloningWorkspace
 *
 * Manages the primary drag-and-drop cloning game mode.
 *
 * Workflow:
 *   idle → vector_cut → donor_cut → placing → done
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
        donorFragments:     [],       // Fragment[] from digestPlasmid()
        vectorEnzymes:      [],       // enzyme names chosen for vector
        donorEnzymes:       [],       // enzyme names chosen for donor
        placedFragment:     null,
        placedOrientation:  'forward',
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

    // Check if fragment ends are compatible with the vector gap ends.
    // Returns { success, orientationCorrect, leftOk, rightOk, note }
    function _checkLigation(fragment, orientation) {
        const sites = _ws.vectorCutSites;
        if (sites.length === 0) return { success: false, note: 'Vector not cut.' };

        const sorted  = [...sites].sort((a, b) => a.topStrandCut - b.topStrandCut);
        const lSite   = sorted[0];
        const rSite   = sorted[sorted.length - 1];
        const lEnz    = EnzymeDB[lSite.enzymeName] || {};
        const rEnz    = EnzymeDB[rSite.enzymeName] || {};

        // Vector's open ends
        const vLeft  = { enzyme: lSite.enzymeName, overhang: lEnz.overhangSeq || '', type: lEnz.overhangType || 'blunt' };
        const vRight = { enzyme: rSite.enzymeName, overhang: rEnz.overhangSeq || '', type: rEnz.overhangType || 'blunt' };

        // Fragment ends in chosen orientation
        let fLeft, fRight;
        if (orientation === 'forward') {
            fLeft  = fragment.leftEnd;
            fRight = fragment.rightEnd;
        } else {
            // Reverse: swap ends and reverse-complement overhangs
            fLeft  = { ...fragment.rightEnd, overhang: reverseComplement(fragment.rightEnd.overhang) };
            fRight = { ...fragment.leftEnd,  overhang: reverseComplement(fragment.leftEnd.overhang)  };
        }

        const compatL = areEndsCompatible(vLeft,  fLeft);
        const compatR = areEndsCompatible(vRight, fRight);

        // Correct orientation per level objective
        const obj = (_ws.level && _ws.level.objectives) || {};
        const orientationCorrect = !obj.correct_orientation
            || (orientation === obj.correct_orientation);

        return {
            success:            compatL.compatible && compatR.compatible,
            orientationCorrect,
            leftOk:             compatL.compatible,
            rightOk:            compatR.compatible,
            leftNote:           compatL.note,
            rightNote:          compatR.note
        };
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Load a level definition object. Resets all workspace state. */
    function loadLevel(levelData) {
        Object.assign(_ws, {
            state:             'idle',
            level:             levelData,
            vectorCutSites:    [],
            donorFragments:    [],
            vectorEnzymes:     [],
            donorEnzymes:      [],
            placedFragment:    null,
            placedOrientation: 'forward',
            trashedFragments:  new Set(),
            levelScore:        0
        });

        // Build vector plasmid
        if (levelData.vector && levelData.vector.use_pUC19) {
            _ws.vectorPlasmid = Game.pUC19;
        } else {
            _ws.vectorPlasmid = new Plasmid(levelData.vector);
        }

        // Build donor plasmid
        _ws.donorPlasmid = new Plasmid(levelData.donor);

        _emit('cloning:levelLoaded', { level: levelData, ws: _ws });
    }

    /** Set enzyme names to use when cutting the vector. */
    function setVectorEnzymes(names) {
        _ws.vectorEnzymes = names.filter(n => EnzymeDB[n]);
        _emit('cloning:vectorEnzymesChanged', { enzymes: _ws.vectorEnzymes });
    }

    /** Set enzyme names to use when cutting the donor. */
    function setDonorEnzymes(names) {
        _ws.donorEnzymes = names.filter(n => EnzymeDB[n]);
        _emit('cloning:donorEnzymesChanged', { enzymes: _ws.donorEnzymes });
    }

    /**
     * Cut the vector with the selected vector enzymes.
     * Emits cloning:vectorCut on success.
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
        _ws.vectorCutSites = sites;
        if (_ws.state === 'donor_cut') {
            _ws.state = 'placing';
        } else {
            _ws.state = 'vector_cut';
        }
        _emit('cloning:vectorCut', { sites, ws: _ws });
        return true;
    }

    /**
     * Cut the donor with the selected donor enzymes.
     * Emits cloning:donorCut on success.
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
        if (_ws.state === 'vector_cut') {
            _ws.state = 'placing';
        } else {
            _ws.state = 'donor_cut';
        }
        _emit('cloning:donorCut', { fragments, ws: _ws });
        return true;
    }

    /**
     * Player drops a fragment into the vector.
     * orientation: 'forward' | 'reverse'
     * Returns a result object and emits cloning:ligationResult.
     */
    function placeFragment(fragmentId, orientation) {
        const fragment = _ws.donorFragments.find(f => f.id === fragmentId);
        if (!fragment) {
            _feedback('Unknown fragment.', 'error');
            return null;
        }
        if (_ws.vectorCutSites.length === 0) {
            _feedback('Cut the vector first!', 'warning');
            return null;
        }

        _ws.placedFragment    = fragment;
        _ws.placedOrientation = orientation || 'forward';

        const result = _checkLigation(fragment, _ws.placedOrientation);

        // Score
        let points = 0;
        let msg, msgType;
        if (result.success) {
            if (result.orientationCorrect) {
                points  = 100;
                msg     = 'Ligation successful! Correct orientation. +100 pts';
                msgType = 'success';
            } else {
                points  = 40;
                msg     = 'Ends are compatible, but insert is in the wrong orientation. +40 pts (partial)';
                msgType = 'warn';
            }
            _ws.state = 'done';
        } else {
            points  = 0;
            msg     = 'Ligation failed — incompatible ends. '
                    + (!result.leftOk ? result.leftNote : result.rightNote);
            msgType = 'error';
        }
        _ws.levelScore += points;
        _feedback(msg, msgType);
        _emit('cloning:ligationResult', { result, fragment, orientation, points, ws: _ws });
        return result;
    }

    /** Mark a fragment as trashed (send to waste bin). */
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
        placeFragment,
        trashFragment,
        resetLevel,
        get state()           { return _ws.state; },
        get ws()              { return _ws; },
        get vectorPlasmid()   { return _ws.vectorPlasmid; },
        get donorPlasmid()    { return _ws.donorPlasmid; },
        get donorFragments()  { return _ws.donorFragments; },
        get vectorCutSites()  { return _ws.vectorCutSites; }
    };

}());

window.CloningWorkspace = CloningWorkspace;
