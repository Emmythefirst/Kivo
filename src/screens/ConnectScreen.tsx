import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useWallet } from '../lib/WalletProvider';
import { color, space, radius, type } from '../theme';

export default function ConnectScreen() {
  const { connect, connecting, error } = useWallet();

  return (
    <View style={s.root}>
      <View style={s.body}>
        <Text style={s.mark}>Kivo</Text>
        <Text style={s.pitch}>
          Ask a friend for money by name. They tap once, it settles on Solana.
        </Text>
      </View>

      <View style={s.footer}>
        {error ? <Text style={s.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}
          onPress={connect}
          disabled={connecting}
          accessibilityRole="button"
        >
          {connecting ? (
            <ActivityIndicator color={color.bg} />
          ) : (
            <Text style={s.ctaText}>Connect wallet</Text>
          )}
        </Pressable>

        <Text style={s.fine}>
          Kivo never holds your keys. Your own wallet signs everything.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.xl },
  body: { flex: 1, justifyContent: 'center' },
  mark: {
    ...type.amount,
    color: color.text,
    marginBottom: space.md,
  },
  pitch: {
    ...type.body,
    fontSize: 19,
    lineHeight: 27,
    color: color.textDim,
    maxWidth: 300,
  },
  footer: { gap: space.md },
  cta: {
    backgroundColor: color.text,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.75 },
  ctaText: { ...type.label, fontSize: 16, color: color.bg },
  error: { ...type.caption, color: color.danger },
  fine: {
    ...type.caption,
    color: color.textFaint,
    textAlign: 'center',
  },
});
