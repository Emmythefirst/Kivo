import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { color } from '../theme';

type Props = { size?: number };

/** Lime checkmark circle with a pulsing ring behind it — shared across every "done" screen. */
export default function SuccessCheck({ size = 76 }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
      { iterations: 3 },
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.15, 0] });

  return (
    <View style={[s.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          s.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <View
        style={[
          s.circle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={[s.mark, { fontSize: size * 0.46 }]}>✓</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', backgroundColor: color.owed },
  circle: { backgroundColor: color.owed, alignItems: 'center', justifyContent: 'center' },
  mark: { color: color.bg, fontWeight: '800' },
});
