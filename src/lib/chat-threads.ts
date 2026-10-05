import type { ChatMessage } from "./types";

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
};

function asMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "");
    const role = o.role === "assistant" ? "assistant" : o.role === "user" ? "user" : "";
    const content = String(o.content ?? "").slice(0, 4000);
    if (!id || !role || !content) continue;
    out.push({ id, role, content, createdAt: String(o.createdAt ?? "") });
    if (out.length >= 40) break;
  }
  return out;
}

export function parseChatThreads(raw: unknown): ChatThread[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatThread[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "");
    const messages = asMessages(o.messages);
    if (!id || !messages.length) continue;
    const title = String(o.title || messages.find((m) => m.role === "user")?.content || "Conversación").slice(0, 80);
    out.push({ id, title, updatedAt: String(o.updatedAt ?? ""), messages });
    if (out.length >= 20) break;
  }
  return out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function threadFromMessages(id: string, messages: ChatMessage[], updatedAt = ""): ChatThread | null {
  if (!id || !messages.length) return null;
  const title = (messages.find((m) => m.role === "user")?.content || "Conversación").slice(0, 80);
  return { id, title, updatedAt: updatedAt || messages.at(-1)?.createdAt || "", messages: messages.slice(-40) };
}

export function upsertThread(threads: ChatThread[], thread: ChatThread): ChatThread[] {
  return [thread, ...threads.filter((t) => t.id !== thread.id)].slice(0, 20);
}

export function mergeChatThreads(local: ChatThread[], remote: ChatThread[]): ChatThread[] {
  const map = new Map<string, ChatThread>();
  for (const t of remote) map.set(t.id, t);
  for (const t of local) {
    const prev = map.get(t.id);
    if (!prev || (t.updatedAt || "") >= (prev.updatedAt || "")) map.set(t.id, t);
  }
  return [...map.values()].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 20);
}
