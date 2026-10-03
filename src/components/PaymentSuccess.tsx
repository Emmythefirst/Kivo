import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import SuccessCheck from './SuccessCheck';
import { color, space, radius, type, font } from '../theme';

type Props = {
  amount: number;
  token: 'USDC' | 'SOL';
  toLabel: string;
  toAddress: string;
  signature: string | null;
  onDone: () => void;
};

/** Full-screen "payment confirmed" view — shared by the composer's Pay mode and the incoming-request pay flow. */
export default function PaymentSuccess({ amount, token, toLabel, toAddress, signature, onDone }: Props) {
  const amountStr = token === 'USDC' ? amount.toFixed(2) : amount.toFixed(4);
  return (
    <View style={s.body}>
      <View style={s.center}>
        <SuccessCheck size={84} />
        <Text style={s.paidLabel}>Paid</Text>
        <View style={s.amountRow}>
          <Text style={s.amount}>{amountStr}</Text>
          <Text style={s.token}>{token}</Text>
        </View>
        <Text style={s.to}>
          to <Text style={s.toName}>{toLabel}</Text>
        </Text>
        <Text style={s.addr}>{toAddress}</Text>
        <View style={s.confirmedPill}>
          <View style={s.confirmedDot} />
          <Text style={s.confirmedText}>Confirmed on Solana</Text>
        </View>
        {signature ? (
          <Pressable
            onPress={() =>
              Linking.openURL(`https://explorer.solana.com/tx/${signature}?cluster=devnet`)
            }
          >
            <Text style={s.viewTx}>View transaction ↗</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable style={s.doneBtn} onPress={onDone}>
        <Text style={s.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  paidLabel: { ...type.label, fontSize: 15, color: color.success, marginTop: space.lg },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs + 2, marginTop: space.xs },
  amount: { ...type.amountHero, fontSize: 48, letterSpacing: -2, color: color.text },
  token: { ...type.label, fontSize: 14, color: color.textDim },
  to: { ...type.bodyEmphasis, fontSize: 15, color: '#C9C6D1', marginTop: space.xs },
  toName: { fontFamily: font.bodyExtraBold, color: color.text },
  addr: { ...type.caption, fontSize: 11.5, color: color.textFaint, fontFamily: 'monospace', marginTop: space.xs },
  confirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingVertical: space.sm - 1,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(154,217,122,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(154,217,122,0.2)',
  },
  confirmedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.success },
  confirmedText: { ...type.captionBold, color: color.success },
  viewTx: { ...type.label, fontSize: 13.5, color: '#C9C2FA', marginTop: space.md },
  doneBtn: {
    width: '100%',
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
  },
  doneBtnText: { ...type.labelLg, color: color.text },
});
