import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { initials, avatarColor, font } from '../theme';

type Props = {
  name: string;
  size?: number;
  colorSeed?: string;
  /** Overrides the computed initials — used for non-name glyphs like "↗" or "0x". */
  glyph?: string;
};

/** Two-tone colored circle with initials — deterministic color per name/id, matches the shared design. */
export default function Avatar({ name, size = 42, colorSeed, glyph }: Props) {
  const { bg, fg } = avatarColor(colorSeed ?? name);
  return (
    <View
      style={[
        s.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[s.label, { fontSize: size * 0.32, color: fg }]}>
        {glyph ?? initials(name)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontFamily: font.bodyExtraBold },
});
