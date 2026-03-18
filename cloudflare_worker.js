/**
 * PCR Jeopardy Score Submission Worker
 *
 * Deploy on Cloudflare Workers (free tier).
 * Add your GitHub PAT as a secret named GITHUB_PAT:
 *   Workers & Pages → your worker → Settings → Variables → Add variable (secret)
 *
 * The game POSTs score JSON here; the worker relays it to GitHub
 * using the PAT stored as an env secret (never in git).
 */

const GITHUB_REPO   = 'bgeiss1/restriction-cloning-game';
const SCORE_FOLDER  = 'pcr_jeopardy_scores';

const CORS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }

    let rec;
    try {
      rec = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (!rec.playerName || !rec.date) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing playerName or date' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const safeName = rec.playerName.replace(/[^a-z0-9]/gi, '_');
    const safeDate = rec.date.slice(0, 19).replace(/[:T]/g, '-');
    const filename = `${SCORE_FOLDER}/${safeName}_${safeDate}.json`;
    const content  = btoa(unescape(encodeURIComponent(JSON.stringify(rec, null, 2))));

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`,
      {
        method : 'PUT',
        headers: {
          'Authorization': `token ${env.GITHUB_PAT}`,
          'Accept'       : 'application/vnd.github.v3+json',
          'Content-Type' : 'application/json',
          'User-Agent'   : 'pcr-jeopardy-score-worker',
        },
        body: JSON.stringify({
          message: `Score: ${rec.playerName} ${rec.date.slice(0, 10)}`,
          content,
        }),
      }
    );

    const json = { ok: ghRes.ok, status: ghRes.status };
    if (!ghRes.ok) {
      json.error = await ghRes.text().catch(() => '');
      console.error('GitHub PUT failed', ghRes.status, json.error);
    }

    return new Response(JSON.stringify(json), {
      status : ghRes.ok ? 200 : 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },
};
