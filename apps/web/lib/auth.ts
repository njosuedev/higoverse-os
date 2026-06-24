export interface User {
  id: string;
  email: string;
  shop_id?: string;
  role?: string;
  name?: string;
}

export type AppRole = "CUSTOMER" | "SHOP_OWNER" | "ADMIN";

/** Derive the effective app role from user + shop activation state. */
export function getEffectiveRole(user: User | null, shopIsActive: boolean): AppRole {
  if (!user) return "CUSTOMER";
  if (user.role === "admin") return "ADMIN";
  if (shopIsActive) return "SHOP_OWNER";
  return "CUSTOMER";
}

const TOKEN_KEY = "token";
const USER_KEY = "user";

export function setAuth(data: { access_token: string; user: User }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
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

/** Clear auth data from storage without navigating (used by React auth context). */
export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.clear();
}

/** Full logout: clears storage and hard-navigates to /login. */
export function logout() {
  clearAuth();
  if (typeof window !== "undefined") window.location.replace("/login");
}

/**
 * Called by the AUTH SERVICE only when the token is genuinely invalid/expired.
 * Forces logout and redirect to login.
 */
export function handleUnauthorized() {
  logout();
}

