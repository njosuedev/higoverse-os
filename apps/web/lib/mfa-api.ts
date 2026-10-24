import { authFetch } from "@/lib/session";
import { AUTH_API } from "@/lib/api-config";
import { setAuth } from "@/lib/auth";

// Two-step sign-in for the platform admin (auth-service app/api/v1/mfa.py).

async function call(path: string, body?: unknown) {
  const res = await authFetch(`${AUTH_API}/api/v1/auth/mfa${path}`, {
    method: body === undefined && path === "/status" ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : `Error ${res.status}`);
  return data;
}

export async function mfaStatus(): Promise<{ enabled: boolean; recovery_left: number }> {
  return (await call("/status")).data;
}

export async function mfaSetup(): Promise<{ secret: string; otpauth_uri: string }> {
  return (await call("/setup", {})).data;
}

/** Turns it on; returns the recovery codes. Other sessions end, this one is renewed. */
export async function mfaEnable(code: string): Promise<string[]> {
  const data = await call("/enable", { code });
  if (data?.access_token && data?.refresh_token && data?.user) setAuth(data);
  return data.data.recovery_codes;
}

export async function mfaDisable(password: string, code: string): Promise<void> {
  await call("/disable", { password, code });
}
