/**
 * scoring.js — Scoring engine for the Restriction Cloning Educational Game.
 *
 * Attach everything to window.Scoring (no ES modules).
 * Usage: <script src="scoring.js"></script>  → window.Scoring
 *
 * Point values:
 *   Correct enzyme choice (cuts in MCS, unique cutter):  +10
 *   Compatible ends achieved:                            +10
 *   Insert in correct orientation:                       +20
 *   Correct variant count prediction (exact):            +15
 *   Correct variant count prediction (within ±1):        +8
 *   Correct colony selection:                            +10
 *   First-try bonus (no wrong attempts on this action):  +10
 *   Streak bonus: +5 per consecutive correct (max +25)
 *   Wrong enzyme (cuts outside MCS or incompatible):     -5
 *   Attempting to ligate incompatible ends:              -5
 */

'use strict';

const Scoring = (function () {

    // ------------------------------------------------------------------
    // Internal state
    // ------------------------------------------------------------------
    let _score    = 0;
    let _streak   = 0;
    let _history  = [];

    // Track per-action attempt counts for first-try bonus
    // Keys are action identifiers (e.g. 'cutVector', 'ligate', 'colony')
    let _attempts = {};

    // ------------------------------------------------------------------
    // Point table
    // ------------------------------------------------------------------
    const POINTS = {
        correct_enzyme:     10,
        compatible_ends:    10,
        correct_orientation:20,
        variant_exact:      15,
        variant_near:        8,
        colony_correct:     10,
        first_try:          10,
        streak_unit:         5,
        streak_max:         25,
        wrong_enzyme:       -5,
        incompatible_ends:  -5
    };

    // ------------------------------------------------------------------
    // _streakBonus() — returns streak bonus capped at streak_max
    // ------------------------------------------------------------------
    function _streakBonus() {
        if (_streak < 2) return 0;
        return Math.min((_streak - 1) * POINTS.streak_unit, POINTS.streak_max);
    }

    // ------------------------------------------------------------------
    // _emit(event, detail) — fire a custom DOM event
    // ------------------------------------------------------------------
    function _emit(eventName, detail) {
        document.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true }));
    }

    // ------------------------------------------------------------------
    // _record(points, message, action, context)
    //   Push an entry onto history and fire game:scored
    // ------------------------------------------------------------------
    function _record(points, message) {
        _score = Math.max(0, _score + points);
        const entry = {
            points,
            message,
            total:     _score,
            streak:    _streak,
            timestamp: Date.now()
        };
        _history.push(entry);
        _emit('game:scored', entry);
        return { points, message, total: _score };
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * award(action, context) — calculate and apply points for a correct action.
     *
     * action  : string — one of:
     *   'correct_enzyme'      context: { enzymeName, inMCS, uniqueCutter }
     *   'compatible_ends'     context: { end1enzyme, end2enzyme }
     *   'correct_orientation' context: { orientation }
     *   'variant_prediction'  context: { predicted, actual }
     *   'colony_correct'      context: { colonyType }
     *   'first_try'           context: { actionKey } — pass explicitly if needed
     *
     * Returns { points, message, total }
     */
    function award(action, context = {}) {
        let pts  = 0;
        let msg  = '';
        const actionKey = context.actionKey || action;

        // Track attempt count for first-try bonus
        if (!_attempts[actionKey]) _attempts[actionKey] = 0;
        const isFirstTry = (_attempts[actionKey] === 0);

        switch (action) {
            case 'correct_enzyme': {
                pts = POINTS.correct_enzyme;
                msg = `Correct enzyme (${context.enzymeName})`;
                if (context.uniqueCutter) {
                    // already baked into correct_enzyme points
                    msg += ' — unique cutter';
                }
                _streak++;
                if (isFirstTry) { pts += POINTS.first_try; msg += ' — first try!'; }
                const sb = _streakBonus();
                if (sb > 0) { pts += sb; msg += ` — streak ×${_streak}`; }
                break;
            }

            case 'compatible_ends': {
                pts = POINTS.compatible_ends;
                msg = `Compatible ends (${context.end1enzyme || '?'} + ${context.end2enzyme || '?'})`;
                _streak++;
                if (isFirstTry) { pts += POINTS.first_try; msg += ' — first try!'; }
                const sb2 = _streakBonus();
                if (sb2 > 0) { pts += sb2; msg += ` — streak ×${_streak}`; }
                break;
            }

            case 'correct_orientation': {
                pts = POINTS.correct_orientation;
                msg = `Correct orientation (${context.orientation || 'forward'})`;
                _streak++;
                if (isFirstTry) { pts += POINTS.first_try; msg += ' — first try!'; }
                const sb3 = _streakBonus();
                if (sb3 > 0) { pts += sb3; msg += ` — streak ×${_streak}`; }
                break;
            }

            case 'variant_prediction': {
                const diff = Math.abs((context.predicted || 0) - (context.actual || 0));
                if (diff === 0) {
                    pts = POINTS.variant_exact;
                    msg = `Exact variant prediction (${context.actual})!`;
                    _streak++;
                } else if (diff === 1) {
                    pts = POINTS.variant_near;
                    msg = `Close variant prediction (predicted ${context.predicted}, actual ${context.actual})`;
                    _streak++;
                } else {
                    // Wrong prediction — handled via penalty()
                    return penalty('wrong_variant_prediction', context);
                }
                if (isFirstTry) { pts += POINTS.first_try; msg += ' — first try!'; }
                const sb4 = _streakBonus();
                if (sb4 > 0) { pts += sb4; msg += ` — streak ×${_streak}`; }
                break;
            }

            case 'colony_correct': {
                pts = POINTS.colony_correct;
                msg = `Correct colony selected (${context.colonyType || 'recombinant'})`;
                _streak++;
                if (isFirstTry) { pts += POINTS.first_try; msg += ' — first try!'; }
                const sb5 = _streakBonus();
                if (sb5 > 0) { pts += sb5; msg += ` — streak ×${_streak}`; }
                break;
            }

            default:
                msg = `Unknown award action: ${action}`;
                break;
        }

        _attempts[actionKey]++;
        return _record(pts, msg);
    }

    /**
     * penalty(action, context) — apply a penalty for a wrong action.
     *
     * action: 'wrong_enzyme' | 'incompatible_ends' | 'wrong_variant_prediction'
     *
     * Returns { points, message, total }
     */
    function penalty(action, context = {}) {
        let pts = 0;
        let msg = '';
        const actionKey = context.actionKey || action;

        // Increment attempt counter so first-try bonus is lost
        if (!_attempts[actionKey]) _attempts[actionKey] = 0;
        _attempts[actionKey]++;

        // Break streak
        _streak = 0;

        switch (action) {
            case 'wrong_enzyme':
                pts = POINTS.wrong_enzyme;
                msg = `Wrong enzyme (${context.enzymeName || '?'}) — ${context.reason || 'cuts outside MCS or incompatible'}`;
                break;

            case 'incompatible_ends':
                pts = POINTS.incompatible_ends;
                msg = `Incompatible ends — ligation failed`;
                break;

            case 'wrong_variant_prediction':
                pts = POINTS.wrong_enzyme;   // same penalty value (-5)
                msg = `Wrong variant prediction (predicted ${context.predicted}, actual ${context.actual})`;
                break;

            default:
                pts = -5;
                msg = `Penalty: ${action}`;
                break;
        }

        return _record(pts, msg);
    }

    /**
     * reset() — reset all scoring state for a new game.
     */
    function reset() {
        _score    = 0;
        _streak   = 0;
        _history  = [];
        _attempts = {};
    }

    /**
     * getSummary() — returns a full breakdown object.
     */
    function getSummary() {
        const positiveEvents  = _history.filter(e => e.points > 0);
        const negativeEvents  = _history.filter(e => e.points < 0);
        const totalEarned     = positiveEvents.reduce((s, e) => s + e.points, 0);
        const totalPenalties  = negativeEvents.reduce((s, e) => s + e.points, 0);
        const highestStreak   = _history.reduce((mx, e) => Math.max(mx, e.streak), 0);

        return {
            score:          _score,
            totalEarned,
            totalPenalties,
            actionCount:    _history.length,
            highestStreak,
            history:        _history.slice()
        };
    }

    // ------------------------------------------------------------------
    // Expose public surface
    // ------------------------------------------------------------------
    return {
        get score()   { return _score;   },
        get streak()  { return _streak;  },
        get history() { return _history.slice(); },
        POINTS,
        award,
        penalty,
        reset,
        getSummary
    };

}());

window.Scoring = Scoring;
