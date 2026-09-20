import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import * as wallet from './wallet';

type Ctx = {
  session: wallet.WalletSession | null;
  connection: Connection;
  connecting: boolean;
  ready: boolean; // restore() has finished — avoids onboarding flash
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<Ctx | null>(null);

// The public devnet RPC (clusterApiUrl('devnet')) is shared and frequently
// congested/rate-limited — flaky enough to break payments mid-demo. Prefer
// a dedicated endpoint (e.g. Helius) via EXPO_PUBLIC_DEVNET_RPC_URL in
// .env, falling back to the public one if it isn't set.
const DEVNET_RPC_URL =
  process.env.EXPO_PUBLIC_DEVNET_RPC_URL || clusterApiUrl('devnet');
const connection = new Connection(DEVNET_RPC_URL, 'confirmed');

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<wallet.WalletSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wallet
      .restore()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, []);

  const doConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      setSession(await wallet.connect());
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      // The common case here is no MWA-compatible wallet installed.
      setError(
        raw.includes('no installed wallet')
          ? 'No Solana wallet found. Install Phantom or Solflare first.'
          : `Connection cancelled.\n\n(${raw})`,
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const doDisconnect = useCallback(async () => {
    await wallet.disconnect();
    setSession(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        session,
        connection,
        connecting,
        ready,
        error,
        connect: doConnect,
        disconnect: doDisconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): Ctx {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
