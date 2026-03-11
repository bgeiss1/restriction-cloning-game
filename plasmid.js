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
            outerRadius:    minDim * 0.30,   // outer DNA ring (reduced to free label space)
            innerRadius:    minDim * 0.23,   // inner DNA ring
            featureWidth:   minDim * 0.048,  // arc thickness
            // Feature label leader lines: radial elbow then horizontal arm
            featureLabelElbowR: minDim * 0.38,  // end of radial segment
            featureLabelArmLen: minDim * 0.035, // length of horizontal arm
            // Restriction site label tiers (staggered to avoid overlap)
            rsTiers: [
                minDim * 0.355,
                minDim * 0.395,
                minDim * 0.435,
            ],
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
        const { cx, cy, outerRadius, featureWidth,
                featureLabelElbowR, featureLabelArmLen } = this._layout;
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

            // Directional arrow for genes, promoters, resistance markers, lacZ
            const DIRECTIONAL = new Set(['gene', 'promoter', 'resistance', 'lacZ']);
            if (DIRECTIONAL.has(feature.type)) {
                const arrowAngle = feature.strand === 1 ? endAngle : startAngle;
                const arrowDir   = feature.strand === 1 ? 1 : -1;
                const ax = cx + featureR * Math.cos(arrowAngle);
                const ay = cy + featureR * Math.sin(arrowAngle);
                const tangentAngle = arrowAngle + arrowDir * Math.PI / 2;
                const arrowLen  = featureWidth * 0.8;
                const arrowHalf = featureWidth * 0.4;
                ctx.save();
                ctx.translate(ax, ay);
                ctx.rotate(tangentAngle);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-arrowLen * arrowDir, -arrowHalf);
                ctx.lineTo(-arrowLen * arrowDir,  arrowHalf);
                ctx.closePath();
                ctx.fillStyle = isHL ? '#FFFFFF' : color;
                ctx.fill();
                ctx.restore();
            }

            // Label with bent leader line — horizontal text, no rotation
            const midBp    = (feature.start + feature.end) / 2;
            const midAngle = this._bpToAngle(midBp);
            const cos      = Math.cos(midAngle);
            const sin      = Math.sin(midAngle);

            // Start of leader: outer edge of feature arc
            const lx0 = cx + (featureR + featureWidth * 0.6) * cos;
            const ly0 = cy + (featureR + featureWidth * 0.6) * sin;

            // Elbow: end of radial segment
            const ex  = cx + featureLabelElbowR * cos;
            const ey  = cy + featureLabelElbowR * sin;

            // Horizontal arm — direction depends on left/right half of map
            const goRight = cos >= 0;
            const tx = ex + (goRight ? featureLabelArmLen : -featureLabelArmLen);
            const ty = ey;

            // Draw leader + arm
            ctx.beginPath();
            ctx.moveTo(lx0, ly0);
            ctx.lineTo(ex, ey);
            ctx.lineTo(tx, ty);
            ctx.strokeStyle = color;
            ctx.lineWidth   = isHL ? 1.5 : 0.9;
            ctx.setLineDash(isHL ? [] : [3, 2]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Text — horizontal, anchored at end of arm
            ctx.font         = isHL ? 'bold 14px sans-serif' : '13px sans-serif';
            ctx.fillStyle    = isHL ? '#FFFFFF' : color;
            ctx.textAlign    = goRight ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(feature.name, tx + (goRight ? 3 : -3), ty);
        }
    }

    // -------------------------------------------------------------------------
    // Draw restriction site tick marks and labels (bent leader lines, outside ring)
    //
    // Sites that are angularly close are grouped into clusters. Within each
    // cluster the label rows are spread vertically so they don't overlap,
    // connected to their tick mark with a 3-segment leader:
    //   outer-ring tip → radial hop → diagonal to label row → horizontal arm
    // The arm direction (left/right) is determined by which half of the map
    // the cluster sits in (cos of mid-angle ≥ 0 → right, < 0 → left).
    // -------------------------------------------------------------------------
    _drawRestrictionSites() {
        const ctx = this.ctx;
        const { cx, cy, outerRadius, innerRadius, featureWidth } = this._layout;

        if (this._restrictionSites.length === 0) return;

        // Colour palette — cycle through for each unique enzyme
        const palette = [
            '#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#C77DFF',
            '#FF9F43','#54A0FF','#01CBC6','#FD7272','#A8E063'
        ];
        const enzymeColorMap = {};
        let colorIdx = 0;

        const sites = this._restrictionSites.map(site => {
            const name = site.enzymeName || site.enzyme;
            if (!enzymeColorMap[name]) {
                enzymeColorMap[name] = palette[colorIdx++ % palette.length];
            }
            return {
                site,
                name,
                angle: this._bpToAngle(site.topStrandCut),
                color: enzymeColorMap[name],
            };
        }).sort((a, b) => a.angle - b.angle);

        // ---- Cluster nearby sites so labels can be fanned out vertically ----
        const CLUSTER_GAP = 0.45;              // rad — sites closer than this are grouped
        const ROW_H       = 20;               // px between label rows within a cluster
        const SPINE_R     = outerRadius * 1.32; // radial distance of the label column
        const INNER_ELBOW = outerRadius * 1.10; // short radial hop before the diagonal
        const ARM_LEN     = outerRadius * 0.10; // horizontal arm at end of leader

        const clusters = [];
        let group = [sites[0]];
        for (let i = 1; i < sites.length; i++) {
            if (sites[i].angle - group[0].angle < CLUSTER_GAP) {
                group.push(sites[i]);
            } else {
                clusters.push(group);
                group = [sites[i]];
            }
        }
        clusters.push(group);

        for (const cluster of clusters) {
            // Spine anchored to the cluster's mid-angle
            const midAngle = cluster[Math.floor(cluster.length / 2)].angle;
            const spineX   = cx + SPINE_R * Math.cos(midAngle);
            const spineY   = cy + SPINE_R * Math.sin(midAngle);
            // Left/right determined by which half of the map the cluster sits in
            const goRight  = Math.cos(midAngle) >= 0;

            cluster.forEach((m, i) => {
                const offset  = (i - (cluster.length - 1) / 2) * ROW_H;
                const stagger = i * 14;   // push each successive label further right
                m.spineX  = spineX;
                m.labelY  = spineY + offset;
                m.labelX  = spineX + (goRight ? ARM_LEN + stagger : -ARM_LEN - stagger);
                m.goRight = goRight;
            });
        }

        // ---- Draw each site ----
        for (const { name, angle, color, labelX, labelY, spineX, goRight } of sites) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // Tick mark: starts at outer ring, extends through feature arc zone
            ctx.beginPath();
            ctx.moveTo(cx + outerRadius * cos, cy + outerRadius * sin);
            ctx.lineTo(cx + (outerRadius + featureWidth) * cos, cy + (outerRadius + featureWidth) * sin);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 2;
            ctx.stroke();

            // 3-segment leader: tip → radial hop → diagonal to label row → arm
            const tipX   = cx + (outerRadius + featureWidth) * cos;
            const tipY   = cy + (outerRadius + featureWidth) * sin;
            const elbowX = cx + INNER_ELBOW * cos;
            const elbowY = cy + INNER_ELBOW * sin;

            ctx.beginPath();
            ctx.moveTo(tipX,   tipY);    // outer ring tip
            ctx.lineTo(elbowX, elbowY);  // short radial hop
            ctx.lineTo(spineX, labelY);  // diagonal to this site's label row
            ctx.lineTo(labelX, labelY);  // horizontal arm
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1;
            ctx.stroke();

            // Label at end of arm
            ctx.font         = 'bold 15px monospace';
            ctx.fillStyle    = color;
            ctx.textAlign    = goRight ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, labelX + (goRight ? 2 : -2), labelY);
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

        // Small "1" label (position 0 = bp 1)
        const lx = cx + (outerRadius + 14) * cos;
        const ly = cy + (outerRadius + 14) * sin;
        ctx.font      = 'bold 12px sans-serif';
        ctx.fillStyle = '#ECEFF1';
        ctx.textAlign = 'center';
        ctx.fillText('1', lx, ly);
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

        ctx.font      = 'bold 23px sans-serif';
        ctx.fillStyle = '#CFD8DC';
        ctx.fillText(this.plasmid.name, cx, cy - 14);

        ctx.font      = '18px monospace';
        ctx.fillStyle = '#90A4AE';
        ctx.fillText(`${this.plasmid.length.toLocaleString()} bp`, cx, cy + 10);

        if (this._cutAnimState && this._cutAnimState.enzyme) {
            ctx.font      = '16px sans-serif';
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
                ctx.font      = '26px sans-serif';
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

// ---------------------------------------------------------------------------
// renderOpenVector(cutSites, dropZoneActive)
//
// Draw the vector as a circle with a gap (the excised region between the
// first and last cut site).  If dropZoneActive, the gap glows as a DnD target.
// cutSites: array of site objects with .topStrandCut and .enzymeName
// ---------------------------------------------------------------------------
PlasmidRenderer.prototype.renderOpenVector = function(cutSites, dropZoneActive) {
    const ctx = this.ctx;
    const { cx, cy, outerRadius, innerRadius } = this._layout;
    const seqLen = this.plasmid.length;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!cutSites || cutSites.length === 0) { this.render(); return; }

    const sorted = [...cutSites].sort((a, b) => a.topStrandCut - b.topStrandCut);
    const gapStartBp = sorted[0].topStrandCut;
    const gapEndBp   = sorted[sorted.length - 1].topStrandCut;
    const singleCut  = sorted.length === 1 || gapStartBp === gapEndBp;

    const toAngle = bp => (bp / seqLen) * 2 * Math.PI - Math.PI / 2;
    const gapA = toAngle(gapStartBp);
    const gapB = singleCut ? gapA + 0.18 : toAngle(gapEndBp);

    // ---- backbone arc (keeper) ----
    const drawArc = (r, lw, color, from, to) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, to, from + 2 * Math.PI, false);
        ctx.strokeStyle = color;
        ctx.lineWidth   = lw;
        ctx.stroke();
    };

    drawArc(outerRadius, 8, '#37474F', gapA, gapB);
    drawArc(innerRadius, 4, '#546E7A', gapA, gapB);

    // ---- drop zone arc ----
    if (dropZoneActive) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        const glowColor = `rgba(79,195,247,${0.4 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (outerRadius + innerRadius) / 2, gapA, gapB, false);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth   = outerRadius - innerRadius + 12;
        ctx.stroke();

        // label
        const midA   = (gapA + gapB) / 2;
        const labelR = outerRadius + 28;
        ctx.font      = 'bold 14px sans-serif';
        ctx.fillStyle = '#4FC3F7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('drop here', cx + labelR * Math.cos(midA), cy + labelR * Math.sin(midA));
    }

    // ---- features ----
    this._drawFeatures();
    this._drawCenterLabel();
    this._drawOriginMark();

    // ---- sticky-end labels at gap edges ----
    const drawEndLabel = (angle, enzName, isLeft) => {
        const r   = outerRadius + 14;
        const ex  = cx + r * Math.cos(angle);
        const ey  = cy + r * Math.sin(angle);
        const enz = EnzymeDB[enzName] || {};
        const oh  = enz.overhangSeq || 'blunt';
        ctx.font         = 'bold 12px monospace';
        ctx.fillStyle    = '#FFD54F';
        ctx.textAlign    = isLeft ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${enzName}(${oh})`, ex + (isLeft ? -4 : 4), ey);
    };
    drawEndLabel(gapA, sorted[0].enzymeName, true);
    if (!singleCut) drawEndLabel(gapB, sorted[sorted.length - 1].enzymeName, false);

    // Store gap info for hit testing
    this._gapAngleA  = gapA;
    this._gapAngleB  = gapB;
    this._dropActive = dropZoneActive;
};

// ---------------------------------------------------------------------------
// isInDropZone(clientX, clientY) — returns true if the pointer is over the gap
// ---------------------------------------------------------------------------
PlasmidRenderer.prototype.isInDropZone = function(clientX, clientY) {
    if (!this._dropActive) return false;
    const rect = this.canvas.getBoundingClientRect();
    const { cx, cy, outerRadius, innerRadius } = this._layout;
    const dx   = clientX - rect.left - cx;
    const dy   = clientY - rect.top  - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < innerRadius - 10 || dist > outerRadius + 10) return false;

    let angle = Math.atan2(dy, dx);
    // Normalize to [gapAngleA, gapAngleA + 2π)
    while (angle < this._gapAngleA) angle += 2 * Math.PI;
    return angle <= this._gapAngleB + 0.1;
};

// ---------------------------------------------------------------------------
// animateDigest(fragments, trayEl, onComplete)
//
// Phase 1 (0-30f)  : fragments slide radially outward (still as arcs)
// Phase 2 (30-80f) : arcs morph to horizontal pills, fall toward trayEl
// Phase 3 (80-110f): spring settle, then call onComplete
// ---------------------------------------------------------------------------
PlasmidRenderer.prototype.animateDigest = function(fragments, trayEl, onComplete) {
    const ctx = this.ctx;
    const { cx, cy, outerRadius, innerRadius, featureWidth } = this._layout;
    const featureR = outerRadius + featureWidth * 0.3;
    const TOTAL_FRAMES = 110;
    let frame = 0;

    // Target positions — spread out horizontally in the tray
    const trayRect  = trayEl.getBoundingClientRect();
    const canvRect  = this.canvas.getBoundingClientRect();
    // Scale CSS pixel offsets to canvas buffer coordinates
    const cssScale  = this.canvas.width / (canvRect.width || this.canvas.width);
    const trayRelY  = (trayRect.top  - canvRect.top  + trayRect.height * 0.5) * cssScale;
    const trayRelX0 = (trayRect.left - canvRect.left) * cssScale;
    const trayW     = Math.max(trayRect.width, 60) * cssScale;
    const n = fragments.length;

    const targets = fragments.map((f, i) => ({
        x: trayRelX0 + trayW * (i + 0.5) / n,
        y: trayRelY,
        rot: (Math.random() - 0.5) * 0.25
    }));

    const drawFragmentPill = (f, t, idx) => {
        // t=0 → at circle position, t=1 → at tray target
        const midCos  = Math.cos(f.midAngle);
        const midSin  = Math.sin(f.midAngle);

        // Phase 1: explode
        const explodeT   = Math.min(1, frame / 30);
        const explodeDist = featureR * 0.35 * explodeT;
        const arcCx = cx + midCos * explodeDist;
        const arcCy = cy + midSin * explodeDist;

        // Phase 2: fall (frame 30-80)
        const fallT  = Math.max(0, Math.min(1, (frame - 30) / 50));
        const ease   = fallT < 0.5 ? 2 * fallT * fallT : -1 + (4 - 2 * fallT) * fallT;
        const px     = arcCx + (targets[idx].x - arcCx) * ease;
        const py     = arcCy + (targets[idx].y - arcCy) * ease;
        const rot    = targets[idx].rot * ease;

        // Arc span → pill width
        const arcSpan = Math.abs(f.angleEnd - f.angleStart);
        const pillW   = Math.max(60, arcSpan * featureR * 1.1);
        const pillH   = featureWidth * 1.2;

        // Choose color from features or default
        const color = f.features.length > 0
            ? featureColor(f.features[0])
            : FEATURE_COLORS.default;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.92;

        // Pill body
        ctx.beginPath();
        ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
        ctx.fillStyle   = color + '44';
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.fill();
        ctx.stroke();

        // Size label
        ctx.font         = `bold ${Math.round(pillH * 0.55)}px monospace`;
        ctx.fillStyle    = '#E8EDF2';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${(f.size / 1000).toFixed(1)} kb`, 0, 0);

        ctx.restore();
    };

    const animate = () => {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw backbone (fades out after frame 30)
        if (frame < 40) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - (frame - 20) / 20);
            this._drawBackbone();
            this._drawFeatures();
            ctx.restore();
        }

        for (let i = 0; i < fragments.length; i++) {
            drawFragmentPill(fragments[i], frame / TOTAL_FRAMES, i);
        }

        frame++;
        if (frame <= TOTAL_FRAMES) {
            requestAnimationFrame(animate);
        } else {
            // Clear canvas — fragment cards now live in HTML
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.font      = '17px sans-serif';
            ctx.fillStyle = 'rgba(79,195,247,0.3)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('digested', cx, cy);
            if (typeof onComplete === 'function') onComplete();
        }
    };

    requestAnimationFrame(animate);
};
