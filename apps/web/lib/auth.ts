export const TOKEN_KEY = "higoverse_token";
export const USER_KEY = "higoverse_user";

/** Save auth after login */
export function setAuth(data: any) {
  if (typeof window === "undefined") return;

  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

/** Get token */
export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Get user */
export function getUser() {
  if (typeof window === "undefined") return null;

  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

/** Check auth */
export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(TOKEN_KEY);
}

/** Logout */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "/login";
}
