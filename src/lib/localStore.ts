import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import type { PaymentRequest } from './requests';

/**
 * Local-only state for things the app has no backend to track: requests
 * this device has created, and wallets it's paid before. Per the project
 * brief, this is deliberately not synced or on-chain — nobody is judging
 * cross-device sync, and it keeps the on-chain design free of a request
 * lifecycle nobody asked for. Source of truth stays the chain (a request
 * link, a resolved username); this is just a per-device convenience.
 */

const SENT_REQUESTS_KEY = 'kivo.sentRequests';
const SENT_PAYMENTS_KEY = 'kivo.sentPayments';
const RECENT_CONTACTS_KEY = 'kivo.recentContacts';
const BILL_META_KEY = 'kivo.billMeta';
const MAX_RECENT_CONTACTS = 10;

export type SentRequest = {
  request: PaymentRequest;
  requestedFromLabel?: string;
};

/**
 * A bill's summary — total and the creator's own share — can't be
 * reconstructed later from the individual per-person requests alone
 * (creatorShare is a rounding remainder decided once at creation time,
 * never itself sent as a request). Stored once here, keyed by billId, so
 * both the just-created share screen and a later Home screen tap into
 * the same bill can show the same summary.
 */
export type BillMeta = {
  total: number;
  creatorShare: number;
  peopleCount: number;
  memo?: string;
  token: 'USDC' | 'SOL';
};

export type RecentContact = {
  address: string; // base58
  username?: string;
  lastUsedAt: number;
};

/**
 * A payment this device has made — the outgoing-money counterpart to
 * SentRequest. Nothing recorded this before; it exists purely so the
 * Activity feed can show a real, on-chain-confirmed history of money you
 * sent, not just money you've asked for. Written once, right after a
 * payment's transaction confirms — never speculatively before that.
 */
export type SentPayment = {
  to: string; // base58
  toUsername?: string;
  amount: number;
  token: 'USDC' | 'SOL';
  memo?: string;
  createdAt: number;
  signature: string;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function getSentRequests(): Promise<SentRequest[]> {
  const list = await readJson<any[]>(SENT_REQUESTS_KEY, []);
  // PublicKey doesn't survive JSON round-tripping — stored as a base58
  // string, reconstructed here so callers get the same shape createRequest
  // produces.
  return list.map((entry) => ({
    ...entry,
    request: { ...entry.request, to: new PublicKey(entry.request.to) },
  }));
}

export async function addSentRequest(entry: SentRequest): Promise<void> {
  const existing = await readJson<any[]>(SENT_REQUESTS_KEY, []);
  const serializable = {
    ...entry,
    request: { ...entry.request, to: entry.request.to.toBase58() },
  };
  // Newest first — that's how the Home screen wants to render them.
  await AsyncStorage.setItem(
    SENT_REQUESTS_KEY,
    JSON.stringify([serializable, ...existing]),
  );
}

/** Cancels a single-request (not a bill share) — removes it from local tracking entirely. */
export async function removeSentRequest(requestId: string): Promise<void> {
  const existing = await readJson<any[]>(SENT_REQUESTS_KEY, []);
  await AsyncStorage.setItem(
    SENT_REQUESTS_KEY,
    JSON.stringify(existing.filter((entry) => entry.request.id !== requestId)),
  );
}

export async function saveBillMeta(
  billId: string,
  meta: BillMeta,
): Promise<void> {
  const all = await readJson<Record<string, BillMeta>>(BILL_META_KEY, {});
  all[billId] = meta;
  await AsyncStorage.setItem(BILL_META_KEY, JSON.stringify(all));
}

export async function getBillMeta(billId: string): Promise<BillMeta | null> {
  const all = await readJson<Record<string, BillMeta>>(BILL_META_KEY, {});
  return all[billId] ?? null;
}

export async function getSentPayments(): Promise<SentPayment[]> {
  return readJson<SentPayment[]>(SENT_PAYMENTS_KEY, []);
}

export async function addSentPayment(payment: SentPayment): Promise<void> {
  const existing = await readJson<SentPayment[]>(SENT_PAYMENTS_KEY, []);
  // Newest first — matches addSentRequest's ordering.
  await AsyncStorage.setItem(
    SENT_PAYMENTS_KEY,
    JSON.stringify([payment, ...existing]),
  );
}

/**
 * Requests received via a tapped link that the user hasn't acted on yet
 * (neither paid nor declined). The original project brief called for
 * tracking both "requests I've created" and "requests I've received"
 * locally — only the sent side existed until now. This is what lets
 * Home surface an incoming request even if the user backed out of
 * RequestScreen without deciding, instead of it only ever being
 * reachable by re-tapping the same link.
 */
export type ReceivedRequest = {
  link: string;
  receivedAt: number;
};

const RECEIVED_REQUESTS_KEY = 'kivo.receivedRequests';

export async function getReceivedRequests(): Promise<ReceivedRequest[]> {
  return readJson<ReceivedRequest[]>(RECEIVED_REQUESTS_KEY, []);
}

export async function recordReceivedRequest(link: string): Promise<void> {
  const existing = await getReceivedRequests();
  if (existing.some((r) => r.link === link)) return;
  await AsyncStorage.setItem(
    RECEIVED_REQUESTS_KEY,
    JSON.stringify([{ link, receivedAt: Date.now() }, ...existing]),
  );
}

/** Called once a received request is paid, declined, or found stale (expired/already paid). */
export async function resolveReceivedRequest(link: string): Promise<void> {
  const existing = await getReceivedRequests();
  await AsyncStorage.setItem(
    RECEIVED_REQUESTS_KEY,
    JSON.stringify(existing.filter((r) => r.link !== link)),
  );
}

export async function getRecentContacts(): Promise<RecentContact[]> {
  return readJson<RecentContact[]>(RECENT_CONTACTS_KEY, []);
}

/**
 * Called after a successful Pay. Moves the contact to the front if it's
 * already known (most-recently-used ordering) and caps the list so it
 * doesn't grow forever.
 */
export async function recordRecentContact(
  address: string,
  username?: string,
): Promise<void> {
  const existing = await getRecentContacts();
  const withoutThisOne = existing.filter((c) => c.address !== address);
  const updated = [
    { address, username, lastUsedAt: Date.now() },
    ...withoutThisOne,
  ].slice(0, MAX_RECENT_CONTACTS);
  await AsyncStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(updated));
}
