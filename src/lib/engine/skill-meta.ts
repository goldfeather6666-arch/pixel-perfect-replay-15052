export type SkillMeta = {
  name: string;
  description: string;
  activation: "always" | "auto" | "manual";
  triggers: string[];
  depends: string[];
  allowedTools: string[];
  version: string;
  body: string;
};

function list(v: string | undefined): string[] {
  if (!v) return [];
  return v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

/** Parse optional YAML-style front matter (SKILL.md convention). Missing fields get safe defaults. */
export function parseSkill(name: string, instructions: string): SkillMeta {
  const m = instructions.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const fields: Record<string, string> = {};
  if (m) for (const line of (m[1] ?? "").split("\n")) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) fields[kv[1]!.toLowerCase()] = kv[2]!.trim();
  }
  const activation = (fields["activation"] ?? "auto").toLowerCase();
  const body = m ? instructions.slice(m[0].length) : instructions;
  return {
    name: fields["name"]?.replace(/^["']|["']$/g, "") || name,
    description: (fields["description"] ?? body.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "").replace(/^["']|["']$/g, "").slice(0, 300),
    activation: activation === "always" || activation === "manual" ? activation : "auto",
    triggers: list(fields["triggers"] ?? fields["when"]).map((t) => t.toLowerCase()),
    depends: list(fields["depends"] ?? fields["dependencies"]),
    allowedTools: list(fields["allowed-tools"] ?? fields["tools"]),
    version: fields["version"] ?? "",
    body,
  };
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "into", "when", "use", "using", "skill", "skills", "will", "are", "you"]);
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9][a-z0-9.+-]{2,}/g)?.filter((w) => !STOP.has(w)) ?? []);

/**
 * Choose which skills to fully load for a request, with the reason. Dependencies of selected skills
 * are pulled in; unknown dependencies are reported rather than silently ignored.
 */
export function selectSkills(request: string, skills: SkillMeta[], stats?: Map<string, { loaded: number; completed: number }>): { selected: { skill: SkillMeta; reason: string }[]; missingDeps: string[] } {
  const req = request.toLowerCase();
  const reqWords = words(request);
  const byName = new Map(skills.map((s) => [s.name.toLowerCase(), s]));
  const chosen = new Map<string, string>();
  for (const s of skills) {
    if (s.activation === "always") { chosen.set(s.name, "marked always-on"); continue; }
    if (s.activation === "manual") { if (req.includes(s.name.toLowerCase())) chosen.set(s.name, "named in your request"); continue; }
    const trig = s.triggers.find((t) => req.includes(t));
    if (trig) { chosen.set(s.name, `request mentions "${trig}"`); continue; }
    if (req.includes(s.name.toLowerCase())) { chosen.set(s.name, "named in your request"); continue; }
    const overlap = [...words(`${s.name.replace(/[-_]/g, " ")} ${s.description}`)].filter((w) => reqWords.has(w));
    const st = stats?.get(s.name);
    const rate = st && st.loaded >= 4 ? st.completed / st.loaded : null;
    const track = rate === null ? "" : ` (${Math.round(rate * 100)}% of ${st!.loaded} past runs completed)`;
    if (overlap.length >= 2 && (rate === null || rate >= 0.25)) chosen.set(s.name, `matches ${overlap.slice(0, 3).join(", ")}${track}`);
    else if (overlap.length === 1 && rate !== null && rate >= 0.7) chosen.set(s.name, `matches ${overlap[0]} and has a strong track record${track}`);
  }
  const missingDeps: string[] = [];
  const queue = [...chosen.keys()];
  while (queue.length) {
    const s = byName.get(queue.shift()!.toLowerCase());
    for (const d of s?.depends ?? []) {
      const dep = byName.get(d.toLowerCase());
      if (!dep) { if (!missingDeps.includes(d)) missingDeps.push(d); continue; }
      if (!chosen.has(dep.name)) { chosen.set(dep.name, `required by ${s!.name}`); queue.push(dep.name); }
    }
  }
  return { selected: skills.filter((s) => chosen.has(s.name)).map((skill) => ({ skill, reason: chosen.get(skill.name)! })), missingDeps };
}

export async function contentHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
