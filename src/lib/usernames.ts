import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_USERNAME_KEY = 'kivo.username';

/**
 * There's no on-chain reverse lookup (pubkey -> username) by design — see
 * the project brief's stance against getProgramAccounts scans. Once this
 * device claims a username through this app, it's cached locally so the
 * UI can show "you're @name" without re-deriving it; this is a per-device
 * convenience, not a source of truth (the chain is).
 */
export async function getLocalUsername(): Promise<string | null> {
  return AsyncStorage.getItem(LOCAL_USERNAME_KEY);
}

export async function setLocalUsername(username: string): Promise<void> {
  await AsyncStorage.setItem(LOCAL_USERNAME_KEY, normalize(username));
}

export const REGISTRY_PROGRAM_ID = new PublicKey(
  'AaVd1D36aZWEVQVRr6EHsF9fxShv5MXVo2b3AXDaodSF',
);

export const USERNAME_MAX_LEN = 20;

/**
 * Usernames are normalised before hashing so "Bob", "BOB" and "bob" all
 * resolve to the same account. Do this in one place or the app and the
 * program will disagree about who owns a name.
 */
export function normalize(username: string): string {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  const u = normalize(username);
  return /^[a-z0-9_]{3,20}$/.test(u);
}

/**
 * The whole point of this design: the account address is derived from the
 * name itself, so looking someone up is a local computation plus one RPC
 * read. No server, no username database, no company as referee.
 */
export function deriveUsernameAccount(username: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('username'), Buffer.from(normalize(username))],
    REGISTRY_PROGRAM_ID,
  );
  return pda;
}

export type Resolved = {
  username: string;
  owner: PublicKey;
};

/**
 * Account layout written by the program:
 *   [0..8]    anchor discriminator
 *   [8..40]   owner pubkey
 *   [40..44]  name length (u32, borsh string prefix)
 *   [44..]    name bytes
 */
export async function resolveUsername(
  connection: Connection,
  username: string,
): Promise<Resolved | null> {
  if (!isValidUsername(username)) return null;

  const account = await connection.getAccountInfo(
    deriveUsernameAccount(username),
  );
  if (!account) return null;

  const owner = new PublicKey(account.data.subarray(8, 40));
  return { username: normalize(username), owner };
}

export async function isAvailable(
  connection: Connection,
  username: string,
): Promise<boolean> {
  if (!isValidUsername(username)) return false;
  const account = await connection.getAccountInfo(
    deriveUsernameAccount(username),
  );
  return account === null;
}

// First 8 bytes of sha256("global:claim") — Anchor's instruction
// discriminator, derived deterministically from the instruction name at
// compile time. Precomputed once here so the app doesn't need a sha256
// dependency just for this one constant.
const CLAIM_DISCRIMINATOR = Buffer.from([
  62, 198, 214, 193, 213, 159, 108, 210,
]);

/**
 * Builds the on-chain `claim` instruction by hand, matching this file's
 * existing manual-byte-layout approach (see resolveUsername) rather than
 * pulling in a full generated Anchor Program client for one instruction.
 * The instruction takes a single `username: String` argument, Borsh-
 * encoded as a u32 LE length prefix followed by the UTF-8 bytes.
 */
export function buildClaimTransaction(
  owner: PublicKey,
  username: string,
): Transaction {
  const normalized = normalize(username);
  const nameBytes = Buffer.from(normalized, 'utf8');
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(nameBytes.length, 0);
  const data = Buffer.concat([CLAIM_DISCRIMINATOR, lengthPrefix, nameBytes]);

  const ix = new TransactionInstruction({
    programId: REGISTRY_PROGRAM_ID,
    keys: [
      {
        pubkey: deriveUsernameAccount(normalized),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: owner, isSigner: true, isWritable: true },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
  });

  return new Transaction().add(ix);
}
