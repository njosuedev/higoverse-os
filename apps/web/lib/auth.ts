export function setAuth(data: any) {
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

export function getUser() {
  if (typeof window === "undefined") return null;
  return JSON.parse(localStorage.getItem("user") || "null");
}

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("token");
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}
