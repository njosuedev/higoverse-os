import { clearAuth, getRefreshToken, getToken, setAuth } from "@/lib/auth";
import { AUTH_API } from "@/lib/api-config";

// Access tokens live 60 minutes; the refresh token lives 30 days and is
// single-use (the server rotates it on every /auth/refresh). Every API client
// goes through authFetch so an expired access token is renewed silently
// instead of logging the user out — or worse, making their data look empty.


/** Fired on window whenever the stored session changes (refresh or expiry). */
export const SESSION_EVENT = "hgv-session-changed";

// Renew a little before the server would reject the token.
const EXPIRY_SKEW_MS = 60_000;

function tokenExpiry(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isExpired(token: string, skewMs = 0): boolean {
  const exp = tokenExpiry(token);
  return exp !== null && exp - skewMs <= Date.now();
}

/** The session is definitively over: clear it and send the user to sign in,
 *  with a notice explaining why. */
export function expireSession() {
  if (typeof window === "undefined") return;
  clearAuth();
  window.dispatchEvent(new Event(SESSION_EVENT));
  if (window.location.pathname !== "/login") {
    const next = window.location.pathname + window.location.search;
    window.location.replace(`/login?expired=1&next=${encodeURIComponent(next)}`);
  }
}

let inflight: Promise<string | null> | null = null;

async function runRefresh(staleToken: string | null): Promise<string | null> {
  // Another tab (or an earlier call) may already have renewed the token.
  const current = getToken();
  if (current && current !== staleToken && !isExpired(current, EXPIRY_SKEW_MS)) return current;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  let res: Response;
  try {
    res = await fetch(`${AUTH_API}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return null; // offline / server unreachable — keep the session, try again later
  }

  if (res.status === 401 || res.status === 403) {
    // A different tab may have rotated the refresh token while we were waiting.
    if (getRefreshToken() !== refreshToken && getToken()) return getToken();
    expireSession();
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data?.access_token) return null;
  setAuth(data);
  window.dispatchEvent(new Event(SESSION_EVENT));
  return data.access_token as string;
}

/** Renew the access token. Concurrent callers share one request, and tabs are
 *  serialised with a Web Lock so they don't burn each other's single-use
 *  refresh token. Resolves to null when no renewal was possible. */
export function refreshAccessToken(staleToken: string | null): Promise<string | null> {
  if (inflight) return inflight;
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const run: Promise<string | null> = locks
    ? (locks.request("hgv-auth-refresh", () => runRefresh(staleToken)) as unknown as Promise<string | null>)
    : runRefresh(staleToken);
  const shared = run.finally(() => { inflight = null; });
  inflight = shared;
  return shared;
}

/** fetch() with the bearer token attached, renewed before expiry and retried
 *  once after a 401. Callers keep their own handling of the final response. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token = getToken();
  if (token && isExpired(token, EXPIRY_SKEW_MS) && getRefreshToken()) {
    token = (await refreshAccessToken(token)) ?? getToken();
  }

  const send = (t: string | null) => {
    const headers = new Headers(init.headers);
    if (t) headers.set("Authorization", `Bearer ${t}`);
    else headers.delete("Authorization");
    return fetch(input, { ...init, headers });
  };

  let res = await send(token);
  if (res.status === 401 && token) {
    const fresh = await refreshAccessToken(token);
    if (fresh) res = await send(fresh);
    // Expired token and no way to renew it: the session is over. A 401 with a
    // still-valid token is left to the caller (e.g. accounts without a shop).
    else if (isExpired(token) && getToken() === token) expireSession();
  }
  return res;
}

/** Renew in the background on app start if the stored token has lapsed, so
 *  the first screen after reopening the app doesn't wait on a 401 round-trip. */
export function warmSession() {
  const token = getToken();
  if (token && isExpired(token, EXPIRY_SKEW_MS) && getRefreshToken()) {
    void refreshAccessToken(token);
  }
}
