"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearAuth, getToken, getUser, setAuth as persistAuth, type User } from "./auth";
import { sendOffline } from "./shop-api";

interface AuthState {
  user: User | null;
  token: string | null;
  /** false until localStorage has been read (avoids SSR→client mismatch) */
  ready: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: { access_token: string; user: User }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  ready: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, ready: false });

  // Hydrate from localStorage once on the client — runs after first render only
  useEffect(() => {
    setState({ user: getUser(), token: getToken(), ready: true });
  }, []);

  const login = useCallback((data: { access_token: string; user: User }) => {
    persistAuth(data); // writes to localStorage
    setState({ user: data.user, token: data.access_token, ready: true });
  }, []);

  const logout = useCallback(() => {
    // Send offline signal first — token is still in localStorage at this point
    sendOffline();
    clearAuth(); // removes from localStorage
    setState({ user: null, token: null, ready: true });
    // Navigation is handled by AuthGuard reacting to user becoming null
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
