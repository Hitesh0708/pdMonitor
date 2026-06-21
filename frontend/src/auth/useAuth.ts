"use client";

import { useCallback, useEffect, useState } from "react";
import { getLastDPs } from "@/services/iosenseClient";
import { allDevSensorPairs } from "@/config/pdLocations";

/**
 * Resolves the IOsense JWT for the dashboard.
 *
 * Resolve order:
 *   1. `?token=` in the URL → exchange via validateSSOToken (deployed / portal path), store, clean URL.
 *   2. existing `localStorage.bearer_token`.
 *   3. dev fallback → `/api/dev-token` (returns env JWT in development only).
 *
 * If none resolve, `token` stays null with no error → the UI shows a TokenGate
 * so the user can paste a token manually (local / undeployed use). When deployed,
 * the portal supplies `?token=` so the gate never appears.
 */

const TOKEN_KEY = "bearer_token";
const SSO_RE = /^[0-9a-f]{64}$/i;

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function storeToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function validateSSOToken(ssoToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://connector.iosense.io/api/retrieve-sso-token/${ssoToken}`, {
      method: "GET",
      headers: { organisation: "https://iosense.io", "ngsw-bypass": "true", "Content-Type": "application/json" },
    });
    const data = await res.json();
    return data?.success && data?.token ? (data.token as string) : null;
  } catch {
    return null;
  }
}

/**
 * Turn a user-pasted value into a usable Bearer token.
 * Accepts either a one-time SSO token (64-char hex → exchanged) or a JWT/Bearer
 * (used directly after a lightweight validation call).
 */
export async function resolveInputToBearer(input: string): Promise<{ token?: string; error?: string }> {
  const raw = input.trim();
  if (!raw) return { error: "Please paste a token." };

  if (SSO_RE.test(raw)) {
    const bearer = await validateSSOToken(raw);
    if (!bearer) return { error: "That SSO token is invalid or expired (they last ~60s). Generate a fresh one and paste it quickly." };
    return { token: bearer };
  }

  // Treat as a JWT / Bearer token. Normalize the prefix for consistent storage.
  const bearer = /^bearer\s/i.test(raw) ? raw : `Bearer ${raw}`;
  try {
    await getLastDPs(bearer, [allDevSensorPairs()[0]]); // ping to validate
    return { token: bearer };
  } catch {
    return { error: "That token was rejected by IOsense. Check it (or paste a fresh SSO token) and try again." };
  }
}

async function fetchDevToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/dev-token", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.token || null;
  } catch {
    return null;
  }
}

export interface AuthState {
  token: string | null;
  loading: boolean;
  error: string | null;
  /** Apply a Bearer token resolved by the TokenGate (stores + activates it). */
  setToken: (bearer: string) => void;
}

export function useAuth(): AuthState {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setToken = useCallback((bearer: string) => {
    storeToken(bearer);
    setError(null);
    setTokenState(bearer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // 1. SSO token in URL (deployed / portal path).
      const params = new URLSearchParams(window.location.search);
      const sso = params.get("token");
      if (sso) {
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState({}, "", url.toString());
        const bearer = await validateSSOToken(sso);
        if (cancelled) return;
        if (bearer) {
          storeToken(bearer);
          setTokenState(bearer);
        } else {
          // Portal token failed — let the user paste one instead of dead-ending.
          setError("The portal sign-in link was invalid or expired. Paste a token below to continue.");
        }
        setLoading(false);
        return;
      }

      // 2. Existing stored token.
      const stored = getStoredToken();
      if (stored) {
        setTokenState(stored);
        setLoading(false);
        return;
      }

      // 3. Dev fallback (development only).
      const dev = await fetchDevToken();
      if (cancelled) return;
      if (dev) {
        storeToken(dev);
        setTokenState(dev);
      }
      // No token anywhere → leave token null (no error); the TokenGate will prompt.
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return { token, loading, error, setToken };
}
