/** C19: flag documentation claims that no longer match the repository (stale, not just missing, docs). */
export type DocClaim = { kind: "path" | "script" | "env"; value: string; line: number };
export type DriftFinding = DocClaim & { doc: string; reason: string };
export type RepoFacts = { files: string[]; scripts: string[]; envNames: string[] | null };

const SCRIPT = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([a-z][\w:-]*)/g;
const BUILTIN = new Set(["install", "i", "add", "remove", "ci", "init", "create", "x", "dlx", "exec", "test", "start", "publish", "link", "update", "upgrade", "outdated", "audit"]);
const ENV = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const PATHISH = /^(?:\.\/)?[\w@.-]+(?:\/[\w@.[\]$-]+)+\/?$|^[\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|sql|toml|ya?ml|py|go|rs)$/;

export function extractClaims(markdown: string): DocClaim[] {
  const claims: DocClaim[] = [];
  let fenced = false;
  markdown.split("\n").forEach((text, i) => {
    const line = i + 1;
    if (/^\s*```/.test(text)) { fenced = !fenced; }
    for (const m of text.matchAll(SCRIPT)) if (!BUILTIN.has(m[1]!) || /\brun\s/.test(m[0])) claims.push({ kind: "script", value: m[1]!, line });
    if (fenced) return;
    for (const m of text.matchAll(/`([^`\n]{2,160})`/g)) {
      const v = m[1]!.trim();
      if (ENV.test(v)) claims.push({ kind: "env", value: v, line });
      else if (PATHISH.test(v) && !/^https?:|[*<>{}]|\s/.test(v)) claims.push({ kind: "path", value: v.replace(/^\.\//, ""), line });
    }
  });
  return claims;
}

/** Claims whose referenced file, script or environment variable no longer exists. */
export function checkDocDrift(doc: string, markdown: string, facts: RepoFacts): DriftFinding[] {
  const files = new Set(facts.files);
  const dirs = new Set(facts.files.flatMap((f) => f.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"))));
  const base = doc.includes("/") ? doc.slice(0, doc.lastIndexOf("/") + 1) : "";
  const scripts = new Set(facts.scripts);
  const env = facts.envNames ? new Set(facts.envNames) : null;
  const out: DriftFinding[] = [];
  for (const c of extractClaims(markdown)) {
    if (c.kind === "path") {
      const p = c.value.replace(/\/$/, "");
      const exists = [p, base + p].some((x) => files.has(x) || dirs.has(x)) || facts.files.some((f) => f.endsWith(`/${p}`));
      if (!exists) out.push({ ...c, doc, reason: `Mentions ${c.value}, which is not in the repository.` });
    } else if (c.kind === "script" && facts.scripts.length && !scripts.has(c.value)) {
      out.push({ ...c, doc, reason: `Says to run "${c.value}", but package.json has no such script.` });
    } else if (c.kind === "env" && env && !env.has(c.value)) {
      out.push({ ...c, doc, reason: `Documents ${c.value}, which the environment template no longer lists.` });
    }
  }
  return out;
}

export function envNamesFromTemplate(text: string): string[] {
  return text.split("\n").map((l) => l.trim().match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1]).filter((x): x is string => !!x);
}

export const isDocFile = (path: string) => /\.(md|mdx)$/i.test(path) && !/(^|\/)(node_modules|CHANGELOG)/i.test(path);
