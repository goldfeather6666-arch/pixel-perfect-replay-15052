// Clients for the user's own Supabase (Management API) and Vercel accounts.
// Hosts are fixed, so no user-controlled network targets.
import type { AccountIdentity } from "./account-identity";

async function call<T>(base: string, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    // Credential-bearing requests must never echo a provider response to the caller.
    if (path.includes("/env")) throw new Error(`Vercel settings sync failed (${res.status}). Check project access and retry.`);
    let msg = text.slice(0, 400);
    try { const j = JSON.parse(text); msg = j.message || j.error?.message || j.error || msg; } catch {}
    throw new Error(`${base.includes("vercel") ? "Vercel" : "Supabase"} ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export class SupabaseMgmt {
  constructor(private token: string) {}
  private req<T = any>(p: string, i?: RequestInit) { return call<T>("https://api.supabase.com/v1", this.token, p, i); }
  async projects() {
    const r = await this.req<any[]>("/projects");
    return r.map((p) => ({ ref: p.id as string, name: p.name as string, region: p.region as string, status: p.status as string }));
  }
  async orgs() {
    const r = await this.req<any[]>("/organizations");
    return r.map((o) => ({ id: o.id as string, name: o.name as string }));
  }
  /** Who this token belongs to: its organizations identify the account. */
  async identity(): Promise<AccountIdentity> {
    const orgs = (await this.orgs()).sort((a, b) => a.id.localeCompare(b.id));
    if (orgs.length) return { key: `org:${orgs.map((o) => o.id).join(",")}`, name: orgs.map((o) => o.name).join(", ") };
    // No visible organizations: fall back to the projects it can see; an empty account can't be compared.
    const refs = (await this.projects()).map((p) => p.ref).sort();
    return { key: refs.length ? `projects:${refs.join(",")}` : "", name: refs.length ? `${refs.length} project(s)` : "Supabase account" };
  }
  async createProject(name: string, orgId: string, region: string) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const db_pass = btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, "") + "Aa1!";
    const p = await this.req<any>("/projects", { method: "POST", body: JSON.stringify({ name, organization_id: orgId, region, db_pass }) });
    return { ref: p.id as string, name: p.name as string };
  }
  status(ref: string) { return this.req<any>(`/projects/${ref}`).then((p) => p.status as string); }
  runSql(ref: string, query: string) {
    return this.req<any>(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
  }
  authConfig(ref: string) { return this.req<{ site_url?: string; uri_allow_list?: string }>(`/projects/${ref}/config/auth`); }
  patchAuth(ref: string, body: { site_url?: string; uri_allow_list?: string }) {
    return this.req(`/projects/${ref}/config/auth`, { method: "PATCH", body: JSON.stringify(body) });
  }
  async anonKey(ref: string) {
    const keys = await this.req<any[]>(`/projects/${ref}/api-keys`);
    return (keys.find((k) => k.name === "anon") ?? keys.find((k) => k.type === "publishable"))?.api_key as string | undefined;
  }
}

export type Deployment = { id: string; name?: string; url: string; state: string; branch: string | null; commitSha?: string | null; created: number; target: string | null };

export class DeployLimitError extends Error {
  constructor(public total: number | null, public resetAt: number | null) {
    super("Vercel deployment limit reached");
  }
}

export class Vercel {
  constructor(private token: string) {}
  private req<T = any>(p: string, i?: RequestInit) { return call<T>("https://api.vercel.com", this.token, p, i); }
  user() { return this.req("/v2/user"); }
  /** Who this token belongs to (Vercel user id + username/email). */
  async identity(): Promise<AccountIdentity> {
    const r = await this.req<any>("/v2/user");
    const u = r?.user ?? {};
    return { key: String(u.id ?? u.uid ?? ""), name: String(u.username || u.email || u.name || "Vercel account") };
  }
  async projects() {
    const r = await this.req<any>("/v9/projects?limit=100");
    return (r.projects as any[]).map((p) => ({ id: p.id as string, name: p.name as string, repo: (p.link?.org && p.link?.repo ? `${p.link.org}/${p.link.repo}` : null) as string | null }));
  }
  async project(projectId: string) {
    const p = await this.req<any>(`/v9/projects/${encodeURIComponent(projectId)}`);
    return { id: p.id as string, repo: (p.link?.org && p.link?.repo ? `${p.link.org}/${p.link.repo}` : null) as string | null };
  }
  async domains(projectId: string): Promise<string[]> {
    const r = await this.req<any>(`/v9/projects/${encodeURIComponent(projectId)}/domains`);
    return ((r.domains ?? []) as any[]).filter((d) => d.verified !== false && !d.redirect).map((d) => String(d.name));
  }
  async createProject(name: string, repo: string) {
    const p = await this.req<any>("/v11/projects", {
      method: "POST",
      body: JSON.stringify({ name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90), gitRepository: { type: "github", repo } }),
    });
    return { id: p.id as string, name: p.name as string };
  }
  async setEnv(projectId: string, vars: Record<string, string>) {
    const body = Object.entries(vars).map(([key, value]) => ({ key, value, type: "encrypted", target: ["production", "preview", "development"] }));
    await this.req(`/v10/projects/${projectId}/env?upsert=true`, { method: "POST", body: JSON.stringify(body) });
  }
  async deployments(projectId: string, branch?: string): Promise<Deployment[]> {
    const r = await this.req<any>(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=100${branch ? `&meta-githubCommitRef=${encodeURIComponent(branch)}` : ""}`);
    const all: Deployment[] = (r.deployments as any[]).map((d) => ({
      id: d.uid, name: d.name as string, url: `https://${d.url}`, state: d.state ?? d.readyState, branch: d.meta?.githubCommitRef ?? null, commitSha: d.meta?.githubCommitSha ?? null, created: d.created, target: d.target ?? null,
    }));
    return (branch ? all.filter((d) => d.branch === branch) : all).sort((a, b) => b.created - a.created);
  }
  /** Rebuilds an existing deployment so new environment variables take effect. */
  async redeploy(d: Deployment) {
    const r = await this.req<any>("/v13/deployments?forceNew=1", { method: "POST", body: JSON.stringify({ name: d.name, deploymentId: d.id, ...(d.target ? { target: d.target } : {}) }) });
    return { id: r.id as string, url: `https://${r.url}` };
  }
  /** Installs Forge's build gate (skip agent/* commits unless marked for deploy). Returns true when the gate is active. */
  async ensureBuildGate(projectId: string) {
    const { gateUpdate, BUILD_GATE_COMMAND } = await import("./vercel-build-gate");
    const p = await this.req<any>(`/v9/projects/${encodeURIComponent(projectId)}`);
    const next = gateUpdate(p.commandForIgnoringBuildStep);
    if (next) await this.req(`/v9/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify({ commandForIgnoringBuildStep: next }) });
    return (next ?? p.commandForIgnoringBuildStep) === BUILD_GATE_COMMAND;
  }
  /** Root directory configured on the Vercel project ("" for the repo root). */
  async rootDirectory(projectId: string) {
    const p = await this.req<any>(`/v9/projects/${encodeURIComponent(projectId)}`);
    return String(p.rootDirectory ?? "").replace(/^\/+|\/+$/g, "");
  }
  /** Starts one build of an exact GitHub commit. Throws DeployLimitError when Vercel's deployment quota is used up. */
  async createGitDeployment(projectId: string, repo: string, ref: string, sha: string) {
    const [org, name] = repo.split("/");
    const project = await this.req<any>(`/v9/projects/${encodeURIComponent(projectId)}`);
    const res = await fetch("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: project.name, project: projectId, gitSource: { type: "github", org, repo: name, ref, sha } }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const { deployLimit } = await import("./vercel-build-gate");
      const limit = deployLimit(res.status, body);
      if (limit) throw new DeployLimitError(limit.total, limit.resetAt);
      const msg = body?.error?.message ?? body?.message ?? `status ${res.status}`;
      throw new Error(`Vercel ${res.status}: ${String(msg).slice(0, 300)}`);
    }
    return { id: body.id as string, url: `https://${body.url}` };
  }
  async buildLog(id: string) {
    const ev = await this.req<any[]>(`/v3/deployments/${id}/events?builds=1&limit=-1`);
    const lines = ev.map((e) => e.payload?.text ?? e.text).filter(Boolean) as string[];
    return lines.slice(-80).join("\n").slice(-6000);
  }
}

/** Lists supabase/migrations/*.sql files in name order and returns those not yet applied. */
export function pendingMigrations(tree: string[], applied: string[]) {
  return tree
    .filter((p) => /^supabase\/migrations\/[^/]+\.sql$/.test(p))
    .sort()
    .filter((p) => !applied.includes(p));
}

/** Copies the Supabase project's public URL + anon key into the Vercel project (all environments). */
export async function syncSupabaseToVercel(supabaseToken: string, vercelToken: string, ref: string, vercelId: string) {
  const anon = await new SupabaseMgmt(supabaseToken).anonKey(ref);
  if (!anon) throw new Error("Couldn't read the Supabase public key (project may still be starting up).");
  const url = `https://${ref}.supabase.co`;
  const { deploymentEnv } = await import("./deployment-env");
  await new Vercel(vercelToken).setEnv(vercelId, deploymentEnv(url, anon));
  return url;
}

/** Polls the branch's latest deployment until it finishes or the time budget runs out. */
export async function waitForDeployment(v: Pick<Vercel, "deployments">, projectId: string, branch: string, maxMs = 180_000, expected?: { commitSha: string; deploymentId?: string }, signal?: AbortSignal) {
  const end = Date.now() + maxMs;
  for (;;) {
    signal?.throwIfAborted();
    const latest = (await v.deployments(projectId, branch))
      .filter((d) => !expected || (d.commitSha === expected.commitSha && (!expected.deploymentId || d.id === expected.deploymentId)))
      .sort((a, b) => b.created - a.created)[0];
    if (latest && ["READY", "ERROR", "CANCELED"].includes(latest.state)) return latest;
    if (Date.now() >= end) return latest ?? null;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("Stopped")); };
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 10_000);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}

type BranchWriter = {
  getFile(repo: string, branch: string, path: string): Promise<{ content: string } | null>;
  putFile(repo: string, branch: string, path: string, content: string, message: string): Promise<string>;
  emptyCommit(repo: string, branch: string, message: string): Promise<string>;
};

/**
 * Builds the work branch's current code exactly once: stops pushes to agent/* from spending Vercel's
 * deployment quota (vercel.json), adds one marked commit and asks Vercel to build that commit.
 * Throws DeployLimitError when Vercel refuses because the quota is used up.
 */
export async function startForgeDeploy(v: Vercel, gh: BranchWriter, projectId: string, repo: string, branch: string) {
  const { DEPLOY_MARKER, withAgentDeploysDisabled } = await import("./vercel-build-gate");
  await v.ensureBuildGate(projectId).catch(() => false);
  try {
    const root = await v.rootDirectory(projectId);
    const path = root ? `${root}/vercel.json` : "vercel.json";
    const next = withAgentDeploysDisabled((await gh.getFile(repo, branch, path))?.content ?? null);
    if (next) await gh.putFile(repo, branch, path, next, "chore: stop per-save Vercel builds on Forge work branches");
  } catch { /* optional quota saver; the deploy below still works without it */ }
  const sha = await gh.emptyCommit(repo, branch, `chore: deploy ${DEPLOY_MARKER}`);
  const d = await v.createGitDeployment(projectId, repo, branch, sha);
  return { commitSha: sha, deploymentId: d.id, url: d.url };
}
