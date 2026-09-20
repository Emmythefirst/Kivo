import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet } from '../lib/WalletProvider';
import { signAndSend } from '../lib/wallet';
import { buildSolTransfer, buildUsdcTransfer } from '../lib/transfer';
import {
  createRequest,
  encodeLink,
  randomId,
  splitEvenly,
} from '../lib/requests';
import {
  isValidUsername,
  resolveUsername,
  getLocalUsername,
} from '../lib/usernames';
import {
  addSentRequest,
  saveBillMeta,
  getRecentContacts,
  recordRecentContact,
  type RecentContact,
} from '../lib/localStore';
import {
  scheduleRequestReminder,
  scheduleBillReminder,
} from '../lib/notifications';
import { color, space, radius, type, formatAmount } from '../theme';

type Mode = 'request' | 'pay' | 'split';
type Token = 'USDC' | 'SOL';

/**
 * Resolves whatever the user typed into an actual payable address. Tried as
 * a raw base58 address first since that's unambiguous; only falls back to
 * on-chain username resolution if it doesn't parse as one. This is the only
 * path that needs a real resolved PublicKey — Request mode treats the same
 * input as a cosmetic label only (see handleSubmit).
 */
async function resolveRecipient(
  connection: Connection,
  raw: string,
): Promise<{ to: PublicKey; toUsername?: string }> {
  const trimmedRaw = raw.trim();
  try {
    return { to: new PublicKey(trimmedRaw) };
  } catch {
    // Not a valid address — try it as a username instead.
  }
  // Recent-contact chips display as "@name"; strip the "@" before
  // validating, same identifier either way.
  const username = trimmedRaw.startsWith('@')
    ? trimmedRaw.slice(1)
    : trimmedRaw;
  if (!isValidUsername(username)) {
    throw new Error('Enter a valid username or wallet address.');
  }
  const resolved = await resolveUsername(connection, username);
  if (!resolved) {
    throw new Error(`No one has claimed @${username.toLowerCase()}.`);
  }
  return { to: resolved.owner, toUsername: resolved.username };
}

export default function NewRequestScreen({ navigation }: any) {
  const { session, connection } = useWallet();
  const [mode, setMode] = useState<Mode>('request');
  const [recipientInput, setRecipientInput] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<Token>('USDC');
  const [memo, setMemo] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [payStatus, setPayStatus] = useState<
    'idle' | 'paying' | 'done' | 'failed'
  >('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [peopleCount, setPeopleCount] = useState('');

  useFocusEffect(
    useCallback(() => {
      getRecentContacts().then(setRecentContacts);
    }, []),
  );

  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const peopleNum = Number(peopleCount);
  const peopleValid = Number.isInteger(peopleNum) && peopleNum >= 2;
  const canSubmit =
    mode === 'split'
      ? amountValid && peopleValid
      : amountValid && (mode === 'request' || recipientInput.trim().length > 0);
  const busy = resolving || payStatus === 'paying';

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setRecipientError(null);

    if (mode === 'split') {
      const { share, creatorShare } = splitEvenly(amountNum, peopleNum);
      const billId = randomId();
      const trimmedMemo = memo.trim() || undefined;
      const localUsername = (await getLocalUsername()) ?? undefined;

      // One request per *other* participant — the creator's own share
      // is tracked (creatorShare) but never sent as a link to themself.
      for (let i = 0; i < peopleNum - 1; i++) {
        const req = createRequest({
          to: session!.publicKey,
          toUsername: localUsername,
          amount: share,
          token,
          memo: trimmedMemo,
          billId,
        });
        await addSentRequest({ request: req, requestedFromLabel: undefined });
      }
      await saveBillMeta(billId, {
        total: amountNum,
        creatorShare,
        peopleCount: peopleNum,
        memo: trimmedMemo,
        token,
      });
      scheduleBillReminder(trimmedMemo, peopleNum);

      navigation.navigate('ShareBill', { billId });
      return;
    }

    if (mode === 'request') {
      const requestedFromLabel = recipientInput.trim() || undefined;
      const req = createRequest({
        to: session!.publicKey,
        toUsername: (await getLocalUsername()) ?? undefined,
        amount: amountNum,
        token,
        memo: memo.trim() || undefined,
      });
      await addSentRequest({ request: req, requestedFromLabel });
      scheduleRequestReminder(req, requestedFromLabel);
      navigation.navigate('ShareRequest', {
        link: encodeLink(req),
        requestedFromLabel,
      });
      return;
    }

    // Pay mode needs a real, resolved destination before anything else.
    setResolving(true);
    let recipient: { to: PublicKey; toUsername?: string };
    try {
      recipient = await resolveRecipient(connection, recipientInput);
    } catch (e: any) {
      setRecipientError(e.message);
      setResolving(false);
      return;
    }
    setResolving(false);

    setPayStatus('paying');
    setPayError(null);
    try {
      const sig = await signAndSend(
        connection,
        session!.publicKey,
        async (payer) =>
          token === 'SOL'
            ? buildSolTransfer(payer, recipient.to, amountNum)
            : buildUsdcTransfer(connection, payer, recipient.to, amountNum),
      );
      setPayStatus('done');
      setTxSig(sig);
      await recordRecentContact(recipient.to.toBase58(), recipient.toUsername);
    } catch (e: any) {
      setPayStatus('failed');
      const raw = e?.message ?? String(e);
      setPayError(
        /insufficient/i.test(raw)
          ? 'Not enough balance to cover this and the network fee.'
          : `The wallet rejected or cancelled this. Nothing was sent.\n\n(${raw})`,
      );
    }
  }

  if (payStatus === 'done') {
    return (
      <View style={s.root}>
        <View style={s.resultCard}>
          <Text style={s.ok}>Sent</Text>
          <Text style={s.amount}>{formatAmount(amountNum, token)}</Text>
          <Text style={s.sig} numberOfLines={1}>
            {txSig}
          </Text>
        </View>
        <Pressable
          style={[s.btn, s.primary]}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={s.primaryText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.pillRow}>
          <Pressable
            style={[s.pill, mode === 'request' && s.pillActive]}
            onPress={() => setMode('request')}
          >
            <Text style={[s.pillText, mode === 'request' && s.pillTextActive]}>
              Request
            </Text>
          </Pressable>
          <Pressable
            style={[s.pill, mode === 'pay' && s.pillActive]}
            onPress={() => setMode('pay')}
          >
            <Text style={[s.pillText, mode === 'pay' && s.pillTextActive]}>
              Pay
            </Text>
          </Pressable>
          <Pressable
            style={[s.pill, mode === 'split' && s.pillActive]}
            onPress={() => setMode('split')}
          >
            <Text style={[s.pillText, mode === 'split' && s.pillTextActive]}>
              Split
            </Text>
          </Pressable>
        </View>

        {mode === 'split' ? (
          <View style={s.field}>
            <Text style={s.fieldLabel}>Split between how many people</Text>
            <TextInput
              style={s.input}
              value={peopleCount}
              onChangeText={setPeopleCount}
              placeholder="e.g. 4 (including you)"
              placeholderTextColor={color.textFaint}
              keyboardType="number-pad"
            />
            {amountValid && peopleValid ? (
              <Text style={s.splitPreview}>
                {(() => {
                  const { share, creatorShare } = splitEvenly(
                    amountNum,
                    peopleNum,
                  );
                  return `${peopleNum - 1} people pay ${formatAmount(share, token)} each — your share is ${formatAmount(creatorShare, token)}`;
                })()}
              </Text>
            ) : null}
          </View>
        ) : (
        <View style={s.field}>
          <Text style={s.fieldLabel}>
            {mode === 'pay' ? 'Who are you paying' : "Who's this for (optional)"}
          </Text>
          <TextInput
            style={s.input}
            value={recipientInput}
            onChangeText={(v) => {
              setRecipientInput(v);
              setRecipientError(null);
            }}
            placeholder="username or wallet address"
            placeholderTextColor={color.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {recipientError ? <Text style={s.error}>{recipientError}</Text> : null}
          {mode === 'pay' && recentContacts.length > 0 ? (
            <View style={s.recentRow}>
              {recentContacts.map((c) => (
                <Pressable
                  key={c.address}
                  style={s.recentChip}
                  onPress={() => {
                    setRecipientInput(c.username ? `@${c.username}` : c.address);
                    setRecipientError(null);
                  }}
                >
                  <Text style={s.recentChipText}>
                    {c.username
                      ? `@${c.username}`
                      : `${c.address.slice(0, 4)}…${c.address.slice(-4)}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        )}

        <View style={s.field}>
          <Text style={s.fieldLabel}>{mode === 'split' ? 'Total amount' : 'Amount'}</Text>
          <View style={s.amountRow}>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={color.textFaint}
              keyboardType="decimal-pad"
            />
            <View style={s.tokenRow}>
              {(['USDC', 'SOL'] as Token[]).map((t) => (
                <Pressable
                  key={t}
                  style={[s.tokenPill, token === t && s.tokenPillActive]}
                  onPress={() => setToken(t)}
                >
                  <Text
                    style={[
                      s.tokenPillText,
                      token === t && s.tokenPillTextActive,
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.fieldLabel}>What for (optional)</Text>
          <TextInput
            style={s.input}
            value={memo}
            onChangeText={setMemo}
            placeholder="dinner, rent, etc."
            placeholderTextColor={color.textFaint}
          />
        </View>

        {payStatus === 'failed' && payError ? (
          <Text style={s.error}>{payError}</Text>
        ) : null}

        <Pressable
          style={[s.btn, s.primary, (!canSubmit || busy) && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || busy}
        >
          {busy ? (
            <ActivityIndicator color={color.bg} />
          ) : (
            <Text style={s.primaryText}>
              {mode === 'split'
                ? 'Split bill'
                : mode === 'request'
                  ? `Request ${amountValid ? formatAmount(amountNum, token) : ''}`
                  : `Send ${amountValid ? formatAmount(amountNum, token) : 'now'}`}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: space.xl, gap: space.lg },

  pillRow: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    padding: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  pillActive: { backgroundColor: color.surfaceRaised },
  pillText: { ...type.label, color: color.textDim },
  pillTextActive: { color: color.text },

  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: color.textDim },
  input: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: color.text,
    ...type.body,
  },
  error: { ...type.caption, color: color.danger },
  splitPreview: { ...type.caption, color: color.textDim },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  recentChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  recentChipText: { ...type.caption, color: color.textDim },

  amountRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  amountInput: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: color.text,
    ...type.amountSm,
  },
  tokenRow: { flexDirection: 'row', gap: space.xs },
  tokenPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  tokenPillActive: { backgroundColor: color.accent },
  tokenPillText: { ...type.label, color: color.textDim },
  tokenPillTextActive: { color: color.text },

  btn: {
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primary: { backgroundColor: color.text },
  primaryText: { ...type.label, fontSize: 16, color: color.bg },

  resultCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
  },
  ok: { ...type.label, color: color.owed },
  amount: { ...type.amount, color: color.text },
  sig: { ...type.caption, color: color.textFaint, maxWidth: 260 },
});
