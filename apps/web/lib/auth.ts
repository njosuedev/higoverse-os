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

/** A yes/no "signed in on this browser" flag (never the token): it lets the
 *  server show the dashboard at higoverse.com/ to people signed in, and the
 *  public home page to everyone else, search engines included (proxy.ts). */
export const SIGNED_IN_COOKIE = "hgv_signed_in";

export function markSignedIn(on: boolean) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on
    ? `${SIGNED_IN_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    : `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function hasSignedInCookie(): boolean {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith(`${SIGNED_IN_COOKIE}=1`));
}

const TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user";

export function setAuth(data: { access_token: string; refresh_token?: string; user: User }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  markSignedIn(true);
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

// Device preferences that aren't tied to an account survive sign-out:
// the language, the Vehicles list/cards view and the appearance (theme).
const KEEP_ON_SIGN_OUT = new Set(["app_lang", "hgv_vehicle_view", "hgv_theme"]);

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
  markSignedIn(false);
}
