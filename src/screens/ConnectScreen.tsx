import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet } from '../lib/WalletProvider';
import { color, space, radius, type, font } from '../theme';

export default function ConnectScreen() {
  const { connect, connecting, error } = useWallet();

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.body}>
        <View style={s.mark}>
          <View style={s.markLime} />
          <View style={s.markPurple} />
        </View>

        <View style={s.copy}>
          <Text style={s.wordmark}>Kivo</Text>
          <Text style={s.pitch}>
            Request money by name, or send a link. Settles instantly through
            whatever Solana wallet they already use.
          </Text>
        </View>

        <View style={s.netPill}>
          <View style={s.netDot} />
          <Text style={s.netPillText}>Solana Devnet · Mobile Wallet Adapter</Text>
        </View>
      </View>

      <View style={s.footer}>
        {error ? <Text style={s.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}
          onPress={connect}
          disabled={connecting}
          accessibilityRole="button"
        >
          <Text style={s.ctaText}>Connect Wallet</Text>
        </Pressable>

        <Text style={s.fine}>If Phantom is your bank account, Kivo is Venmo.</Text>
      </View>

      {connecting ? (
        <View style={s.overlay}>
          <ActivityIndicator color={color.owed} size="large" />
          <Text style={s.overlayText}>Connecting to your wallet…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.xxl },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },

  mark: { width: 76, height: 76 },
  markLime: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
  },
  markPurple: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: color.accent,
  },

  copy: { alignItems: 'center' },
  wordmark: { ...type.wordmark, color: color.text, textAlign: 'center' },
  pitch: {
    ...type.body,
    color: color.textDim,
    maxWidth: 260,
    textAlign: 'center',
    marginTop: space.sm + 2,
  },

  netPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(158,140,252,0.35)',
  },
  netDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  netPillText: { fontFamily: font.body, fontSize: 12, letterSpacing: 0.3, color: '#C9C2FA' },

  footer: { gap: space.md },
  cta: {
    backgroundColor: color.owed,
    paddingVertical: space.lg + 2,
    borderRadius: radius.xl,
    alignItems: 'center',
  },
  ctaPressed: { transform: [{ scale: 0.97 }] },
  ctaText: { ...type.labelLg, fontSize: 16, color: color.bg },
  error: { ...type.caption, color: color.danger },
  fine: { ...type.caption, color: color.textFaint, textAlign: 'center' },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5,5,8,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
  },
  overlayText: { ...type.bodyEmphasis, color: color.textDim },
});
