import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '../lib/WalletProvider';
import { useToast } from '../lib/ToastProvider';
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
  const toast = useToast();

  useEffect(() => {
    if (!request) return;
    isRequestMarkedPaid(connection, request.id).then(setPaid);
  }, [connection, request]);

  if (!request) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <Text style={s.label}>This link isn't a valid request.</Text>
      </SafeAreaView>
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
    toast('Link copied');
  }

  const subtitle = request.memo
    ? request.memo
    : requestedFromLabel
      ? `Requesting from ${requestedFromLabel}`
      : 'Request created';

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <Text style={s.title}>Ready to share</Text>

      <View style={s.card}>
        <View style={s.amountRow}>
          <Text style={s.amount}>{formatAmount(request.amount, request.token)}</Text>
          {paid ? (
            <View style={s.paidBadge}>
              <Text style={s.paidBadgeText}>Paid</Text>
            </View>
          ) : null}
        </View>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>

      <View style={s.qrBlock}>
        <QrCode value={link} size={180} />
        <Text style={s.qrCaption}>Scan to pay</Text>
      </View>

      <View style={s.linkRow}>
        <Text style={s.link} numberOfLines={1}>
          {link}
        </Text>
        <Pressable style={s.copyBtn} onPress={copy}>
          <Text style={s.copyBtnText}>Copy</Text>
        </Pressable>
      </View>

      <Pressable style={s.shareBtn} onPress={share}>
        <Text style={s.shareBtnText}>Share link</Text>
      </Pressable>

      <Pressable style={s.done} onPress={() => navigation.navigate('Home')}>
        <Text style={s.doneText}>Done</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.xl, paddingTop: space.xl + 4 },
  title: { ...type.title, color: color.text, textAlign: 'center' },
  label: { ...type.body, color: color.textDim },

  card: {
    marginTop: space.lg,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    borderRadius: radius.xl,
    padding: space.xl,
    alignItems: 'center',
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amount: { ...type.amountMd, color: color.owed },
  subtitle: { ...type.caption, color: color.textFainter, marginTop: space.xs + 2 },
  paidBadge: {
    backgroundColor: 'rgba(198,242,78,0.12)',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  paidBadgeText: { ...type.captionBold, color: color.owed },

  qrBlock: { alignItems: 'center', marginTop: space.lg },
  qrCaption: { ...type.caption, color: color.textFaint, marginTop: space.sm },

  linkRow: {
    marginTop: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
  },
  link: { flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#C9C2C6' },
  copyBtn: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
  },
  copyBtnText: { ...type.captionBold, fontSize: 12, color: color.text },

  shareBtn: {
    marginTop: space.md,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
    alignItems: 'center',
  },
  shareBtnText: { ...type.labelLg, color: color.bg },

  done: { alignItems: 'center', paddingVertical: space.md + 2 },
  doneText: { ...type.label, color: color.textFainter },
});
