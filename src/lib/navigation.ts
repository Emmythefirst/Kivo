/**
 * The single source of truth for every screen's params. Giving
 * createNativeStackNavigator() this type (see App.tsx) is what lets a
 * screen declare a real, non-`any` Props type via NativeStackScreenProps
 * — without it, React Navigation can't tell what params a route expects,
 * and a screen with strict typing structurally stops matching what
 * Stack.Screen thinks it's handed (that's what previously broke
 * RequestScreen: the navigator didn't know "Request" required one).
 *
 * Request/ShareRequest take a plain `link` string, not a decoded
 * PaymentRequest object — a PaymentRequest embeds a PublicKey, a class
 * instance, and React Navigation warns ("non-serializable values") about
 * passing those through navigation state. Each screen already has
 * decodeLink()/encodeLink() on hand to reconstruct what it needs from the
 * link itself, so there's no reason to also thread the decoded object
 * through — same idea ShareBillScreen already uses (load by billId, not
 * by a snapshot passed in params).
 */
export type PickedRecipient = { address: string; username?: string };

export type RootStackParamList = {
  Connect: undefined;
  Home: undefined;
  Request: { link: string };
  // selectedRecipient is written by Picker/Scan navigating back to this
  // same screen instance (React Navigation merges params into the
  // existing route rather than pushing a new one) — the standard pattern
  // for "returning a value" from a pushed screen.
  New: { mode?: 'request' | 'pay' | 'split'; selectedRecipient?: PickedRecipient } | undefined;
  Picker: { mode: 'pay' | 'request' };
  Scan: { mode: 'pay' | 'request' };
  ShareRequest: { link: string; requestedFromLabel?: string };
  ClaimUsername: undefined;
  ShareBill: { billId: string };
  Activity: undefined;
};
