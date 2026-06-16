export interface User {
  id: string;
  email: string;
  shop_id: string;
  role?: string;
}

const TOKEN_KEY = "token";
const USER_KEY = "user";

export function setAuth(data: {
  access_token: string;
  user: User;
}) {
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

// Decode JWT payload (no signature verification — only for expiry UX check)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    // Convert base64url → base64 and pad to multiple of 4
    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(base64Url.length + (4 - (base64Url.length % 4)) % 4, "=");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false; // if we can't decode, don't force logout
  return Date.now() / 1000 > payload.exp;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token || !getUser()) return false;
  if (isTokenExpired(token)) return false; // let the caller / AuthGuard handle the redirect
  return true;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token && {
      Authorization: `Bearer ${token}`,
    }),
  };
}

export function logout() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.clear();

  window.location.replace("/login");
}

// Call this in API clients when backend returns 401
export function handleUnauthorized() {
  logout();
}