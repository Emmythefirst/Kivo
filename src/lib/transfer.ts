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
