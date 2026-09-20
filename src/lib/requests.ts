import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { REGISTRY_PROGRAM_ID } from './usernames';

export const LINK_HOST = 'https://kivo.app';
export const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PaymentRequest = {
  id: string; // single-use identifier, checked on-chain at settle
  to: PublicKey; // who gets paid
  toUsername?: string;
  amount: number; // in whole tokens, not base units
  token: 'USDC' | 'SOL';
  memo?: string;
  createdAt: number;
  /** Set when this share belongs to a group bill. */
  billId?: string;
};

// Exported so a group bill can mint one shared billId up front, tagging
// each participant's individually-generated request — see
// NewRequestScreen's Split mode.
export function randomId(): string {
  // 16 hex chars is plenty for demo-scale uniqueness and keeps links short.
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

export function createRequest(
  params: Omit<PaymentRequest, 'id' | 'createdAt'>,
): PaymentRequest {
  return { ...params, id: randomId(), createdAt: Date.now() };
}

/**
 * One link format, two destinations: Android opens Kivo directly when it's
 * installed (autoVerify intent filter in app.json), and falls back to the
 * same URL as a web page when it isn't.
 */
export function encodeLink(req: PaymentRequest): string {
  const params = new URLSearchParams({
    i: req.id,
    to: req.to.toBase58(),
    a: String(req.amount),
    t: req.token,
    c: String(req.createdAt),
  });
  if (req.toUsername) params.set('u', req.toUsername);
  if (req.memo) params.set('m', req.memo);
  if (req.billId) params.set('b', req.billId);
  return `${LINK_HOST}/r?${params.toString()}`;
}

export function decodeLink(url: string): PaymentRequest | null {
  try {
    const parsed = new URL(url);
    const q = parsed.searchParams;

    const id = q.get('i');
    const to = q.get('to');
    const amount = Number(q.get('a'));
    const token = q.get('t');
    const createdAt = Number(q.get('c'));

    if (!id || !to || !amount || !createdAt) return null;
    if (token !== 'USDC' && token !== 'SOL') return null;
    if (!Number.isFinite(amount) || amount <= 0) return null;

    return {
      id,
      to: new PublicKey(to),
      toUsername: q.get('u') ?? undefined,
      amount,
      token,
      memo: q.get('m') ?? undefined,
      createdAt,
      billId: q.get('b') ?? undefined,
    };
  } catch {
    return null;
  }
}

export function isExpired(req: PaymentRequest): boolean {
  return Date.now() - req.createdAt > REQUEST_TTL_MS;
}

/**
 * The marker PDA that mark_paid() creates on-chain — its address alone
 * (not its contents; it holds no data) is the proof a request was paid.
 * Derived the same way on both sides: the program seeds it with
 * [b"request", request_id.as_bytes()] and this must match exactly.
 */
export function deriveRequestMarker(requestId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('request'), Buffer.from(requestId, 'utf8')],
    REGISTRY_PROGRAM_ID,
  );
  return pda;
}

export async function isRequestMarkedPaid(
  connection: import('@solana/web3.js').Connection,
  requestId: string,
): Promise<boolean> {
  const account = await connection.getAccountInfo(
    deriveRequestMarker(requestId),
  );
  return account !== null;
}

// First 8 bytes of sha256("global:mark_paid") — Anchor's instruction
// discriminator, precomputed the same way as CLAIM_DISCRIMINATOR in
// usernames.ts (see that file for why this is hardcoded rather than
// computed at runtime).
const MARK_PAID_DISCRIMINATOR = Buffer.from([
  51, 120, 9, 160, 70, 29, 18, 205,
]);

/**
 * Builds the mark_paid instruction — NOT a full Transaction, since this
 * must be added alongside the actual SOL/USDC transfer instructions in
 * the same transaction as RequestScreen's pay() does (see
 * buildSolTransfer/buildUsdcTransfer in transfer.ts). Solana's
 * atomicity is what makes this a real guarantee: the marker account and
 * the transfer either both land or neither does. Encodes
 * `request_id: String` (Borsh: u32 LE length + UTF-8 bytes) followed by
 * `created_at: i64` (Borsh: 8-byte LE) — the request's creation time in
 * Unix *seconds*, converted from the millisecond timestamp everything
 * else in this file uses.
 */
export function buildMarkPaidInstruction(
  payer: PublicKey,
  request: PaymentRequest,
): TransactionInstruction {
  const idBytes = Buffer.from(request.id, 'utf8');
  const idLength = Buffer.alloc(4);
  idLength.writeUInt32LE(idBytes.length, 0);

  const createdAtSeconds = Buffer.alloc(8);
  createdAtSeconds.writeBigInt64LE(
    BigInt(Math.floor(request.createdAt / 1000)),
    0,
  );

  const data = Buffer.concat([
    MARK_PAID_DISCRIMINATOR,
    idLength,
    idBytes,
    createdAtSeconds,
  ]);

  return new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      {
        pubkey: deriveRequestMarker(request.id),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: payer, isSigner: true, isWritable: true },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });
}

/** Even division with the remainder pushed onto the bill creator. */
export function splitEvenly(
  total: number,
  people: number,
): { share: number; creatorShare: number } {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / people);
  const remainder = cents - base * people;
  return { share: base / 100, creatorShare: (base + remainder) / 100 };
}
