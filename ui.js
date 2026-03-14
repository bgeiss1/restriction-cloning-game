/**
 * ui.js — UI controller for Sticky Ends.
 *
 * Depends on: enzymes.js, plasmid.js, scoring.js, game.js  (loaded before this)
 * Attach everything to window.UI (no ES modules).
 *
 * Manages all interactive panels and reacts to Game custom events.
 */

'use strict';

const UI = (function () {

    // ------------------------------------------------------------------
    // Panel registry  (panelName → element id)
    // ------------------------------------------------------------------
    const PANEL_IDS = {
        'mode-select':         'modeSelectScreen',
        'enzyme-picker':       'enzymePicker',
        'ligation-workspace':  'ligationWorkspace',
        'colony-plate':        'colonyPlate',
        'variant-predictor':   'variantPredictor',
        'score-summary':       'scoreSummary',
        'game-area':           'gameArea',
        'level-info':          'levelInfo',
        'timer-bar':           'timerBar'
    };

    // Cached DOM references
    let _els = {};

    // Current renderer reference (updated when a level loads)
    let _renderer = null;

    // ------------------------------------------------------------------
    // init() — set up all event listeners, cache DOM refs, init panels
    // ------------------------------------------------------------------
    function init() {
        // Cache all panel elements
        for (const [name, id] of Object.entries(PANEL_IDS)) {
            _els[name] = document.getElementById(id);
        }

        // Other key elements
        _els.scoreValue      = document.getElementById('scoreValue');
        _els.correctValue    = document.getElementById('correctValue');
        _els.streakValue     = document.getElementById('streakValue');
        _els.logPanel        = document.getElementById('logPanel');
        _els.analysisPanel   = document.getElementById('analysisPanel');
        _els.enzymeList      = document.getElementById('enzymeList');
        _els.enzymeSelect    = document.getElementById('enzymeSelect');
        _els.enzymeDetail    = document.getElementById('enzymeDetail');
        _els.btnCut          = document.getElementById('btnCut');
        _els.btnReset        = document.getElementById('btnReset');
        _els.btnShowAll      = document.getElementById('btnShowAllSites');
        _els.plasmidInfo     = document.getElementById('plasmidInfo');
        _els.canvas          = document.getElementById('plasmidCanvas');
        _els.toastContainer  = document.getElementById('toastContainer');

        // Mode selection buttons
        _bindModeButtons();

        // Bind enzyme interactions (sidebar + dropdown + cut button)
        _bindEnzymeInteractions();

        // Info tab switching
        _bindInfoTabs();

        // Game event listeners
        bindGameEvents();

        // Initialize canvas renderer with pUC19
        _initRenderer();

        // Show the mode-select screen on startup
        showPanel('mode-select');

        // Populate enzyme lists
        _buildEnzymeLists();
    }

    // ------------------------------------------------------------------
    // _initRenderer()
    // ------------------------------------------------------------------
    function _initRenderer() {
        const canvas = _els.canvas;
        if (!canvas) return;

        // Make canvas responsive
        (function resizeCanvas() {
            const area = canvas.parentElement;
            const size = Math.min(area.clientWidth, area.clientHeight) - 32;
            canvas.width  = size;
            canvas.height = size;
        })();

        _renderer = new PlasmidRenderer(canvas, Game.pUC19);
        _renderer.render(Game.MCS_ENZYMES);

        // Canvas click → select enzyme or show feature info
        _renderer.onClick(({ type, data }) => {
            if (type === 'restriction_site') {
                const name = data.enzymeName || data.enzyme;
                _handleEnzymeSelect(name);
            } else if (type === 'feature') {
                showFeedback(
                    `Feature: ${data.name} | ${data.type} | ${data.start}–${data.end} bp`,
                    'info'
                );
                _renderer.setHighlight(data.name);
                setTimeout(() => _renderer && _renderer.setHighlight(null), 2000);
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            const area = canvas.parentElement;
            const size = Math.min(area.clientWidth, area.clientHeight) - 32;
            canvas.width  = size;
            canvas.height = size;
            if (_renderer) {
                _renderer._computeLayout();
                _renderer.render(
                    Game.state.allSitesVisible ? Game.ALL_ENZYMES : Game.MCS_ENZYMES
                );
            }
        });
    }

    // ------------------------------------------------------------------
    // _bindModeButtons()
    // ------------------------------------------------------------------
    function _bindModeButtons() {
        const btnTutorial  = document.getElementById('btnTutorial');
        const btnChallenge = document.getElementById('btnChallenge');
        const btnSandbox   = document.getElementById('btnSandbox');

        if (btnTutorial)  btnTutorial.addEventListener('click',  () => _startMode('tutorial'));
        if (btnChallenge) btnChallenge.addEventListener('click', () => _startMode('challenge'));
        if (btnSandbox)   btnSandbox.addEventListener('click',   () => _startMode('sandbox'));
    }

    function _startMode(mode) {
        Game.startMode(mode);
        showPanel('game-area');
        if (mode !== 'sandbox') {
            _renderCurrentLevel();
        }
    }

    // ------------------------------------------------------------------
    // _bindEnzymeInteractions()
    // ------------------------------------------------------------------
    function _bindEnzymeInteractions() {
        // Dropdown change
        if (_els.enzymeSelect) {
            _els.enzymeSelect.addEventListener('change', () => {
                const name = _els.enzymeSelect.value;
                if (name) _handleEnzymeSelect(name);
            });
        }

        // Cut button — routed through Game.actions.cutVector
        if (_els.btnCut) {
            _els.btnCut.addEventListener('click', () => {
                const name = Game.state.selectedEnzyme;
                if (!name) return;

                // Disable button during animation
                _els.btnCut.disabled = true;
                if (_els.btnReset) _els.btnReset.disabled = true;

                const outcome = Game.actions.cutVector(name);

                if (outcome.success && outcome.site) {
                    _renderer.renderCutAnimation(name, outcome.site.topStrandCut, () => {
                        if (_els.btnReset) _els.btnReset.disabled = false;
                        // Refresh analysis panel
                        _showAnalysis(name, outcome.sites);
                        // Show ligation workspace
                        if (_renderer) {
                            const vc = Game.state.vectorCutResult;
                            if (vc) {
                                const vEnz = EnzymeDB[name];
                                const endObj = { type: vEnz.overhangType, overhangSeq: vEnz.overhangSeq, enzyme: name };
                                const rcEnd  = { type: vEnz.overhangType, overhangSeq: reverseComplement(vEnz.overhangSeq || ''), enzyme: name };
                                renderLigationWorkspace({ left: rcEnd, right: endObj }, _buildInsertEnds());
                            }
                        }
                    });
                } else {
                    _els.btnCut.disabled = false;
                    if (_els.btnReset) _els.btnReset.disabled = false;
                }
            });
        }

        // Reset button
        if (_els.btnReset) {
            _els.btnReset.addEventListener('click', () => {
                _resetLevel();
            });
        }

        // Show all sites toggle
        if (_els.btnShowAll) {
            _els.btnShowAll.addEventListener('click', () => {
                const g = Game.state;
                g.allSitesVisible = !g.allSitesVisible;
                _els.btnShowAll.textContent = g.allSitesVisible ? 'Show MCS Only' : 'Show All Sites';
                if (_renderer) _renderer.render(g.allSitesVisible ? Game.ALL_ENZYMES : Game.MCS_ENZYMES);
                showFeedback(
                    `Displaying ${g.allSitesVisible ? 'all enzyme' : 'MCS-only'} sites.`,
                    'info'
                );
            });
        }
    }

    // ------------------------------------------------------------------
    // _buildInsertEnds() — derive insert end objects from game state
    // ------------------------------------------------------------------
    function _buildInsertEnds() {
        const ins = Game.state.insertCutResult;
        if (ins) return { left: ins.left, right: ins.right };
        // Fallback: derive from current level insert definition
        const level = Game.state.currentLevel;
        if (!level || !level.insert || !level.insert.ends) return null;
        const le = EnzymeDB[level.insert.ends.left];
        const re = EnzymeDB[level.insert.ends.right];
        if (!le || !re) return null;
        return {
            left:  { type: le.overhangType, overhangSeq: le.overhangSeq  || '', enzyme: level.insert.ends.left  },
            right: { type: re.overhangType, overhangSeq: re.overhangSeq  || '', enzyme: level.insert.ends.right }
        };
    }

    // ------------------------------------------------------------------
    // _resetLevel()
    // ------------------------------------------------------------------
    function _resetLevel() {
        if (_renderer) {
            _renderer._cutAnimState = null;
            _renderer.render(Game.MCS_ENZYMES);
        }

        // Reset enzyme selections
        document.querySelectorAll('.enzyme-item').forEach(el => el.classList.remove('selected'));
        if (_els.enzymeSelect) _els.enzymeSelect.value = '';
        if (_els.btnCut)       _els.btnCut.disabled = true;
        if (_els.enzymeDetail) {
            _els.enzymeDetail.innerHTML =
                '<div style="color:var(--text-muted);font-size:12px;">Click an enzyme to see details.</div>';
        }
        if (_els.analysisPanel) _els.analysisPanel.innerHTML = '';

        Game.state.selectedEnzyme = null;
        Game.state.allSitesVisible = false;
        showFeedback('Level reset.', 'info');
    }

    // ------------------------------------------------------------------
    // _handleEnzymeSelect(name) — called from sidebar, dropdown, or canvas click
    // ------------------------------------------------------------------
    function _handleEnzymeSelect(name) {
        Game.actions.selectEnzyme(name);

        // Update sidebar highlight
        document.querySelectorAll('.enzyme-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.enzyme === name);
        });

        if (_els.enzymeSelect) _els.enzymeSelect.value = name;
        if (_els.btnCut)       _els.btnCut.disabled = false;

        _showEnzymeDetail(name);

        // Re-render plasmid map with selected enzyme sites marked
        if (_renderer) {
            const showSet = Game.state.allSitesVisible ? Game.ALL_ENZYMES : Game.MCS_ENZYMES;
            _renderer.render(showSet);
        }

        // Analysis
        const sites = Game.pUC19.findRestrictionSites([name]);
        showFeedback(`Selected ${name} — ${sites.length} site(s) found.`, 'info');
        _showAnalysis(name, sites);
    }

    // ------------------------------------------------------------------
    // _buildEnzymeLists() — populate sidebar list and dropdown
    // ------------------------------------------------------------------
    function _buildEnzymeLists() {
        const list   = _els.enzymeList;
        const select = _els.enzymeSelect;
        if (!list && !select) return;

        if (list)   list.innerHTML   = '';
        if (select) select.innerHTML = '<option value="">— select enzyme —</option>';

        for (const name of Game.ALL_ENZYMES) {
            const enz = EnzymeDB[name];

            // Sidebar item
            if (list) {
                const item   = document.createElement('div');
                item.className        = 'enzyme-item';
                item.dataset.enzyme   = name;

                const nameEl = document.createElement('span');
                nameEl.className     = 'enzyme-name';
                nameEl.textContent   = name;

                const badge = document.createElement('span');
                badge.className = 'overhang-badge ' + (
                    enz.overhangType === '5prime'  ? 'five-prime'  :
                    enz.overhangType === '3prime'  ? 'three-prime' : 'blunt'
                );
                badge.textContent =
                    enz.overhangType === '5prime'  ? "5'" :
                    enz.overhangType === '3prime'  ? "3'" : '\u229F';

                const seqEl = document.createElement('span');
                seqEl.className   = 'overhang-seq';
                seqEl.textContent = enz.overhangSeq || 'blunt';

                item.appendChild(nameEl);
                item.appendChild(badge);
                item.appendChild(seqEl);
                item.addEventListener('click', () => _handleEnzymeSelect(name));
                list.appendChild(item);
            }

            // Dropdown option
            if (select) {
                const opt       = document.createElement('option');
                opt.value       = name;
                opt.textContent = `${name}  [${enz.recognitionSeq}]`;
                select.appendChild(opt);
            }
        }
    }

    // ------------------------------------------------------------------
    // _renderCurrentLevel() — update level info banner
    // ------------------------------------------------------------------
    function _renderCurrentLevel() {
        const level = Game.state.currentLevel;
        if (!level || !_els['level-info']) return;

        const el = _els['level-info'];
        el.style.display = 'block';
        el.innerHTML = `
            <div class="level-title">${level.title || ''}</div>
            <div class="level-desc">${level.description || ''}</div>
            ${level.teaching_point
                ? `<div class="level-teaching"><strong>Teaching point:</strong> ${level.teaching_point}</div>`
                : ''}
            ${level.objectives && level.objectives.expected_variants !== undefined
                ? `<div class="level-objective">
                     Objective: find the correct enzyme, ligate, and predict
                     <strong>${level.objectives.expected_variants}</strong> variant(s).
                   </div>`
                : ''}
        `;

        // Show timer bar for challenge mode
        if (level.mode === 'challenge' && _els['timer-bar']) {
            _els['timer-bar'].style.display = 'flex';
            _updateTimerBar(level.time_limit_seconds, level.time_limit_seconds);
        } else if (_els['timer-bar']) {
            _els['timer-bar'].style.display = 'none';
        }
    }

    function _updateTimerBar(remaining, total) {
        const bar = _els['timer-bar'];
        if (!bar) return;
        const pct = Math.max(0, Math.round((remaining / total) * 100));
        const fill = bar.querySelector('.timer-fill');
        const label = bar.querySelector('.timer-label');
        if (fill)  fill.style.width = pct + '%';
        if (label) label.textContent = remaining + 's';
        if (pct < 25 && fill) fill.style.background = 'var(--danger)';
        else if (fill) fill.style.background = 'var(--accent)';
    }

    // ------------------------------------------------------------------
    // showPanel(panelName)
    // ------------------------------------------------------------------
    function showPanel(panelName) {
        // Hide all top-level screens
        const topLevel = ['mode-select', 'game-area', 'score-summary'];
        for (const p of topLevel) {
            const el = _els[p] || document.getElementById(PANEL_IDS[p]);
            if (el) el.style.display = 'none';
        }

        const target = _els[panelName] || document.getElementById(PANEL_IDS[panelName]);
        if (target) {
            target.style.display = 'flex';
        }

        // For sub-panels inside game-area, just toggle visibility
        if (!topLevel.includes(panelName)) {
            const gameArea = _els['game-area'] || document.getElementById(PANEL_IDS['game-area']);
            if (gameArea) gameArea.style.display = 'flex';

            const subPanels = ['enzyme-picker', 'ligation-workspace', 'colony-plate',
                               'variant-predictor', 'level-info', 'timer-bar'];
            for (const p of subPanels) {
                const el = _els[p] || document.getElementById(PANEL_IDS[p]);
                if (el) el.style.display = (p === panelName) ? 'block' : 'none';
            }
        }
    }

    // ------------------------------------------------------------------
    // updateScore(scoreData)
    // ------------------------------------------------------------------
    function updateScore(scoreData) {
        if (!scoreData) return;
        if (_els.scoreValue  && scoreData.score   !== undefined) _els.scoreValue.textContent   = scoreData.score;
        if (_els.correctValue && scoreData.correct !== undefined) _els.correctValue.textContent = scoreData.correct;
        if (_els.streakValue && scoreData.streak   !== undefined) _els.streakValue.textContent  = scoreData.streak;
    }

    // ------------------------------------------------------------------
    // showFeedback(message, type)
    // type: 'success'|'warning'|'error'|'info'
    // ------------------------------------------------------------------
    function showFeedback(message, type = 'info') {
        _log(message, type);
        _showToast(message, type);
    }

    // ------------------------------------------------------------------
    // renderLigationWorkspace(vectorEnds, insertEnds)
    //
    // Draws an ASCII-style sticky-end diagram in the ligation workspace div.
    // vectorEnds: { left: endObj, right: endObj }
    // insertEnds: { left: endObj, right: endObj }  (may be null)
    // ------------------------------------------------------------------
    function renderLigationWorkspace(vectorEnds, insertEnds) {
        const container = _els['ligation-workspace'] ||
                          document.getElementById('ligationWorkspace');
        if (!container) return;

        container.style.display = 'block';

        const rows = [];

        function _endDiagram(end, side) {
            // side: 'left' | 'right'
            if (!end) return '<span style="color:var(--text-muted)">—</span>';
            const t = end.type;
            const seq = end.overhangSeq || '';
            if (t === 'blunt') {
                return `<span class="strand-overhang">| (blunt)</span>`;
            }
            if (t === '5prime') {
                if (side === 'right') {
                    // 5' overhang on the right end of a fragment: top strand protrudes left
                    return `
                    <span style="font-family:var(--font-mono);font-size:12px">
                      <span class="strand-top">5'—${seq}</span><br>
                      <span class="strand-bottom">&nbsp;&nbsp;&nbsp;&nbsp;</span><span class="strand-bottom">—3'</span>
                    </span>`;
                } else {
                    return `
                    <span style="font-family:var(--font-mono);font-size:12px">
                      <span class="strand-top">3'—&nbsp;&nbsp;&nbsp;&nbsp;</span><br>
                      <span class="strand-overhang">5'—${seq}</span><span class="strand-bottom">—</span>
                    </span>`;
                }
            }
            if (t === '3prime') {
                if (side === 'right') {
                    return `
                    <span style="font-family:var(--font-mono);font-size:12px">
                      <span class="strand-overhang">${seq}—3'</span><br>
                      <span class="strand-bottom">&nbsp;&nbsp;&nbsp;&nbsp;—5'</span>
                    </span>`;
                } else {
                    return `
                    <span style="font-family:var(--font-mono);font-size:12px">
                      <span class="strand-top">5'—&nbsp;&nbsp;&nbsp;&nbsp;</span><br>
                      <span class="strand-overhang">3'—${seq}</span>
                    </span>`;
                }
            }
            return seq;
        }

        let html = `
        <div class="ligation-diagram">
          <div class="ligation-title" style="color:var(--accent);font-weight:700;margin-bottom:8px;">
            Ligation Workspace
          </div>`;

        // Vector ends row
        html += `
          <div class="ligation-row" style="display:flex;align-items:center;gap:24px;margin-bottom:8px;">
            <div class="ligation-label" style="color:var(--text-muted);min-width:80px;">Vector:</div>
            <div class="end-box" style="background:var(--bg-dark);border:1px solid var(--border);
                border-radius:4px;padding:6px 12px;">
              ${_endDiagram(vectorEnds.left,  'left')}
              &nbsp;&nbsp;&nbsp;&nbsp;
              <span style="color:var(--text-muted)">— vector backbone —</span>
              &nbsp;&nbsp;&nbsp;&nbsp;
              ${_endDiagram(vectorEnds.right, 'right')}
            </div>
          </div>`;

        // Insert ends row (if available)
        if (insertEnds) {
            html += `
          <div class="ligation-row" style="display:flex;align-items:center;gap:24px;margin-bottom:8px;">
            <div class="ligation-label" style="color:var(--text-muted);min-width:80px;">Insert:</div>
            <div class="end-box" style="background:var(--bg-dark);border:1px solid var(--border);
                border-radius:4px;padding:6px 12px;">
              ${_endDiagram(insertEnds.left,  'left')}
              &nbsp;&nbsp;&nbsp;&nbsp;
              <span style="color:var(--text-muted)">— insert DNA —</span>
              &nbsp;&nbsp;&nbsp;&nbsp;
              ${_endDiagram(insertEnds.right, 'right')}
            </div>
          </div>`;

            // Compatibility check row
            if (vectorEnds.left && insertEnds.left) {
                const compatL = areEndsCompatible(vectorEnds.left, insertEnds.left);
                const compatR = (vectorEnds.right && insertEnds.right)
                    ? areEndsCompatible(vectorEnds.right, insertEnds.right)
                    : { compatible: false, note: 'No right ends' };
                const ok   = compatL.compatible && compatR.compatible;
                const color = ok ? 'var(--success)' : 'var(--danger)';
                html += `
          <div class="ligation-compat" style="margin-top:6px;color:${color};font-size:12px;">
            ${ok ? '✓ Ends are compatible — ligation possible' : '✗ Ends incompatible'}
            ${compatL.destroysSite || compatR.destroysSite
                ? '<span style="color:var(--warn)"> — WARNING: ligation destroys recognition site(s)</span>'
                : ''}
          </div>`;
            }
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    // ------------------------------------------------------------------
    // renderColonyPlate(variants)
    //
    // Renders a virtual colony plate. Variants is the predictVariants() result.
    // ------------------------------------------------------------------
    function renderColonyPlate(variants) {
        const container = _els['colony-plate'] ||
                          document.getElementById('colonyPlate');
        if (!container) return;

        container.style.display = 'block';

        if (!variants || !variants.variants) {
            container.innerHTML = '<p style="color:var(--text-muted)">No variants to display.</p>';
            return;
        }

        const COLONY_COLORS = {
            forward:     '#66BB6A',   // green — correct recombinant
            reverse:     '#FFD54F',   // yellow — wrong orientation
            selfLigation:'#EF5350',   // red — background (no insert)
            default:     '#78909C'    // grey
        };

        // Determine how many colonies to simulate
        const total = 20;

        // Probability weights: forward >> reverse >> self-ligation
        const weights = variants.variants.map(v => {
            if (v.selfLigation)        return 0.15;
            if (v.orientation === 'forward') return 0.55;
            if (v.orientation === 'reverse') return 0.30;
            return 0.1;
        });
        const wSum = weights.reduce((a, b) => a + b, 0);
        const probs = weights.map(w => w / wSum);

        // Assign each colony to a variant
        const colonies = [];
        for (let i = 0; i < total; i++) {
            let r = Math.random();
            let vi = 0;
            for (let j = 0; j < probs.length; j++) {
                r -= probs[j];
                if (r <= 0) { vi = j; break; }
            }
            const v = variants.variants[vi];
            colonies.push({
                variant: v,
                color: v.selfLigation ? COLONY_COLORS.selfLigation
                     : v.orientation === 'reverse' ? COLONY_COLORS.reverse
                     : v.orientation === 'forward' ? COLONY_COLORS.forward
                     : COLONY_COLORS.default
            });
        }

        // Shuffle for realism
        for (let i = colonies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colonies[i], colonies[j]] = [colonies[j], colonies[i]];
        }

        // Build HTML
        let html = `
        <div class="colony-plate-wrapper">
          <div style="color:var(--accent);font-weight:700;margin-bottom:8px;">Virtual Colony Plate</div>
          <div class="plate-dish" style="
            width:260px;height:260px;
            border-radius:50%;
            background:radial-gradient(circle at 40% 35%, #2a3d2a, #1a2a1a);
            border:3px solid #445544;
            position:relative;
            margin:0 auto 12px;">`;

        // Place colonies at random positions inside the circle
        const placed = [];
        for (const colony of colonies) {
            // Random point inside circle r=100
            let cx, cy, tries = 0;
            do {
                const r = Math.sqrt(Math.random()) * 105;
                const a = Math.random() * 2 * Math.PI;
                cx = Math.round(130 + r * Math.cos(a));
                cy = Math.round(130 + r * Math.sin(a));
                tries++;
            } while (tries < 30 && placed.some(p => Math.hypot(p.x - cx, p.y - cy) < 16));
            placed.push({ x: cx, y: cy });

            html += `
            <div title="${colony.variant.description}" style="
              position:absolute;
              left:${cx - 8}px;top:${cy - 8}px;
              width:16px;height:16px;
              border-radius:50%;
              background:${colony.color};
              cursor:pointer;
              box-shadow:0 0 4px rgba(0,0,0,0.6);
              transition:transform 0.15s;
            " onmouseover="this.style.transform='scale(1.5)'" onmouseout="this.style.transform='scale(1)'">
            </div>`;
        }

        html += `</div>`;

        // Legend
        html += `<div class="colony-legend" style="font-size:11px;font-family:var(--font-mono)">`;
        const seen = new Set();
        for (const colony of colonies) {
            const key = colony.variant.orientation + String(colony.variant.selfLigation);
            if (!seen.has(key)) {
                seen.add(key);
                html += `
                <div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colony.color}"></span>
                  <span style="color:var(--text-muted)">${colony.variant.description}</span>
                </div>`;
            }
        }
        html += `</div></div>`;

        container.innerHTML = html;
    }

    // ------------------------------------------------------------------
    // renderVariantPredictor()
    // ------------------------------------------------------------------
    function renderVariantPredictor() {
        const container = _els['variant-predictor'] ||
                          document.getElementById('variantPredictor');
        if (!container) return;

        container.style.display = 'block';

        const level = Game.state.currentLevel;
        const hasHint = level && level.hints && level.hints.length > 0;

        container.innerHTML = `
        <div class="variant-predictor-panel"
             style="background:var(--bg-mid);border:1px solid var(--border);border-radius:var(--radius);
                    padding:16px;max-width:400px;">
          <div style="color:var(--accent);font-weight:700;margin-bottom:8px;">
            Predict Ligation Variants
          </div>
          <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px;">
            How many distinct ligation products do you expect?
            (Include correct insertion, wrong orientation, self-ligation, etc.)
          </p>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <input type="number" id="variantCountInput" min="0" max="20" value="1"
              style="width:70px;background:var(--bg-dark);color:var(--text-main);
                     border:1px solid var(--border);border-radius:var(--radius);
                     padding:6px 10px;font-size:1rem;text-align:center;" />
            <button class="primary" id="btnSubmitVariants">Submit Prediction</button>
            ${hasHint ? '<button id="btnHintVariants">Hint</button>' : ''}
          </div>
          <div id="variantHintText" style="display:none;color:var(--warn);font-size:12px;"></div>
        </div>`;

        // Submit handler
        const input   = container.querySelector('#variantCountInput');
        const btnSub  = container.querySelector('#btnSubmitVariants');
        const btnHint = container.querySelector('#btnHintVariants');

        if (btnSub && input) {
            btnSub.addEventListener('click', () => {
                const count = parseInt(input.value, 10);
                if (isNaN(count) || count < 0) return;
                Game.actions.predictVariants(count);
            });
        }

        if (btnHint && level && level.hints) {
            btnHint.addEventListener('click', () => {
                const hintEl = container.querySelector('#variantHintText');
                if (hintEl) {
                    hintEl.style.display = 'block';
                    hintEl.textContent   = level.hints[0] || 'Think about orientation and self-ligation.';
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // _showEnzymeDetail(name) — update the sidebar detail panel
    // ------------------------------------------------------------------
    function _showEnzymeDetail(name) {
        const el = _els.enzymeDetail;
        if (!el) return;

        const enz = EnzymeDB[name];
        if (!enz) { el.innerHTML = ''; return; }

        const seq    = enz.recognitionSeq;
        const topCut = enz.cutPositionTop;
        const topStr = seq.slice(0, topCut) +
                       '<span class="cut-mark">↓</span>' +
                       seq.slice(topCut);
        // Bottom strand shown 3'→5' left-to-right = complement of top strand (no reversal)
        const _comp  = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const botSeq = seq.split('').map(b => _comp[b] || b).join('');
        const botCut = enz.cutPositionBottom;
        const botStr = botSeq.slice(0, botCut) +
                       '<span class="cut-mark">↑</span>' +
                       botSeq.slice(botCut);

        const compat = (enz.compatibleWith || [enz.name])
            .filter(n => n !== name).join(', ') || 'self only';

        el.innerHTML = `
          <h3>${name}</h3>
          <div class="recog">
            5'—${topStr}—3'<br>
            3'—${botStr}—5'
          </div>
          <div class="detail-row">Type: <strong>${enz.overhangType.replace('prime', "' overhang")}</strong></div>
          <div class="detail-row">Overhang: <strong style="font-family:var(--font-mono)">${enz.overhangSeq || '(blunt)'}</strong></div>
          <div class="detail-row">Compatible: <strong>${compat}</strong></div>
          ${enz.destroysSiteWith && enz.destroysSiteWith.length
            ? `<div class="detail-row" style="color:var(--warn)">
                 ⚠ Hybrid ligation with ${enz.destroysSiteWith.join('/')} destroys both sites
               </div>` : ''}`;
    }

    // ------------------------------------------------------------------
    // _showAnalysis(enzymeName, sites) — analysis panel content
    // ------------------------------------------------------------------
    function _showAnalysis(enzymeName, sites) {
        const el = _els.analysisPanel;
        if (!el) return;

        if (!sites || sites.length === 0) {
            el.innerHTML = `<span style="color:var(--text-muted)">No sites found for ${enzymeName} in pUC19.</span>`;
            return;
        }

        const enz    = EnzymeDB[enzymeName];
        const seq    = enz.recognitionSeq;
        const topCut = enz.cutPositionTop;
        // Bottom strand shown 3'→5' left-to-right = complement of top strand (no reversal)
        const _c     = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const botSeq = seq.split('').map(b => _c[b] || b).join('');
        const botCut = enz.cutPositionBottom;

        let diagram = '';
        if (enz.overhangType === '5prime') {
            const topLeft  = seq.slice(0, topCut);
            const botLeft  = botSeq.slice(0, botCut);
            const topRight = seq.slice(topCut);
            const botRight = botSeq.slice(botCut);
            diagram = `
              <div class="overhang-visual">
                <span class="strand-top">${topLeft}&nbsp;&nbsp;&nbsp;&nbsp;</span>
                <span class="strand-overhang">${topRight}</span>
                &nbsp;&nbsp;&nbsp;<span style="color:var(--text-muted)">← 5' overhang</span>
              </div><br>
              <div class="overhang-visual">
                <span class="strand-bottom">${botLeft}</span>
                <span class="strand-overhang">&nbsp;&nbsp;&nbsp;&nbsp;</span>
                <span class="strand-bottom">${botRight}</span>
              </div>`;
        } else if (enz.overhangType === '3prime') {
            diagram = `
              <div class="overhang-visual">
                <span class="strand-top">${seq.slice(0, topCut)}</span>
                <span class="strand-overhang">&nbsp;&nbsp;&nbsp;&nbsp;</span>
                <span class="strand-top">${seq.slice(topCut)}</span>
                &nbsp;&nbsp;<span style="color:var(--text-muted)">← 3' overhang</span>
              </div><br>
              <div class="overhang-visual">
                <span class="strand-bottom">${botSeq.slice(0, botCut)}</span>
                <span class="strand-overhang">${botSeq.slice(botCut)}&nbsp;&nbsp;&nbsp;&nbsp;</span>
              </div>`;
        } else {
            diagram = `
              <div class="overhang-visual">
                <span class="strand-top">${seq.slice(0, topCut)}</span>
                <span style="color:var(--danger)"> | </span>
                <span class="strand-top">${seq.slice(topCut)}</span>
                &nbsp;&nbsp;<span style="color:var(--text-muted)">← blunt end</span>
              </div>`;
        }

        const endObj  = { type: enz.overhangType, overhangSeq: enz.overhangSeq, enzyme: enzymeName };
        const rcEnd   = { type: enz.overhangType, overhangSeq: reverseComplement(enz.overhangSeq || ''), enzyme: enzymeName };
        const compat  = areEndsCompatible(endObj, rcEnd);

        const paired    = (enzymeName !== 'EcoRI') ? 'EcoRI' : 'BamHI';
        const pairedEnz = EnzymeDB[paired];
        const pvResult  = predictVariants(
            {
                left:  { type: enz.overhangType,       overhangSeq: reverseComplement(enz.overhangSeq || ''),       enzyme: enzymeName },
                right: { type: pairedEnz.overhangType, overhangSeq: reverseComplement(pairedEnz.overhangSeq || ''), enzyme: paired }
            },
            {
                left:  { type: enz.overhangType,       overhangSeq: enz.overhangSeq       || '', enzyme: enzymeName },
                right: { type: pairedEnz.overhangType, overhangSeq: pairedEnz.overhangSeq || '', enzyme: paired }
            }
        );

        const variantHTML = pvResult.variants.map((v, i) =>
            `<div style="color:${v.selfLigation ? 'var(--warn)' : v.destroysSite ? 'var(--danger)' : 'var(--success)'}">
              ${i + 1}. ${v.description}${v.destroysSite ? ' ⚠ site destroyed' : ''}${v.selfLigation ? ' [background]' : ''}
             </div>`
        ).join('');

        el.innerHTML = `
          <strong style="color:var(--accent)">${enzymeName}</strong>
          — ${sites.length} site(s) at: ${sites.map(s => s.topStrandCut).join(', ')} bp<br><br>
          <strong>Cut diagram:</strong><br>${diagram}<br>
          <strong>Self-ligation risk:</strong>
          <span style="color:${compat.compatible ? 'var(--warn)' : 'var(--success)'}">
            ${compat.compatible ? 'Possible (consider directional cloning)' : 'Not possible'}
          </span><br>
          <span style="color:var(--text-muted);font-size:11px">${compat.note}</span><br><br>
          <strong>Directional prediction (${enzymeName} + ${paired}):</strong>
          <span style="color:${pvResult.directional ? 'var(--success)' : 'var(--text-muted)'}">
            ${pvResult.directional ? 'Directional' : 'Non-directional'}
          </span><br>${variantHTML}`;
    }

    // ------------------------------------------------------------------
    // bindGameEvents() — listen to game:* custom events
    // ------------------------------------------------------------------
    function bindGameEvents() {
        document.addEventListener('game:statechange', (e) => {
            const { from, to } = e.detail;
            if (to === 'menu') showPanel('mode-select');
            if (to === 'result') _renderScoreSummary();
        });

        document.addEventListener('game:scored', (e) => {
            updateScore({
                score:   Scoring.score,
                streak:  Scoring.streak,
                correct: Scoring.history.filter(h => h.points > 0).length
            });
        });

        document.addEventListener('game:feedback', (e) => {
            const { message, type } = e.detail;
            showFeedback(message, type);
        });

        document.addEventListener('game:levelLoaded', (e) => {
            _renderCurrentLevel();
        });

        document.addEventListener('game:timerTick', (e) => {
            const level = Game.state.currentLevel;
            if (level && level.time_limit_seconds) {
                _updateTimerBar(e.detail.timeRemaining, level.time_limit_seconds);
            }
        });

        document.addEventListener('game:ligationComplete', (e) => {
            const variants = e.detail.variants;
            renderColonyPlate(variants);
            renderVariantPredictor();
        });
    }

    // ------------------------------------------------------------------
    // _renderScoreSummary()
    // ------------------------------------------------------------------
    function _renderScoreSummary() {
        const container = _els['score-summary'] || document.getElementById('scoreSummary');
        if (!container) return;

        showPanel('score-summary');

        const summary = Scoring.getSummary();
        container.innerHTML = `
        <div class="score-summary-inner"
             style="max-width:500px;margin:0 auto;padding:32px;
                    background:var(--bg-mid);border-radius:var(--radius);
                    border:1px solid var(--border);">
          <h2 style="color:var(--accent);text-align:center;margin-bottom:24px;">
            Level Complete
          </h2>
          <div style="font-size:2.5rem;font-weight:700;text-align:center;
                      color:var(--accent);font-family:var(--font-mono);">
            ${summary.score}
          </div>
          <div style="text-align:center;color:var(--text-muted);margin-bottom:20px;">
            Total Points
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="color:var(--text-muted);padding:4px 0;">Points earned</td>
                <td style="text-align:right;color:var(--success)">+${summary.totalEarned}</td></tr>
            <tr><td style="color:var(--text-muted);">Penalties</td>
                <td style="text-align:right;color:var(--danger)">${summary.totalPenalties}</td></tr>
            <tr><td style="color:var(--text-muted);">Actions taken</td>
                <td style="text-align:right;">${summary.actionCount}</td></tr>
            <tr><td style="color:var(--text-muted);">Best streak</td>
                <td style="text-align:right;color:var(--warn)">${summary.highestStreak}</td></tr>
          </table>
          <div style="margin-top:20px;">
            <div style="color:var(--text-muted);font-size:11px;margin-bottom:8px;">Action history:</div>
            ${summary.history.slice(-10).map(h =>
                `<div style="font-size:11px;color:${h.points > 0 ? 'var(--success)' : 'var(--danger)'}">
                   ${h.points > 0 ? '+' : ''}${h.points}  ${h.message}
                 </div>`
            ).join('')}
          </div>
          <div style="display:flex;justify-content:center;gap:12px;margin-top:24px;">
            <button class="primary" id="btnPlayAgain">Play Again</button>
            <button id="btnBackToMenu">Main Menu</button>
          </div>
        </div>`;

        const btnAgain = container.querySelector('#btnPlayAgain');
        const btnMenu  = container.querySelector('#btnBackToMenu');
        if (btnAgain) {
            btnAgain.addEventListener('click', () => {
                const mode = Game.gameState === 'result'
                    ? (Game.state.levelList === Game._tutorialLevels ? 'tutorial' : 'challenge')
                    : 'tutorial';
                _startMode(mode);
            });
        }
        if (btnMenu) {
            btnMenu.addEventListener('click', () => showPanel('mode-select'));
        }
    }

    // ------------------------------------------------------------------
    // Internal log & toast (private helpers used by showFeedback)
    // ------------------------------------------------------------------
    function _log(message, type = 'info') {
        const el = _els.logPanel;
        if (!el) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
        entry.textContent = `[${time}] ${message}`;
        el.prepend(entry);
        while (el.children.length > 80) el.removeChild(el.lastChild);
    }

    function _showToast(message, type = 'info') {
        const container = _els.toastContainer;
        if (!container) return;
        const toast = document.createElement('div');
        toast.className   = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) container.removeChild(toast); }, 3200);
    }

    // ------------------------------------------------------------------
    // _bindInfoTabs()
    // ------------------------------------------------------------------
    function _bindInfoTabs() {
        document.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const targetId = tab.dataset.panel;
                document.querySelectorAll('#logPanel, #analysisPanel, #helpPanel').forEach(p => {
                    p.classList.toggle('active', p.id === targetId);
                });
            });
        });
    }

    // ------------------------------------------------------------------
    // Public surface
    // ------------------------------------------------------------------
    return {
        init,
        showPanel,
        updateScore,
        showFeedback,
        renderLigationWorkspace,
        renderColonyPlate,
        renderVariantPredictor,
        bindGameEvents,
        // Expose renderer reference for external access
        get renderer() { return _renderer; }
    };

}());

window.UI = UI;
