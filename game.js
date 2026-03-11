/**
 * game.js — Core game state machine and loop for the Restriction Cloning
 * Educational Game.
 *
 * Depends on: enzymes.js, plasmid.js, scoring.js  (loaded before this file)
 * Attach everything to window.Game (no ES modules).
 *
 * States: 'menu' | 'tutorial' | 'challenge' | 'sandbox' | 'result'
 */

'use strict';

const Game = (function () {

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------
    const MCS_ENZYMES = ['EcoRI','KpnI','SmaI','BamHI','HindIII'];
    const ALL_ENZYMES = Object.keys(EnzymeDB);

    // pUC19 canonical sequence builder (re-used from index.html inline script)
    function _buildPUC19Sequence() {
        const TOTAL   = 2686;
        const mcsBlock =
            'GAATTC' + 'GGTACC' + 'CCCGGG' +
            'GGATCC' + 'TCTAGA' + 'GTCGAC' +
            'CTGCAG' + 'AAGCTT';
        const mcsStart = 396;
        function repeat(unit, n) {
            let s = '';
            while (s.length < n) s += unit;
            return s.slice(0, n);
        }
        const fillA     = 'ACGTACGT';
        const lacZFill  = repeat('ATGCATGCATGCATGCATGCATGCATGCATGCATGC', 100);
        const beforeMCS = lacZFill.slice(0, mcsStart);
        const afterMCS  = lacZFill.slice(0, 507 - mcsStart - mcsBlock.length);
        const oriRegion  = repeat('AATTAATTAATTAAGCGCGCGCGCTATATATATATAGCGCGCGC', 50);
        const ampRRegion = repeat('ATGAGTATTCAACATTTCCGTGTCGCCCTTATTCCCTTTTTTGCGG', 50);

        let seq = '';
        seq += beforeMCS;
        seq += mcsBlock;
        seq += afterMCS;
        seq += repeat(fillA, 858 - seq.length);
        seq += oriRegion.slice(0, 443);
        seq += repeat(fillA, 1629 - seq.length);
        seq += ampRRegion.slice(0, 861);
        seq += repeat(fillA, TOTAL - seq.length);
        return seq.slice(0, TOTAL).toUpperCase();
    }

    // ------------------------------------------------------------------
    // Build pUC19 Plasmid object  (shared across levels)
    // ------------------------------------------------------------------
    const _pUC19 = new Plasmid({
        name: 'pUC19',
        sequence: _buildPUC19Sequence(),
        features: [
            { name: 'lacZ-α',   start: 149,  end: 506,  type: 'lacZ',       strand:  1 },
            { name: 'MCS',      start: 396,  end: 453,  type: 'mcs',        strand:  1 },
            { name: 'pMB1 ori', start: 858,  end: 1300, type: 'ori',        strand:  1 },
            { name: 'ampR',     start: 1629, end: 2489, type: 'resistance', strand: -1 },
            { name: 'ampR prom',start: 2489, end: 2593, type: 'promoter',   strand: -1 },
            { name: 'lacZ prom',start: 55,   end: 148,  type: 'promoter',   strand:  1 }
        ]
    });

    // ------------------------------------------------------------------
    // Internal game state
    // ------------------------------------------------------------------
    let _gameState = 'menu';   // 'menu'|'tutorial'|'challenge'|'sandbox'|'result'

    const _state = {
        currentLevel:    null,   // level data object from JSON
        levelIndex:      0,      // index within the loaded level array
        levelList:       [],     // loaded level array for the current mode
        score:           0,
        attempts:        0,
        history:         [],     // array of action records
        // Working DNA objects for the current level
        vectorPlasmid:   null,
        vectorCutResult: null,   // result of cutDNA() on the vector
        insertCutResult: null,   // result of cutDNA() on the insert
        ligationResult:  null,
        // Selections
        selectedEnzyme:  null,
        selectedVectorEnzyme: null,
        selectedInsertEnzyme: null,
        // Timer (challenge mode)
        timerInterval:   null,
        timeRemaining:   0
    };

    const _feedback = {
        last:    null,
        history: []
    };

    // ------------------------------------------------------------------
    // Custom event helpers
    // ------------------------------------------------------------------
    function _emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }

    function _emitStateChange(from, to) {
        _emit('game:statechange', { from, to, state: _state });
    }

    function _emitFeedback(message, type) {
        const fb = { message, type, timestamp: Date.now() };
        _feedback.last = fb;
        _feedback.history.push(fb);
        _emit('game:feedback', fb);
    }

    function _emitScored(result) {
        _state.score = Scoring.score;
        _emit('game:scored', { ...result, state: _state });
    }

    // ------------------------------------------------------------------
    // _setGameState(newState)
    // ------------------------------------------------------------------
    function _setGameState(newState) {
        const prev = _gameState;
        _gameState = newState;
        _emitStateChange(prev, newState);
    }

    // ------------------------------------------------------------------
    // _loadLevelData(levelData)
    //
    // Sets up all per-level working state from a level definition object.
    // ------------------------------------------------------------------
    function loadLevel(levelData) {
        if (!levelData) return;
        _state.currentLevel         = levelData;
        _state.attempts             = 0;
        _state.history              = [];
        _state.vectorCutResult      = null;
        _state.insertCutResult      = null;
        _state.ligationResult       = null;
        _state.selectedEnzyme       = null;
        _state.selectedVectorEnzyme = null;
        _state.selectedInsertEnzyme = null;

        // Rebuild vector plasmid from level definition
        // If the level supplies a custom sequence use it; otherwise fall back to pUC19
        if (levelData.vector && levelData.vector.sequence) {
            _state.vectorPlasmid = new Plasmid({
                name:     levelData.vector.name || 'Vector',
                sequence: levelData.vector.sequence,
                features: levelData.vector.features || []
            });
        } else {
            // Use the shared pUC19 object (most levels)
            _state.vectorPlasmid = _pUC19;
        }

        // Timer for challenge mode
        if (levelData.mode === 'challenge' && levelData.time_limit_seconds) {
            _startTimer(levelData.time_limit_seconds);
        }

        _emitFeedback(`Level loaded: ${levelData.title}`, 'info');
        _emit('game:levelLoaded', { level: levelData, state: _state });
    }

    // ------------------------------------------------------------------
    // Timer helpers (challenge mode)
    // ------------------------------------------------------------------
    function _startTimer(seconds) {
        _stopTimer();
        _state.timeRemaining = seconds;
        _state.timerInterval = setInterval(() => {
            _state.timeRemaining--;
            _emit('game:timerTick', { timeRemaining: _state.timeRemaining });
            if (_state.timeRemaining <= 0) {
                _stopTimer();
                _emitFeedback('Time is up!', 'error');
                _emit('game:timeUp', { state: _state });
                _endLevel(false);
            }
        }, 1000);
    }

    function _stopTimer() {
        if (_state.timerInterval) {
            clearInterval(_state.timerInterval);
            _state.timerInterval = null;
        }
    }

    // ------------------------------------------------------------------
    // _endLevel(success)
    // ------------------------------------------------------------------
    function _endLevel(success) {
        _stopTimer();
        const summary = Scoring.getSummary();
        _emit('game:levelComplete', { success, summary, state: _state });

        // Decide whether to advance to next level or show result screen
        if (success && _state.levelIndex < _state.levelList.length - 1) {
            _state.levelIndex++;
            loadLevel(_state.levelList[_state.levelIndex]);
        } else {
            _setGameState('result');
        }
    }

    // ------------------------------------------------------------------
    // Actions object — all player actions go through here
    // ------------------------------------------------------------------
    const actions = {

        /**
         * selectEnzyme(enzymeName)
         * Player highlights an enzyme (UI selection, not yet cutting).
         */
        selectEnzyme(enzymeName) {
            if (!EnzymeDB[enzymeName]) {
                _emitFeedback(`Unknown enzyme: ${enzymeName}`, 'error');
                return false;
            }
            _state.selectedEnzyme = enzymeName;
            _emit('game:enzymeSelected', { enzyme: enzymeName, state: _state });
            return true;
        },

        /**
         * cutVector(enzymeName)
         * Player cuts the vector plasmid.
         * Validates against level objectives.
         */
        cutVector(enzymeName) {
            _state.attempts++;
            const level = _state.currentLevel;
            if (!level) {
                _emitFeedback('No level loaded.', 'error');
                return { success: false };
            }

            const enz = EnzymeDB[enzymeName];
            if (!enz) {
                _emitFeedback(`Unknown enzyme: ${enzymeName}`, 'error');
                return { success: false };
            }

            const plasmid = _state.vectorPlasmid;
            const sites   = plasmid.findRestrictionSites([enzymeName]);

            if (sites.length === 0) {
                const result = Scoring.penalty('wrong_enzyme', {
                    enzymeName,
                    reason: 'no site found in vector',
                    actionKey: 'cutVector'
                });
                _state.history.push({ action: 'cutVector', enzyme: enzymeName, success: false });
                _emitFeedback(`${enzymeName} has no site in this vector!`, 'error');
                _emitScored(result);
                return { success: false, sites: [] };
            }

            // Check against objectives
            const objective = level.objectives || {};
            const correctEnzyme = objective.correct_enzyme;
            const isCorrect     = !correctEnzyme || (enzymeName === correctEnzyme);
            const inMCS         = MCS_ENZYMES.includes(enzymeName);
            const uniqueCutter  = sites.length === 1;

            if (!isCorrect) {
                const result = Scoring.penalty('wrong_enzyme', {
                    enzymeName,
                    reason: `objective requires ${correctEnzyme}`,
                    actionKey: 'cutVector'
                });
                _state.history.push({ action: 'cutVector', enzyme: enzymeName, success: false });
                _emitFeedback(
                    `${enzymeName} is not the right choice here. Try ${correctEnzyme}.`,
                    'warning'
                );
                _emitScored(result);
                return { success: false, sites, hint: correctEnzyme };
            }

            // Award points
            const result = Scoring.award('correct_enzyme', {
                enzymeName,
                inMCS,
                uniqueCutter,
                actionKey: 'cutVector'
            });

            // Perform the actual cut
            const site            = sites[0];
            _state.vectorCutResult = cutDNA(plasmid.sequence, site);
            _state.selectedVectorEnzyme = enzymeName;

            _state.history.push({ action: 'cutVector', enzyme: enzymeName, success: true, site });
            _emitFeedback(
                `Vector cut with ${enzymeName} at position ${site.topStrandCut} bp. ` +
                `Overhang: ${enz.overhangSeq || 'blunt'} (${enz.overhangType}).`,
                'success'
            );
            _emitScored(result);
            return { success: true, sites, site, cutResult: _state.vectorCutResult };
        },

        /**
         * cutInsert(enzymeName)
         * Player cuts the insert DNA.
         * The insert is described in level.insert.
         */
        cutInsert(enzymeName) {
            _state.attempts++;
            const level = _state.currentLevel;
            if (!level || !level.insert) {
                _emitFeedback('No insert defined for this level.', 'error');
                return { success: false };
            }

            const enz = EnzymeDB[enzymeName];
            if (!enz) {
                _emitFeedback(`Unknown enzyme: ${enzymeName}`, 'error');
                return { success: false };
            }

            // Build a virtual insert sequence that contains the enzyme site
            // For game purposes we use the insert.ends metadata directly
            const insert = level.insert;
            const leftEnzyme  = insert.ends ? insert.ends.left  : null;
            const rightEnzyme = insert.ends ? insert.ends.right : null;
            const correct     = (enzymeName === leftEnzyme || enzymeName === rightEnzyme);

            if (!correct) {
                const result = Scoring.penalty('wrong_enzyme', {
                    enzymeName,
                    reason: `insert has ${leftEnzyme}/${rightEnzyme} ends`,
                    actionKey: 'cutInsert'
                });
                _state.history.push({ action: 'cutInsert', enzyme: enzymeName, success: false });
                _emitFeedback(
                    `${enzymeName} does not cut the insert. Insert has ${leftEnzyme}/${rightEnzyme} ends.`,
                    'warning'
                );
                _emitScored(result);
                return { success: false };
            }

            // Build synthetic insert ends
            const leftEnz  = EnzymeDB[leftEnzyme]  || null;
            const rightEnz = EnzymeDB[rightEnzyme] || null;

            _state.insertCutResult = {
                left: {
                    enzyme:      leftEnzyme,
                    overhangSeq: leftEnz  ? reverseComplement(leftEnz.overhangSeq  || '') : '',
                    type:        leftEnz  ? leftEnz.overhangType  : 'blunt'
                },
                right: {
                    enzyme:      rightEnzyme,
                    overhangSeq: rightEnz ? rightEnz.overhangSeq || '' : '',
                    type:        rightEnz ? rightEnz.overhangType : 'blunt'
                },
                size: insert.size
            };

            _state.selectedInsertEnzyme = enzymeName;

            const result = Scoring.award('correct_enzyme', {
                enzymeName,
                inMCS: MCS_ENZYMES.includes(enzymeName),
                uniqueCutter: true,
                actionKey: 'cutInsert'
            });

            _state.history.push({ action: 'cutInsert', enzyme: enzymeName, success: true });
            _emitFeedback(
                `Insert cut with ${enzymeName}. Ready for ligation.`,
                'success'
            );
            _emitScored(result);
            return { success: true, insertEnds: _state.insertCutResult };
        },

        /**
         * ligate(vectorEnd1, vectorEnd2, insertEnd1, insertEnd2)
         *
         * vectorEnd1 / vectorEnd2 : { type, overhangSeq, enzyme }
         * insertEnd1 / insertEnd2 : { type, overhangSeq, enzyme }
         *
         * Returns { success, variants, compatible, destroysSite }
         */
        ligate(vectorEnd1, vectorEnd2, insertEnd1, insertEnd2) {
            _state.attempts++;
            const level = _state.currentLevel;

            // Build end objects for areEndsCompatible
            const vLeft  = vectorEnd1;
            const vRight = vectorEnd2;
            const iLeft  = insertEnd1;
            const iRight = insertEnd2;

            // Check compatibility: vector-left with insert-left, vector-right with insert-right
            // (for insertion, the insert left end anneals to vector left end, etc.)
            const compatL = areEndsCompatible(vLeft, iLeft);
            const compatR = areEndsCompatible(vRight, iRight);

            if (!compatL.compatible || !compatR.compatible) {
                const result = Scoring.penalty('incompatible_ends', { actionKey: 'ligate' });
                _state.history.push({ action: 'ligate', success: false, reason: 'incompatible' });
                _emitFeedback(
                    'Ligation failed — ends are not compatible. ' +
                    (!compatL.compatible ? compatL.note : compatR.note),
                    'error'
                );
                _emitScored(result);
                return { success: false, compatible: false };
            }

            // Ends compatible — award points
            const result = Scoring.award('compatible_ends', {
                end1enzyme: vLeft.enzyme,
                end2enzyme: iLeft.enzyme,
                actionKey:  'ligate'
            });

            // Run predictVariants to determine all possible products
            const vectorEnds = { left: vLeft, right: vRight };
            const insertEnds = { left: iLeft, right: iRight };
            const pvResult   = predictVariants(vectorEnds, insertEnds);

            _state.ligationResult = pvResult;

            // Check orientation objective
            const obj = (level && level.objectives) || {};
            if (obj.orientation_matters) {
                const correctOrientation = pvResult.variants.some(v => v.orientation === 'forward' && !v.selfLigation);
                if (correctOrientation) {
                    const orResult = Scoring.award('correct_orientation', {
                        orientation: 'forward',
                        actionKey: 'orientation'
                    });
                    _emitScored(orResult);
                }
            }

            _state.history.push({ action: 'ligate', success: true, variants: pvResult });
            _emitFeedback(
                `Ligation successful! ${pvResult.count} possible product(s) predicted.`,
                'success'
            );
            _emitScored(result);

            _emit('game:ligationComplete', {
                variants:    pvResult,
                destroySite: compatL.destroysSite || compatR.destroysSite,
                state:       _state
            });

            return {
                success:     true,
                compatible:  true,
                variants:    pvResult,
                destroySite: compatL.destroysSite || compatR.destroysSite
            };
        },

        /**
         * predictVariants(count)
         * Player submits their predicted number of ligation variants.
         */
        predictVariants(count) {
            _state.attempts++;
            const level = _state.currentLevel;
            const obj   = (level && level.objectives) || {};
            const actual = (typeof obj.expected_variants === 'number')
                ? obj.expected_variants
                : (_state.ligationResult ? _state.ligationResult.count : null);

            if (actual === null) {
                _emitFeedback('Cannot evaluate prediction — no ligation data yet.', 'warning');
                return { success: false };
            }

            const result = Scoring.award('variant_prediction', {
                predicted: count,
                actual,
                actionKey: 'variant_prediction'
            });

            const diff = Math.abs(count - actual);
            _state.history.push({ action: 'predictVariants', predicted: count, actual, success: diff <= 1 });

            if (diff === 0) {
                _emitFeedback(`Correct! There are ${actual} possible ligation products.`, 'success');
            } else if (diff === 1) {
                _emitFeedback(`Close! Actual: ${actual}, you predicted: ${count}.`, 'warning');
            } else {
                _emitFeedback(`Incorrect. Actual: ${actual}, you predicted: ${count}.`, 'error');
            }

            _emitScored(result);
            return { success: diff <= 1, predicted: count, actual };
        },

        /**
         * selectColony(antibioticPlate)
         * Player selects which colony plate to pick recombinants from.
         * antibioticPlate: 'ampicillin' | 'ampicillin+x-gal' | 'kanamycin' | etc.
         */
        selectColony(antibioticPlate) {
            _state.attempts++;
            const level = _state.currentLevel;
            const obj   = (level && level.objectives) || {};
            const correct = antibioticPlate === obj.select_antibiotic;

            if (!correct) {
                const result = Scoring.penalty('wrong_enzyme', {
                    enzymeName: antibioticPlate,
                    reason: `correct plate is ${obj.select_antibiotic}`,
                    actionKey: 'colony'
                });
                _state.history.push({ action: 'selectColony', plate: antibioticPlate, success: false });
                _emitFeedback(
                    `Wrong plate. Use ${obj.select_antibiotic} to select transformants.`,
                    'error'
                );
                _emitScored(result);
                return { success: false };
            }

            const result = Scoring.award('colony_correct', {
                colonyType: antibioticPlate,
                actionKey: 'colony'
            });

            _state.history.push({ action: 'selectColony', plate: antibioticPlate, success: true });
            _emitFeedback(`Correct! ${antibioticPlate} selection picks transformants.`, 'success');
            _emitScored(result);

            // Level complete
            _endLevel(true);
            return { success: true };
        }
    };

    // ------------------------------------------------------------------
    // init(tutorialLevels, challengeLevels)
    //
    // Called once on page load after fetching the JSON files.
    // ------------------------------------------------------------------
    function init(tutorialLevels, challengeLevels) {
        Game._tutorialLevels   = tutorialLevels   || [];
        Game._challengeLevels  = challengeLevels  || [];

        Scoring.reset();
        _setGameState('menu');

        // Listen for Scoring events to re-broadcast
        document.addEventListener('game:scored', (e) => {
            _state.score = Scoring.score;
        });

        _emit('game:ready', { tutorialCount: Game._tutorialLevels.length,
                              challengeCount: Game._challengeLevels.length });
    }

    // ------------------------------------------------------------------
    // startMode(mode)   'tutorial' | 'challenge' | 'sandbox'
    // ------------------------------------------------------------------
    function startMode(mode) {
        Scoring.reset();
        _state.levelIndex = 0;

        if (mode === 'tutorial') {
            if (!Game._tutorialLevels || Game._tutorialLevels.length === 0) {
                _emitFeedback('Tutorial levels not loaded yet.', 'error');
                return;
            }
            _state.levelList = Game._tutorialLevels;
            _setGameState('tutorial');
            loadLevel(_state.levelList[0]);

        } else if (mode === 'challenge') {
            if (!Game._challengeLevels || Game._challengeLevels.length === 0) {
                _emitFeedback('Challenge levels not loaded yet.', 'error');
                return;
            }
            _state.levelList = Game._challengeLevels;
            _setGameState('challenge');
            loadLevel(_state.levelList[0]);

        } else {
            // Sandbox — load a default level with no objectives
            _state.levelList = [];
            _setGameState('sandbox');
            _emitFeedback('Sandbox mode — experiment freely with pUC19.', 'info');
            _emit('game:levelLoaded', {
                level: {
                    id: 'sandbox',
                    title: 'Sandbox',
                    mode: 'sandbox',
                    vector: { name: 'pUC19', size: 2686 },
                    objectives: {}
                },
                state: _state
            });
        }
    }

    // ------------------------------------------------------------------
    // Expose public surface
    // ------------------------------------------------------------------
    return {
        // Mutable data attached by init()
        _tutorialLevels:  null,
        _challengeLevels: null,

        get gameState()  { return _gameState; },
        get state()      { return _state; },
        get feedback()   { return _feedback; },
        get score()      { return Scoring.score; },

        // Shared plasmid reference
        pUC19: _pUC19,
        MCS_ENZYMES,
        ALL_ENZYMES,

        init,
        startMode,
        loadLevel,
        actions
    };

}());

window.Game = Game;
