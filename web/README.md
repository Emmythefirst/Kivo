# Kivo web fallback

Phase 5 of the project brief: a small standalone page for people who tap a
Kivo request link but don't have the app installed. Same link format as
the app (`?i=...&to=...&a=...&t=...&c=...&u=...&m=...&b=...`), decoded the
same way, connects to any injected Solana wallet (Phantom, Solflare) in
the browser, and pays with the same on-chain replay protection the mobile
app uses (`mark_paid`, same deployed program).

This is a **plain static file** — `index.html` has everything inlined
(styles, JS, wallet logic). No build step, no bundler, no dependencies to
install. It loads `@solana/web3.js` and `@solana/spl-token` as ES modules
directly from jsdelivr at runtime.

## Deploying it

Any static host works. A few free options:

**Vercel** (recommended, fastest):
```bash
npm i -g vercel
cd web
vercel --prod
```

**Netlify**: drag-and-drop the `web/` folder at https://app.netlify.com/drop,
or `netlify deploy --prod --dir=web` with the Netlify CLI.

**GitHub Pages**: push this repo, enable Pages on the `web/` folder (or a
`gh-pages` branch containing its contents) in the repo's Settings.

Whichever you pick, once it's live at some URL, either:
- Point `kivo.app`'s DNS at it (if you register that domain), and update
  `LINK_HOST` in `src/lib/requests.ts` and `app.json`'s intent filter
  `host` to match if it's ever different from `kivo.app`, **or**
- Just use whatever URL the host gives you (e.g. `kivo.vercel.app`) as
  `LINK_HOST` instead — the app doesn't require a custom domain to work,
  only App Links auto-verification (below) benefits from one you control.

## Enabling real App Links (optional but recommended before a public demo)

Right now, tapping a Kivo link with the app installed still works (Android
matches the `https://kivo.app/r*` intent filter in `app.json` and opens
Kivo directly) **only after** Android has verified domain ownership via
`assetlinks.json`. Until that file is live and correctly signed, Android
falls back to opening a browser for everyone — including people who do
have the app — which is exactly this web fallback page, so the demo still
works either way. But for the intended "app opens directly" experience:

1. Get your release keystore's SHA-256 fingerprint:
   ```bash
   keytool -list -v -keystore release.keystore -alias kivo
   ```
2. Paste it into `.well-known/assetlinks.json` in this folder, replacing
   the placeholder.
3. Deploy so that file is reachable at exactly
   `https://<your-domain>/.well-known/assetlinks.json` (most static hosts
   serve dotfolders correctly by default; verify after deploying).
4. Android checks this automatically — no separate submission step. Given
   Android's verification cache, a fresh install or a few minutes' wait
   may be needed to see it take effect.

## Known limitations, on purpose

- **Public devnet RPC**, not a dedicated one. The mobile app uses a private
  Helius endpoint (`WalletProvider.tsx`) that can't be embedded here — a
  private RPC key in this page's client-side JS would be visible to
  anyone viewing source. This page accepts the public endpoint's known
  congestion as a fallback-page tradeoff; if it matters for a demo,
  either route this page's RPC calls through your own proxy, or just
  don't rely on the web fallback path for the primary demo (the brief's
  own stance: the mobile-to-mobile loop is what's actually judged).
- **No QR code, no username claim UI, no bill/split composer, no recent
  contacts, no reminders.** This page's only job is: receive a link,
  connect a wallet, pay it, with the same on-chain guarantees. Everything
  else lives in the app.
