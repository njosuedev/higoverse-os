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
localStorage.setItem(TOKEN_KEY, data.access_token);
localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function getToken(): string | null {
if (typeof window === "undefined") return null;

return localStorage.getItem(TOKEN_KEY);
}

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

export function isAuthenticated(): boolean {
return !!getToken();
}

export function getAuthHeaders(): HeadersInit {
const token = getToken();

return {
Authorization: `Bearer ${token}`,
"Content-Type": "application/json",
};
}

export function logout() {
localStorage.removeItem(TOKEN_KEY);
localStorage.removeItem(USER_KEY);

window.location.replace("/login");
}

export function requireAuth() {
if (!isAuthenticated()) {
window.location.replace("/login");
}
}
