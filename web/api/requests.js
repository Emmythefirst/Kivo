// Tiny serverless endpoint: the real source of truth for "requests
// addressed to username X," separate from any push notification. A
// sender POSTs a pending request for a known contact's username; any
// device can GET the pending list for its own claimed username and merge
// it into its local incoming-request tracking; a sender can DELETE their
// own request back out if they cancel it.
//
// No real authentication — by design, for a hackathon timeline. Safety
// instead comes from two places: (1) the client only ever calls POST for
// recipients already in the sender's own recent-contacts list (enforced
// app-side, not here — see NewRequestScreen.tsx), and (2) every device
// that GETs this list re-checks, locally, that a returned request's `to`
// address actually matches its own connected wallet before trusting it
// (see src/lib/sync.ts) — so even a spoofed entry posted directly against
// this endpoint can't make itself appear in the wrong person's app.
//
// Storage: Upstash Redis via its plain REST API (no SDK/dependency
// needed — this project has no package.json at all, just static files
// plus this one function, and Upstash's REST API is just HTTP). Shares
// the user's existing free-tier Upstash database with another project —
// a Redis instance isn't "one database per app," it's one keyspace, so
// every key this file touches is namespaced under "kivo:" specifically
// to avoid ever colliding with that other project's keys.
//
// One hash per username (field = the request's own id, value = the JSON
// payload) rather than a plain list — a list has no way to target one
// entry for removal, which cancelling a request needs. No size cap here
// (unlike the earlier list-based version's LTRIM): a hackathon-scale
// number of pending requests per username is never going to be large
// enough for this to matter in practice.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY_PREFIX = 'kivo:pending:';

async function redis(command) {
  const path = command.map((part) => encodeURIComponent(String(part))).join('/');
  const res = await fetch(`${UPSTASH_URL}/${path}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash command failed: ${res.status}`);
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Server storage is not configured yet.' });
  }

  if (req.method === 'POST') {
    const { id, username, link, fromLabel, amount, token, memo, createdAt } = req.body || {};
    if (!id || !username || !link) {
      return res.status(400).json({ error: 'id, username and link are required' });
    }
    const key = `${KEY_PREFIX}${String(username).toLowerCase()}`;
    const entry = JSON.stringify({ link, fromLabel, amount, token, memo, createdAt });
    try {
      await redis(['HSET', key, id, entry]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(502).json({ error: 'Could not store the request.' });
    }
  }

  if (req.method === 'GET') {
    const username = String(req.query.username || '').toLowerCase();
    if (!username) return res.status(400).json({ error: 'username is required' });
    const key = `${KEY_PREFIX}${username}`;
    try {
      const flat = (await redis(['HGETALL', key])) || [];
      const items = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        try {
          items.push(JSON.parse(flat[i + 1]));
        } catch {
          // Skip a corrupted entry rather than failing the whole response.
        }
      }
      return res.status(200).json({ items });
    } catch (e) {
      return res.status(502).json({ error: 'Could not read pending requests.' });
    }
  }

  if (req.method === 'DELETE') {
    const username = String(req.query.username || '').toLowerCase();
    const id = String(req.query.id || '');
    if (!username || !id) {
      return res.status(400).json({ error: 'username and id are required' });
    }
    const key = `${KEY_PREFIX}${username}`;
    try {
      await redis(['HDEL', key, id]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(502).json({ error: 'Could not cancel the request.' });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
