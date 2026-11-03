// Pure helpers for read-only task shares, review badges and team notices.
export const SHARE_DAYS = [1, 7, 30] as const;

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function shareActive(s: { expires_at: string; revoked_at: string | null }, now = Date.now()): boolean {
  return !s.revoked_at && new Date(s.expires_at).getTime() > now;
}

type Msg = { role?: string; content?: unknown };
function textOf(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text ?? "") : "")).join("\n");
  return "";
}

/** Snapshot taken at share time: only the task title, the user's requests and the agent's final reply. Never secrets, files or env. */
export function buildSnapshot(title: string, messages: unknown, includeRepo: string | null) {
  const list = (Array.isArray(messages) ? messages : []) as Msg[];
  const prompts = list.filter((m) => m.role === "user").map((m) => textOf(m.content).trim()).filter((t) => t && !t.startsWith("[")).slice(-5).map((t) => t.slice(0, 1500));
  const reply = [...list].reverse().find((m) => m.role === "assistant" && textOf(m.content).trim());
  return { title: title.slice(0, 200), repo: includeRepo, prompts, reply: reply ? textOf(reply.content).trim().slice(0, 8000) : "" };
}

export type Badge = "reviewed" | "changes_requested" | "unreviewed" | "checks_passed" | "checks_blocked";
export function reviewBadges(latestVerdict: string | null, verification: { status: string }[]): Badge[] {
  const out: Badge[] = [latestVerdict === "approved" ? "reviewed" : latestVerdict === "changes_requested" ? "changes_requested" : "unreviewed"];
  const latest = verification[0];
  if (latest?.status === "passed") out.push("checks_passed");
  else if (latest && latest.status === "failed") out.push("checks_blocked");
  return out;
}

/** Only Slack and Microsoft Teams incoming webhooks are accepted, to prevent posting to arbitrary hosts. */
export function validWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return u.hostname === "hooks.slack.com" || /(^|\.)webhook\.office\.com$/.test(u.hostname) || /\.logic\.azure\.com$/.test(u.hostname);
  } catch { return false; }
}
