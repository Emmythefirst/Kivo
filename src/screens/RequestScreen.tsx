import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useWallet } from '../lib/WalletProvider';
import { signAndSend } from '../lib/wallet';
import { buildSolTransfer, buildUsdcTransfer } from '../lib/transfer';
import {
  decodeLink,
  isExpired,
  isRequestMarkedPaid,
  buildMarkPaidInstruction,
} from '../lib/requests';
import type { RootStackParamList } from '../lib/navigation';
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
    } catch (e: any) {
      setStatus('failed');
      const raw = e?.message ?? String(e);
      setMessage(
        /insufficient/i.test(raw)
          ? "Not enough balance to cover this and the network fee."
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
      <View style={s.root}>
        <Text style={s.warn}>This link isn't a valid request.</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.who}>
          {request.toUsername ? `@${request.toUsername}` : 'Someone'} is asking
          you for
        </Text>
        <Text style={s.amount}>
          {formatAmount(request.amount, request.token)}
        </Text>
        {request.memo ? <Text style={s.memo}>{request.memo}</Text> : null}

        {/* Impersonation is the main abuse vector: always show the full
            destination so "alice_" can't pass itself off as "alice". */}
        <View style={s.detail}>
          <Text style={s.detailLabel}>Paying to</Text>
          <Text style={s.detailValue} numberOfLines={1}>
            {request.to.toBase58()}
          </Text>
        </View>

        {!request.toUsername ? (
          <Text style={s.warn}>
            This request has no registered username. Check the address is who
            you expect.
          </Text>
        ) : null}
      </View>

      {alreadyPaid ? (
        <Text style={s.warn}>This request was already paid.</Text>
      ) : expired ? (
        <Text style={s.warn}>This request expired. Ask for a new one.</Text>
      ) : status === 'done' ? (
        <Text style={s.ok}>Paid. It's confirmed on-chain.</Text>
      ) : (
        <View style={s.actions}>
          <Pressable
            style={[s.btn, s.decline]}
            onPress={() => navigation.goBack()}
            disabled={status === 'paying'}
          >
            <Text style={s.declineText}>Decline</Text>
          </Pressable>
          <Pressable
            style={[s.btn, s.confirm]}
            onPress={pay}
            disabled={status === 'paying'}
          >
            {status === 'paying' ? (
              <ActivityIndicator color={color.bg} />
            ) : (
              <Text style={s.confirmText}>Pay</Text>
            )}
          </Pressable>
        </View>
      )}

      {status === 'failed' && message ? (
        <Text style={s.error}>{message}</Text>
      ) : null}
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
  who: { ...type.body, color: color.textDim },
  amount: { ...type.amount, color: color.text },
  memo: { ...type.body, color: color.textDim },
  detail: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    gap: 2,
  },
  detailLabel: { ...type.caption, color: color.textFaint },
  detailValue: { ...type.caption, color: color.textDim },
  actions: { flexDirection: 'row', gap: space.md },
  btn: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  decline: { backgroundColor: color.surfaceRaised },
  declineText: { ...type.label, fontSize: 16, color: color.textDim },
  confirm: { backgroundColor: color.text },
  confirmText: { ...type.label, fontSize: 16, color: color.bg },
  warn: { ...type.caption, color: color.owing },
  ok: { ...type.label, color: color.owed },
  error: { ...type.caption, color: color.danger },
});
