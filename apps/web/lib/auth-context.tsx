"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearAuth, getRefreshToken, getToken, getUser, setAuth as persistAuth, type User } from "./auth";
import { sendOffline } from "./shop-api";
import { SESSION_EVENT, warmSession } from "./session";
import { AUTH_API as AUTH_URL } from "@/lib/api-config";


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
    let currentUserId = getUser()?.id ?? null;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== "token" && e.key !== "user") return;
      const next = getUser();
      if (!getToken() || !next) {
        // Signed out in another tab: this tab still holds that account's data
        // in memory, so reload rather than just switching the UI.
        if (window.location.pathname !== "/login") window.location.replace("/login");
        return;
      }
      if (currentUserId && next.id !== currentUserId) {
        // A different account signed in elsewhere — start over with its data.
        window.location.reload();
        return;
      }
      currentUserId = next.id;
      sync(); // same account, e.g. a token refreshed in another tab
    };
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const login = useCallback((data: { access_token: string; refresh_token?: string; user: User }) => {
    // Start the new session clean: drop anything a previous account left
    // behind (e.g. its session expired instead of signing out).
    clearAuth();
    persistAuth(data); // writes to localStorage
    setState({ user: data.user, token: data.access_token, ready: true });
  }, []);

  const updateUser = useCallback((data: { access_token: string; refresh_token?: string; user: User }) => {
    persistAuth(data);
    setState((s) => ({ ...s, user: data.user, token: data.access_token }));
  }, []);

  const logout = useCallback(() => {
    // Send offline signal first — token is still in localStorage at this point.
    // keepalive lets both requests finish even though the page reloads below.
    sendOffline();
    // Best-effort server-side revocation of the refresh token — don't block
    // the UI on it, and don't fail logout if the network call fails.
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      fetch(`${AUTH_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        keepalive: true,
      }).catch(() => {});
    }
    clearAuth(); // tokens, user and any cached business data in storage
    setState({ user: null, token: null, ready: true });
    // A full reload (not a client-side route change) drops every in-memory
    // cache — dashboard queries, the shop profile, settings — so the next
    // account starts from nothing.
    window.location.replace("/login");
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
