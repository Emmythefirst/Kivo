import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toUint8Array } from 'js-base64';

// Identity shown inside the wallet's approval sheet. Keep the name short —
// it renders inside Phantom/Solflare's own UI, not ours.
const APP_IDENTITY = {
  name: 'Kivo',
  uri: 'https://kivo.app',
  icon: 'favicon.ico', // resolved relative to uri
};

const CHAIN = 'solana:devnet'; // switch to solana:mainnet-beta for release
const AUTH_KEY = 'kivo.authToken';
const ADDR_KEY = 'kivo.address';

export type WalletSession = {
  address: string;
  publicKey: PublicKey;
  label?: string;
};

/**
 * MWA hands back a base64 address, not a base58 one. Converting it wrong is
 * the single most common bug when wiring this up the first time.
 */
function addressToPublicKey(base64Address: string): PublicKey {
  return new PublicKey(toUint8Array(base64Address));
}

/**
 * MWA 2.0 folds reauthorization into authorize() itself — pass a stored
 * auth_token and the wallet silently reauthorizes if it's still valid, or
 * prompts fresh otherwise, all as one call. The older, separate
 * reauthorize() method (MWA 1.x-era) is deliberately never used: Phantom
 * doesn't reliably follow a reauthorize() with a working
 * signAndSendTransactions() in the same session — it was observed to
 * accept the reauthorize but then hang indefinitely (no dialog, no
 * response, no error) on the very next call. authorize() with auth_token
 * doesn't have that problem and is the spec-current pattern anyway.
 */
async function authorize(
  wallet: any,
  authToken?: string,
): Promise<WalletSession> {
  try {
    return await doAuthorize(wallet, authToken);
  } catch (e) {
    // A stale/revoked auth_token makes the wallet reject the whole call
    // outright rather than treating it as a fresh request — so a stale
    // token needs its own retry, without one, not just a bare rethrow.
    if (!authToken) throw e;
    await AsyncStorage.multiRemove([AUTH_KEY, ADDR_KEY]);
    return doAuthorize(wallet, undefined);
  }
}

async function doAuthorize(
  wallet: any,
  authToken?: string,
): Promise<WalletSession> {
  const result = await wallet.authorize({
    chain: CHAIN,
    identity: APP_IDENTITY,
    auth_token: authToken,
  });
  const account = result.accounts[0];
  await AsyncStorage.multiSet([
    [AUTH_KEY, result.auth_token],
    [ADDR_KEY, account.address],
  ]);
  return {
    address: account.address,
    publicKey: addressToPublicKey(account.address),
    label: account.label,
  };
}

/**
 * First connect. Opens the wallet app, user approves, Android returns here.
 * The authToken we store lets later calls skip the approval screen.
 */
export async function connect(): Promise<WalletSession> {
  return transact((wallet) => authorize(wallet));
}

/**
 * Silent reconnect on app launch. Returns null if the user has never
 * connected or the wallet revoked us — caller should show onboarding.
 */
export async function restore(): Promise<WalletSession | null> {
  const authToken = await AsyncStorage.getItem(AUTH_KEY);
  if (!authToken) return null;

  try {
    return await transact((wallet) => authorize(wallet, authToken));
  } catch {
    await AsyncStorage.multiRemove([AUTH_KEY, ADDR_KEY]);
    return null;
  }
}

export async function disconnect(): Promise<void> {
  const authToken = await AsyncStorage.getItem(AUTH_KEY);
  await AsyncStorage.multiRemove([AUTH_KEY, ADDR_KEY]);
  if (!authToken) return;
  try {
    await transact(async (wallet) => {
      await wallet.deauthorize({ auth_token: authToken });
    });
  } catch {
    // Wallet may already have dropped us. Local state is cleared either way.
  }
}

/**
 * Fetches a blockhash with a couple of retries — used right before
 * signing (see signAndSend), where a transient failure is worth retrying
 * rather than failing the whole payment outright.
 */
async function getFreshBlockhash(connection: Connection): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await connection.getLatestBlockhash()).blockhash;
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError;
}

/**
 * Sign and send. Every payment in the app funnels through here, so the
 * wallet-switch behaviour is identical everywhere.
 *
 * One session, authorize then sign — the standard, spec-compliant
 * pattern. (A two-session workaround was tried here to route around a
 * Phantom-specific bug where signAndSendTransactions silently hangs after
 * authorize in the same session — see progress.md — but it only traded
 * one race for another. Reverted: this bug appears to be Phantom-side,
 * not something to paper over with session gymnastics.)
 *
 * `payer` is the already-connected account (session.publicKey) — `build`
 * runs with it before transact() ever opens the wallet session, since
 * nothing it does (e.g. buildUsdcTransfer checking for an existing token
 * account) has a validity window. The blockhash is different: it's only
 * valid ~60-90s, and wallet interaction — approval screens, a first-run
 * backup-your-wallet flow, plain human hesitation — can easily take
 * longer than that (confirmed live: Solflare rejected a signature with
 * "Blockhash expired" after an unrelated onboarding screen ate the time
 * budget). So it's fetched here, inside the session, immediately before
 * signing — as late as possible — rather than before transact() opens.
 */
export async function signAndSend(
  connection: Connection,
  payer: PublicKey,
  build: (payer: PublicKey) => Promise<Transaction>,
): Promise<string> {
  const tx = await build(payer);

  return transact(async (wallet) => {
    const authToken = await AsyncStorage.getItem(AUTH_KEY);
    const session = await authorize(wallet, authToken ?? undefined);
    tx.feePayer = session.publicKey;
    tx.recentBlockhash = await getFreshBlockhash(connection);

    const [signature] = await wallet.signAndSendTransactions({
      transactions: [tx],
    });
    return signature;
  });
}
