import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useWallet } from '../lib/WalletProvider';
import { signAndSend } from '../lib/wallet';
import {
  isValidUsername,
  isAvailable,
  buildClaimTransaction,
  setLocalUsername,
} from '../lib/usernames';
import { color, space, radius, type } from '../theme';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function ClaimUsernameScreen({ navigation }: any) {
  const { session, connection } = useWallet();
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced availability check — every keystroke would otherwise fire
  // an RPC read on each character typed.
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setAvailability('idle');
      return;
    }
    if (!isValidUsername(trimmed)) {
      setAvailability('invalid');
      return;
    }
    setAvailability('checking');
    const handle = setTimeout(async () => {
      try {
        const free = await isAvailable(connection, trimmed);
        setAvailability(free ? 'available' : 'taken');
      } catch {
        setAvailability('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [username, connection]);

  async function handleClaim() {
    if (availability !== 'available' || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      await signAndSend(connection, session!.publicKey, async (payer) =>
        buildClaimTransaction(payer, username),
      );
      await setLocalUsername(username);
      navigation.navigate('Home');
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      setError(
        /insufficient/i.test(raw)
          ? "Not enough SOL to cover this — claiming a username costs a small amount of rent. You can skip this for now and claim later."
          : `The wallet rejected or cancelled this. Nothing was claimed.\n\n(${raw})`,
      );
    } finally {
      setClaiming(false);
    }
  }

  const statusText: Record<Availability, string | null> = {
    idle: null,
    checking: 'Checking availability…',
    available: 'Available',
    taken: 'Already claimed by someone else',
    invalid: '3-20 characters: letters, numbers, underscore',
  };
  const statusColor: Record<Availability, string> = {
    idle: color.textFaint,
    checking: color.textFaint,
    available: color.owed,
    taken: color.danger,
    invalid: color.danger,
  };

  return (
    <View style={s.root}>
      <View style={s.body}>
        <Text style={s.title}>Claim a username</Text>
        <Text style={s.pitch}>
          Let people send you money by name instead of pasting your wallet
          address. Optional — you can always do this later.
        </Text>

        <View style={s.field}>
          <View style={s.inputRow}>
            <Text style={s.at}>@</Text>
            <TextInput
              style={s.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={color.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          {statusText[availability] ? (
            <Text style={[s.status, { color: statusColor[availability] }]}>
              {statusText[availability]}
            </Text>
          ) : null}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      <View style={s.footer}>
        <Pressable
          style={[
            s.btn,
            s.primary,
            (availability !== 'available' || claiming) && s.btnDisabled,
          ]}
          onPress={handleClaim}
          disabled={availability !== 'available' || claiming}
        >
          {claiming ? (
            <ActivityIndicator color={color.bg} />
          ) : (
            <Text style={s.primaryText}>Claim username</Text>
          )}
        </Pressable>
        <Pressable
          style={s.skip}
          onPress={() => navigation.navigate('Home')}
          disabled={claiming}
        >
          <Text style={s.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.lg },
  body: { flex: 1, paddingTop: space.xl, gap: space.lg },
  title: { ...type.title, color: color.text },
  pitch: { ...type.body, color: color.textDim },

  field: { gap: space.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  at: { ...type.body, color: color.textFaint },
  input: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    color: color.text,
    ...type.body,
  },
  status: { ...type.caption },
  error: { ...type.caption, color: color.danger },

  footer: { gap: space.sm, paddingBottom: space.md },
  btn: {
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primary: { backgroundColor: color.text },
  primaryText: { ...type.label, fontSize: 16, color: color.bg },
  skip: { alignItems: 'center', paddingVertical: space.md },
  skipText: { ...type.label, color: color.textFaint },
});
