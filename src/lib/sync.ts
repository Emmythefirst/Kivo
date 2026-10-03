import { decodeLink } from './requests';
import { recordReceivedRequest } from './localStore';

// Same deployment as the web fallback page — one Vercel project serving
// both the static page and this one small API route.
const API_BASE = 'https://web-rouge-one-97.vercel.app';

type PendingEntry = {
  link: string;
  fromLabel?: string;
  amount?: number;
  token?: string;
  memo?: string;
  createdAt?: number;
};

/**
 * Tells the backend "this request is for @username" — best-effort only.
 * If this fails (offline, server hiccup, not configured yet), the sender
 * still has the normal link to share manually; nothing about the
 * existing request-creation flow depends on this succeeding. `id` is the
 * request's own id (already unique per request) — it's what lets a later
 * cancel target this exact entry instead of guessing.
 */
export async function pushPendingRequest(params: {
  id: string;
  username: string;
  link: string;
  fromLabel?: string;
  amount: number;
  token: string;
  memo?: string;
  createdAt: number;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // Best-effort — see above.
  }
}

/**
 * Retracts a request filed against pushPendingRequest — best-effort, and
 * safe to call even if it was never actually pushed in the first place
 * (e.g. the recipient wasn't a known contact yet at creation time): the
 * backend just no-ops deleting a field that was never set.
 */
export async function cancelPendingRequest(username: string, id: string): Promise<void> {
  try {
    await fetch(
      `${API_BASE}/api/requests?username=${encodeURIComponent(username)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  } catch {
    // Best-effort — see above.
  }
}

async function pullPendingRequests(username: string): Promise<PendingEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/requests?username=${encodeURIComponent(username)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

/**
 * Pulls anything pending for the device's own claimed username and folds
 * it into the same local "received request" tracking a tapped link
 * already uses — so Home's incoming-request card and the Activity feed
 * don't need to know or care whether a request arrived via a shared link
 * or this sync. Each entry is independently verified before being
 * trusted: its own `to` address must match this exact wallet, not just
 * whatever username the server happened to file it under. A no-op if no
 * username is claimed yet — this feature only exists between Kivo users
 * with usernames, by design.
 */
export async function syncIncomingRequests(myUsername: string, myAddress: string): Promise<void> {
  const items = await pullPendingRequests(myUsername);
  for (const item of items) {
    const decoded = decodeLink(item.link);
    if (!decoded) continue;
    if (decoded.to.toBase58() !== myAddress) continue;
    await recordReceivedRequest(item.link);
  }
}
