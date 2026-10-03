export interface User {
  id: string;
  email: string;
  shop_id?: string;
  role?: string;
  name?: string;
  permissions?: string[];
}

export type AppRole = "GUEST" | "SHOP_OWNER" | "ADMIN";

/** Derive the effective app role from the logged-in user. Every authenticated
 *  user gets full dashboard access — there is no shop-application approval gate. */
export function getEffectiveRole(user: User | null): AppRole {
  if (!user) return "GUEST";
  if (user.role === "admin") return "ADMIN";
  return "SHOP_OWNER";
}

const TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";

export function setAuth(data: { access_token: string; refresh_token?: string; user: User }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!(getToken() && getUser());
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Device preferences that aren't tied to an account survive sign-out.
const KEEP_ON_SIGN_OUT = new Set(["app_lang"]);

/** Remove everything this account left in the browser — tokens, the stored
 *  user, and any cached business data (e.g. the old `hgv_dash_*` dashboard
 *  snapshot) — so the next person to sign in on this device sees nothing of
 *  it. Server-side data is never touched. Callers reload the page afterwards
 *  to drop in-memory caches too. */
export function clearAuth() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!KEEP_ON_SIGN_OUT.has(key)) localStorage.removeItem(key);
    }
  } catch { /* storage unavailable (private mode) — nothing to clear */ }
  try { sessionStorage.clear(); } catch { /* same */ }
}
