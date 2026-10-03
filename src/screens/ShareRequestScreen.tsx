import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Share, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '../lib/WalletProvider';
import { useToast } from '../lib/ToastProvider';
import { decodeLink, isRequestMarkedPaid } from '../lib/requests';
import { removeSentRequest } from '../lib/localStore';
import { cancelPendingRequest } from '../lib/sync';
import QrCode from '../components/QrCode';
import SuccessCheck from '../components/SuccessCheck';
import { color, space, radius, type, formatAmount } from '../theme';

export default function ShareRequestScreen({ route, navigation }: any) {
  const { link, requestedFromLabel } = route.params;
  // Reconstructed from the link, not passed as its own param — a decoded
  // PaymentRequest embeds a PublicKey, which React Navigation warns about
  // passing through navigation state.
  const request = useMemo(() => decodeLink(link), [link]);
  const { connection } = useWallet();
  const [paid, setPaid] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
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

  function confirmCancel() {
    Alert.alert(
      'Cancel this request?',
      "They won't be able to pay it anymore, and it'll disappear from their Home screen if it's already there.",
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel request', style: 'destructive', onPress: doCancel },
      ],
    );
  }

  async function doCancel() {
    await removeSentRequest(request!.id);
    // Harmless no-op on the backend if this particular request was never
    // actually pushed there (recipient wasn't a known contact at
    // creation time) — same best-effort contract as pushPendingRequest.
    if (requestedFromLabel?.startsWith('@')) {
      await cancelPendingRequest(requestedFromLabel.slice(1), request!.id);
    }
    toast('Request cancelled');
    navigation.navigate('Home');
  }

  const fromLabel = requestedFromLabel
    ? `from ${requestedFromLabel}`
    : 'Anyone with the link can pay';

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.topRow}>
        <Pressable style={s.backBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={s.backBtnText}>‹</Text>
        </Pressable>
        {!paid ? (
          <Pressable style={s.cancelBtn} onPress={confirmCancel}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </Pressable>
        ) : (
          <View style={s.topRowSpacer} />
        )}
      </View>

      <View style={s.topBlock}>
        <SuccessCheck size={56} />
        <Text style={s.createdLabel}>REQUEST CREATED</Text>
      </View>

      <View style={s.card}>
        <View style={s.amountRow}>
          <Text style={s.amount}>{formatAmount(request.amount, request.token).replace(/ SOL$|^\$/, '')}</Text>
          <Text style={s.token}>{request.token}</Text>
        </View>
        <Text style={s.subtitle}>{fromLabel}</Text>
        {request.memo ? <Text style={s.memo}>For {request.memo}</Text> : null}
        <View style={[s.statusPill, paid && s.statusPillPaid]}>
          <View style={[s.statusDot, paid && s.statusDotPaid]} />
          <Text style={[s.statusText, paid && s.statusTextPaid]}>
            {paid ? 'Paid' : 'Waiting for payment'}
          </Text>
        </View>
      </View>

      <View style={s.linkRow}>
        <Text style={s.link} numberOfLines={1}>
          {link}
        </Text>
        <Pressable style={s.copyBtn} onPress={copy}>
          <Text style={s.copyBtnText}>Copy</Text>
        </Pressable>
      </View>

      <View style={s.spacer} />

      <Text style={s.expiresText}>Expires in 7 days</Text>
      <Pressable style={s.shareBtn} onPress={share}>
        <Text style={s.shareBtnText}>Share request</Text>
      </Pressable>
      <View style={s.secondaryRow}>
        <Pressable style={s.secondaryBtn} onPress={copy}>
          <Text style={s.secondaryBtnText}>Copy link</Text>
        </Pressable>
        <Pressable style={s.secondaryBtn} onPress={() => setQrOpen(true)}>
          <Text style={s.secondaryBtnText}>Show QR</Text>
        </Pressable>
      </View>

      <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setQrOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHandle} />
            <QrCode value={link} size={200} />
            <Text style={s.sheetCaption}>
              Scan to pay {formatAmount(request.amount, request.token)}
            </Text>
            <Text style={s.sheetSub}>Opens in Kivo or any Solana wallet</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.xl, paddingTop: space.lg },
  label: { ...type.body, color: color.textDim },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 32 },
  backBtnText: { fontSize: 24, color: color.text },
  topRowSpacer: { width: 32 },
  cancelBtn: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  cancelBtnText: { ...type.label, fontSize: 13.5, color: color.danger },

  topBlock: { alignItems: 'center', marginTop: space.sm },
  createdLabel: { ...type.captionBold, fontSize: 11.5, letterSpacing: 0.8, color: color.textFainter, marginTop: space.md },

  card: {
    marginTop: space.lg,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    borderRadius: radius.xl,
    padding: space.xl,
    alignItems: 'center',
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs + 2 },
  amount: { ...type.amountMd, color: color.owed },
  token: { ...type.label, fontSize: 14, color: color.textDim },
  subtitle: { ...type.bodyEmphasis, fontSize: 14, color: '#C9C6D1', marginTop: space.xs + 2 },
  memo: { ...type.caption, color: color.textFainter, marginTop: 4 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    marginTop: space.md,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(242,197,114,0.08)',
  },
  statusPillPaid: { backgroundColor: 'rgba(198,242,78,0.1)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.owing },
  statusDotPaid: { backgroundColor: color.owed },
  statusText: { ...type.captionBold, color: color.owing },
  statusTextPaid: { color: color.owed },

  linkRow: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.sm + 2,
    paddingLeft: space.md,
  },
  link: { flex: 1, fontFamily: 'monospace', fontSize: 13, color: '#C9C2C6' },
  copyBtn: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 1,
  },
  copyBtnText: { ...type.captionBold, fontSize: 12, color: color.text },

  spacer: { flex: 1 },

  expiresText: { ...type.caption, fontSize: 12, color: color.textFaint, textAlign: 'center', marginBottom: space.sm },

  shareBtn: {
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
    alignItems: 'center',
  },
  shareBtnText: { ...type.labelLg, color: color.bg },

  secondaryRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  secondaryBtn: {
    flex: 1,
    paddingVertical: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
  },
  secondaryBtnText: { ...type.label, fontSize: 13.5, color: color.text },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: space.lg,
  },
  sheetCaption: { ...type.label, fontSize: 15, color: color.text, marginTop: space.md },
  sheetSub: { ...type.caption, color: color.textFainter, marginTop: space.xs },
});
