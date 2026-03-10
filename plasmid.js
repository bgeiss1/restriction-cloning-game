/**
 * plasmid.js — Plasmid data model and Canvas-based circular renderer
 * for the Restriction Cloning Educational Game.
 *
 * Depends on enzymes.js being loaded first (uses findCutSites, EnzymeDB).
 * All classes attached to window (no ES modules).
 *
 * Usage:
 *   const p = new Plasmid({ name: 'pUC19', sequence: '...', features: [...] });
 *   const renderer = new PlasmidRenderer(canvasElement, p);
 *   renderer.render();
 */

'use strict';

// ---------------------------------------------------------------------------
// Colour palette for feature types and resistance genes
// ---------------------------------------------------------------------------
const FEATURE_COLORS = {
    ori:        '#4FC3F7',   // light blue  — origin of replication
    resistance: '#EF5350',   // red         — antibiotic resistance (default)
    ampR:       '#EF5350',   // red         — ampicillin resistance
    kanR:       '#FFD54F',   // yellow      — kanamycin resistance
    tetR:       '#FF8A65',   // orange      — tetracycline resistance
    cmR:        '#CE93D8',   // purple      — chloramphenicol resistance
    mcs:        '#A5D6A7',   // green       — multiple cloning site
    gene:       '#90CAF9',   // blue        — generic gene
    promoter:   '#FFCC02',   // amber       — promoter
    terminator: '#FF7043',   // deep orange — terminator
    lacZ:       '#80DEEA',   // cyan        — lacZ / lacZ-alpha
    default:    '#B0BEC5'    // grey        — unknown
};

function featureColor(feature) {
    // First, try matching by feature name (e.g. 'ampR', 'kanR')
    const nameLower = feature.name.toLowerCase();
    for (const key of Object.keys(FEATURE_COLORS)) {
        if (nameLower.includes(key.toLowerCase())) return FEATURE_COLORS[key];
    }
    // Fall back to type
    return feature.color || FEATURE_COLORS[feature.type] || FEATURE_COLORS.default;
}

// ---------------------------------------------------------------------------
// Plasmid — data model
// ---------------------------------------------------------------------------
class Plasmid {
    /**
     * @param {Object} opts
     * @param {string} opts.name       — plasmid name (e.g. 'pUC19')
     * @param {string} opts.sequence   — full circular DNA sequence (top strand, 5'→3')
     * @param {Array}  opts.features   — array of feature objects (see below)
     *
     * Feature object:
     *   {
     *     name   : string,
     *     start  : number,   0-based, inclusive
     *     end    : number,   0-based, inclusive (wrap-around handled)
     *     type   : 'ori'|'resistance'|'mcs'|'gene'|'promoter'|'terminator',
     *     strand : 1 | -1,
     *     color  : string (optional, overrides palette)
     *   }
     */
    constructor({ name = 'Unnamed', sequence = '', features = [] } = {}) {
        this.name     = name;
        this.sequence = sequence.toUpperCase();
        this.length   = this.sequence.length;
        this.features = features.map(f => ({ ...f })); // shallow clone
    }

    /** Add a feature to the plasmid */
    addFeature(feature) {
        this.features.push({ ...feature });
    }

    /**
     * Find all restriction sites for a list of enzyme names.
     * Returns array of cut-site objects (from findCutSites), each annotated
     * with .enzymeName for convenience.
     *
     * @param {string[]} enzymeNames
     * @returns {Array}
     */
    findRestrictionSites(enzymeNames) {
        const sites = [];
        for (const name of enzymeNames) {
            const found = findCutSites(this.sequence, name, /* circular= */ true);
            for (const site of found) {
                sites.push({ ...site, enzymeName: name });
            }
        }
        // Sort by position
        sites.sort((a, b) => a.topStrandCut - b.topStrandCut);
        return sites;
    }

    /**
     * Linearise the plasmid by cutting at a given restriction site.
     * Returns a new Plasmid object representing the linear form (sequence
     * starting at the cut site, looped around).
     *
     * @param {Object} cutSite — as returned by findRestrictionSites
     * @returns {Plasmid}
     */
    getLinearized(cutSite) {
        const cutPos   = cutSite.topStrandCut % this.length;
        // Rearrange sequence so the cut point is at position 0
        const linSeq   = this.sequence.slice(cutPos) + this.sequence.slice(0, cutPos);

        // Remap features
        const linFeatures = this.features.map(f => {
            let start = (f.start - cutPos + this.length) % this.length;
            let end   = (f.end   - cutPos + this.length) % this.length;
            return { ...f, start, end };
        });

        const linear = new Plasmid({
            name:     this.name + ' (linearised)',
            sequence: linSeq,
            features: linFeatures
        });
        linear._cutInfo = cutSite;
        return linear;
    }

    /** Serialise to a plain JSON-safe object */
    toJSON() {
        return {
            name:     this.name,
            sequence: this.sequence,
            features: this.features
        };
    }

    /** Restore from a plain JSON object */
    static fromJSON(obj) {
        return new Plasmid(obj);
    }
}

// ---------------------------------------------------------------------------
// PlasmidRenderer — Canvas-based circular renderer
// ---------------------------------------------------------------------------
class PlasmidRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Plasmid} plasmid
     */
    constructor(canvas, plasmid) {
        this.canvas   = canvas;
        this.ctx      = canvas.getContext('2d');
        this.plasmid  = plasmid;

        // Layout constants (scaled from canvas size)
        this._layout = {};
        this._computeLayout();

        // State
        this._highlightedFeature = null;
        this._clickCallbacks     = [];
        this._cutAnimState       = null;   // used during cut animation
        this._restrictionSites   = [];     // last rendered sites

        // Bind click handler
        this.canvas.addEventListener('click', (e) => this._handleClick(e));
    }

    // -------------------------------------------------------------------------
    // Layout helpers
    // -------------------------------------------------------------------------
    _computeLayout() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const minDim = Math.min(w, h);

        this._layout = {
            cx,
            cy,
            outerRadius:    minDim * 0.38,   // outer DNA ring
            innerRadius:    minDim * 0.30,   // inner DNA ring
            featureRadius:  minDim * 0.43,   // arcs drawn outside DNA ring
            labelRadius:    minDim * 0.50,   // feature labels
            tickRadius:     minDim * 0.26,   // restriction-site tick inner end
            tickOuterR:     minDim * 0.29,   // restriction-site tick outer end
            rsLabelRadius:  minDim * 0.22,   // restriction-site labels
            featureWidth:   minDim * 0.055   // arc thickness
        };
    }

    // -------------------------------------------------------------------------
    // Angle conversion: bp position → radians (0 at top, clockwise)
    // -------------------------------------------------------------------------
    _bpToAngle(bp) {
        return (bp / this.plasmid.length) * 2 * Math.PI - Math.PI / 2;
    }

    // -------------------------------------------------------------------------
    // Core render
    // -------------------------------------------------------------------------
    /**
     * Draws the full plasmid map.
     * @param {string[]} [enzymeNames] — optional list of enzymes to mark
     */
    render(enzymeNames = []) {
        const ctx = this.ctx;
        const { cx, cy, outerRadius, innerRadius } = this._layout;

        // Clear
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Compute restriction sites if enzyme list provided
        if (enzymeNames.length > 0) {
            this._restrictionSites = this.plasmid.findRestrictionSites(enzymeNames);
        }

        // Draw layers back-to-front
        this._drawBackbone();
        this._drawFeatures();
        this._drawRestrictionSites();
        this._drawCenterLabel();
        this._drawOriginMark();
    }

    // -------------------------------------------------------------------------
    // Draw the double-stranded DNA backbone (two concentric rings)
    // -------------------------------------------------------------------------
    _drawBackbone() {
        const ctx = this.ctx;
        const { cx, cy, outerRadius, innerRadius } = this._layout;

        // Outer ring (top strand)
        ctx.beginPath();
        ctx.arc(cx, cy, outerRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#37474F';
        ctx.lineWidth   = 8;
        ctx.stroke();

        // Inner ring (bottom strand)
        ctx.beginPath();
        ctx.arc(cx, cy, innerRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#546E7A';
        ctx.lineWidth   = 4;
        ctx.stroke();

        // Radial "rungs" (base pairs) — light dashed lines between the two rings
        ctx.setLineDash([2, 10]);
        ctx.strokeStyle = '#78909C';
        ctx.lineWidth   = 1;
        const nRungs = 72; // every 5°
        for (let i = 0; i < nRungs; i++) {
            const angle = (i / nRungs) * 2 * Math.PI;
            const cos   = Math.cos(angle);
            const sin   = Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(cx + (innerRadius + 2) * cos, cy + (innerRadius + 2) * sin);
            ctx.lineTo(cx + (outerRadius - 2) * cos, cy + (outerRadius - 2) * sin);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // -------------------------------------------------------------------------
    // Draw feature arcs
    // -------------------------------------------------------------------------
    _drawFeatures() {
        const ctx = this.ctx;
        const { cx, cy, outerRadius, featureWidth, labelRadius } = this._layout;
        const featureR = outerRadius + featureWidth * 0.3;

        for (const feature of this.plasmid.features) {
            const startAngle = this._bpToAngle(feature.start);
            const endAngle   = this._bpToAngle(feature.end + 1);
            const color      = featureColor(feature);
            const isHL       = this._highlightedFeature === feature.name;

            // Feature arc
            ctx.beginPath();
            ctx.arc(cx, cy, featureR, startAngle, endAngle, false);
            ctx.strokeStyle = isHL ? '#FFFFFF' : color;
            ctx.lineWidth   = featureWidth * (isHL ? 1.5 : 1);
            ctx.stroke();

            // Arrow tip for directional features
            if (feature.end - feature.start > this.plasmid.length * 0.015) {
                const arrowAngle = feature.strand === 1 ? endAngle : startAngle;
                const arrowDir   = feature.strand === 1 ? 1 : -1;
                const ax = cx + featureR * Math.cos(arrowAngle);
                const ay = cy + featureR * Math.sin(arrowAngle);
                const tangentAngle = arrowAngle + arrowDir * Math.PI / 2;
                ctx.save();
                ctx.translate(ax, ay);
                ctx.rotate(tangentAngle);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-8 * arrowDir, -5);
                ctx.lineTo(-8 * arrowDir,  5);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                ctx.restore();
            }

            // Label — placed radially outward at the midpoint of the feature
            const midBp    = (feature.start + feature.end) / 2;
            const midAngle = this._bpToAngle(midBp);
            const lx = cx + labelRadius * Math.cos(midAngle);
            const ly = cy + labelRadius * Math.sin(midAngle);

            ctx.save();
            ctx.translate(lx, ly);
            // Rotate text so it reads outward
            let textAngle = midAngle + Math.PI / 2;
            if (midAngle > Math.PI / 2 && midAngle < 3 * Math.PI / 2) {
                textAngle += Math.PI;
            }
            ctx.rotate(textAngle);
            ctx.font        = isHL ? 'bold 12px monospace' : '11px sans-serif';
            ctx.fillStyle   = isHL ? '#FFFFFF' : color;
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(feature.name, 0, 0);
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------------
    // Draw restriction site tick marks and labels
    // -------------------------------------------------------------------------
    _drawRestrictionSites() {
        const ctx = this.ctx;
        const { cx, cy, outerRadius, innerRadius, rsLabelRadius } = this._layout;

        // Colours for enzyme labels — cycle through a palette
        const palette = [
            '#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#C77DFF',
            '#FF9F43','#54A0FF','#5F27CD','#01CBC6','#FD7272'
        ];
        const enzymeColorMap = {};
        let colorIdx = 0;

        for (const site of this._restrictionSites) {
            const name = site.enzymeName || site.enzyme;
            if (!enzymeColorMap[name]) {
                enzymeColorMap[name] = palette[colorIdx++ % palette.length];
            }

            const angle = this._bpToAngle(site.topStrandCut);
            const cos   = Math.cos(angle);
            const sin   = Math.sin(angle);

            // Tick mark spanning the DNA rings
            ctx.beginPath();
            ctx.moveTo(cx + (innerRadius - 6) * cos, cy + (innerRadius - 6) * sin);
            ctx.lineTo(cx + (outerRadius + 6) * cos, cy + (outerRadius + 6) * sin);
            ctx.strokeStyle = enzymeColorMap[name];
            ctx.lineWidth   = 2.5;
            ctx.stroke();

            // Enzyme name label
            const lx = cx + rsLabelRadius * cos;
            const ly = cy + rsLabelRadius * sin;

            ctx.save();
            ctx.translate(lx, ly);
            let textAngle = angle + Math.PI / 2;
            if (angle > Math.PI / 2 && angle < 3 * Math.PI / 2) {
                textAngle += Math.PI;
            }
            ctx.rotate(textAngle);
            ctx.font        = 'bold 10px monospace';
            ctx.fillStyle   = enzymeColorMap[name];
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, 0, 0);
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------------
    // Draw the origin of replication marker (position 0)
    // -------------------------------------------------------------------------
    _drawOriginMark() {
        const ctx = this.ctx;
        const { cx, cy, outerRadius, innerRadius } = this._layout;
        const angle = this._bpToAngle(0);
        const cos   = Math.cos(angle);
        const sin   = Math.sin(angle);

        // Double tick
        ctx.beginPath();
        ctx.moveTo(cx + (innerRadius - 10) * cos, cy + (innerRadius - 10) * sin);
        ctx.lineTo(cx + (outerRadius + 10) * cos, cy + (outerRadius + 10) * sin);
        ctx.strokeStyle = '#ECEFF1';
        ctx.lineWidth   = 3;
        ctx.stroke();

        // Small "ORI" label
        const lx = cx + (outerRadius + 18) * cos;
        const ly = cy + (outerRadius + 18) * sin;
        ctx.font      = 'bold 10px sans-serif';
        ctx.fillStyle = '#ECEFF1';
        ctx.textAlign = 'center';
        ctx.fillText('ORI', lx, ly);
    }

    // -------------------------------------------------------------------------
    // Draw the central label (plasmid name + size)
    // -------------------------------------------------------------------------
    _drawCenterLabel() {
        const ctx = this.ctx;
        const { cx, cy } = this._layout;
        const sizeKb = (this.plasmid.length / 1000).toFixed(1);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.font      = 'bold 18px sans-serif';
        ctx.fillStyle = '#CFD8DC';
        ctx.fillText(this.plasmid.name, cx, cy - 14);

        ctx.font      = '14px monospace';
        ctx.fillStyle = '#90A4AE';
        ctx.fillText(`${this.plasmid.length.toLocaleString()} bp`, cx, cy + 10);

        if (this._cutAnimState && this._cutAnimState.enzyme) {
            ctx.font      = '12px sans-serif';
            ctx.fillStyle = '#EF9A9A';
            ctx.fillText(`Cut with ${this._cutAnimState.enzyme}`, cx, cy + 30);
        }
    }

    // -------------------------------------------------------------------------
    // renderCutAnimation(enzymeName, cutSitePosition[, onComplete])
    //
    // Animates the cutting of the plasmid at the given position.
    // The circular map "opens up" into a linear form over ~1 second.
    //
    // @param {string} enzymeName
    // @param {number} cutSitePosition — topStrandCut value (0-based bp index)
    // @param {Function} [onComplete]  — called when animation finishes
    // -------------------------------------------------------------------------
    renderCutAnimation(enzymeName, cutSitePosition, onComplete) {
        const ctx     = this.ctx;
        const { cx, cy, outerRadius, innerRadius } = this._layout;
        const totalFrames = 60;   // ~1 second at 60 fps
        let   frame       = 0;

        this._cutAnimState = { enzyme: enzymeName, position: cutSitePosition };

        const cutAngle = this._bpToAngle(cutSitePosition);

        const animate = () => {
            const t = frame / totalFrames;   // 0 → 1
            frame++;

            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // --- Phase 1 (t 0→0.5): flash the cut site ---
            // --- Phase 2 (t 0.5→1): open the ring -------

            const openAngle = t > 0.5 ? (t - 0.5) * 2 * Math.PI * 0.25 : 0;

            // Draw gap in the ring at the cut site
            const gapStart = cutAngle - openAngle;
            const gapEnd   = cutAngle + openAngle;

            // Outer ring with gap
            ctx.beginPath();
            ctx.arc(cx, cy, outerRadius, gapEnd, gapStart + 2 * Math.PI, false);
            ctx.strokeStyle = '#37474F';
            ctx.lineWidth   = 8;
            ctx.stroke();

            // Inner ring with gap
            ctx.beginPath();
            ctx.arc(cx, cy, innerRadius, gapEnd, gapStart + 2 * Math.PI, false);
            ctx.strokeStyle = '#546E7A';
            ctx.lineWidth   = 4;
            ctx.stroke();

            // Flash highlight at cut site
            const flashAlpha = t < 0.5 ? Math.sin(t * Math.PI * 4) * 0.8 : 0;
            if (flashAlpha > 0) {
                ctx.save();
                ctx.globalAlpha = flashAlpha;
                ctx.beginPath();
                ctx.arc(cx, cy, outerRadius + 10, cutAngle - 0.05, cutAngle + 0.05);
                ctx.strokeStyle = '#FF1744';
                ctx.lineWidth   = 12;
                ctx.stroke();
                ctx.restore();
            }

            // Draw features (faded)
            ctx.save();
            ctx.globalAlpha = 0.5;
            this._drawFeatures();
            ctx.restore();

            // Cut scissors emoji at the site
            if (t > 0.1 && t < 0.9) {
                const sx = cx + (outerRadius + 20) * Math.cos(cutAngle);
                const sy = cy + (outerRadius + 20) * Math.sin(cutAngle);
                ctx.font      = '20px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('✂', sx, sy);
            }

            this._drawCenterLabel();

            if (frame <= totalFrames) {
                requestAnimationFrame(animate);
            } else {
                // Final state: show linearised (open gap)
                this._cutAnimState.done = true;
                this.render(
                    Object.keys(EnzymeDB).filter(e =>
                        this._restrictionSites.some(s => s.enzymeName === e)
                    )
                );
                if (typeof onComplete === 'function') onComplete();
            }
        };

        requestAnimationFrame(animate);
    }

    // -------------------------------------------------------------------------
    // setHighlight(featureName)
    //
    // Highlights the named feature (pass null to clear).
    // Automatically re-renders.
    // -------------------------------------------------------------------------
    setHighlight(featureName) {
        this._highlightedFeature = featureName;
        this.render(this._restrictionSites.map(s => s.enzymeName || s.enzyme));
    }

    // -------------------------------------------------------------------------
    // onClick(callback)
    //
    // Registers a click handler. The callback receives an object:
    //   {
    //     type    : 'feature' | 'restriction_site' | 'background',
     //     data    : feature object or restriction site object or null,
    //     angle   : click angle in radians,
    //     bp      : approximate bp position clicked
    //   }
    // -------------------------------------------------------------------------
    onClick(callback) {
        this._clickCallbacks.push(callback);
    }

    _handleClick(event) {
        if (this._clickCallbacks.length === 0) return;

        const rect  = this.canvas.getBoundingClientRect();
        const mx    = event.clientX - rect.left;
        const my    = event.clientY - rect.top;
        const { cx, cy, outerRadius, innerRadius } = this._layout;

        const dx   = mx - cx;
        const dy   = my - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Angle from top (matching _bpToAngle convention)
        let angle = Math.atan2(dy, dx) + Math.PI / 2;
        if (angle < 0) angle += 2 * Math.PI;
        if (angle > 2 * Math.PI) angle -= 2 * Math.PI;

        // Convert angle back to bp
        const bp = Math.round((angle / (2 * Math.PI)) * this.plasmid.length) % this.plasmid.length;

        let result = { type: 'background', data: null, angle, bp };

        // Check restriction sites (within ±5° of a tick)
        const angleTol = 0.087; // 5°
        for (const site of this._restrictionSites) {
            const siteAngle = this._bpToAngle(site.topStrandCut) + Math.PI / 2;
            if (Math.abs(angle - siteAngle) < angleTol && dist < outerRadius + 20) {
                result = { type: 'restriction_site', data: site, angle, bp };
                break;
            }
        }

        // Check features (within the feature arc radius band)
        if (result.type === 'background') {
            const featureR = outerRadius + this._layout.featureWidth * 0.3;
            const featureTol = this._layout.featureWidth;
            if (Math.abs(dist - featureR) < featureTol) {
                for (const feature of this.plasmid.features) {
                    const startAngle = (this._bpToAngle(feature.start) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
                    const endAngle   = (this._bpToAngle(feature.end)   + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
                    let inArc = false;
                    if (startAngle <= endAngle) {
                        inArc = angle >= startAngle && angle <= endAngle;
                    } else {
                        inArc = angle >= startAngle || angle <= endAngle;
                    }
                    if (inArc) {
                        result = { type: 'feature', data: feature, angle, bp };
                        break;
                    }
                }
            }
        }

        for (const cb of this._clickCallbacks) {
            cb(result);
        }
    }
}

// ---------------------------------------------------------------------------
// Attach to window
// ---------------------------------------------------------------------------
window.Plasmid         = Plasmid;
window.PlasmidRenderer = PlasmidRenderer;
window.FEATURE_COLORS  = FEATURE_COLORS;
