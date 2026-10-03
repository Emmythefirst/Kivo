import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '../lib/WalletProvider';
import { isValidUsername, resolveUsername } from '../lib/usernames';
import { getRecentContacts, type RecentContact } from '../lib/localStore';
import Avatar from '../components/Avatar';
import { color, space, radius, type, font } from '../theme';

function isBase58Address(v: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(v.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Real-data recipient search — deliberately NOT a fuzzy "type a few
 * letters and see live matches" directory search. The project brief is
 * explicit that exact-match-only username resolution is the whole design
 * (no off-chain indexer exists to support fuzzy search); this screen
 * mirrors that: a full valid username resolves via one on-chain lookup,
 * a full address is recognized directly, and recent contacts fill the
 * empty-query state. No partial-match suggestions are faked.
 */
export default function PickerScreen({ navigation, route }: any) {
  const { connection } = useWallet();
  const mode: 'pay' | 'request' = route.params?.mode ?? 'pay';
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<RecentContact[]>([]);
  const [resolved, setResolved] = useState<{ address: string; username?: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getRecentContacts().then(setRecent);
  }, []);

  const trimmed = query.trim();
  const queryIsAddress = isBase58Address(trimmed);

  useEffect(() => {
    setResolved(null);
    setNotFound(false);
    if (!trimmed || queryIsAddress) return;
    const username = trimmed.replace(/^@/, '');
    if (!isValidUsername(username)) return;
    setResolving(true);
    const handle = setTimeout(async () => {
      try {
        const match = await resolveUsername(connection, username);
        setResolving(false);
        if (match) setResolved({ address: match.owner.toBase58(), username: match.username });
        else setNotFound(true);
      } catch {
        setResolving(false);
        setNotFound(true);
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, queryIsAddress, connection]);

  function pick(p: { address: string; username?: string }) {
    navigation.navigate('New', { selectedRecipient: p });
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.topRow}>
        <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>‹</Text>
        </Pressable>
        <Text style={s.title}>{mode === 'pay' ? 'Pay to' : 'Request from'}</Text>
      </View>

      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search username or paste address"
          placeholderTextColor={color.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        <Pressable style={s.qrBtn} onPress={() => navigation.navigate('Scan', { mode })}>
          <Text style={s.qrBtnText}>QR</Text>
        </Pressable>
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.sectionLabel}>
          {!trimmed ? 'RECENT' : queryIsAddress ? 'ADDRESS' : 'PEOPLE ON KIVO'}
        </Text>

        {queryIsAddress ? (
          <Pressable style={s.row} onPress={() => pick({ address: trimmed })}>
            <View style={s.addrIcon}>
              <Text style={s.addrIconText}>0x</Text>
            </View>
            <View style={s.rowMain}>
              <Text style={s.rowTitle} numberOfLines={1}>
                {trimmed.slice(0, 4)}…{trimmed.slice(-4)}
              </Text>
              <Text style={s.rowWarn}>Wallet address · no Kivo username</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Pressable>
        ) : trimmed ? (
          resolving ? (
            <Text style={s.statusText}>Checking @{trimmed.replace(/^@/, '')}…</Text>
          ) : resolved ? (
            <Pressable style={s.row} onPress={() => pick(resolved)}>
              <Avatar
                name={resolved.username ?? resolved.address}
                colorSeed={resolved.username ?? resolved.address}
                size={42}
              />
              <View style={s.rowMain}>
                <Text style={s.rowTitle}>@{resolved.username}</Text>
                <Text style={s.rowSub}>
                  {resolved.address.slice(0, 4)}…{resolved.address.slice(-4)}
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          ) : notFound ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>No one found for "{trimmed}"</Text>
              <Text style={s.emptyBody}>Paste a full Solana address to pay any wallet.</Text>
            </View>
          ) : null
        ) : recent.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>No recent contacts yet</Text>
            <Text style={s.emptyBody}>Type a username or paste an address to get started.</Text>
          </View>
        ) : (
          recent.map((c) => (
            <Pressable
              key={c.address}
              style={s.row}
              onPress={() => pick({ address: c.address, username: c.username })}
            >
              <Avatar name={c.username ?? c.address} colorSeed={c.username ?? c.address} size={42} />
              <View style={s.rowMain}>
                <Text style={s.rowTitle}>
                  {c.username ? `@${c.username}` : `${c.address.slice(0, 4)}…${c.address.slice(-4)}`}
                </Text>
                {c.username ? (
                  <Text style={s.rowSub}>
                    {c.address.slice(0, 4)}…{c.address.slice(-4)}
                  </Text>
                ) : null}
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  backBtn: { width: 32 },
  backBtnText: { fontSize: 24, color: color.text },
  title: { ...type.title, fontSize: 18, color: color.text },

  searchRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.35)',
    color: color.text,
    ...type.body,
    fontSize: 14.5,
  },
  qrBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBtnText: { ...type.captionBold, fontSize: 11, color: '#C9C6D1' },

  listContent: { padding: space.lg, paddingTop: space.lg },
  sectionLabel: { ...type.sectionLabel, color: color.textFaint, marginBottom: space.xs + 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { ...type.label, fontSize: 14.5, color: color.text },
  rowSub: { ...type.caption, fontSize: 12, color: color.textFainter, marginTop: 2 },
  rowWarn: { ...type.caption, fontSize: 12, color: color.owing, marginTop: 3 },
  chevron: { color: color.textFaint, fontSize: 18 },

  addrIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: '#262A33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addrIconText: { fontFamily: 'monospace', fontSize: 11, fontWeight: '800', color: '#B8C0D0' },

  statusText: { ...type.caption, color: color.textFainter, paddingVertical: space.md },

  emptyState: { paddingVertical: space.xxl, alignItems: 'center', gap: space.xs },
  emptyTitle: { ...type.label, fontSize: 14.5, color: color.text, textAlign: 'center' },
  emptyBody: { ...type.caption, color: color.textFainter, textAlign: 'center', lineHeight: 18 },
});
