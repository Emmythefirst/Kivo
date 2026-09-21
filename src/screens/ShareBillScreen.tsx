import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '../lib/WalletProvider';
import { useToast } from '../lib/ToastProvider';
import { isRequestMarkedPaid, encodeLink } from '../lib/requests';
import {
  getSentRequests,
  getBillMeta,
  type SentRequest,
  type BillMeta,
} from '../lib/localStore';
import Avatar from '../components/Avatar';
import { color, space, radius, type, formatAmount } from '../theme';

type Share_ = SentRequest & { paid: boolean };

/**
 * Loads its own data by billId rather than taking it all as nav params —
 * so this screen works the same whether it's reached right after creating
 * a bill or later from a Home screen row, and always reflects current
 * paid status rather than a stale snapshot. Paid status per share is a
 * real on-chain check; there's deliberately no manual "mark paid" toggle
 * here (the shared design's mock had one, but faking a paid state that
 * hasn't actually settled on-chain would be exactly the kind of mockup
 * behavior worth dropping when wiring this up to real data).
 */
export default function ShareBillScreen({ route, navigation }: any) {
  const { billId } = route.params;
  const { connection } = useWallet();
  const [meta, setMeta] = useState<BillMeta | null>(null);
  const [shares, setShares] = useState<Share_[]>([]);
  const toast = useToast();

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
      if (remind) toast('Reminder sent');
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  async function copyLink(link: string) {
    await Clipboard.setStringAsync(link);
    toast('Link copied');
  }

  const paidCount = shares.filter((entry) => entry.paid).length;
  const remaining = shares.reduce(
    (sum, entry) => (entry.paid ? sum : sum + entry.request.amount),
    0,
  );

  if (!meta) return null;

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.topRow}>
        <Pressable style={s.backBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={s.backBtnText}>‹</Text>
        </Pressable>
        <Text style={s.title}>Split bill</Text>
      </View>

      <View style={s.summary}>
        <Text style={s.summaryLabel}>
          {paidCount} of {shares.length} paid
        </Text>
        <Text style={s.summaryAmount}>
          {shares.length > 0 ? formatAmount(remaining, meta.token) : formatAmount(meta.total, meta.token)}
        </Text>
        <View style={s.progressTrack}>
          <View
            style={[
              s.progressFill,
              {
                width: `${
                  shares.length > 0 ? Math.round((paidCount / shares.length) * 100) : 0
                }%`,
              },
            ]}
          />
        </View>
      </View>

      {shares.map((entry, i) => {
        const link = encodeLink(entry.request);
        const name = `Person ${i + 1}`;
        return (
          <View key={entry.request.id} style={s.row}>
            <Avatar name={name} colorSeed={entry.request.id} size={38} />
            <View style={s.rowMain}>
              <Text style={s.rowName}>{name}</Text>
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
                <Pressable style={s.smallBtn} onPress={() => copyLink(link)}>
                  <Text style={s.smallBtnText}>Copy</Text>
                </Pressable>
                <Pressable
                  style={s.smallBtn}
                  onPress={() =>
                    shareLink(link, entry.request.amount, entry.request.token, true)
                  }
                >
                  <Text style={s.smallBtnText}>Remind</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}

      <Pressable style={s.homeBtn} onPress={() => navigation.navigate('Home')}>
        <Text style={s.homeBtnText}>Back home</Text>
      </Pressable>
    </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.bg },
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: space.lg, gap: space.md },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  backBtn: { width: 28 },
  backBtnText: { fontSize: 20, color: color.text },
  title: { ...type.title, fontSize: 17, color: color.text },

  summary: {
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    borderRadius: radius.xl,
    padding: space.lg + 2,
  },
  summaryLabel: { ...type.caption, color: color.textFainter },
  summaryAmount: { ...type.amountMd, color: color.text, marginTop: space.xs },
  progressTrack: {
    marginTop: space.md,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.borderStrong,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: color.owed, borderRadius: 3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { ...type.label, fontSize: 14, color: color.text },
  rowAmount: { ...type.caption, color: color.textFainter, marginTop: 2 },

  rowActions: { flexDirection: 'row', gap: space.xs },
  smallBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  smallBtnText: { ...type.captionBold, fontSize: 11.5, color: color.textDim },

  paidBadge: {
    backgroundColor: 'rgba(198,242,78,0.12)',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  paidBadgeText: { ...type.captionBold, color: color.owed },

  homeBtn: {
    marginTop: space.sm,
    paddingVertical: space.md + 3,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    alignItems: 'center',
  },
  homeBtnText: { ...type.label, color: color.text },
});
