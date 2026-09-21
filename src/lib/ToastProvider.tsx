import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { color, radius, space, type } from '../theme';

type Ctx = (message: string) => void;

const ToastContext = createContext<Ctx | null>(null);

/**
 * Small bottom pill toast, matching the shared design's toast component.
 * Replaces Alert.alert() for low-stakes confirmations ("Link copied",
 * "Reminder sent") — an Alert's modal interruption doesn't fit this
 * design's tone, and the design explicitly specs a toast for exactly this.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(
    (msg: string) => {
      clearTimeout(hideTimer.current);
      setMessage(msg);
      opacity.setValue(0);
      translateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          () => setMessage(null),
        );
      }, 2000);
    },
    [opacity, translateY],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          style={[s.toast, { opacity, transform: [{ translateY }] }]}
        >
          <Text style={s.text}>{message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: '50%',
    bottom: 40,
    marginLeft: -140,
    width: 280,
    alignItems: 'center',
    backgroundColor: color.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    zIndex: 999,
  },
  text: { ...type.label, color: color.text, textAlign: 'center' },
});
