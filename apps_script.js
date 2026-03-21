/**
 * PCR Jeopardy — Google Apps Script
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Delete the default code and paste this entire file
 * 3. Set RESET_SECRET below (any word/phrase you choose, or leave blank)
 * 4. Save → Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy → copy the Web app URL
 * 6. Paste that URL into:
 *    - pcr_jeopardy.html  →  APPS_SCRIPT_URL
 *    - pcr_jeopardy_monitor.html  →  Apps Script URL field on connect screen
 *
 * PUBLISH THE SHEET FOR THE MONITOR TO READ:
 * In Google Sheets: File → Share → Publish to web
 * → select your sheet → CSV → Publish → copy URL
 * Paste that URL into the monitor's CSV URL field.
 */

// Optional: set a secret word to protect the reset endpoint.
// Leave blank ('') to allow unauthenticated resets.
const RESET_SECRET = '';

// Column order — do not change (monitor and game depend on this)
const HEADERS = [
  'date', 'playerName', 'finalDNTPs', 'targetDNTPs', 'targetMet',
  'correct', 'wrong', 'hotStartWon', 'finalWagered', 'finalWon',
  'finalPlayerAnswer', 'questionResults'
];

// ── RECEIVE SCORE FROM GAME ──────────────────────────────────
function doPost(e) {
  try {
    const rec   = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Write header row on first submission
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }

    sheet.appendRow([
      rec.date               || new Date().toISOString(),
      rec.playerName         || '',
      Number(rec.finalDNTPs) || 0,
      Number(rec.targetDNTPs)|| 0,
      rec.targetMet          ? 'true' : 'false',
      Number(rec.correct)    || 0,
      Number(rec.wrong)      || 0,
      rec.hotStart           ? (rec.hotStart.won      ? 'true' : 'false') : 'false',
      rec.finalReaction      ? (Number(rec.finalReaction.wagered) || 0)   : 0,
      rec.finalReaction      ? (rec.finalReaction.won  ? 'true' : 'false'): 'false',
      rec.finalReaction      ? (rec.finalReaction.playerAnswer || '')     : '',
      JSON.stringify(rec.questionResults || [])
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── RECEIVE SCORE FROM GAME (GET fallback — no questionResults) ──
function doGet(e) {
  if (e.parameter.action === 'score') {
    try {
      const p     = e.parameter;
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

      if (sheet.getLastRow() === 0) {
        sheet.appendRow(HEADERS);
        sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      }

      sheet.appendRow([
        p.date              || new Date().toISOString(),
        p.playerName        || '',
        Number(p.finalDNTPs)  || 0,
        Number(p.targetDNTPs) || 0,
        p.targetMet         || 'false',
        Number(p.correct)   || 0,
        Number(p.wrong)     || 0,
        p.hotStartWon       || 'false',
        Number(p.finalWagered) || 0,
        p.finalWon          || 'false',
        p.finalPlayerAnswer || '',
        '[]'   // questionResults not available via GET
      ]);

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── RESET SHEET (called by monitor Reset button) ──────────────
  if (e.parameter.action === 'reset') {
    if (RESET_SECRET && e.parameter.secret !== RESET_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid secret' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'Sheet cleared' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}
