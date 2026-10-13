import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Devnet USDC. Swap for EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v on mainnet.
export const USDC_MINT = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
);
export const USDC_DECIMALS = 6;

/**
 * Thrown before the wallet ever opens when the payer can't cover a USDC
 * payment — so the user sees a plain reason instead of the wallet's
 * opaque "Simulation failed" screen.
 */
export class UsdcBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsdcBalanceError';
  }
}

export function buildSolTransfer(
  from: PublicKey,
  to: PublicKey,
  amount: number,
): Transaction {
  return new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: Math.round(amount * LAMPORTS_PER_SOL),
    }),
  );
}

/**
 * USDC is the default for bills — people split in dollars, not in a token
 * that moves 8% overnight. If the recipient has no token account yet we
 * create it in the same transaction; the sender pays that one-time rent.
 */
export async function buildUsdcTransfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  amount: number,
): Promise<Transaction> {
  const fromAta = await getAssociatedTokenAddress(USDC_MINT, from);
  const toAta = await getAssociatedTokenAddress(USDC_MINT, to);

  // Fail early and clearly if the payer doesn't hold enough of THIS USDC
  // (the devnet mint above). USDC from other faucets uses a different
  // mint and won't count.
  let have = 0;
  try {
    have = Number((await connection.getTokenAccountBalance(fromAta)).value.uiAmount ?? 0);
  } catch {
    have = 0; // no token account for this mint yet
  }
  if (have < amount) {
    throw new UsdcBalanceError(
      `You need ${amount} USDC but this wallet has ${have} of Kivo's devnet USDC. ` +
        `Get some at faucet.circle.com (Solana, Devnet) and try again.`,
    );
  }

  const tx = new Transaction();

  const toAccount = await connection.getAccountInfo(toAta);
  if (!toAccount) {
    tx.add(
      createAssociatedTokenAccountInstruction(from, toAta, to, USDC_MINT),
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      USDC_MINT,
      toAta,
      from,
      BigInt(Math.round(amount * 10 ** USDC_DECIMALS)),
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  return tx;
}
