/**
 * Design direction: this is a ledger between friends, not a trading terminal.
 * So: ink-on-paper contrast, a single saturated accent reserved for money
 * owed *to you*, and amounts set large in a tabular face so columns of
 * numbers line up. Nothing glows. Nothing gradients.
 */

export const color = {
  // Deep slate rather than tinted near-black — reads as paper stock at night.
  bg: '#14171C',
  surface: '#1C2027',
  surfaceRaised: '#242932',
  border: '#2E343E',

  text: '#F2F4F7',
  textDim: '#9AA3B0',
  textFaint: '#646E7D',

  // Reserved: only ever used for money coming toward the user.
  owed: '#4ADE80',
  // Only ever used for money the user owes.
  owing: '#F2994A',
  danger: '#EB5757',

  accent: '#6C8CFF',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const type = {
  // Amounts use tabular figures so lists of numbers stay aligned.
  amount: {
    fontSize: 34,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums' as const],
    letterSpacing: -0.5,
  },
  amountSm: {
    fontSize: 17,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums' as const],
  },
  title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};
// Not `as const`: each fontWeight is already narrowed above, and applying
// it to the whole object would make fontVariant a readonly tuple, which
// conflicts with RN's mutable TextStyle["fontVariant"] type.

export function formatAmount(amount: number, token: string): string {
  const n = token === 'USDC' ? amount.toFixed(2) : amount.toFixed(4);
  return token === 'USDC' ? `$${n}` : `${n} SOL`;
}