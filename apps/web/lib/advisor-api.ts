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

export async function sendChat(
  message: string,
  conversationId: string | null,
  language: string,
): Promise<ChatResponse> {
  return advisorRequest("/advisor/chat", {
    method: "POST",
    body: JSON.stringify({ message, conversation_id: conversationId, language }),
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
