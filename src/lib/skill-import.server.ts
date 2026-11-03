import type { GitHub } from "./github.server";
import { inspectSkillText, openLicense, type SkillRegistry } from "./free-skills";

export type SkillSource = { repo: string; branch: string | null; path: string | null };

export type SkillCandidate = {
  path: string;
  name: string;
  description: string;
  chars: number;
  instructions: string;
  registry: SkillRegistry;
};

/** Instructions are stored with this ceiling (matches the skills table validator). */
export const MAX_INSTRUCTIONS = 8000;
/** Never offer more than this many files from one repository. */
export const MAX_CANDIDATES = 40;

const IGNORED_DOCS = /^(readme|license|licence|copying|notice|contributing|changelog|history|authors|code[-_]of[-_]conduct|security)/i;

function clean(s: string) {
  return s.replace(/\s+/g, " ").replace(/["<>\n\r\t]/g, "").trim();
}

/**
 * Accepts the forms a person actually pastes:
 *   owner/repo
 *   owner/repo/skills/foo
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/main/skills/foo
 *   https://github.com/owner/repo/blob/main/skills/foo/SKILL.md
 *   https://raw.githubusercontent.com/owner/repo/main/skills/foo/SKILL.md
 *   https://api.github.com/repos/owner/repo/contents/skills/foo
 */
export function parseSkillSource(input: string): SkillSource {
  let work = input.trim().replace(/\.git$/i, "");
  if (!work) throw new Error("Enter a GitHub repository URL or owner/repo");
  work = work.replace(/^https?:\/\//i, "").replace(/^www\./i, "");

  let branch: string | null = null;
  if (work.startsWith("api.github.com/")) {
    work = work.replace(/^api\.github\.com\/repos\//i, "").replace(/\/(contents|git\/trees)\//i, "/");
  } else if (work.startsWith("raw.githubusercontent.com/")) {
    const parts = work.replace(/^raw\.githubusercontent\.com\//i, "").split("/");
    if (parts.length < 3) throw new Error("That raw.githubusercontent.com link is missing a branch or file path");
    branch = parts[2] ?? null;
    work = [parts[0], parts[1], ...parts.slice(3)].join("/");
  } else {
    work = work.replace(/^github\.com\//i, "");
  }

  const parts = work.split("/").filter((p) => p.length > 0);
  const owner = parts[0];
  const name = parts[1];
  if (!owner || !name) throw new Error("Use owner/repo, or a full github.com link");
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error("That repository name doesn't look like a GitHub owner/repo");
  }

  let path: string | null = null;
  const tail = parts.slice(2);
  const head = tail[0];
  if (head === "tree" || head === "blob" || head === "edit" || head === "raw") {
    branch = tail[1] ?? branch;
    path = tail.slice(2).join("/") || null;
  } else {
    path = tail.join("/") || null;
  }
  if (branch !== null && !/^[A-Za-z0-9._\-/]+$/.test(branch)) branch = null;
  return { repo: `${owner}/${name}`, branch, path: path ? path.replace(/^\/+|\/+$/g, "") : null };
}

function baseName(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function relative(path: string, root: string | null) {
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

/**
 * Picks the files worth turning into skills:
 *  - a pasted .md file on its own;
 *  - otherwise every SKILL.md under the path (the Agent Skills convention);
 *  - otherwise the plain markdown docs sitting directly in that folder.
 */
export function pickSkillFiles(paths: string[], root: string | null): string[] {
  const under = root === null ? paths : paths.filter((p) => p === root || p.startsWith(`${root}/`));
  if (root !== null && under.length === 1 && under[0] === root && /\.md$/i.test(root)) return [root];

  const md = under.filter((p) => /\.md$/i.test(p));
  const skillDocs = md.filter((p) => /(^|\/)skill\.md$/i.test(p)).sort();
  if (skillDocs.length) return skillDocs.slice(0, MAX_CANDIDATES);

  const top = md
    .filter((p) => !relative(p, root).includes("/"))
    .filter((p) => !IGNORED_DOCS.test(baseName(p)))
    .sort();
  return top.slice(0, MAX_CANDIDATES);
}

/** Minimal front-matter reader: top-level `key: value` lines between leading `---` fences. */
function readFrontMatter(text: string): { fields: Record<string, string>; body: string } {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (text.slice(start, start + 3) !== "---") return { fields: {}, body: text };
  const nl = text.indexOf("\n", start);
  if (nl === -1) return { fields: {}, body: text };
  const lines = text.slice(nl + 1).split("\n");
  const fields: Record<string, string> = {};
  let closed = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^(---|\.\.\.)\s*$/.test(line)) {
      closed = i;
      break;
    }
    if (/^\s/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]?.toLowerCase();
    const value = (m[2] ?? "").trim();
    if (!key || /^[|>&@]/.test(value)) continue; // block scalars and anchors aren't read
    fields[key] = value.replace(/^["']+|["']+$/g, "");
  }
  if (closed === -1) return { fields: {}, body: text };
  return { fields, body: lines.slice(closed + 1).join("\n") };
}

function firstHeading(body: string) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? clean(m[1] ?? "") : "";
}

/** Turns one markdown file into a skill: name, when-to-use line and the instructions the agent sees. */
export function parseSkillMarkdown(text: string, fallbackName: string): { name: string; description: string; instructions: string } {
  const { fields, body } = readFrontMatter(text);
  const rawName = clean(fields["name"] || firstHeading(body) || fallbackName).slice(0, 80);
  const name = rawName || clean(fallbackName).slice(0, 80) || "Skill";
  const description = clean(fields["description"] || "").slice(0, 300);
  const trimmed = body.trim();
  let instructions = description ? `When to use: ${description}\n\n${trimmed}` : trimmed;
  if (instructions.length > MAX_INSTRUCTIONS) {
    instructions = `${instructions.slice(0, MAX_INSTRUCTIONS - 14)}\n\n…(truncated)`;
  }
  return { name, description, instructions };
}

/** Name shown for a file before its own title is read. */
export function fallbackSkillName(path: string, root: string | null): string {
  const file = baseName(path);
  if (/^skill\.md$/i.test(file)) {
    const dir = path.slice(0, path.length - file.length).replace(/\/+$/, "");
    const parent = baseName(dir);
    return parent && parent !== "." ? parent : root ? baseName(root) : "Skill";
  }
  return file.replace(/\.md$/i, "");
}

/** Reads the repo tree and turns the chosen markdown files into skill drafts. */
export async function listSkillCandidates(
  gh: GitHub,
  src: SkillSource,
): Promise<{ repo: string; branch: string; candidates: SkillCandidate[] }> {
  const info = await gh.req<{ default_branch: string; private: boolean; archived: boolean; pushed_at: string }>(`repos/${src.repo}`);
  if (info.private) throw new Error("Free-only skill discovery accepts public repositories only.");
  const branch = src.branch ?? info.default_branch;
  const version = await gh.headSha(src.repo, branch);
  const tree = await gh.tree(src.repo, version);
  const files = pickSkillFiles(tree, src.path);
  if (!files.length) {
    throw new Error(
      src.path
        ? "No SKILL.md file and no markdown docs found at that path — check the folder name and branch"
        : "That repository has no markdown files to import",
    );
  }
  const read = await Promise.all(
    files.map(async (path) => {
      const f = await gh.getFile(src.repo, version, path);
      if (!f) return null;
      const parsed = parseSkillMarkdown(f.content, fallbackSkillName(path, src.path));
      const front = readFrontMatter(f.content).fields;
      // Preserve bounded activation metadata without accepting arbitrary YAML or template injection.
      const activationFields = ["activation", "triggers", "depends", "version"].flatMap((key) => {
        const value = front[key];
        return value && /^[a-zA-Z0-9., _\-[\]"']{1,400}$/.test(value) ? [`${key}: ${value}`] : [];
      });
      if (activationFields.length) parsed.instructions = `---\n${activationFields.join("\n")}\n---\n${parsed.instructions}`;
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const ancestors = folder ? folder.split("/").map((_, i, parts) => parts.slice(0, parts.length - i).join("/")) : [];
      const licensePaths = [...ancestors, ""].flatMap((dir) => tree.filter((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") === dir && /^(license|licence|copying)(\..*)?$/i.test(p.split("/").pop() ?? "")));
      // The nearest license wins; restrictive per-skill terms cannot be masked by a root MIT license.
      const licensePath = licensePaths[0] ?? null;
      const licenseFile = licensePath ? await gh.getFile(src.repo, version, licensePath) : null;
      const license = licenseFile ? openLicense(licenseFile.content) : null;
      const findings = inspectSkillText(f.content);
      if (!license) findings.push("Missing, restricted or unrecognized applicable license");
      const fmLicense = f.content.match(/^license:\s*(.+)$/m)?.[1] ?? "";
      if (/proprietary|restricted|non.?commercial|see.*license/i.test(fmLicense) && !licensePath?.startsWith(`${folder}/`)) findings.push("Per-skill license requires review");
      if (info.archived) findings.push("Repository archived");
      if (!info.pushed_at || Date.now() - Date.parse(info.pushed_at) > 730 * 86400000) findings.push("Maintenance review required");
      const dependencies = tree.filter((p) => p.startsWith(`${folder}/`) && /(?:^|\/)(?:scripts\/|package\.json$|requirements.*\.txt$|pyproject\.toml$|.*\.(?:sh|py|js|ts)$)/.test(p));
      if (dependencies.length) findings.push("Bundled scripts/dependencies require manual source audit; not installed");
      const adjacent = tree.filter((p) => p.startsWith(`${folder}/`) && p !== path && !licensePaths.includes(p));
      if (adjacent.length) findings.push("Additional bundled resources require manual source audit");
      const networkCalls = [...new Set(f.content.match(/https?:\/\/[^\s<>\])"']+/g) ?? [])];
      if (/\b(api[_ -]?key|access[_ -]?token|oauth|pip install|npm install|npx |uv run)\b/i.test(f.content)) findings.push("External service or executable dependency needs quota/compatibility review");
      // Advisory notes: scripts/resources are never installed and long instructions are trimmed, so they don't block import.
      const advisory = new Set(["Bundled scripts/dependencies require manual source audit; not installed", "Additional bundled resources require manual source audit", "External service or executable dependency needs quota/compatibility review"]);
      if (parsed.instructions.length > MAX_INSTRUCTIONS) {
        parsed.instructions = parsed.instructions.slice(0, MAX_INSTRUCTIONS - 40).trimEnd() + "\n\n[Trimmed to fit Forge's limit]";
        findings.push("Instructions trimmed to fit the size limit");
        advisory.add("Instructions trimmed to fit the size limit");
      }
      const blocking = findings.filter((x) => !advisory.has(x));
      const registry: SkillRegistry = { category: "Imported", repository: src.repo, version, license: license ?? "unverified", licensePath,
        securityStatus: blocking.length ? "review-required" : "instructions-only", verificationStatus: blocking.length ? "blocked" : "verified",
        compatibility: blocking.length ? "unverified" : "Forge instructions-only", dependencies, networkCalls, findings, lastUpdate: info.pushed_at };
      return { path, name: parsed.name, description: parsed.description, instructions: parsed.instructions, chars: parsed.instructions.length, registry } satisfies SkillCandidate;
    }),
  );
  const candidates = read.filter((c): c is SkillCandidate => c !== null);
  if (!candidates.length) throw new Error("Those files could not be read — is the repository private and the token unable to see it?");
  return { repo: src.repo, branch, candidates };
}
