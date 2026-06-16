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

  console.log("Auth saved:", {
    token: data.access_token,
    user: data.user,
  });
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
  } catch (error) {
    console.error("Failed to parse user:", error);
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) return null;

    const base64Url = parts[1];

    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");

    return JSON.parse(atob(base64));
  } catch (error) {
    console.error("JWT decode failed:", error);
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    console.warn("Could not decode token");
    return false;
  }

  const exp = payload.exp;

  if (typeof exp !== "number") {
    console.warn("Token has no exp field");
    return false;
  }

  const expired = Date.now() / 1000 > exp;

  console.log("Token expiry:", {
    exp,
    now: Date.now() / 1000,
    expired,
  });

  return expired;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  const user = getUser();

  console.log("Auth Check", {
    tokenExists: !!token,
    user,
  });

  if (!token) {
    console.warn("No token found");
    return false;
  }

  if (!user) {
    console.warn("No user found");
    return false;
  }

  if (isTokenExpired(token)) {
    console.warn("Token expired");
    return false;
  }

  return true;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };
}

export function logout() {
  if (typeof window === "undefined") return;

  console.log("Logging out...");

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.clear();

  window.location.replace("/login");
}

export function handleUnauthorized() {
  logout();
}