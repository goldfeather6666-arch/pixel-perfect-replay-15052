// Four autonomy levels, enforced server-side in /api/agent.
// "supervised" and "autonomous" keep their existing meanings for saved tasks.
export const AUTONOMY = ["supervised", "significant", "autonomous", "full"] as const;
export type Autonomy = (typeof AUTONOMY)[number];

export const AUTONOMY_LABEL: Record<Autonomy, { title: string; hint: string }> = {
  supervised: { title: "1 · Ask every write", hint: "You approve every edit" },
  significant: { title: "2 · Approve big changes", hint: "Small edits commit; risky ones wait" },
  autonomous: { title: "3 · Autonomous", hint: "Commits as it works; destructive steps wait" },
  full: { title: "4 · Full autonomy", hint: "Everything inside its branch and linked projects" },
};

export function asAutonomy(mode: string | null | undefined): Autonomy {
  return (AUTONOMY as readonly string[]).includes(mode ?? "") ? (mode as Autonomy) : "supervised";
}

const SENSITIVE = /(^|\/)(package\.json|.*lock.*|\.env.*|vercel\.json|netlify\.toml|wrangler\.toml|vite\.config\.\w+|next\.config\.\w+|tsconfig\.json|Dockerfile|\.github\/workflows\/.*|supabase\/migrations\/.*|supabase\/config\.toml|.*\.sql)$/i;

/** True when a file write must be staged for approval at this level. */
export function writeNeedsApproval(level: Autonomy, f: { path: string; action: "write" | "delete"; content?: string; original?: string | null }): boolean {
  if (level === "supervised") return true;
  if (level === "full" || level === "autonomous") return false;
  // significant: deletes, config/migration/dependency files, and large rewrites of existing files wait.
  if (f.action === "delete") return true;
  if (SENSITIVE.test(f.path)) return true;
  const before = f.original?.split("\n").length ?? 0;
  const after = f.content?.split("\n").length ?? 0;
  return before > 50 && Math.abs(after - before) > before * 0.6;
}

const DESTRUCTIVE_SQL = /\b(drop\s+(table|schema|column|database|type|function)|truncate\b|alter\s+table\s+\S+\s+drop\b|delete\s+from\s+\S+\s*(;|$))/i;
export function isDestructiveSql(sql: string): boolean {
  return DESTRUCTIVE_SQL.test(sql.replace(/--.*$/gm, ""));
}

/** Database migrations: who applies them at each level. */
export function migrationNeedsApproval(level: Autonomy, sql: string): boolean {
  if (level === "supervised" || level === "significant") return true;
  if (level === "autonomous") return isDestructiveSql(sql);
  return false;
}

/** Deploy syncs/rebuilds change hosted settings. Only levels 3–4 may run them. */
export function deployAllowed(level: Autonomy): boolean {
  return level === "autonomous" || level === "full";
}
