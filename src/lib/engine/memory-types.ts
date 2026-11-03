// Six-tier memory model (handbook §7). Working memory lives in run state/checkpoints, not the table.
export const MEMORY_TYPES = ["episodic", "semantic", "procedural", "project", "preference"] as const;
export type StoredMemoryType = (typeof MEMORY_TYPES)[number];
/** Legacy categories kept readable; both are episodic in the UAF model. */
export const LEGACY_TYPES = { decision: "episodic", error: "episodic" } as const;
export type MemoryCategory = StoredMemoryType | keyof typeof LEGACY_TYPES;

export const MEMORY_RETENTION: Record<StoredMemoryType | "working", string> = {
  working: "Task lifetime; checkpoint on interruption.",
  episodic: "Useful scoped summaries of outcomes/errors/decisions; expire when stale.",
  semantic: "Validated facts; review when source changes or confidence decays.",
  procedural: "Reusable workflows; promote only after repeated validation.",
  project: "Architecture, conventions, dependencies; revalidate against the repository.",
  preference: "Explicit user preferences; user-controlled.",
};

/** Default expiry in days (null = no automatic expiry). */
export const DEFAULT_TTL_DAYS: Record<StoredMemoryType, number | null> = {
  episodic: 90, semantic: 180, procedural: null, project: null, preference: null,
};

export type MemoryRow = {
  id?: string; category: string; content: string; updated_at: string;
  confidence?: number | null; status?: string | null; expires_at?: string | null; validated_at?: string | null; source_ref?: string | null;
};

const SECRET = /(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,}|eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|\b(password|api[_-]?key|secret|token)\s*[:=]\s*\S{6,})/i;

export type MemoryDecision = { verdict: "STORE" | "REJECT"; reason: string; expiresAt: string | null };

/** Memory-write review (prompt J) enforced in code: credentials and low-confidence claims are rejected. */
export function reviewMemory(c: { category: MemoryCategory; content: string; confidence: number }, now = Date.now()): MemoryDecision {
  if (SECRET.test(c.content)) return { verdict: "REJECT", reason: "looks like a credential or secret", expiresAt: null };
  if (c.content.trim().length < 3) return { verdict: "REJECT", reason: "empty", expiresAt: null };
  const type = normalizeType(c.category);
  if (type === "procedural" && c.confidence < 0.8) return { verdict: "REJECT", reason: "procedural lessons need confidence ≥ 0.8 (repeated validation)", expiresAt: null };
  if (c.confidence < 0.3) return { verdict: "REJECT", reason: "confidence too low; unverified claims are not stored", expiresAt: null };
  const ttl = DEFAULT_TTL_DAYS[type];
  return { verdict: "STORE", reason: "ok", expiresAt: ttl ? new Date(now + ttl * 86_400_000).toISOString() : null };
}

export function normalizeType(c: string): StoredMemoryType {
  return (LEGACY_TYPES as Record<string, StoredMemoryType>)[c] ?? ((MEMORY_TYPES as readonly string[]).includes(c) ? (c as StoredMemoryType) : "episodic");
}

/** Retrieval filter: only active, unexpired memories reach the model. */
export function liveMemories<T extends MemoryRow>(rows: T[], now = Date.now()): T[] {
  return rows.filter((m) => (m.status ?? "active") === "active" && (!m.expires_at || Date.parse(m.expires_at) > now));
}

/** Provenance line shown to the model with each memory. */
export function memoryLine(m: MemoryRow): string {
  const conf = m.confidence != null ? ` conf=${m.confidence.toFixed(2)}` : "";
  return `[${normalizeType(m.category)}${m.category !== normalizeType(m.category) ? `/${m.category}` : ""}${conf} saved=${m.updated_at.slice(0, 10)}${m.source_ref ? ` src=${m.source_ref}` : ""}] ${m.content}`;
}
