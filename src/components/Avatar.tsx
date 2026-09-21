import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { initials, avatarColor, font } from '../theme';

type Props = { name: string; size?: number; colorSeed?: string };

/** Colored circle with initials — deterministic color per name/id, matches the shared design. */
export default function Avatar({ name, size = 42, colorSeed }: Props) {
  const bg = avatarColor(colorSeed ?? name);
  return (
    <View
      style={[
        s.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[s.label, { fontSize: size * 0.32 }]}>{initials(name)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontFamily: font.bodyExtraBold, color: '#0A0A0D' },
});
