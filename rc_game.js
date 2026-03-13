/**
 * rc_game.js — Reverse Complement Game
 *
 * Phases:
 *   1. Single base DNA, 5'→3'
 *   2. Growing sequence 2–5 bases DNA, 5'→3'
 *   3. 5–8 bases DNA/RNA mix (40% RNA), 5'→3'
 *   4. 4 bases DNA, random direction
 *
 * Player always types the 5'→3' reverse complement.
 * Strict Watson-Crick pairing: A↔T, G↔C (DNA) | A↔U, G↔C (RNA).
 */

'use strict';

// ============================================================
// Default settings (overridden by rc_settings.json)
// ============================================================
const DEFAULT_SETTINGS = {
    phases: [
        {
            id: 1, name: 'Single Base', description: 'One base at a time.',
            seqLength: [1, 1], rna_ratio: 0, randomDirection: false,
            timerStart: 5, timerMin: 2, timerDecayPerRound: 0.1,
            advanceCondition: { type: 'totalScore', value: 200 }
        },
        {
            id: 2, name: 'Growing Sequence', description: '2–5 bases as score climbs.',
            seqLength: [2, 5], lengthGrowInterval: 200, rna_ratio: 0, randomDirection: false,
            timerStart: 5, timerMin: 3, timerDecayPerRound: 0.05,
            advanceCondition: { type: 'consecutiveAtMaxLength', consecutive: 3, minPts: 7 }
        },
        {
            id: 3, name: 'DNA + RNA Mix', description: '40% RNA — A pairs with U!',
            seqLength: [5, 8], rna_ratio: 0.4, randomDirection: false,
            timerStart: 5, timerMin: 3, timerDecayPerRound: 0.05,
            advanceCondition: { type: 'consecutive', consecutive: 3, minPts: 5 }
        },
        {
            id: 4, name: 'Random Direction', description: 'May be shown 3′→5′ — stay sharp!',
            seqLength: [4, 4], rna_ratio: 0, randomDirection: true,
            timerStart: 5, timerMin: 3, timerDecayPerRound: 0.05,
            advanceCondition: { type: 'consecutive', consecutive: 3, minPts: 5 }
        }
    ],
    scoring: {
        basePointsPerBase: 10, maxTimeBonus: 9,
        wrongKeyPenalty: 2, milestoneInterval: 200, gameOverConsecutiveZeros: 3
    },
    baseColors: { A: '#4CAF50', T: '#F44336', U: '#F44336', G: '#FFC107', C: '#2196F3' },
    ui: { roundResultPauseSec: 1.2, timeoutResultPauseSec: 1.8, phaseFlashDurationSec: 2.5 }
};

// ============================================================
// State
// ============================================================
let S = null; // settings

const G = {
    // phase tracking
    phaseIdx:        0,   // 0–3
    totalScore:      0,
    phaseScore:      0,
    roundsInPhase:   0,
    streak:          0,   // consecutive non-zero rounds
    consecutiveZero: 0,
    consecutiveGood: 0,   // consecutive rounds meeting phase advance threshold
    lastMilestone:   0,

    // round state
    sequence:    [],   // bases shown
    answer:      [],   // expected answer (5'→3')
    isRNA:       false,
    isForward:   true, // true = shown 5'→3', false = shown 3'→5'
    typedIdx:    0,    // number of correct bases typed so far
    wrongCount:  0,
    roundWrongPts: 0,  // penalty accumulated this round

    // timer (RAF)
    timerMax:        0, // ms
    roundStartTime:  0, // performance.now()
    roundActive:     false,
    rafId:           null,
};

// ============================================================
// DOM references
// ============================================================
const $ = id => document.getElementById(id);
const D = {
    startScreen:    $('startScreen'),
    gameScreen:     $('gameScreen'),
    phaseScreen:    $('phaseScreen'),
    gameOverScreen: $('gameOverScreen'),
    victoryScreen:  $('victoryScreen'),

    phaseBadge:     $('phaseBadge'),
    phaseName:      $('phaseName'),
    totalScoreVal:  $('totalScoreVal'),
    streakVal:      $('streakVal'),

    seqDirLabel:    $('seqDirLabel'),
    molTypeBadge:   $('molTypeBadge'),
    seqDisplay:     $('seqDisplay'),
    ansDisplay:     $('ansDisplay'),

    timerFill:      $('timerFill'),
    timerText:      $('timerText'),

    wrongCount:     $('wrongCount'),
    roundScorePreview: $('roundScorePreview'),

    btnA: $('btnA'), btnT: $('btnT'), btnG: $('btnG'), btnC: $('btnC'),

    resultOverlay:  $('resultOverlay'),
    resultBanner:   $('resultBanner'),
    milestoneFlash: $('milestoneFlash'),

    phaseIcon:          $('phaseIcon'),
    phaseCompleteTitle: $('phaseCompleteTitle'),
    phaseCompleteText:  $('phaseCompleteText'),
    phaseScoreVal:      $('phaseScoreVal'),
    phaseTotalVal:      $('phaseTotalVal'),

    gameOverScoreVal:  $('gameOverScoreVal'),
    gameOverPhaseVal:  $('gameOverPhaseVal'),
    victoryScoreVal:   $('victoryScoreVal'),
    victoryCanvas:     $('victoryConfettiCanvas'),
};

// ============================================================
// Screen helpers
// ============================================================
const SCREENS = ['startScreen','gameScreen','phaseScreen','gameOverScreen','victoryScreen'];

function showScreen(id) {
    SCREENS.forEach(s => {
        const el = D[s];
        if (!el) return;
        el.classList.toggle('active', s === id);
    });
}

// ============================================================
// Base utilities
// ============================================================
const DNA_BASES = ['A','T','G','C'];
const RNA_BASES = ['A','U','G','C'];

function randomBase(isRNA) {
    const pool = isRNA ? RNA_BASES : DNA_BASES;
    return pool[Math.floor(Math.random() * pool.length)];
}

function complement(base, isRNA) {
    if (isRNA) {
        return { A:'U', U:'A', G:'C', C:'G' }[base] || base;
    }
    return { A:'T', T:'A', G:'C', C:'G' }[base] || base;
}

/**
 * Compute the answer the player must type (always 5'→3').
 * sequence: array of bases shown left-to-right in given direction.
 * isForward: true = shown 5'→3', false = shown 3'→5'.
 */
function computeAnswer(sequence, isForward, isRNA) {
    const comped = sequence.map(b => complement(b, isRNA));
    return isForward ? comped.reverse() : comped;
}

// ============================================================
// Sequence generation
// ============================================================
function generateSequence() {
    const phase = S.phases[G.phaseIdx];
    const [minLen, maxLen] = phase.seqLength;

    // Determine length
    let len;
    if (G.phaseIdx === 1 && phase.lengthGrowInterval) {
        // Phase 2: grows with phase score
        const grown = Math.floor(G.phaseScore / phase.lengthGrowInterval);
        len = Math.min(maxLen, minLen + grown);
    } else if (minLen === maxLen) {
        len = minLen;
    } else {
        len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
    }

    // RNA or DNA?
    const isRNA = Math.random() < (phase.rna_ratio || 0);

    // Direction
    const isForward = phase.randomDirection ? Math.random() < 0.5 : true;

    // Generate
    const seq = Array.from({ length: len }, () => randomBase(isRNA));
    const ans = computeAnswer(seq, isForward, isRNA);

    return { seq, ans, isRNA, isForward };
}

// ============================================================
// Timer duration for current round
// ============================================================
function computeTimerDuration() {
    const phase = S.phases[G.phaseIdx];
    const decay = (phase.timerDecayPerRound || 0) * G.roundsInPhase;
    const secs = Math.max(phase.timerMin, phase.timerStart - decay);
    return secs * 1000; // ms
}

// ============================================================
// Build base box DOM element
// ============================================================
function makeBaseBox(base, cssClass) {
    const div = document.createElement('div');
    div.className = `base-box ${cssClass}`;
    div.textContent = base || '';
    if (base) {
        const col = S.baseColors[base] || '#888';
        div.style.color = col;
        div.style.borderColor = col;
        if (cssClass === 'seq-box') {
            div.style.background = col + '22'; // slight tint
        }
    }
    return div;
}

// ============================================================
// Update base button labels (T→U for RNA rounds)
// ============================================================
function updateBaseButtons() {
    const isRNA = G.isRNA;
    D.btnT.textContent = isRNA ? 'U' : 'T';
    D.btnT.dataset.base = isRNA ? 'U' : 'T';

    // Color the buttons by base type
    ['A','T','G','C'].forEach(base => {
        const btn = D['btn' + base];
        if (!btn) return;
        const actualBase = (base === 'T' && isRNA) ? 'U' : base;
        btn.style.background = S.baseColors[actualBase] || '#555';
    });
}

// ============================================================
// Start round
// ============================================================
function startRound() {
    G.roundActive = false;
    if (G.rafId) cancelAnimationFrame(G.rafId);

    const { seq, ans, isRNA, isForward } = generateSequence();
    G.sequence   = seq;
    G.answer     = ans;
    G.isRNA      = isRNA;
    G.isForward  = isForward;
    G.typedIdx   = 0;
    G.wrongCount = 0;
    G.roundWrongPts = 0;

    // Update direction label
    if (isForward) {
        D.seqDirLabel.textContent = '→';
        D.seqDirLabel.parentElement.childNodes[0].textContent = "5'";
        D.seqDirLabel.parentElement.childNodes[2].textContent = "3'";
    } else {
        D.seqDirLabel.textContent = '→';
        D.seqDirLabel.parentElement.childNodes[0].textContent = "3'";
        D.seqDirLabel.parentElement.childNodes[2].textContent = "5'";
    }
    D.molTypeBadge.textContent = isRNA ? 'RNA' : 'DNA';
    D.molTypeBadge.style.color = isRNA ? '#F44336' : 'var(--accent)';

    // Build sequence display
    D.seqDisplay.innerHTML = '';
    seq.forEach(base => D.seqDisplay.appendChild(makeBaseBox(base, 'seq-box')));

    // Build answer display (empty boxes)
    D.ansDisplay.innerHTML = '';
    ans.forEach((_, i) => {
        const box = makeBaseBox('', 'ans-box');
        if (i === 0) box.classList.add('current');
        D.ansDisplay.appendChild(box);
    });

    // Update header phase info
    const phase = S.phases[G.phaseIdx];
    D.phaseBadge.textContent = `Phase ${phase.id}`;
    D.phaseName.textContent = phase.name;

    // Update base buttons
    updateBaseButtons();

    // Reset round UI
    D.wrongCount.textContent = '0';
    D.roundScorePreview.textContent = 'Round score: —';

    // Start timer
    G.timerMax = computeTimerDuration();
    G.roundStartTime = performance.now();
    G.roundActive = true;
    G.rafId = requestAnimationFrame(timerLoop);
}

// ============================================================
// Timer RAF loop
// ============================================================
function timerLoop(now) {
    if (!G.roundActive) return;

    const elapsed  = now - G.roundStartTime;
    const remaining = Math.max(0, G.timerMax - elapsed);
    const frac = remaining / G.timerMax;

    // Update bar
    D.timerFill.style.width = (frac * 100) + '%';
    D.timerFill.style.background =
        frac < 0.25 ? 'var(--danger)' :
        frac < 0.5  ? 'var(--warning)' : 'var(--accent)';
    D.timerText.textContent = (remaining / 1000).toFixed(1) + 's';

    // Update live score preview
    if (G.typedIdx > 0 || G.roundWrongPts > 0) {
        const preview = computeRoundScore(remaining);
        D.roundScorePreview.textContent = `Round score: ~${preview}`;
    }

    if (remaining <= 0) {
        onTimeout();
        return;
    }

    G.rafId = requestAnimationFrame(timerLoop);
}

// ============================================================
// Score computation
// ============================================================
function computeRoundScore(msRemaining) {
    const seqLen = G.sequence.length;
    const basePoints = seqLen * S.scoring.basePointsPerBase;
    const timeFrac = Math.max(0, msRemaining / G.timerMax);
    const timeBonus = Math.round(timeFrac * S.scoring.maxTimeBonus);
    return Math.max(0, basePoints + timeBonus - G.roundWrongPts);
}

// ============================================================
// Handle a base input (keyboard or button)
// ============================================================
function handleInput(base) {
    if (!G.roundActive) return;
    // Normalise: accept both T and U for RNA rounds
    const expected = G.answer[G.typedIdx];
    const normalised = (G.isRNA && base === 'T') ? 'U' : base;

    const boxes = D.ansDisplay.querySelectorAll('.ans-box');
    const currentBox = boxes[G.typedIdx];

    if (normalised === expected) {
        // Correct
        currentBox.classList.remove('current');
        currentBox.textContent = normalised;
        const col = S.baseColors[normalised] || '#888';
        currentBox.style.color = col;
        currentBox.style.borderColor = col;
        currentBox.style.borderStyle = 'solid';
        currentBox.style.background = col + '22';
        currentBox.classList.add('filled');
        currentBox.classList.add('correct-flash');
        setTimeout(() => currentBox.classList.remove('correct-flash'), 350);

        G.typedIdx++;

        // Mark next box as current
        if (G.typedIdx < boxes.length) {
            boxes[G.typedIdx].classList.add('current');
        }

        // Check completion
        if (G.typedIdx >= G.answer.length) {
            onRoundComplete();
        }
    } else {
        // Wrong key
        G.wrongCount++;
        G.roundWrongPts += S.scoring.wrongKeyPenalty;
        D.wrongCount.textContent = G.wrongCount;

        currentBox.classList.add('wrong-shake');
        setTimeout(() => currentBox.classList.remove('wrong-shake'), 400);

        // Play error sound
        playTone(220, 0.08, 'sawtooth');

        // Penalty popup
        showPenaltyPop(currentBox);
    }
}

function showPenaltyPop(refEl) {
    const pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = `-${S.scoring.wrongKeyPenalty}`;
    pop.style.color = 'var(--danger)';
    const rect = refEl.getBoundingClientRect();
    pop.style.left = rect.left + 'px';
    pop.style.top  = (rect.top - 10) + 'px';
    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 900);
}

// ============================================================
// Round complete (correct answer)
// ============================================================
function onRoundComplete() {
    G.roundActive = false;
    if (G.rafId) cancelAnimationFrame(G.rafId);

    const msRemaining = Math.max(0, G.timerMax - (performance.now() - G.roundStartTime));
    const score = computeRoundScore(msRemaining);

    // Play success chord
    playChord([523, 659, 784], 0.12, 0.35);

    // Score pop
    showScorePop(score, true);
    applyScore(score);

    showResultOverlay('correct', `+${score} pts`, () => {
        checkAdvance(score);
    });
}

// ============================================================
// Timeout
// ============================================================
function onTimeout() {
    G.roundActive = false;

    // Reveal correct answer in grey
    const boxes = D.ansDisplay.querySelectorAll('.ans-box');
    G.answer.forEach((base, i) => {
        if (i >= G.typedIdx) {
            boxes[i].textContent = base;
            boxes[i].style.borderStyle = 'solid';
            boxes[i].style.color = '#666';
            boxes[i].style.borderColor = '#555';
            boxes[i].classList.add('timeout-show');
        }
    });

    playTone(180, 0.12, 'square');
    applyScore(0);

    showResultOverlay('timeout', 'Time out!', () => {
        checkAdvance(0);
    });
}

// ============================================================
// Apply score to state
// ============================================================
function applyScore(pts) {
    G.totalScore += pts;
    G.phaseScore += pts;
    D.totalScoreVal.textContent = G.totalScore;

    // Animate score
    D.totalScoreVal.classList.remove('score-pulse');
    void D.totalScoreVal.offsetWidth;
    D.totalScoreVal.classList.add('score-pulse');

    // Streak
    if (pts > 0) {
        G.streak++;
        G.consecutiveZero = 0;
    } else {
        G.streak = 0;
        G.consecutiveZero++;
    }
    D.streakVal.textContent = G.streak;

    // Milestone
    const mi = S.scoring.milestoneInterval;
    if (Math.floor(G.totalScore / mi) > Math.floor(G.lastMilestone / mi)) {
        G.lastMilestone = G.totalScore;
        showMilestone();
    }

    G.roundsInPhase++;
}

// ============================================================
// Show result overlay banner
// ============================================================
function showResultOverlay(type, text, onDone) {
    D.resultBanner.className = type;
    D.resultBanner.textContent = text;
    D.resultOverlay.classList.add('active');

    const pauseSecs = type === 'timeout'
        ? (S.ui.timeoutResultPauseSec || 1.8)
        : (S.ui.roundResultPauseSec || 1.2);

    setTimeout(() => {
        D.resultOverlay.classList.remove('active');
        onDone();
    }, pauseSecs * 1000);
}

// ============================================================
// Score pop
// ============================================================
function showScorePop(pts, positive) {
    const pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = positive ? `+${pts}` : `${pts}`;
    pop.style.color = positive ? 'var(--success)' : 'var(--danger)';
    pop.style.fontSize = '1.6rem';
    pop.style.fontWeight = '800';
    const el = D.totalScoreVal;
    const r = el.getBoundingClientRect();
    pop.style.left = (r.left + r.width / 2 - 20) + 'px';
    pop.style.top  = r.top + 'px';
    pop.style.position = 'fixed';
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 950);
}

// ============================================================
// Milestone flash
// ============================================================
function showMilestone() {
    D.milestoneFlash.textContent = `🎯 ${G.totalScore} pts! Keep going!`;
    D.milestoneFlash.classList.remove('active');
    void D.milestoneFlash.offsetWidth;
    D.milestoneFlash.classList.add('active');
    setTimeout(() => D.milestoneFlash.classList.remove('active'),
        (S.ui.phaseFlashDurationSec || 2.5) * 1000);
}

// ============================================================
// Check advance conditions after a round
// ============================================================
function checkAdvance(pts) {
    const phase = S.phases[G.phaseIdx];
    const cond  = phase.advanceCondition;

    // Game over?
    if (G.consecutiveZero >= S.scoring.gameOverConsecutiveZeros) {
        showGameOver();
        return;
    }

    // Update consecutiveGood
    const threshold = cond.minPts || 0;
    if (pts >= threshold && pts > 0) {
        G.consecutiveGood++;
    } else {
        G.consecutiveGood = 0;
    }

    let shouldAdvance = false;

    if (cond.type === 'totalScore') {
        shouldAdvance = G.totalScore >= cond.value;

    } else if (cond.type === 'consecutive') {
        shouldAdvance = G.consecutiveGood >= cond.consecutive;

    } else if (cond.type === 'consecutiveAtMaxLength') {
        const [minLen, maxLen] = phase.seqLength;
        const grown = Math.floor(G.phaseScore / (phase.lengthGrowInterval || 200));
        const currentLen = Math.min(maxLen, minLen + grown);
        shouldAdvance = (currentLen >= maxLen) && (G.consecutiveGood >= cond.consecutive);
    }

    if (shouldAdvance) {
        if (G.phaseIdx >= S.phases.length - 1) {
            showVictory();
        } else {
            showPhaseComplete();
        }
    } else {
        startRound();
    }
}

// ============================================================
// Phase complete
// ============================================================
function showPhaseComplete() {
    const phase = S.phases[G.phaseIdx];
    const icons = ['⭐','🌟','💫','🏆'];
    D.phaseIcon.textContent = icons[G.phaseIdx] || '⭐';
    D.phaseCompleteTitle.textContent = `Phase ${phase.id} Complete!`;
    D.phaseCompleteText.textContent = phase.description || '';
    D.phaseScoreVal.textContent = G.phaseScore;
    D.phaseTotalVal.textContent = G.totalScore;

    showScreen('phaseScreen');
}

function advancePhase() {
    G.phaseIdx++;
    G.phaseScore      = 0;
    G.roundsInPhase   = 0;
    G.consecutiveGood = 0;
    G.consecutiveZero = 0;
    showScreen('gameScreen');
    startRound();
}

// ============================================================
// Game over
// ============================================================
function showGameOver() {
    D.gameOverScoreVal.textContent = G.totalScore;
    D.gameOverPhaseVal.textContent = G.phaseIdx + 1;
    showScreen('gameOverScreen');
}

// ============================================================
// Victory
// ============================================================
function showVictory() {
    D.victoryScoreVal.textContent = G.totalScore;
    showScreen('victoryScreen');
    launchConfetti();
}

// ============================================================
// Confetti
// ============================================================
function launchConfetti() {
    const canvas = D.victoryCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const colors = ['#5BA3C9','#4CAF50','#FFC107','#F44336','#E91E63','#9C27B0'];
    const dots = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 8,
        life: 1,
    }));

    let startT = null;
    const DURATION = 4000;

    function frame(t) {
        if (!startT) startT = t;
        const elapsed = t - startT;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let stillAlive = false;
        dots.forEach(d => {
            d.x  += d.vx;
            d.y  += d.vy;
            d.rot += d.rotV;
            if (d.y < canvas.height + 20) stillAlive = true;

            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
            ctx.translate(d.x, d.y);
            ctx.rotate(d.rot * Math.PI / 180);
            ctx.fillStyle = d.color;
            ctx.fillRect(-d.r, -d.r / 2, d.r * 2, d.r);
            ctx.restore();
        });

        if (stillAlive && elapsed < DURATION * 1.5) {
            requestAnimationFrame(frame);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
        }
    }
    requestAnimationFrame(frame);
}

// ============================================================
// Web Audio helpers
// ============================================================
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
}

function playTone(freq, gain, type) {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (_) {}
}

function playChord(freqs, gain, duration) {
    try {
        const ctx = getAudioCtx();
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0, ctx.currentTime);
            g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.04);
            osc.stop(ctx.currentTime + duration + 0.05);
        });
    } catch (_) {}
}

// ============================================================
// Reset / new game
// ============================================================
function resetGame() {
    Object.assign(G, {
        phaseIdx: 0, totalScore: 0, phaseScore: 0,
        roundsInPhase: 0, streak: 0, consecutiveZero: 0,
        consecutiveGood: 0, lastMilestone: 0,
        roundActive: false,
    });
    D.totalScoreVal.textContent = '0';
    D.streakVal.textContent = '0';
}

// ============================================================
// Keyboard input
// ============================================================
document.addEventListener('keydown', e => {
    if (!G.roundActive) return;
    const key = e.key.toUpperCase();
    if (['A','T','G','C','U'].includes(key)) {
        e.preventDefault();
        handleInput(key);
    }
});

// ============================================================
// Button clicks
// ============================================================
['A','T','G','C'].forEach(base => {
    const btn = D['btn' + base];
    if (!btn) return;
    btn.addEventListener('click', () => handleInput(btn.dataset.base));
});

$('btnStart').addEventListener('click', () => {
    resetGame();
    showScreen('gameScreen');
    startRound();
});

$('btnNextPhase').addEventListener('click', advancePhase);

$('btnRetry').addEventListener('click', () => {
    resetGame();
    showScreen('gameScreen');
    startRound();
});

$('btnPlayAgain').addEventListener('click', () => {
    resetGame();
    showScreen('gameScreen');
    startRound();
});

// ============================================================
// Init: load settings then wire up start screen
// ============================================================
(async function init() {
    try {
        const r = await fetch('rc_settings.json');
        S = r.ok ? await r.json() : DEFAULT_SETTINGS;
    } catch (_) {
        S = DEFAULT_SETTINGS;
    }
    // Show start screen (already active by default)
})();
