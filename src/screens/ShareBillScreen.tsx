import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '../lib/WalletProvider';
import { isRequestMarkedPaid, encodeLink } from '../lib/requests';
import {
  getSentRequests,
  getBillMeta,
  type SentRequest,
  type BillMeta,
} from '../lib/localStore';
import { color, space, radius, type, formatAmount } from '../theme';

type Share_ = SentRequest & { paid: boolean };

/**
 * Loads its own data by billId rather than taking it all as nav params —
 * so this screen works the same whether it's reached right after creating
 * a bill or later from a Home screen row, and always reflects current
 * paid status rather than a stale snapshot.
 */
export default function ShareBillScreen({ route, navigation }: any) {
  const { billId } = route.params;
  const { connection } = useWallet();
  const [meta, setMeta] = useState<BillMeta | null>(null);
  const [shares, setShares] = useState<Share_[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [billMeta, all] = await Promise.all([
          getBillMeta(billId),
          getSentRequests(),
        ]);
        const mine = all.filter((entry) => entry.request.billId === billId);
        const withPaid = await Promise.all(
          mine.map(async (entry) => ({
            ...entry,
            paid: await isRequestMarkedPaid(connection, entry.request.id),
          })),
        );
        if (!cancelled) {
          setMeta(billMeta);
          setShares(withPaid);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [billId, connection]),
  );

  async function shareLink(
    link: string,
    amount: number,
    token: 'USDC' | 'SOL',
    remind: boolean,
  ) {
    try {
      await Share.share({
        message: `${remind ? 'Reminder: y' : 'Y'}ou owe ${formatAmount(
          amount,
          token,
        )}${meta?.memo ? ` for ${meta.memo}` : ''} — ${link}`,
      });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  async function copyLink(link: string) {
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', 'Link copied to clipboard.');
  }

  const paidCount = shares.filter((entry) => entry.paid).length;

  if (!meta) return null;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.summary}>
        <Text style={s.summaryLabel}>{meta.memo || 'Split bill'}</Text>
        <Text style={s.summaryAmount}>
          {formatAmount(meta.total, meta.token)}
        </Text>
        <Text style={s.summaryMeta}>
          Split {meta.peopleCount} ways — your share{' '}
          {formatAmount(meta.creatorShare, meta.token)}
        </Text>
        {shares.length > 0 ? (
          <Text style={s.summaryMeta}>
            {paidCount} of {shares.length} paid
          </Text>
        ) : null}
      </View>

      {shares.map((entry, i) => {
        const link = encodeLink(entry.request);
        return (
          <View key={entry.request.id} style={s.row}>
            <View style={s.rowMain}>
              <Text style={s.rowName}>Person {i + 1}</Text>
              <Text style={s.rowAmount}>
                {formatAmount(entry.request.amount, entry.request.token)}
              </Text>
            </View>
            {entry.paid ? (
              <View style={s.paidBadge}>
                <Text style={s.paidBadgeText}>Paid</Text>
              </View>
            ) : (
              <View style={s.rowActions}>
                <Pressable
                  style={s.smallBtn}
                  onPress={() => copyLink(link)}
                >
                  <Text style={s.smallBtnText}>Copy</Text>
                </Pressable>
                <Pressable
                  style={s.smallBtn}
                  onPress={() =>
                    shareLink(
                      link,
                      entry.request.amount,
                      entry.request.token,
                      true,
                    )
                  }
                >
                  <Text style={s.smallBtnText}>Remind</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      <Pressable style={s.done} onPress={() => navigation.navigate('Home')}>
        <Text style={s.doneText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: space.xl, gap: space.md },

  summary: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.xs,
  },
  summaryLabel: { ...type.body, color: color.textDim },
  summaryAmount: { ...type.amount, color: color.text },
  summaryMeta: { ...type.caption, color: color.textFaint },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.lg,
  },
  rowMain: { gap: 2 },
  rowName: { ...type.label, fontSize: 15, color: color.text },
  rowAmount: { ...type.amountSm, color: color.textDim },

  rowActions: { flexDirection: 'row', gap: space.xs },
  smallBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceRaised,
  },
  smallBtnText: { ...type.caption, color: color.text },

  paidBadge: {
    backgroundColor: color.owed,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  paidBadgeText: { ...type.caption, color: color.bg, fontWeight: '600' },

  done: { alignItems: 'center', paddingVertical: space.md },
  doneText: { ...type.label, color: color.textFaint },
});
