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
          <Text style={s.headline}>Request money by name, or send a link.</Text>
          <Text style={s.pitch}>
            Settles through the <Text style={s.pitchAccent}>wallet you already use</Text>.
          </Text>
        </View>

        <View style={s.netPill}>
          <View style={s.netDot} />
          <Text style={s.netPillText}>Solana Devnet · MWA</Text>
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
          <Text style={s.ctaText}>Connect wallet</Text>
        </Pressable>

        <Text style={s.fine}>If Phantom is your bank account,{'\n'}Kivo is Venmo.</Text>
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

  mark: { width: 80, height: 80 },
  markLime: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor: color.owed,
  },
  markPurple: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: color.accent,
    borderWidth: 3,
    borderColor: color.bg,
  },

  copy: { alignItems: 'center' },
  wordmark: { ...type.wordmark, fontSize: 36, color: color.text, textAlign: 'center' },
  headline: {
    fontFamily: font.bodyBold,
    fontSize: 19,
    lineHeight: 25,
    color: color.text,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: space.md + 2,
  },
  pitch: {
    ...type.body,
    color: color.textDim,
    maxWidth: 280,
    textAlign: 'center',
    marginTop: space.sm,
  },
  pitchAccent: { fontFamily: font.bodyBold, color: '#C9C2FA' },

  netPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm - 1,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(158,140,252,0.3)',
  },
  netDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  netPillText: { fontFamily: font.body, fontSize: 12, letterSpacing: 0.3, color: '#C9C2FA' },

  footer: { gap: space.md },
  cta: {
    backgroundColor: color.owed,
    paddingVertical: space.lg + 2,
    borderRadius: radius.xl,
    alignItems: 'center',
    shadowColor: color.owed,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  ctaPressed: { transform: [{ scale: 0.97 }] },
  ctaText: { ...type.labelLg, fontSize: 16, color: color.bg },
  error: { ...type.caption, color: color.danger },
  fine: { ...type.caption, fontSize: 12.5, color: '#6E6E78', textAlign: 'center', lineHeight: 18 },

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
