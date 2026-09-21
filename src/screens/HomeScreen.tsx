import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useWallet } from '../lib/WalletProvider';
import { getLocalUsername } from '../lib/usernames';
import { loadActivity, type ActivityItem } from '../lib/activity';
import ActivityRow from '../components/ActivityRow';
import { color, space, radius, type, font, formatAmount } from '../theme';

const HOME_PREVIEW_LIMIT = 5;

export default function HomeScreen({ navigation }: any) {
  const { session, connection } = useWallet();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [username, setUsername] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getLocalUsername().then(setUsername);
      loadActivity(connection).then((all) => {
        if (!cancelled) setItems(all);
      });
      return () => {
        cancelled = true;
      };
    }, [connection]),
  );

  // Summed as a single number regardless of each item's own token — mixing
  // USDC and SOL amounts isn't really "one currency," but USDC is this
  // app's default and SOL rows are rare in practice, so a single
  // aggregate figure (labelled as USDC) is an acceptable simplification
  // for the design's one pending-total card rather than two separate
  // per-token totals nobody asked for. Payments don't count toward this
  // total — they're money that already left, not money pending to you.
  const pendingTotal = items.reduce((sum, it) => {
    if (it.kind === 'bill') return sum + it.totalFromOthers;
    if (it.kind === 'request') return it.paid ? sum : sum + it.amount;
    return sum;
  }, 0);
  const address = session ? session.publicKey.toBase58() : null;
  const visibleItems = items.slice(0, HOME_PREVIEW_LIMIT);

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.wordmark}>Kivo</Text>
          {address ? (
            <Text style={s.walletSub}>
              {address.slice(0, 4)}…{address.slice(-4)}
            </Text>
          ) : null}
        </View>
        {username ? (
          <View style={s.usernameChip}>
            <Text style={s.usernameChipText}>@{username}</Text>
          </View>
        ) : (
          <Pressable style={s.claimChip} onPress={() => navigation.navigate('ClaimUsername')}>
            <Text style={s.claimChipText}>Claim username</Text>
          </Pressable>
        )}
      </View>

      <View style={s.pendingCard}>
        <Text style={s.pendingLabel}>PENDING TO YOU</Text>
        <Text style={s.pendingAmount}>{formatAmount(pendingTotal, 'USDC')}</Text>
      </View>

      {items.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon} />
          <Text style={s.emptyTitle}>No activity yet</Text>
          <Text style={s.emptyBody}>
            Ask someone for money, pay someone, or split a bill — you'll see it here.
          </Text>
        </View>
      ) : (
        <View style={s.list}>
          <Text style={s.listLabel}>ACTIVITY</Text>
          {visibleItems.map((item) => (
            <ActivityRow key={item.id} item={item} navigation={navigation} />
          ))}
          {items.length > HOME_PREVIEW_LIMIT ? (
            <Pressable style={s.seeAllBtn} onPress={() => navigation.navigate('Activity')}>
              <Text style={s.seeAllText}>See all {items.length} →</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={s.actionsRow}>
        <Pressable
          style={s.secondaryBtn}
          onPress={() => navigation.navigate('New', { mode: 'pay' })}
        >
          <Text style={s.secondaryBtnText}>Pay someone</Text>
        </Pressable>
        <Pressable
          style={s.primaryBtn}
          onPress={() => navigation.navigate('New', { mode: 'request' })}
        >
          <Text style={s.primaryBtnText}>Request money</Text>
        </Pressable>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.bg },
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xxl, gap: space.lg },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wordmark: { ...type.title, color: color.text },
  walletSub: { ...type.caption, color: color.textFaint, marginTop: 2 },

  usernameChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  usernameChipText: { ...type.label, fontSize: 13, color: color.owed },
  claimChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(158,140,252,0.4)',
  },
  claimChipText: { fontFamily: font.bodyBold, fontSize: 12, color: '#C9C2FA' },

  pendingCard: {
    backgroundColor: color.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.xl,
  },
  pendingLabel: { ...type.sectionLabel, color: color.textDim },
  pendingAmount: { ...type.amount, color: color.text, marginTop: space.xs + 2 },

  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(198,242,78,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.25)',
  },
  emptyTitle: { ...type.label, fontSize: 15, color: color.text },
  emptyBody: { ...type.caption, color: color.textFainter, textAlign: 'center', maxWidth: 220 },

  list: { gap: space.sm },
  listLabel: { ...type.sectionLabel, color: color.textFaint, marginBottom: 2 },

  seeAllBtn: { alignItems: 'center', paddingVertical: space.md },
  seeAllText: { ...type.label, fontSize: 13, color: color.owed },

  actionsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  secondaryBtn: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
  },
  secondaryBtnText: { ...type.label, color: color.text },
  primaryBtn: {
    flex: 1.4,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
    alignItems: 'center',
  },
  primaryBtnText: { ...type.labelLg, color: color.bg },
});
