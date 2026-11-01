"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createWalletClient, custom, getAddress, type Address } from "viem";
import { messages, translate, type Language, type MessageKey } from "./messages";
import "./portal.css";

type Role = "user" | "agent" | "reviewer" | "admin";
export type PortalSession = { profileId: string; walletAddress: Address; role: Role };

type InjectedWallet = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type PortalContextValue = {
  session: PortalSession | null;
  sessionLoading: boolean;
  working: boolean;
  authError: string | null;
  language: Language;
  lastSignInAt: string | null;
  t: (key: MessageKey) => string;
  setLanguage: (language: Language) => void;
  connectWallet: () => Promise<void>;
  signOut: () => Promise<void>;
};

const PortalContext = createContext<PortalContextValue | null>(null);
const LANGUAGE_KEY = "celoht.portal.language";

export class PortalApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function portalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json() as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new PortalApiError(response.status, payload.error?.message ?? "The request could not be completed.");
  }
  return payload.data as T;
}

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContext);
  if (!context) throw new Error("usePortal must be used inside PortalShell.");
  return context;
}

export function PortalShell({ active, children }: { active: "profile" | "admin"; children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<Language>("en");
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);

  useEffect(() => {
    let activeEffect = true;
    const storedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
    if (storedLanguage && storedLanguage in messages) setLanguageState(storedLanguage as Language);
    void portalRequest<PortalSession>("/auth/session").then((value) => {
      if (activeEffect) setSession(value);
    }).catch((error: unknown) => {
      if (activeEffect && (!(error instanceof PortalApiError) || error.status !== 401)) {
        setAuthError(error instanceof Error ? error.message : "Session status is unavailable.");
      }
    }).finally(() => {
      if (activeEffect) setSessionLoading(false);
    });
    return () => { activeEffect = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!session) {
      setLastSignInAt(null);
      return;
    }
    setLastSignInAt(window.localStorage.getItem(`celoht.portal.last-sign-in.${session.walletAddress.toLowerCase()}`));
  }, [session]);

  function setLanguage(languageValue: Language) {
    setLanguageState(languageValue);
    window.localStorage.setItem(LANGUAGE_KEY, languageValue);
  }

  async function connectWallet() {
    const provider = (window as Window & { ethereum?: InjectedWallet }).ethereum;
    if (!provider) {
      setAuthError("No injected wallet was found.");
      return;
    }
    setWorking(true);
    setAuthError(null);
    try {
      const client = createWalletClient({ transport: custom(provider as never) });
      const [injectedAddress] = await client.requestAddresses();
      if (!injectedAddress) throw new Error("The wallet did not return an account.");
      const walletAddress = getAddress(injectedAddress);
      const challenge = await portalRequest<{ message: string; nonce: string }>("/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
      });
      const signature = await client.signMessage({ account: walletAddress, message: challenge.message });
      await portalRequest<{ profileId: string; walletAddress: Address }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ walletAddress, nonce: challenge.nonce, signature }),
      });
      const verifiedSession = await portalRequest<PortalSession>("/auth/session");
      const signInAt = new Date().toISOString();
      window.localStorage.setItem(`celoht.portal.last-sign-in.${walletAddress.toLowerCase()}`, signInAt);
      setLastSignInAt(signInAt);
      setSession(verifiedSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Wallet sign-in could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    setWorking(true);
    try {
      await portalRequest<{ loggedOut: boolean }>("/auth/logout", { method: "POST" });
      setSession(null);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-out could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  const contextValue: PortalContextValue = {
    session,
    sessionLoading,
    working,
    authError,
    language,
    lastSignInAt,
    t: (key) => translate(language, key),
    setLanguage,
    connectWallet,
    signOut,
  };

  return (
    <PortalContext.Provider value={contextValue}>
      <div className="portal-shell">
        <header className="portal-header">
          <Link className="portal-brand" href="/profile" aria-label="CeloHT profile">CELO<span>HT</span></Link>
          <nav className="portal-nav" aria-label="Account navigation">
            <Link href="/profile" aria-current={active === "profile" ? "page" : undefined}>{translate(language, "profile")}</Link>
            {(session?.role === "admin" || session?.role === "reviewer") && <Link href="/admin" aria-current={active === "admin" ? "page" : undefined}>{translate(language, "administration")}</Link>}
          </nav>
          <div className="portal-controls">
            <label className="portal-language">
              <span>{translate(language, "language")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={translate(language, "language")}>
                <option value="ht">Kreyòl</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
              </select>
            </label>
            {session ? (
              <button className="portal-signin" onClick={() => void signOut()} disabled={working} title={`${translate(language, "authenticatedAs")}: ${session.walletAddress}`}>
                {session.walletAddress.slice(0, 6)}…{session.walletAddress.slice(-4)}
                <span>{translate(language, "disconnect")}</span>
              </button>
            ) : (
              <button className="portal-signin" onClick={() => void connectWallet()} disabled={working || sessionLoading}>
                {working ? translate(language, "connecting") : translate(language, "connectWallet")}
              </button>
            )}
          </div>
        </header>
        {authError && <p className="portal-alert" role="alert">{authError}</p>}
        <main className="portal-main">{children}</main>
      </div>
    </PortalContext.Provider>
  );
}