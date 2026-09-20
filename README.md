# Kivo

A payment request layer for Solana. Ask a friend for money by username, or
send them a link that works whether or not they have the app. Settles through
whatever wallet they already use — Kivo never holds keys.

Built for CLOCK IN (Solana Mobile hackathon), Android only.

## Why this isn't a wallet

Kivo generates payment requests and resolves usernames. It never creates a
seed phrase, stores a key, or signs anything itself. Every signature is
delegated to an installed wallet over Mobile Wallet Adapter. If Phantom is
the bank account, Kivo is Venmo.

## Setup

```bash
npm install

# Expo Go cannot load MWA — it needs native modules. Always use a dev build.
npx expo prebuild --clean
npx expo run:android          # device or emulator with a wallet installed
```

You need **Phantom, Solflare, or Seed Vault Wallet installed on the same
device**, set to devnet. MWA has nothing to talk to otherwise, and `connect()`
will throw `no installed wallet`.

Also copy `.env.example` to `.env` and fill in a dedicated devnet RPC
endpoint (e.g. Helius' free tier). The public `api.devnet.solana.com`
endpoint is shared and frequently congested enough to break payments —
see `EXPO_PUBLIC_DEVNET_RPC_URL` in `src/lib/WalletProvider.tsx`.

### Deploy the username registry

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Then paste the printed program id into **both**:
- `Anchor.toml` → `[programs.devnet]`
- `programs/username-registry/src/lib.rs` → `declare_id!`
- `src/lib/usernames.ts` → `REGISTRY_PROGRAM_ID`

Rebuild and redeploy after changing `declare_id!`. The same program also
hosts `mark_paid`, the replay-protection instruction described below —
redeploying with `anchor deploy` upgrades it in place at the same program
id rather than requiring a fresh one.

### App Links

`app.json` claims `https://kivo.app/r*` with `autoVerify: true`. For Android
to open Kivo instead of a browser, that domain must serve
`/.well-known/assetlinks.json` containing your release keystore's SHA-256
fingerprint:

```bash
keytool -list -v -keystore release.keystore -alias kivo
```

Until that file is live, links fall back to opening a browser — which is the
intended behaviour for people without the app anyway, so the demo still
works. For local testing without a real hosted domain, open a request link
directly with an explicit package target instead of relying on the browser
fallback:

```bash
adb shell am start -a android.intent.action.VIEW -d "<link>" -p com.kivo.app
```

## Layout

```
App.tsx                          navigation + deep link routing
src/lib/wallet.ts                MWA connect / authorize / sign
src/lib/WalletProvider.tsx       session state, RPC connection
src/lib/usernames.ts             PDA derivation, on-chain lookup, claim tx
src/lib/requests.ts              link encode/decode, split maths, mark_paid tx
src/lib/transfer.ts              SOL + USDC transaction builders
src/lib/localStore.ts            sent requests, recent contacts, bill metadata
src/lib/notifications.ts         local self-reminders (see below)
src/lib/navigation.ts            typed React Navigation param list
src/components/QrCode.tsx        pure-JS QR rendering, no native dependency
src/screens/                     Connect, Home, New request (Request/Pay/Split),
                                  Request, ShareRequest, ShareBill, ClaimUsername
src/theme/                       colour, type, spacing tokens
programs/username-registry/      Anchor program: claim, mark_paid
```

## Gotchas worth knowing before you hit them

**Base64, not base58.** MWA returns account addresses base64-encoded.
`new PublicKey(account.address)` throws; you have to decode it first (see
`addressToPublicKey()` — uses `js-base64`'s `toUint8Array`, not the
similarly-named `base64-js` package's `toByteArray`, which is a different
library entirely).

**Polyfills load first.** `index.js` imports `src/polyfills.js` as its sole,
first import, which sets up `Buffer` and `react-native-get-random-values`
before anything else runs. This isn't just ordering as written — Babel's
CommonJS transform hoists *every* `import` statement above plain
statements, so polyfill setup has to live inside its own imported module to
guarantee it actually runs first.

**Fetch the blockhash right before signing, not before.** Wallet
interaction — approval screens, a wallet's own first-run onboarding, plain
human hesitation — can easily take longer than a blockhash stays valid
(~60-90s). `signAndSend()` in `wallet.ts` fetches it inside the wallet
session, immediately before `signAndSendTransactions`, not earlier.

**Normalise usernames in one place.** The program lowercases and the client
lowercases. If they ever disagree, lookups silently miss. `normalize()` is the
single source of truth — mirror any change into the Rust validation.

**USDC is the default token.** People split bills in dollars. The devnet mint
in `transfer.ts` must be swapped for the mainnet one before release.

**Recipient token accounts.** If the person being paid has no USDC account,
the transfer creates one in the same transaction and the *sender* pays that
rent. Expected, but it makes the first payment to someone cost slightly more.

**Replay protection is on-chain, not just client-side.** Paying a request
appends a `mark_paid` instruction (same program as the username registry) to
the *same transaction* as the transfer — it creates a tiny marker PDA seeded
by the request id, and a second payment attempt fails outright because the
account already exists. The client also does a friendly pre-check
(`isRequestMarkedPaid`) so a doomed payment never even opens the wallet, but
that check isn't the actual guarantee — the on-chain `init` constraint is.

**"Remind" is a local self-reminder, not a push notification to the other
person.** Notifying whoever owes you the instant you tap Remind would need a
backend mapping their identity to a device push token — exactly the kind of
directory this project deliberately doesn't have, and the person you're
reminding may not even have Kivo installed at all. `src/lib/notifications.ts`
instead schedules a local notification on *your own* device a couple of days
later, nudging you to re-share the link through whatever channel (text,
DM, etc.) you originally used.

## Status

Working end-to-end, verified live against devnet: wallet connect/restore/
disconnect, deep link decode and routing, username claim and on-chain
resolution, the full request composer (Request / Pay / Split), SOL and USDC
transfers, on-chain replay protection via `mark_paid`, recent contacts,
QR codes as an additional link transport, and local reminder notifications.

Not built: the web fallback page for people without the app (Phase 5 in the
project brief — deliberately last), and cross-device push notifications
(would require backend infrastructure this project intentionally doesn't
have — see the notifications gotcha above).
