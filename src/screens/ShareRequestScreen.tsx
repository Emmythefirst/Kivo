import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Share, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '../lib/WalletProvider';
import { decodeLink, isRequestMarkedPaid } from '../lib/requests';
import QrCode from '../components/QrCode';
import { color, space, radius, type, formatAmount } from '../theme';

export default function ShareRequestScreen({ route, navigation }: any) {
  const { link, requestedFromLabel } = route.params;
  // Reconstructed from the link, not passed as its own param — a decoded
  // PaymentRequest embeds a PublicKey, which React Navigation warns about
  // passing through navigation state.
  const request = useMemo(() => decodeLink(link), [link]);
  const { connection } = useWallet();
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!request) return;
    isRequestMarkedPaid(connection, request.id).then(setPaid);
  }, [connection, request]);

  if (!request) {
    return (
      <View style={s.root}>
        <Text style={s.label}>This link isn't a valid request.</Text>
      </View>
    );
  }

  async function share() {
    // Safe: this is only ever wired to a button rendered below the
    // `if (!request) return` guard above, so `request` is always set by
    // the time this runs — TS just can't see across the closure boundary.
    try {
      await Share.share({
        message: `Requesting ${formatAmount(request!.amount, request!.token)}${
          request!.memo ? ` for ${request!.memo}` : ''
        } — ${link}`,
      });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  async function copy() {
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', 'Link copied to clipboard.');
  }

  return (
    <View style={s.root}>
      <View style={s.card}>
        <View style={s.headerRow}>
          <Text style={s.label}>
            {requestedFromLabel
              ? `Requesting from ${requestedFromLabel}`
              : 'Request created'}
          </Text>
          {paid ? (
            <View style={s.paidBadge}>
              <Text style={s.paidBadgeText}>Paid</Text>
            </View>
          ) : null}
        </View>
        <Text style={s.amount}>
          {formatAmount(request.amount, request.token)}
        </Text>
        {request.memo ? <Text style={s.memo}>{request.memo}</Text> : null}

        <View style={s.linkBox}>
          <Text style={s.linkLabel}>Anyone with this link can pay it</Text>
          <Text style={s.link} numberOfLines={2}>
            {link}
          </Text>
        </View>
      </View>

      <View style={s.qrRow}>
        <QrCode value={link} size={180} />
      </View>

      <View style={s.actions}>
        <Pressable style={[s.btn, s.secondary]} onPress={copy}>
          <Text style={s.secondaryText}>Copy link</Text>
        </Pressable>
        <Pressable style={[s.btn, s.primary]} onPress={share}>
          <Text style={s.primaryText}>Share</Text>
        </Pressable>
      </View>

      <Pressable
        style={s.done}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={s.doneText}>Done</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.lg, gap: space.lg },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { ...type.body, color: color.textDim },
  paidBadge: {
    backgroundColor: color.owed,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  paidBadgeText: { ...type.caption, color: color.bg, fontWeight: '600' },
  amount: { ...type.amount, color: color.text },
  memo: { ...type.body, color: color.textDim },
  linkBox: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    gap: 2,
  },
  linkLabel: { ...type.caption, color: color.textFaint },
  link: { ...type.caption, color: color.accent },

  qrRow: { alignItems: 'center' },

  actions: { flexDirection: 'row', gap: space.md },
  btn: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  secondary: { backgroundColor: color.surfaceRaised },
  secondaryText: { ...type.label, fontSize: 16, color: color.textDim },
  primary: { backgroundColor: color.text },
  primaryText: { ...type.label, fontSize: 16, color: color.bg },

  done: { alignItems: 'center', paddingVertical: space.md },
  doneText: { ...type.label, color: color.textFaint },
});
