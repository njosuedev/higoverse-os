"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearAuth, getRefreshToken, getToken, getUser, setAuth as persistAuth, type User } from "./auth";
import { sendOffline } from "./shop-api";
import { SESSION_EVENT, warmSession } from "./session";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_API || "https://auth-esys.vercel.app";

interface AuthState {
  user: User | null;
  token: string | null;
  /** false until localStorage has been read (avoids SSR→client mismatch) */
  ready: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: { access_token: string; refresh_token?: string; user: User }) => void;
  logout: () => void;
  updateUser: (data: { access_token: string; refresh_token?: string; user: User }) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  ready: false,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, ready: false });

  // Hydrate from localStorage once on the client — runs after first render only
  useEffect(() => {
    setState({ user: getUser(), token: getToken(), ready: true });
    warmSession();

    // Stay in sync with token refreshes/expiry from authFetch, and with
    // sign-in/sign-out in other tabs (the "storage" event).
    const sync = () => setState({ user: getUser(), token: getToken(), ready: true });
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "token" || e.key === "user") sync();
    };
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const login = useCallback((data: { access_token: string; refresh_token?: string; user: User }) => {
    persistAuth(data); // writes to localStorage
    setState({ user: data.user, token: data.access_token, ready: true });
  }, []);

  const updateUser = useCallback((data: { access_token: string; refresh_token?: string; user: User }) => {
    persistAuth(data);
    setState((s) => ({ ...s, user: data.user, token: data.access_token }));
  }, []);

  const logout = useCallback(() => {
    // Send offline signal first — token is still in localStorage at this point
    sendOffline();
    // Best-effort server-side revocation of the refresh token — don't block
    // the UI on it, and don't fail logout if the network call fails.
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      fetch(`${AUTH_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    clearAuth(); // removes from localStorage
    setState({ user: null, token: null, ready: true });
    // Navigation is handled by AuthGuard reacting to user becoming null
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
