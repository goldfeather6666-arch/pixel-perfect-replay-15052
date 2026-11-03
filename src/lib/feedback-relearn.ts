/** C23: a user's comment on an agent reply becomes a durable correction the agent reads on every later run. */
export function correctionMemory(excerpt: string, comment: string): string | null {
  const c = comment.replace(/\s+/g, " ").trim();
  if (c.length < 3) return null;
  const e = excerpt.replace(/\s+/g, " ").trim().slice(0, 300);
  return `User correction${e ? ` on the reply "${e}${excerpt.length > 300 ? "…" : ""}"` : ""}: ${c.slice(0, 1500)}. Apply this in future work and do not repeat the flagged mistake.`;
}
