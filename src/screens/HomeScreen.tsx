import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useWallet } from '../lib/WalletProvider';
import { getLocalUsername } from '../lib/usernames';
import { loadActivity, loadIncoming, type ActivityItem, type IncomingRequest } from '../lib/activity';
import { syncIncomingRequests } from '../lib/sync';
import ActivityRow from '../components/ActivityRow';
import Avatar from '../components/Avatar';
import { color, space, radius, type, font, formatAmount } from '../theme';

const HOME_PREVIEW_LIMIT = 5;

export default function HomeScreen({ navigation }: any) {
  const { session, connection } = useWallet();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const localUsername = await getLocalUsername();
        if (cancelled) return;
        setUsername(localUsername);

        // Best-effort pull of anything a known contact requested from
        // this device's claimed username while the app wasn't open —
        // folds straight into the same local tracking a tapped link
        // already uses, so loadIncoming() below picks it up either way.
        if (localUsername && session) {
          await syncIncomingRequests(localUsername, session.publicKey.toBase58());
        }
        if (cancelled) return;

        loadActivity(connection).then((all) => {
          if (!cancelled) setItems(all);
        });
        loadIncoming(connection).then((inc) => {
          if (!cancelled) setIncoming(inc);
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [connection, session]),
  );

  // Summed as a single number regardless of each item's own token — mixing
  // USDC and SOL amounts isn't really "one currency," but USDC is this
  // app's default and SOL rows are rare in practice, so a single
  // aggregate figure (labelled as USDC) is an acceptable simplification
  // for the design's one pending-total card rather than two separate
  // per-token totals nobody asked for. Payments don't count toward this
  // total — they're money that already left, not money pending to you.
  const pendingItems = items.filter(
    (it) => (it.kind === 'bill' && it.totalFromOthers > 0) || (it.kind === 'request' && !it.paid),
  );
  const pendingTotal = pendingItems.reduce(
    (sum, it) => sum + (it.kind === 'bill' ? it.totalFromOthers : it.amount),
    0,
  );
  const pendingCountLabel =
    pendingItems.length === 0
      ? 'Nothing outstanding'
      : `${pendingItems.length} open request${pendingItems.length > 1 ? 's' : ''}`;
  const pendingAvatars = pendingItems.slice(0, 3);

  const address = session ? session.publicKey.toBase58() : null;
  const walletName = session?.label || 'Wallet';
  const visibleItems = items.slice(0, HOME_PREVIEW_LIMIT);

  const incFromLabel = incoming?.request.toUsername ? `@${incoming.request.toUsername}` : 'Someone';
  const incSeed = incoming ? incoming.request.toUsername ?? incoming.request.to.toBase58() : '';

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <View style={s.brandRow}>
          <View style={s.miniMark}>
            <View style={s.miniMarkLime} />
            <View style={s.miniMarkPurple} />
          </View>
          <View>
            <Text style={s.wordmark}>Kivo</Text>
            {address ? (
              <Text style={s.walletSub}>
                {walletName} · {address.slice(0, 4)}…{address.slice(-4)}
              </Text>
            ) : null}
          </View>
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
        <View style={s.pendingAmountRow}>
          <Text style={s.pendingAmount}>{pendingTotal.toFixed(2)}</Text>
          <Text style={s.pendingAmountToken}>USDC</Text>
        </View>
        <View style={s.pendingBottomRow}>
          <Text style={s.pendingCount}>{pendingCountLabel}</Text>
          {pendingAvatars.length > 0 ? (
            <View style={s.pendingAvatarsRow}>
              {pendingAvatars.map((it, i) => (
                <View key={it.id} style={[s.pendingAvatarWrap, i > 0 && s.pendingAvatarOverlap]}>
                  <Avatar
                    name={it.kind === 'request' ? it.counterparty : it.memo || 'Split bill'}
                    colorSeed={it.id}
                    size={28}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {incoming ? (
        <Pressable
          style={s.incomingCard}
          onPress={() => navigation.navigate('Request', { link: incoming.link })}
        >
          <View style={s.incomingTopRow}>
            <Avatar name={incFromLabel} colorSeed={incSeed} size={42} />
            <View style={s.incomingMain}>
              <Text style={s.incomingTitle} numberOfLines={1}>
                <Text style={s.incomingTitleBold}>{incFromLabel}</Text> requested
              </Text>
              <Text style={s.incomingSub} numberOfLines={1}>
                {incoming.request.memo || '—'} · pending
              </Text>
            </View>
            <Text style={s.incomingAmount}>
              {formatAmount(incoming.request.amount, incoming.request.token)}
            </Text>
          </View>
          <View style={s.incomingActions}>
            <Pressable
              style={s.incomingDecline}
              onPress={() => navigation.navigate('Request', { link: incoming.link })}
            >
              <Text style={s.incomingDeclineText}>Decline</Text>
            </Pressable>
            <Pressable
              style={s.incomingReview}
              onPress={() => navigation.navigate('Request', { link: incoming.link })}
            >
              <Text style={s.incomingReviewText}>Review & pay</Text>
            </Pressable>
          </View>
        </Pressable>
      ) : null}

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
  content: { padding: space.xl, paddingBottom: space.xxl, gap: space.md + 2 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  miniMark: { width: 28, height: 28 },
  miniMarkLime: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: color.owed,
  },
  miniMarkPurple: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.bg,
  },
  wordmark: { ...type.title, fontSize: 18, color: color.text },
  walletSub: { ...type.caption, fontSize: 11.5, fontFamily: 'monospace', color: '#6E6E78', marginTop: 4 },

  usernameChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  usernameChipText: { ...type.label, fontSize: 13, color: color.text },
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
  pendingLabel: { ...type.captionBold, fontSize: 11.5, letterSpacing: 0.6, color: color.textFainter },
  pendingAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xs + 2 },
  pendingAmount: { ...type.amount, color: color.text },
  pendingAmountToken: { ...type.label, fontSize: 13, color: color.textFainter },
  pendingBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  pendingCount: { ...type.body, fontSize: 13, color: color.textDim },
  pendingAvatarsRow: { flexDirection: 'row', paddingLeft: space.sm },
  pendingAvatarWrap: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#17171F',
  },
  pendingAvatarOverlap: { marginLeft: -8 },

  incomingCard: {
    backgroundColor: '#14131C',
    borderWidth: 1,
    borderColor: 'rgba(158,140,252,0.28)',
    borderRadius: radius.xl,
    padding: space.md + 2,
    gap: space.md,
  },
  incomingTopRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  incomingMain: { flex: 1, minWidth: 0 },
  incomingTitle: { ...type.body, fontSize: 14, color: color.textDim },
  incomingTitleBold: { fontFamily: font.bodyExtraBold, color: color.text },
  incomingSub: { ...type.caption, fontSize: 12.5, color: color.textFainter, marginTop: 2 },
  incomingAmount: { ...type.label, fontSize: 17, color: color.owed },
  incomingActions: { flexDirection: 'row', gap: space.sm },
  incomingDecline: {
    flex: 1,
    paddingVertical: space.sm + 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  incomingDeclineText: { ...type.label, fontSize: 13, color: color.textDim },
  incomingReview: {
    flex: 1.6,
    paddingVertical: space.sm + 3,
    borderRadius: radius.md,
    backgroundColor: color.text,
    alignItems: 'center',
  },
  incomingReviewText: { ...type.labelLg, fontSize: 13, color: color.bg },

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
