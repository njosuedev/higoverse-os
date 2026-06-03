const TOKEN_KEY = "higoverse_token";
const USER_KEY = "higoverse_user";

// --------------------
// SAVE LOGIN DATA
// --------------------
export function setAuth(data: any) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

// --------------------
// LOGOUT
// --------------------
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = "/login";
}

// --------------------
// CHECK AUTH
// --------------------
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(TOKEN_KEY);
}

// --------------------
// GET USER
// --------------------
export function getUser() {
  if (typeof window === "undefined") return null;

  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

// --------------------
// GET TOKEN
// --------------------
export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
