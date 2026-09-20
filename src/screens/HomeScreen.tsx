import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useWallet } from '../lib/WalletProvider';
import { getLocalUsername } from '../lib/usernames';
import { encodeLink } from '../lib/requests';
import { getSentRequests, type SentRequest } from '../lib/localStore';
import { color, space, radius, type, formatAmount } from '../theme';

/**
 * Requests this device has created, read from local storage (see the
 * project brief's stance against an on-chain request lifecycle — there's
 * intentionally no server or on-chain "pending" state to query instead).
 * Every item here is money someone else owes the connected wallet, since
 * a created request always pays back to session.publicKey; there's no
 * "you owe" side yet because nothing currently tracks requests received
 * from someone else (Phase 3+ territory — replay protection would be
 * the natural place to also start recording that).
 *
 * Requests sharing a billId (created via Split mode) collapse into one
 * row rather than showing N duplicate "Someone owes you $X" lines — a
 * bill is one thing on Home, matching the brief's positioning of
 * splitting as something the request layer supports, not its own
 * separate feature identity.
 */
type SingleItem = {
  kind: 'single';
  id: string;
  counterparty: string;
  amount: number;
  token: 'USDC' | 'SOL';
  memo?: string;
  sentRequest: SentRequest;
};
type BillRow = {
  kind: 'bill';
  billId: string;
  memo?: string;
  token: 'USDC' | 'SOL';
  totalFromOthers: number;
  count: number;
};
type Row = SingleItem | BillRow;

export default function HomeScreen({ navigation }: any) {
  const { session } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [username, setUsername] = useState<string | null>(null);

  // Re-check on every focus, not just mount — creating a request or
  // claiming a username both navigate back here without remounting.
  useFocusEffect(
    useCallback(() => {
      getLocalUsername().then(setUsername);
      getSentRequests().then((sent) => {
        const singles: SingleItem[] = [];
        const bills = new Map<string, SentRequest[]>();

        for (const entry of sent) {
          const billId = entry.request.billId;
          if (billId) {
            bills.set(billId, [...(bills.get(billId) ?? []), entry]);
          } else {
            singles.push({
              kind: 'single',
              id: entry.request.id,
              counterparty: entry.requestedFromLabel ?? 'Someone',
              amount: entry.request.amount,
              token: entry.request.token,
              memo: entry.request.memo,
              sentRequest: entry,
            });
          }
        }

        const billRows: BillRow[] = Array.from(bills.entries()).map(
          ([billId, entries]) => ({
            kind: 'bill',
            billId,
            memo: entries[0].request.memo,
            token: entries[0].request.token,
            totalFromOthers: entries.reduce(
              (sum, e) => sum + e.request.amount,
              0,
            ),
            count: entries.length,
          }),
        );

        setRows([...billRows, ...singles]);
      });
    }, []),
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={s.greeting}>Open tabs</Text>
        <Pressable
          style={s.newCta}
          onPress={() => navigation.navigate('New')}
        >
          <Text style={s.newCtaText}>New request</Text>
        </Pressable>
      </View>

      {username ? (
        <Text style={s.usernameLabel}>@{username}</Text>
      ) : (
        <Pressable
          style={s.usernameCta}
          onPress={() => navigation.navigate('ClaimUsername')}
        >
          <Text style={s.usernameCtaText}>Claim a username</Text>
        </Pressable>
      )}

      {rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Nothing outstanding</Text>
          <Text style={s.emptyBody}>
            Send your first request and it shows up here until it's settled.
          </Text>
        </View>
      ) : (
        rows.map((row) =>
          row.kind === 'bill' ? (
            <Pressable
              key={row.billId}
              style={s.row}
              onPress={() =>
                navigation.navigate('ShareBill', { billId: row.billId })
              }
            >
              <View style={s.rowMain}>
                <Text style={s.rowName}>
                  {row.memo || 'Split bill'} — {row.count} people
                </Text>
              </View>
              <Text style={[s.rowAmount, { color: color.owed }]}>
                {formatAmount(row.totalFromOthers, row.token)}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              key={row.id}
              style={s.row}
              onPress={() =>
                navigation.navigate('ShareRequest', {
                  link: encodeLink(row.sentRequest.request),
                  requestedFromLabel: row.sentRequest.requestedFromLabel,
                })
              }
            >
              <View style={s.rowMain}>
                <Text style={s.rowName}>{row.counterparty} owes you</Text>
                {row.memo ? <Text style={s.rowMemo}>{row.memo}</Text> : null}
              </View>
              <Text style={[s.rowAmount, { color: color.owed }]}>
                {formatAmount(row.amount, row.token)}
              </Text>
            </Pressable>
          ),
        )
      )}

      <View style={s.walletStrip}>
        <Text style={s.walletLabel}>Paying from</Text>
        <Text style={s.walletAddr}>
          {session
            ? `${session.publicKey.toBase58().slice(0, 4)}…${session.publicKey
                .toBase58()
                .slice(-4)}`
            : '—'}
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: space.xl, gap: space.sm },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  greeting: { ...type.title, color: color.text },
  newCta: {
    backgroundColor: color.surfaceRaised,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  newCtaText: { ...type.label, color: color.text },
  usernameLabel: {
    ...type.label,
    color: color.accent,
    marginBottom: space.md,
  },
  usernameCta: { alignSelf: 'flex-start', marginBottom: space.md },
  usernameCtaText: { ...type.label, color: color.accent },

  empty: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.sm,
    alignItems: 'flex-start',
  },
  emptyTitle: { ...type.label, fontSize: 16, color: color.text },
  emptyBody: { ...type.body, color: color.textDim },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { ...type.label, fontSize: 15, color: color.text },
  rowMemo: { ...type.caption, color: color.textDim },
  rowMeta: { ...type.caption, color: color.textFaint },
  rowAmount: { ...type.amountSm },

  walletStrip: {
    marginTop: space.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
  },
  walletLabel: { ...type.caption, color: color.textFaint },
  walletAddr: { ...type.caption, color: color.textDim },
});
