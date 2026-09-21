/**
 * Design direction (2026-09-21 redesign): near-black, high-contrast, one
 * lime accent reserved for money/CTAs and a purple accent reserved for
 * wallet/Solana branding moments. Space Grotesk for numbers and headings,
 * Manrope for everything else — matches the shared design exactly (see
 * progress.md for how this was sourced from a Claude design artifact).
 */

export const color = {
  bg: '#0A0A0D',
  surface: '#15151B',
  surfaceRaised: '#1D1D24',
  card: '#13131A',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.1)',

  text: '#F5F4F0',
  textDim: '#9A9AA3',
  textFainter: '#8A8A93',
  textFaint: '#5C5C66',

  // Reserved: only ever used for money coming toward the user, primary
  // CTAs, and success states.
  owed: '#C6F24E',
  // Only ever used for money the user owes / pending warnings.
  owing: '#F2C572',
  danger: '#FF6B5E',
  success: '#9AD97A',

  // Wallet/Solana branding accent — the devnet pill, MWA mentions.
  accent: '#9E8CFC',
} as const;

export const AVATAR_COLORS = [
  '#C6F24E',
  '#9E8CFC',
  '#FF9C6B',
  '#5FD0C0',
  '#FFD166',
] as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  pill: 999,
} as const;

/** Font family names as registered by the @expo-google-fonts packages loaded in App.tsx. */
export const font = {
  heading: 'SpaceGrotesk_700Bold',
  headingSemibold: 'SpaceGrotesk_600SemiBold',
  headingMedium: 'SpaceGrotesk_500Medium',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemibold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtraBold: 'Manrope_800ExtraBold',
} as const;

export const type = {
  wordmark: { fontFamily: font.heading, fontSize: 34, letterSpacing: -1 },
  amountHero: {
    fontFamily: font.heading,
    fontSize: 64,
    letterSpacing: -2,
    fontVariant: ['tabular-nums' as const],
  },
  amount: {
    fontFamily: font.heading,
    fontSize: 42,
    letterSpacing: -1,
    fontVariant: ['tabular-nums' as const],
  },
  amountMd: {
    fontFamily: font.heading,
    fontSize: 30,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums' as const],
  },
  amountSm: {
    fontFamily: font.heading,
    fontSize: 16,
    fontVariant: ['tabular-nums' as const],
  },
  title: { fontFamily: font.heading, fontSize: 20 },
  titleLg: { fontFamily: font.heading, fontSize: 24 },
  sectionLabel: { fontFamily: font.body, fontSize: 12, letterSpacing: 0.4 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  bodyEmphasis: { fontFamily: font.bodyMedium, fontSize: 14.5 },
  label: { fontFamily: font.bodyBold, fontSize: 14.5 },
  labelLg: { fontFamily: font.bodyExtraBold, fontSize: 15 },
  caption: { fontFamily: font.body, fontSize: 12.5 },
  captionBold: { fontFamily: font.bodyBold, fontSize: 11.5 },
};
// Not `as const`: fontVariant arrays above are individually narrowed with
// `as const` on the tuple itself; wrapping the whole object would make
// them deeply readonly, which conflicts with RN's mutable
// TextStyle["fontVariant"] type.

export function formatAmount(amount: number, token: string): string {
  const n = token === 'USDC' ? amount.toFixed(2) : amount.toFixed(4);
  return token === 'USDC' ? `$${n}` : `${n} SOL`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic avatar color per name/id — same input always maps to the same color. */
export function avatarColor(seed: string): string {
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length];
}

/** Coarse relative-time label ("2h ago", "3d ago") for request timestamps. */
export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
