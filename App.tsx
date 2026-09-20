import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  type NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import { WalletProvider, useWallet } from './src/lib/WalletProvider';
import { decodeLink } from './src/lib/requests';
import type { RootStackParamList } from './src/lib/navigation';
import ConnectScreen from './src/screens/ConnectScreen';
import HomeScreen from './src/screens/HomeScreen';
import RequestScreen from './src/screens/RequestScreen';
import NewRequestScreen from './src/screens/NewRequestScreen';
import ShareRequestScreen from './src/screens/ShareRequestScreen';
import ClaimUsernameScreen from './src/screens/ClaimUsernameScreen';
import ShareBillScreen from './src/screens/ShareBillScreen';
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
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        {!session ? (
          <Stack.Screen
            name="Connect"
            component={ConnectScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: '' }}
            />
            <Stack.Screen
              name="Request"
              component={RequestScreen}
              options={{ title: 'Request' }}
            />
            <Stack.Screen
              name="New"
              component={NewRequestScreen}
              options={{ title: 'New request' }}
            />
            <Stack.Screen
              name="ShareRequest"
              component={ShareRequestScreen}
              options={{ title: 'Request created', headerBackVisible: false }}
            />
            <Stack.Screen
              name="ClaimUsername"
              component={ClaimUsernameScreen}
              options={{ title: 'Username' }}
            />
            <Stack.Screen
              name="ShareBill"
              component={ShareBillScreen}
              options={{ title: 'Split bill', headerBackVisible: false }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <StatusBar style="light" />
      <Root />
    </WalletProvider>
  );
}

const s = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
