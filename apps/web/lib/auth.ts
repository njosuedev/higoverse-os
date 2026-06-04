export interface User {
  id: string;
  email: string;
  shop_id: string;
  role?: string;
}

const TOKEN_KEY = "token";
const USER_KEY = "user";

/* SAVE LOGIN */
export function setAuth(data: { access_token: string; user: User }) {
  if (typeof window === "undefined") return;

  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

/* GET TOKEN */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/* GET USER */
export function getUser(): User | null {
  if (typeof window === "undefined") return null;

  const user = localStorage.getItem(USER_KEY);
  if (!user) return null;

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

/* CHECK AUTH */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/* API HEADERS */
export function getAuthHeaders(): HeadersInit {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* LOGOUT */
export function logout() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  window.location.href = "/login";
}