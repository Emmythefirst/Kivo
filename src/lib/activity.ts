import type { Connection } from '@solana/web3.js';
import { getSentRequests, getSentPayments, type SentRequest } from './localStore';
import { isRequestMarkedPaid } from './requests';

export type RequestActivityItem = {
  kind: 'request';
  id: string;
  createdAt: number;
  counterparty: string;
  amount: number;
  token: 'USDC' | 'SOL';
  memo?: string;
  paid: boolean;
  sentRequest: SentRequest;
};

export type BillActivityItem = {
  kind: 'bill';
  id: string; // = billId — kept as `id` so every item shares one key field
  billId: string;
  createdAt: number;
  memo?: string;
  token: 'USDC' | 'SOL';
  totalFromOthers: number;
  count: number;
  paidCount: number;
};

export type PaymentActivityItem = {
  kind: 'payment';
  id: string; // = signature
  createdAt: number;
  to: string;
  toUsername?: string;
  amount: number;
  token: 'USDC' | 'SOL';
  memo?: string;
  signature: string;
};

export type ActivityItem = RequestActivityItem | BillActivityItem | PaymentActivityItem;

/**
 * Everything locally known to have happened, merged and sorted newest
 * first: requests sent, group bills created, and payments made. Shared by
 * HomeScreen (capped preview) and ActivityScreen (full month-grouped
 * history) so the two never compute this differently. Paid status for
 * requests/bills is a real on-chain check, same as everywhere else in
 * this app — payments need no such check since they're only ever
 * recorded after their own transaction already confirmed.
 */
export async function loadActivity(connection: Connection): Promise<ActivityItem[]> {
  const [sent, payments] = await Promise.all([getSentRequests(), getSentPayments()]);

  const singlesRaw: SentRequest[] = [];
  const bills = new Map<string, SentRequest[]>();
  for (const entry of sent) {
    const billId = entry.request.billId;
    if (billId) {
      bills.set(billId, [...(bills.get(billId) ?? []), entry]);
    } else {
      singlesRaw.push(entry);
    }
  }

  const requestItems: RequestActivityItem[] = await Promise.all(
    singlesRaw.map(async (entry) => ({
      kind: 'request' as const,
      id: entry.request.id,
      createdAt: entry.request.createdAt,
      counterparty: entry.requestedFromLabel ?? 'Someone',
      amount: entry.request.amount,
      token: entry.request.token,
      memo: entry.request.memo,
      paid: await isRequestMarkedPaid(connection, entry.request.id),
      sentRequest: entry,
    })),
  );

  const billItems: BillActivityItem[] = await Promise.all(
    Array.from(bills.entries()).map(async ([billId, entries]) => {
      const paidFlags = await Promise.all(
        entries.map((e) => isRequestMarkedPaid(connection, e.request.id)),
      );
      const unpaidTotal = entries.reduce(
        (sum, e, i) => (paidFlags[i] ? sum : sum + e.request.amount),
        0,
      );
      return {
        kind: 'bill' as const,
        id: billId,
        billId,
        createdAt: entries[0].request.createdAt,
        memo: entries[0].request.memo,
        token: entries[0].request.token,
        totalFromOthers: unpaidTotal,
        count: entries.length,
        paidCount: paidFlags.filter(Boolean).length,
      };
    }),
  );

  const paymentItems: PaymentActivityItem[] = payments.map((p) => ({
    kind: 'payment' as const,
    id: p.signature,
    createdAt: p.createdAt,
    to: p.to,
    toUsername: p.toUsername,
    amount: p.amount,
    token: p.token,
    memo: p.memo,
    signature: p.signature,
  }));

  return [...requestItems, ...billItems, ...paymentItems].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

/** "September 2026" style label for grouping the full history by month. */
export function monthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
