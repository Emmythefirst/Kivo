import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  type NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts as useManropeFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useFonts as useSpaceGroteskFonts, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';

import { WalletProvider, useWallet } from './src/lib/WalletProvider';
import { ToastProvider } from './src/lib/ToastProvider';
import { decodeLink } from './src/lib/requests';
import type { RootStackParamList } from './src/lib/navigation';
import ConnectScreen from './src/screens/ConnectScreen';
import HomeScreen from './src/screens/HomeScreen';
import RequestScreen from './src/screens/RequestScreen';
import NewRequestScreen from './src/screens/NewRequestScreen';
import ShareRequestScreen from './src/screens/ShareRequestScreen';
import ClaimUsernameScreen from './src/screens/ClaimUsernameScreen';
import ShareBillScreen from './src/screens/ShareBillScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import { color } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Root() {
  const { session, ready } = useWallet();
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  /**
   * Both entry paths land here: a cold start from a tapped link, and a link
   * tapped while Kivo is already open. Android routes these to us because
   * of the autoVerify intent filter in app.json.
   */
  useEffect(() => {
    function handle(url: string | null) {
      if (!url) return;
      // Validate before navigating, but hand the screen the raw link —
      // not the decoded object, which embeds a PublicKey (a class
      // instance) that React Navigation warns about passing through nav
      // state. RequestScreen re-decodes it itself.
      if (decodeLink(url)) navRef.current?.navigate('Request', { link: url });
    }

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  if (!ready) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={color.textDim} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          // Matches the shared design's "kivoIn" transition (a subtle
          // fade combined with a slight upward slide) applied to every
          // screen — the closest native-stack preset to that CSS keyframe.
          animation: 'fade_from_bottom',
        }}
      >
        {!session ? (
          <Stack.Screen name="Connect" component={ConnectScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Request" component={RequestScreen} />
            <Stack.Screen name="New" component={NewRequestScreen} />
            <Stack.Screen name="ShareRequest" component={ShareRequestScreen} />
            <Stack.Screen name="ClaimUsername" component={ClaimUsernameScreen} />
            <Stack.Screen name="ShareBill" component={ShareBillScreen} />
            <Stack.Screen name="Activity" component={ActivityScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [manropeLoaded, manropeError] = useManropeFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [spaceGroteskLoaded, spaceGroteskError] = useSpaceGroteskFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // useFonts' second tuple element is the load error, if any — surfaced
  // directly rather than left silent, since an error here would otherwise
  // just look identical to "still loading" forever with no way to tell
  // the two apart from the screen alone.
  if (manropeError || spaceGroteskError) {
    return (
      <View style={s.loading}>
        <Text style={s.debugError}>
          Font load failed:{'\n'}
          {String(manropeError ?? spaceGroteskError)}
        </Text>
      </View>
    );
  }

  if (!manropeLoaded || !spaceGroteskLoaded) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={color.textDim} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <WalletProvider>
        <ToastProvider>
          <StatusBar style="light" />
          <Root />
        </ToastProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  debugError: { color: '#FF6B5E', fontSize: 13, textAlign: 'center' },
});
