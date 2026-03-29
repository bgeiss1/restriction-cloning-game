// vi_p3_edu.js — P3Edu: educational fact card system
// Cards slide in from the right, stack up to 3, auto-dismiss after 7.5 s.
// Each factId is shown at most once per Phase 3 session (deduplication).
// Depends on: vi_p3_config.js, vi_p3_main.js
'use strict';

class P3Edu {

  // cfg    — P3_CFG reference
  // escape — window.P3Escape singleton
  constructor(cfg, escape) {
    this._cfg        = cfg;
    this._escape     = escape;
    this._seen       = new Set();   // factIds already triggered this session
    this._queue      = [];          // cards waiting because the stack is full
    this._active     = [];          // currently visible card records

    this._MAX_CARDS  = 3;           // max simultaneously visible cards
    this._DISPLAY_MS = 7500;        // ms before auto-dismiss

    this._container = null;
    this._injectStyles();
    this._buildContainer();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  // Show an educational card for factId once. Subsequent calls with the same
  // factId are silently ignored.
  trigger(factId, title, text) {
    if (!factId || this._seen.has(factId)) return;
    this._seen.add(factId);
    this._enqueue({ factId, title: title || factId, text: text || '' });
  }

  destroy() {
    if (this._container) { this._container.remove(); this._container = null; }
    const st = document.getElementById('p3EduStyle');
    if (st) st.remove();
    this._active.forEach(r => clearTimeout(r.timer));
    this._active = [];
    this._queue  = [];
  }

  // ── Card lifecycle ────────────────────────────────────────────────────────────

  _enqueue(card) {
    if (this._active.length < this._MAX_CARDS) {
      this._show(card);
    } else {
      this._queue.push(card);
    }
  }

  _show(card) {
    if (!this._container) return;

    const el = document.createElement('div');
    el.className = 'p3e-card';
    el.innerHTML =
      `<div class="p3e-header">` +
        `<span class="p3e-title">${_p3eEsc(card.title)}</span>` +
        `<button class="p3e-close" aria-label="Dismiss">✕</button>` +
      `</div>` +
      `<div class="p3e-body">${_p3eEsc(card.text)}</div>` +
      `<div class="p3e-bar"><div class="p3e-bar-fill"></div></div>`;

    const rec = { el, timer: null };
    this._active.push(rec);
    this._container.appendChild(el);

    // Progress bar depletes over the display duration
    const fill = el.querySelector('.p3e-bar-fill');
    // Two-frame delay so the browser paints the initial state before transitioning
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transition = `width ${this._DISPLAY_MS}ms linear`;
      fill.style.width = '0%';
    }));

    // Auto-dismiss
    rec.timer = setTimeout(() => this._dismiss(rec), this._DISPLAY_MS);

    // Slide in on next frame
    requestAnimationFrame(() => el.classList.add('p3e-card--in'));

    // Dismiss button
    el.querySelector('.p3e-close').addEventListener('click', () => {
      clearTimeout(rec.timer);
      this._dismiss(rec);
    });
  }

  _dismiss(rec) {
    const idx = this._active.indexOf(rec);
    if (idx === -1) return;
    this._active.splice(idx, 1);

    const el = rec.el;
    el.classList.remove('p3e-card--in');
    el.classList.add('p3e-card--out');

    // Remove element after slide-out completes, then show next queued card
    setTimeout(() => {
      if (el.parentNode) el.remove();
      if (this._queue.length > 0 && this._active.length < this._MAX_CARDS) {
        this._show(this._queue.shift());
      }
    }, 380);
  }

  // ── DOM / styles ─────────────────────────────────────────────────────────────

  _buildContainer() {
    const c = document.createElement('div');
    c.id = 'p3EduContainer';
    document.body.appendChild(c);
    this._container = c;
  }

  _injectStyles() {
    if (document.getElementById('p3EduStyle')) return;
    const s = document.createElement('style');
    s.id = 'p3EduStyle';
    s.textContent = `
      #p3EduContainer {
        position: fixed; bottom: 70px; right: 14px;
        display: flex; flex-direction: column-reverse; gap: 9px;
        z-index: 2100; pointer-events: none;
        width: 300px;
      }

      .p3e-card {
        background: rgba(6,14,20,0.94);
        border: 1px solid rgba(0,210,148,0.28);
        border-radius: 10px; padding: 11px 13px 9px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
        font-size: 11px; line-height: 1.58; color: #8eb8a8;
        pointer-events: all;

        /* Slide-in from right */
        transform: translateX(115%);
        opacity: 0;
        transition: transform .36s cubic-bezier(.22,.68,0,1.15), opacity .28s ease;
      }
      .p3e-card--in  { transform: translateX(0); opacity: 1; }
      .p3e-card--out { transform: translateX(115%); opacity: 0; }

      .p3e-header {
        display: flex; align-items: flex-start;
        justify-content: space-between; gap: 6px;
        margin-bottom: 5px;
      }
      .p3e-title {
        font-size: 11.5px; font-weight: 700; letter-spacing: .09em;
        text-transform: uppercase; color: #00e89a;
        line-height: 1.3;
      }
      .p3e-close {
        background: none; border: none; cursor: pointer;
        color: rgba(255,255,255,0.25); font-size: 10px;
        padding: 1px 2px; line-height: 1; flex-shrink: 0;
        margin-top: 1px;
      }
      .p3e-close:hover { color: rgba(255,255,255,0.65); }

      .p3e-body {
        color: #7aa090; font-size: 10.5px; line-height: 1.6;
      }

      /* Countdown bar */
      .p3e-bar {
        margin-top: 8px; height: 2px; border-radius: 1px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
      }
      .p3e-bar-fill {
        height: 100%; width: 100%; border-radius: 1px;
        background: rgba(0,210,148,0.50);
        /* transition set dynamically in JS */
      }
    `;
    document.head.appendChild(s);
  }
}

// ── Module-level HTML-escape utility ────────────────────────────────────────────
function _p3eEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Self-register if P3Escape is already running
if (typeof P3Escape !== 'undefined' && P3Escape._active && !P3Escape.edu) {
  P3Escape.edu = new P3Edu(P3_CFG, P3Escape);
}
