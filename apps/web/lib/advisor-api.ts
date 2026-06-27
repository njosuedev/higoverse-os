import { getToken, handleUnauthorized } from "@/lib/auth";

const ADVISOR_API =
  process.env.NEXT_PUBLIC_API_ADVISOR || "https://higoverse-advisor.onrender.com";

async function advisorRequest(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${ADVISOR_API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.parse(text)?.detail ?? text; } catch {}
    const err: any = new Error(detail || `Advisor API error ${res.status}`);
    err.status = res.status;
    throw err;
  }

  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  language: string;
  created_at: string;
}

export interface ChatResponse {
  reply: string;
  conversation_id: string;
  message_id: string;
  language: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** Fire-and-forget ping to warm up the Render instance before the user types. */
export async function pingAdvisor(): Promise<void> {
  try {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(`${ADVISOR_API}/health`, { headers, signal: AbortSignal.timeout(8000) });
  } catch { /* ignore — this is best-effort */ }
}

export async function sendChat(
  message: string,
  conversationId: string | null,
  language: string,
  userName?: string,
): Promise<ChatResponse> {
  return advisorRequest("/advisor/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      language,
      ...(userName ? { user_name: userName } : {}),
    }),
  });
}

export async function getConversations(): Promise<Conversation[]> {
  const data = await advisorRequest("/advisor/conversations");
  return (data?.data ?? []) as Conversation[];
}

export async function getMessages(convId: string): Promise<ChatMessage[]> {
  const data = await advisorRequest(`/advisor/conversations/${convId}/messages`);
  return (data?.data ?? []) as ChatMessage[];
}

export async function deleteConversation(convId: string) {
  return advisorRequest(`/advisor/conversations/${convId}`, { method: "DELETE" });
}
