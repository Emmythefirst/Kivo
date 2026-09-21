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
import { SafeAreaView } from 'react-native-safe-area-context';
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
  addSentPayment,
  saveBillMeta,
  getRecentContacts,
  recordRecentContact,
  type RecentContact,
} from '../lib/localStore';
import {
  scheduleRequestReminder,
  scheduleBillReminder,
} from '../lib/notifications';
import Avatar from '../components/Avatar';
import { color, space, radius, type, font, formatAmount } from '../theme';

type Mode = 'request' | 'pay' | 'split';
type Token = 'USDC' | 'SOL';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

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

export default function NewRequestScreen({ navigation, route }: any) {
  const { session, connection } = useWallet();
  const [mode, setMode] = useState<Mode>(route.params?.mode ?? 'request');
  const [recipientInput, setRecipientInput] = useState('');
  const [amountCents, setAmountCents] = useState(0);
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
  const [peopleCount, setPeopleCount] = useState(3);

  useFocusEffect(
    useCallback(() => {
      getRecentContacts().then(setRecentContacts);
    }, []),
  );

  const amountNum = amountCents / 100;
  const amountValid = amountCents > 0;
  const canSubmit =
    mode === 'split'
      ? amountValid
      : amountValid && (mode === 'request' || recipientInput.trim().length > 0);
  const busy = resolving || payStatus === 'paying';

  function keyPress(digit: string) {
    setAmountCents((prev) => {
      const next = prev * 10 + parseInt(digit, 10);
      return next > 999999999 ? prev : next;
    });
  }
  function backspace() {
    setAmountCents((prev) => Math.floor(prev / 10));
  }

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setRecipientError(null);

    if (mode === 'split') {
      const { share, creatorShare } = splitEvenly(amountNum, peopleCount);
      const billId = randomId();
      const trimmedMemo = memo.trim() || undefined;
      const localUsername = (await getLocalUsername()) ?? undefined;

      for (let i = 0; i < peopleCount - 1; i++) {
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
        peopleCount,
        memo: trimmedMemo,
        token,
      });
      scheduleBillReminder(trimmedMemo, peopleCount);

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
      await addSentPayment({
        to: recipient.to.toBase58(),
        toUsername: recipient.toUsername,
        amount: amountNum,
        token,
        memo: memo.trim() || undefined,
        createdAt: Date.now(),
        signature: sig,
      });
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

  const ctaDisabled = !canSubmit || busy;
  let ctaLabel = 'Continue';
  if (mode === 'request') {
    ctaLabel = amountValid ? `Request ${formatAmount(amountNum, token)}` : 'Request money';
  } else if (mode === 'pay') {
    ctaLabel = amountValid ? `Pay ${formatAmount(amountNum, token)}` : 'Pay';
  } else {
    ctaLabel = amountValid
      ? `Split ${formatAmount(amountNum, token)} · ${peopleCount} people`
      : 'Split a bill';
  }

  const isPayBusy = mode === 'pay' && payStatus !== 'idle' && payStatus !== 'failed';

  return (
    <SafeAreaView style={s.flex} edges={['top', 'bottom']}>
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.root}>
        <View style={s.topRow}>
          <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>‹</Text>
          </Pressable>
          <View style={s.pillRow}>
            {(['request', 'pay', 'split'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                style={[s.pill, mode === m && s.pillActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[s.pillText, mode === m && s.pillTextActive]}>
                  {m === 'request' ? 'Request' : m === 'pay' ? 'Pay' : 'Split'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {isPayBusy ? (
          <View style={s.busyBody}>
            {payStatus === 'paying' ? (
              <>
                <ActivityIndicator size="large" color={color.accent} />
                <Text style={s.busyText}>Waiting for wallet approval…</Text>
              </>
            ) : (
              <>
                <View style={s.successCircle}>
                  <Text style={s.successMark}>✓</Text>
                </View>
                <Text style={s.successAmount}>
                  {formatAmount(amountNum, token)} sent
                </Text>
                <Text style={s.successSig} numberOfLines={1}>
                  {txSig}
                </Text>
                <Pressable
                  style={s.doneBtn}
                  onPress={() => navigation.navigate('Home')}
                >
                  <Text style={s.doneBtnText}>Done</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <ScrollView
            style={s.flex}
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.amountBlock}>
              <View style={s.amountRow}>
                <Text style={s.amountBig}>{formatAmount(amountNum, token)}</Text>
                <View style={s.cursor} />
              </View>
              <View style={s.tokenRow}>
                {(['USDC', 'SOL'] as Token[]).map((t) => (
                  <Pressable
                    key={t}
                    style={[s.tokenPill, token === t && s.tokenPillActive]}
                    onPress={() => setToken(t)}
                  >
                    <Text
                      style={[s.tokenPillText, token === t && s.tokenPillTextActive]}
                    >
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {mode !== 'split' ? (
              <View style={s.field}>
                <Text style={s.fieldLabel}>
                  {mode === 'pay' ? 'PAY TO' : 'FOR (optional)'}
                </Text>
                <TextInput
                  style={s.input}
                  value={recipientInput}
                  onChangeText={(v) => {
                    setRecipientInput(v);
                    setRecipientError(null);
                  }}
                  placeholder="@username or wallet address"
                  placeholderTextColor={color.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {recipientError ? <Text style={s.error}>{recipientError}</Text> : null}
                {mode === 'pay' && recentContacts.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.recentRow}
                  >
                    {recentContacts.map((c) => (
                      <Pressable
                        key={c.address}
                        style={s.recentItem}
                        onPress={() => {
                          setRecipientInput(c.username ? `@${c.username}` : c.address);
                          setRecipientError(null);
                        }}
                      >
                        <Avatar name={c.username ?? c.address} size={44} />
                        <Text style={s.recentItemLabel} numberOfLines={1}>
                          {c.username ?? `${c.address.slice(0, 4)}…`}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ) : (
              <View style={s.splitRow}>
                <View>
                  <Text style={s.splitTitle}>Split between</Text>
                  <Text style={s.splitPreview}>
                    {peopleCount} people ·{' '}
                    {formatAmount(splitEvenly(amountNum, peopleCount).share, token)} each
                  </Text>
                </View>
                <View style={s.stepper}>
                  <Pressable
                    style={s.stepperBtn}
                    onPress={() => setPeopleCount((p) => Math.max(2, p - 1))}
                  >
                    <Text style={s.stepperBtnText}>−</Text>
                  </Pressable>
                  <Text style={s.stepperValue}>{peopleCount}</Text>
                  <Pressable
                    style={s.stepperBtn}
                    onPress={() => setPeopleCount((p) => Math.min(8, p + 1))}
                  >
                    <Text style={s.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <TextInput
              style={s.input}
              value={memo}
              onChangeText={setMemo}
              placeholder="What's it for?"
              placeholderTextColor={color.textFaint}
            />

            {payStatus === 'failed' && payError ? (
              <Text style={s.error}>{payError}</Text>
            ) : null}

            <View style={s.keypad}>
              {KEYPAD_KEYS.map((k, i) => {
                if (k === '') return <View key={i} style={s.keyBlank} />;
                return (
                  <Pressable
                    key={i}
                    style={s.key}
                    onPress={() => (k === '⌫' ? backspace() : keyPress(k))}
                  >
                    <Text style={s.keyText}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[s.submitBtn, ctaDisabled && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={ctaDisabled}
            >
              {resolving ? (
                <ActivityIndicator color={color.bg} />
              ) : (
                <Text
                  style={[s.submitBtnText, ctaDisabled && s.submitBtnTextDisabled]}
                >
                  {ctaLabel}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  root: { flex: 1, backgroundColor: color.bg },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  backBtnText: { fontSize: 22, color: color.text },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    padding: 4,
    gap: 2,
  },
  pill: { flex: 1, paddingVertical: space.sm, borderRadius: radius.pill, alignItems: 'center' },
  pillActive: { backgroundColor: color.owed },
  pillText: { ...type.label, fontSize: 13, color: color.textDim },
  pillTextActive: { color: color.bg },

  formContent: { padding: space.xl, paddingTop: space.md, gap: space.lg },

  amountBlock: { alignItems: 'center', paddingVertical: space.lg },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  amountBig: { ...type.amountHero, color: color.text },
  cursor: { width: 3, height: 44, backgroundColor: color.owed, marginLeft: 4 },
  tokenRow: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  tokenPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  tokenPillActive: { backgroundColor: 'rgba(198,242,78,0.12)', borderColor: 'rgba(198,242,78,0.35)' },
  tokenPillText: { fontFamily: font.bodyBold, fontSize: 12, color: color.textFainter },
  tokenPillTextActive: { color: color.owed },

  field: { gap: space.sm },
  fieldLabel: { ...type.sectionLabel, color: color.textFaint },
  input: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.md,
    color: color.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    ...type.body,
  },
  error: { ...type.caption, color: color.danger },

  recentRow: { gap: space.md, paddingVertical: space.xs },
  recentItem: { alignItems: 'center', gap: space.xs, width: 58 },
  recentItemLabel: { ...type.caption, fontSize: 11, color: color.textDim, textAlign: 'center' },

  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md + 2,
  },
  splitTitle: { ...type.label, fontSize: 13, color: color.text },
  splitPreview: { ...type.caption, color: color.textFainter, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 16, color: color.text },
  stepperValue: { ...type.amountSm, width: 18, textAlign: 'center', color: color.text },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    width: '31%',
    height: 56,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBlank: { width: '31%', height: 56 },
  keyText: { fontFamily: font.headingMedium, fontSize: 22, color: color.text },

  submitBtn: {
    paddingVertical: space.lg + 1,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: color.surfaceRaised },
  submitBtnText: { ...type.labelLg, color: color.bg },
  submitBtnTextDisabled: { color: color.textFaint },

  busyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  busyText: { ...type.body, color: color.textDim },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: color.owed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: { fontSize: 34, color: color.bg },
  successAmount: { ...type.titleLg, color: color.text },
  successSig: { ...type.caption, color: color.textFaint, maxWidth: 260 },
  doneBtn: {
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl + 12,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  doneBtnText: { ...type.label, color: color.text },
});
