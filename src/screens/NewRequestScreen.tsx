import React, { useCallback, useEffect, useState } from 'react';
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
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '../lib/WalletProvider';
import { signAndSend } from '../lib/wallet';
import { buildSolTransfer, buildUsdcTransfer } from '../lib/transfer';
import {
  createRequest,
  encodeLink,
  randomId,
  splitEvenly,
} from '../lib/requests';
import { getLocalUsername } from '../lib/usernames';
import {
  addSentRequest,
  addSentPayment,
  saveBillMeta,
  recordRecentContact,
  getRecentContacts,
} from '../lib/localStore';
import {
  scheduleRequestReminder,
  scheduleBillReminder,
} from '../lib/notifications';
import { pushPendingRequest } from '../lib/sync';
import Avatar from '../components/Avatar';
import PaymentSuccess from '../components/PaymentSuccess';
import { color, space, radius, type, font, formatAmount } from '../theme';
import type { PickedRecipient } from '../lib/navigation';

type Mode = 'request' | 'pay';
type ReqKind = 'single' | 'split';
type Token = 'USDC' | 'SOL';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function NewRequestScreen({ navigation, route }: any) {
  const { session, connection } = useWallet();
  const initialMode: Mode = route.params?.mode === 'pay' ? 'pay' : 'request';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [reqKind, setReqKind] = useState<ReqKind>(
    route.params?.mode === 'split' ? 'split' : 'single',
  );
  const [recipient, setRecipient] = useState<PickedRecipient | null>(null);
  // Typed as a raw decimal string, not shifted cents — "0" -> "1" -> "1." ->
  // "1.1" as you'd type on any normal calculator/keypad (matches Phantom's
  // own amount entry). A cents-shift model can never express SOL amounts
  // finer than 0.01 at all, which is why this was changed in the first
  // place — kept as-is through this redesign, by explicit request.
  const [amountStr, setAmountStr] = useState('0');
  const [token, setToken] = useState<Token>('USDC');
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false);
  const [memo, setMemo] = useState('');
  const [peopleCount, setPeopleCount] = useState(3);
  const [payStatus, setPayStatus] = useState<
    'idle' | 'paying' | 'done' | 'failed'
  >('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Picker/Scan "return a value" by navigating back to this same screen
  // instance with a new param — React Navigation pops back to the
  // existing route rather than pushing a duplicate. Consumed once, then
  // cleared so refocusing this screen later doesn't re-apply it.
  useEffect(() => {
    const picked = route.params?.selectedRecipient;
    if (picked) {
      setRecipient(picked);
      navigation.setParams({ selectedRecipient: undefined });
    }
  }, [route.params?.selectedRecipient, navigation]);

  useFocusEffect(
    useCallback(() => {
      // no-op refresh hook kept for parity with other screens' focus
      // effects; recent contacts are now fetched by PickerScreen instead.
    }, []),
  );

  const amountNum = Number(amountStr) || 0;
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const isSplit = mode === 'request' && reqKind === 'split';
  const canSubmit = isSplit
    ? amountValid
    : amountValid && (mode === 'request' || !!recipient);
  const walletName = session?.label || 'your wallet';
  const walletLetter = walletName[0]?.toUpperCase() ?? 'W';

  function keyPress(digit: string) {
    setAmountStr((prev) => {
      if (digit === '.') return prev.includes('.') ? prev : prev + '.';
      if (prev === '0') return digit;
      return prev.length >= 12 ? prev : prev + digit;
    });
  }
  function backspace() {
    setAmountStr((prev) => {
      const next = prev.slice(0, -1);
      return next === '' ? '0' : next;
    });
  }

  function switchMode(m: Mode) {
    // Each pill is its own independent form — switching tabs shouldn't
    // carry over whatever amount/recipient/memo was mid-entry in another
    // one, and definitely shouldn't leave a just-completed payment's
    // success state visible after flipping away and back.
    setMode(m);
    setReqKind('single');
    setAmountStr('0');
    setToken('USDC');
    setRecipient(null);
    setMemo('');
    setPeopleCount(3);
    setTokenMenuOpen(false);
    setPayStatus('idle');
    setPayError(null);
  }

  async function handleSubmit() {
    if (!canSubmit || payStatus === 'paying') return;

    if (isSplit) {
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
      const requestedFromLabel = recipient
        ? recipient.username
          ? `@${recipient.username}`
          : recipient.address
        : undefined;
      const localUsername = await getLocalUsername();
      const req = createRequest({
        to: session!.publicKey,
        toUsername: localUsername ?? undefined,
        amount: amountNum,
        token,
        memo: memo.trim() || undefined,
      });
      await addSentRequest({ request: req, requestedFromLabel });
      scheduleRequestReminder(req, requestedFromLabel);

      // Only for a recipient who's both a known Kivo username AND already
      // a contact you've transacted with before — the safeguard against
      // using this to blast an unsolicited "pay me" card onto a
      // stranger's Home screen just because their username happens to be
      // guessable/known. Anyone else still gets the normal link-only
      // flow, same as always; this is additive, never a replacement.
      if (recipient?.username) {
        const contacts = await getRecentContacts();
        const alreadyKnown = contacts.some((c) => c.address === recipient.address);
        if (alreadyKnown) {
          pushPendingRequest({
            id: req.id,
            username: recipient.username,
            link: encodeLink(req),
            fromLabel: localUsername ? `@${localUsername}` : undefined,
            amount: amountNum,
            token,
            memo: memo.trim() || undefined,
            createdAt: req.createdAt,
          });
        }
      }

      navigation.navigate('ShareRequest', {
        link: encodeLink(req),
        requestedFromLabel,
      });
      return;
    }

    // Pay mode — recipient is always already-resolved by this point
    // (Picker/Scan only ever hand back a confirmed address), so there's
    // no on-submit username lookup needed here anymore.
    if (!recipient) return;
    const to = new PublicKey(recipient.address);

    setPayStatus('paying');
    setPayError(null);
    try {
      const sig = await signAndSend(
        connection,
        session!.publicKey,
        async (payer) =>
          token === 'SOL'
            ? buildSolTransfer(payer, to, amountNum)
            : buildUsdcTransfer(connection, payer, to, amountNum),
      );
      setPayStatus('done');
      setTxSig(sig);
      await recordRecentContact(recipient.address, recipient.username);
      await addSentPayment({
        to: recipient.address,
        toUsername: recipient.username,
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

  const ctaDisabled = !canSubmit || payStatus === 'paying';
  let ctaLabel = 'Continue';
  if (mode === 'pay') {
    ctaLabel = !amountValid
      ? 'Enter an amount'
      : !recipient
        ? 'Choose who to pay'
        : `Pay ${formatAmount(amountNum, token)}`;
  } else if (isSplit) {
    ctaLabel = amountValid
      ? `Split ${formatAmount(amountNum, token)} · ${peopleCount} people`
      : 'Enter the bill total';
  } else {
    ctaLabel = amountValid ? `Request ${formatAmount(amountNum, token)}` : 'Enter an amount';
  }

  if (payStatus === 'done' && recipient) {
    return (
      <SafeAreaView style={s.flex} edges={['top', 'bottom']}>
        <PaymentSuccess
          amount={amountNum}
          token={token}
          toLabel={recipient.username ? `@${recipient.username}` : `${recipient.address.slice(0, 4)}…${recipient.address.slice(-4)}`}
          toAddress={`${recipient.address.slice(0, 4)}…${recipient.address.slice(-4)}`}
          signature={txSig}
          onDone={() => navigation.navigate('Home')}
        />
      </SafeAreaView>
    );
  }

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
              {(['request', 'pay'] as Mode[]).map((m) => (
                <Pressable
                  key={m}
                  style={[s.pill, mode === m && s.pillActive]}
                  onPress={() => switchMode(m)}
                >
                  <Text style={[s.pillText, mode === m && s.pillTextActive]}>
                    {m === 'request' ? 'Request' : 'Pay'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={s.topRowSpacer} />
          </View>

          <ScrollView
            style={s.flex}
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.amountBlock}>
              <View style={s.amountRow}>
                {token === 'USDC' ? <Text style={s.amountPrefix}>$</Text> : null}
                <Text style={s.amountBig}>{amountStr}</Text>
                {token === 'SOL' ? <Text style={s.amountSuffix}> SOL</Text> : null}
                <View style={s.cursor} />
              </View>

              <Pressable style={s.tokenBtn} onPress={() => setTokenMenuOpen((v) => !v)}>
                <Text style={s.tokenBtnText}>{token}</Text>
                <Text style={s.tokenBtnCaret}>▼</Text>
              </Pressable>
              {tokenMenuOpen ? (
                <View style={s.tokenMenu}>
                  {(['USDC', 'SOL'] as Token[]).map((t) => (
                    <Pressable
                      key={t}
                      style={[s.tokenMenuItem, t === token && s.tokenMenuItemActive]}
                      onPress={() => {
                        setToken(t);
                        setTokenMenuOpen(false);
                      }}
                    >
                      <Text style={s.tokenMenuLabel}>{t}</Text>
                      <Text style={s.tokenMenuHint}>{t === 'USDC' ? 'Stablecoin' : 'Native'}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {mode === 'request' ? (
                <View style={s.kindRow}>
                  {(['single', 'split'] as ReqKind[]).map((k) => (
                    <Pressable key={k} style={s.kindBtn} onPress={() => setReqKind(k)}>
                      <Text
                        style={[
                          s.kindBtnText,
                          reqKind === k && s.kindBtnTextActive,
                          reqKind === k && s.kindBtnUnderline,
                        ]}
                      >
                        {k === 'single' ? 'One person' : 'Split a bill'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={s.fieldsBlock}>
              {!isSplit ? (
                <View style={s.whoRow}>
                  {recipient ? (
                    <Pressable
                      style={s.recipientChip}
                      onPress={() => navigation.navigate('Picker', { mode })}
                    >
                      <Avatar
                        name={recipient.username ?? recipient.address}
                        colorSeed={recipient.username ?? recipient.address}
                        size={36}
                      />
                      <View style={s.recipientMain}>
                        <View style={s.recipientTitleRow}>
                          <Text style={s.recipientTitle} numberOfLines={1}>
                            {recipient.username
                              ? `@${recipient.username}`
                              : `${recipient.address.slice(0, 4)}…${recipient.address.slice(-4)}`}
                          </Text>
                          {recipient.username ? (
                            <View style={s.verifiedDot}>
                              <Text style={s.verifiedDotText}>✓</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={s.recipientSub} numberOfLines={1}>
                          {recipient.username
                            ? `${recipient.address.slice(0, 4)}…${recipient.address.slice(-4)}`
                            : 'Not linked to a username'}
                        </Text>
                      </View>
                      <Pressable style={s.clearBtn} onPress={() => setRecipient(null)}>
                        <Text style={s.clearBtnText}>×</Text>
                      </Pressable>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={s.whoPlaceholder}
                      onPress={() => navigation.navigate('Picker', { mode })}
                    >
                      <Text style={s.whoLabel}>{mode === 'pay' ? 'To' : 'From'}</Text>
                      <Text style={s.whoPlaceholderText}>
                        {mode === 'pay' ? 'Username or address' : 'Anyone with the link'}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable style={s.scanBtn} onPress={() => navigation.navigate('Scan', { mode })}>
                    <Text style={s.scanBtnText}>QR</Text>
                  </Pressable>
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

              <View style={s.memoRow}>
                <Text style={s.memoLabel}>For</Text>
                <TextInput
                  style={s.memoInput}
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="Dinner, rent, tickets…"
                  placeholderTextColor={color.textFaint}
                />
              </View>
            </View>

            {payStatus === 'failed' && payError ? (
              <Text style={s.error}>{payError}</Text>
            ) : null}

            <View style={s.keypad}>
              {KEYPAD_KEYS.map((k, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [s.key, pressed && s.keyPressed]}
                  onPress={() => (k === '⌫' ? backspace() : keyPress(k))}
                >
                  <Text style={s.keyText}>{k}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[s.submitBtn, ctaDisabled && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={ctaDisabled}
            >
              <Text
                style={[s.submitBtnText, ctaDisabled && s.submitBtnTextDisabled]}
              >
                {ctaLabel}
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        {payStatus === 'paying' ? (
          <View style={s.approvingOverlay}>
            <View style={s.approvingBadgeWrap}>
              <ActivityIndicator size="large" color={color.accent} />
              <View style={s.approvingBadge}>
                <Text style={s.approvingBadgeText}>{walletLetter}</Text>
              </View>
            </View>
            <Text style={s.approvingTitle}>Approve in {walletName}</Text>
            <Text style={s.approvingSub}>Sign to send {formatAmount(amountNum, token)}</Text>
          </View>
        ) : null}
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
    paddingBottom: space.xs,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  backBtnText: { fontSize: 24, color: color.text },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    padding: 4,
    gap: 2,
    maxWidth: 220,
    alignSelf: 'center',
  },
  topRowSpacer: { width: 32 },
  pill: { flex: 1, paddingVertical: space.sm, borderRadius: radius.pill, alignItems: 'center' },
  pillActive: { backgroundColor: color.text },
  pillText: { ...type.label, fontSize: 13, color: color.textDim },
  pillTextActive: { color: color.bg },

  formContent: { padding: space.xl, paddingTop: space.xs, gap: space.md },

  amountBlock: { alignItems: 'center', paddingVertical: space.md, position: 'relative' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  amountBig: { ...type.amountHero, fontSize: 62, color: color.text },
  amountPrefix: { ...type.amountHero, fontSize: 62, color: color.text },
  amountSuffix: { ...type.titleLg, color: color.textDim },
  cursor: { width: 3, height: 40, backgroundColor: color.owed, marginLeft: 4 },

  tokenBtn: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingVertical: space.xs + 1,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  tokenBtnText: { ...type.captionBold, fontSize: 12.5, color: '#C9C6D1' },
  tokenBtnCaret: { fontSize: 9, color: color.textFaint },
  tokenMenu: {
    position: 'absolute',
    top: 118,
    alignSelf: 'center',
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    padding: space.xs + 2,
    minWidth: 150,
    zIndex: 5,
  },
  tokenMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm + 1,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.sm,
  },
  tokenMenuItemActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  tokenMenuLabel: { ...type.label, fontSize: 13.5, color: color.text },
  tokenMenuHint: { ...type.caption, fontSize: 11.5, color: color.textFainter },

  kindRow: { flexDirection: 'row', gap: space.lg, marginTop: space.md + 2 },
  kindBtn: { paddingVertical: space.xs },
  kindBtnText: { ...type.label, fontSize: 13, color: color.textFaint },
  kindBtnTextActive: { color: color.text },
  kindBtnUnderline: { borderBottomWidth: 2, borderBottomColor: color.owed, paddingBottom: 4 },

  fieldsBlock: { gap: space.sm, marginTop: space.xs },

  whoRow: { flexDirection: 'row', gap: space.sm },
  recipientChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    padding: space.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  recipientMain: { flex: 1, minWidth: 0 },
  recipientTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  recipientTitle: { ...type.label, fontSize: 14, color: color.text, flexShrink: 1 },
  verifiedDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedDotText: { fontSize: 9, color: color.bg },
  recipientSub: { ...type.caption, fontSize: 11.5, color: color.textFainter, fontFamily: 'monospace', marginTop: 2 },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: { fontSize: 14, color: color.textFainter },

  whoPlaceholder: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  whoLabel: { ...type.label, fontSize: 13, color: color.textDim },
  whoPlaceholderText: { ...type.body, fontSize: 13.5, color: color.textFaint, flexShrink: 1 },
  scanBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnText: { ...type.captionBold, fontSize: 11, color: '#C9C6D1' },

  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.lg,
    paddingHorizontal: space.md + 2,
    height: 56,
  },
  splitTitle: { ...type.label, fontSize: 13.5, color: color.text },
  splitPreview: { ...type.caption, color: color.textFainter, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 16, color: color.text },
  stepperValue: { ...type.amountSm, fontSize: 17, width: 18, textAlign: 'center', color: color.text },

  memoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.lg,
    paddingHorizontal: space.md + 2,
    height: 52,
  },
  memoLabel: { ...type.label, fontSize: 13, color: color.textDim },
  memoInput: { flex: 1, height: '100%', color: color.text, ...type.body, fontSize: 14 },

  error: { ...type.caption, color: color.danger },

  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  key: {
    width: '31%',
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: color.surface },
  keyText: { fontFamily: font.headingMedium, fontSize: 24, color: color.text },

  submitBtn: {
    paddingVertical: space.lg + 1,
    borderRadius: radius.lg,
    backgroundColor: color.owed,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: color.surfaceRaised },
  submitBtnText: { ...type.labelLg, color: color.bg },
  submitBtnTextDisabled: { color: color.textFaint },

  approvingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5,5,8,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  approvingBadgeWrap: { alignItems: 'center', justifyContent: 'center', width: 84, height: 84 },
  approvingBadge: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvingBadgeText: { ...type.titleLg, fontSize: 18, color: color.bg },
  approvingTitle: { ...type.label, fontSize: 16, color: color.text },
  approvingSub: { ...type.caption, color: color.textFainter },
});
