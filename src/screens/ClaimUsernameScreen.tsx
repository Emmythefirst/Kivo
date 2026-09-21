import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    idle: 'Pick something short and memorable',
    checking: 'Checking availability…',
    available: `@${username} is available`,
    taken: 'That username is taken — try another',
    invalid: '3-20 characters: letters, numbers, underscore',
  };
  const statusColor: Record<Availability, string> = {
    idle: color.textFaint,
    checking: color.textFaint,
    available: color.success,
    taken: color.danger,
    invalid: color.danger,
  };
  const borderColor: Record<Availability, string> = {
    idle: color.borderStrong,
    checking: color.borderStrong,
    available: 'rgba(154,217,122,0.4)',
    taken: 'rgba(255,107,94,0.4)',
    invalid: 'rgba(255,107,94,0.4)',
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <Pressable style={s.backBtn} onPress={() => navigation.navigate('Home')}>
        <Text style={s.backBtnText}>‹</Text>
      </Pressable>

      <View style={s.body}>
        <Text style={s.title}>Claim your username</Text>
        <Text style={s.pitch}>
          Lets people pay you by name instead of a wallet address. Fully
          on-chain — no one can take it from you.
        </Text>

        <View style={s.field}>
          <View style={[s.inputRow, { borderColor: borderColor[availability] }]}>
            <Text style={s.at}>@</Text>
            <TextInput
              style={s.input}
              value={username}
              onChangeText={setUsername}
              placeholder="yourname"
              placeholderTextColor={color.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          <Text style={[s.status, { color: statusColor[availability] }]}>
            {statusText[availability]}
          </Text>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      <View style={s.footer}>
        <Pressable
          style={[
            s.btn,
            availability === 'available' ? s.btnActive : s.btnDisabled,
          ]}
          onPress={handleClaim}
          disabled={availability !== 'available' || claiming}
        >
          {claiming ? (
            <ActivityIndicator color={color.bg} />
          ) : (
            <Text
              style={[
                s.btnText,
                availability === 'available' ? s.btnTextActive : s.btnTextDisabled,
              ]}
            >
              Claim @{username || 'username'}
            </Text>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.xl },
  backBtn: { width: 32, marginBottom: space.sm },
  backBtnText: { fontSize: 20, color: color.textFaint },

  body: { flex: 1, gap: space.lg, paddingTop: space.lg },
  title: { ...type.titleLg, color: color.text },
  pitch: { ...type.body, color: color.textFainter, lineHeight: 21 },

  field: { gap: space.sm, marginTop: space.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: space.lg,
  },
  at: { ...type.body, color: color.textFaint, marginRight: 2 },
  input: {
    flex: 1,
    paddingVertical: space.lg - 2,
    paddingHorizontal: space.xs,
    color: color.text,
    ...type.body,
  },
  status: { ...type.caption },
  error: { ...type.caption, color: color.danger },

  footer: { gap: space.sm, paddingBottom: space.md },
  btn: { paddingVertical: space.lg, borderRadius: radius.lg, alignItems: 'center' },
  btnActive: { backgroundColor: color.owed },
  btnDisabled: { backgroundColor: color.surfaceRaised },
  btnText: { ...type.labelLg },
  btnTextActive: { color: color.bg },
  btnTextDisabled: { color: color.textFaint },
  skip: { alignItems: 'center', paddingVertical: space.md },
  skipText: { ...type.label, color: color.textFainter },
});
