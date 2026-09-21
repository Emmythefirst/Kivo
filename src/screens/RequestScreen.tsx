import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet } from '../lib/WalletProvider';
import { signAndSend } from '../lib/wallet';
import { buildSolTransfer, buildUsdcTransfer } from '../lib/transfer';
import {
  decodeLink,
  isExpired,
  isRequestMarkedPaid,
  buildMarkPaidInstruction,
} from '../lib/requests';
import { addSentPayment } from '../lib/localStore';
import type { RootStackParamList } from '../lib/navigation';
import Avatar from '../components/Avatar';
import { color, space, radius, type, formatAmount } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Request'>;

export default function RequestScreen({ route, navigation }: Props) {
  // App.tsx already validated this link decodes before navigating here,
  // but a raw string (not the decoded object) is what's actually passed
  // through nav params — decodeLink() embeds a PublicKey, which React
  // Navigation warns about passing through navigation state.
  const request = useMemo(() => decodeLink(route.params.link), [
    route.params.link,
  ]);
  const { connection, session } = useWallet();
  const [status, setStatus] = useState<'idle' | 'paying' | 'done' | 'failed'>(
    'idle',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [declined, setDeclined] = useState(false);

  const expired = request ? isExpired(request) : false;

  // A real, on-chain check, not just a nicer message — the mark_paid
  // instruction below is what actually prevents a double-pay; this just
  // saves the user from opening their wallet for a payment the chain
  // would refuse anyway.
  useEffect(() => {
    if (!request) return;
    isRequestMarkedPaid(connection, request.id).then(setAlreadyPaid);
  }, [connection, request]);

  async function pay() {
    if (!request) return;
    setStatus('paying');
    setMessage(null);
    try {
      const sig = await signAndSend(
        connection,
        session!.publicKey,
        async (payer) => {
          const tx =
            request.token === 'SOL'
              ? buildSolTransfer(payer, request.to, request.amount)
              : await buildUsdcTransfer(
                  connection,
                  payer,
                  request.to,
                  request.amount,
                );
          // Same transaction as the transfer, not a separate one — an
          // atomic all-or-nothing pair is the entire replay-protection
          // guarantee. See mark_paid() in the Anchor program.
          tx.add(buildMarkPaidInstruction(payer, request));
          return tx;
        },
      );
      setStatus('done');
      setMessage(sig);
      await addSentPayment({
        to: request.to.toBase58(),
        toUsername: request.toUsername,
        amount: request.amount,
        token: request.token,
        memo: request.memo,
        createdAt: Date.now(),
        signature: sig,
      });
    } catch (e: any) {
      setStatus('failed');
      const raw = e?.message ?? String(e);
      setMessage(
        /insufficient/i.test(raw)
          ? 'Not enough balance to cover this and the network fee.'
          : /RequestExpired|This request has expired/i.test(raw)
            ? 'This request expired. Ask for a new one.'
            : /already in use/i.test(raw)
              ? 'This request was already paid. Nothing was sent.'
              : `The wallet rejected or cancelled this. Nothing was sent.\n\n(${raw})`,
      );
    }
  }

  if (!request) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.centerBody}>
          <Text style={s.warn}>This link isn't a valid request.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const fromLabel = request.toUsername ? `@${request.toUsername}` : 'Someone';
  const avatarSeed = request.toUsername ?? request.to.toBase58();

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.topRow}>
        <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>‹</Text>
        </Pressable>
      </View>

      {declined ? (
        <View style={s.centerBody}>
          <Text style={s.declinedText}>Request declined</Text>
          <Pressable style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      ) : status === 'paying' ? (
        <View style={s.centerBody}>
          <ActivityIndicator size="large" color={color.owed} />
          <Text style={s.busyText}>Waiting for wallet approval…</Text>
        </View>
      ) : status === 'done' ? (
        <View style={s.centerBody}>
          <View style={s.successCircle}>
            <Text style={s.successMark}>✓</Text>
          </View>
          <Text style={s.successTitle}>Paid. Confirmed on-chain.</Text>
          <Pressable style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      ) : alreadyPaid ? (
        <View style={s.centerBody}>
          <Text style={s.declinedText}>This request was already paid.</Text>
          <Pressable style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      ) : expired ? (
        <View style={s.centerBody}>
          <Text style={s.declinedText}>This request expired. Ask for a new one.</Text>
          <Pressable style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.idleBody}>
          <Avatar name={fromLabel} colorSeed={avatarSeed} size={64} />
          <Text style={s.fromLine}>{fromLabel} requested</Text>
          <Text style={s.amount}>{formatAmount(request.amount, request.token)}</Text>
          {request.memo ? <Text style={s.memo}>“{request.memo}”</Text> : null}

          <View style={s.addrCard}>
            <Text style={s.addrLabel}>DESTINATION ADDRESS</Text>
            <Text style={s.addrValue}>{request.to.toBase58()}</Text>
            {request.toUsername ? (
              <Text style={s.addrOk}>✓ Matches @{request.toUsername}'s registered wallet</Text>
            ) : (
              <Text style={s.addrWarn}>⚠ No registered username — verify this address carefully</Text>
            )}
          </View>

          <View style={s.netPill}>
            <Text style={s.netPillText}>Settles via Solana Devnet · MWA</Text>
          </View>

          <View style={s.spacer} />

          {status === 'failed' && message ? (
            <Text style={s.error}>{message}</Text>
          ) : null}

          <View style={s.actions}>
            <Pressable style={s.declineBtn} onPress={() => setDeclined(true)}>
              <Text style={s.declineBtnText}>Decline</Text>
            </Pressable>
            <Pressable style={s.payBtn} onPress={pay}>
              <Text style={s.payBtnText}>
                Pay {formatAmount(request.amount, request.token)}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  topRow: { paddingHorizontal: space.lg, paddingTop: space.lg },
  backBtn: { width: 32 },
  backBtnText: { fontSize: 22, color: color.textFaint },

  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  idleBody: { flex: 1, alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.lg },

  fromLine: { ...type.body, color: color.textDim, marginTop: space.md },
  amount: { ...type.amountMd, color: color.owed, marginTop: space.xs },
  memo: { ...type.bodyEmphasis, fontStyle: 'italic', color: '#C9C6D1', marginTop: space.sm },

  addrCard: {
    width: '100%',
    marginTop: space.xl,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space.md + 2,
  },
  addrLabel: { ...type.sectionLabel, color: color.textFaint },
  addrValue: { fontFamily: 'monospace', fontSize: 12.5, color: '#C9C2C6', marginTop: space.sm },
  addrOk: { ...type.caption, color: color.success, marginTop: space.sm },
  addrWarn: { ...type.caption, color: color.owing, marginTop: space.sm },

  netPill: {
    marginTop: space.lg,
    paddingVertical: space.sm - 1,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(158,140,252,0.35)',
  },
  netPillText: { ...type.caption, fontSize: 11.5, color: '#C9C2FA' },

  spacer: { flex: 1 },

  error: { ...type.caption, color: color.danger, textAlign: 'center', marginBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, width: '100%' },
  declineBtn: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,107,94,0.4)',
    alignItems: 'center',
  },
  declineBtnText: { ...type.label, color: color.danger },
  payBtn: {
    flex: 2,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
    alignItems: 'center',
  },
  payBtnText: { ...type.labelLg, color: color.bg },

  busyText: { ...type.body, color: color.textDim },
  successCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: color.owed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: { fontSize: 36, color: color.bg },
  successTitle: { ...type.titleLg, color: color.text },
  declinedText: { ...type.body, color: color.textDim, textAlign: 'center' },
  doneBtn: {
    paddingVertical: space.md,
    paddingHorizontal: space.xxl + 16,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  doneBtnText: { ...type.label, color: color.text },
  warn: { ...type.caption, color: color.owing },
});
