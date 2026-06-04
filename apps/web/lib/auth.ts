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

export function isAuthenticated(): boolean {
  return !!getToken() && !!getUser();
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