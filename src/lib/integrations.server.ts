// Clients for the user's own Supabase (Management API) and Vercel accounts.
// Hosts are fixed, so no user-controlled network targets.

async function call<T>(base: string, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const text = await res.text();
  if (!res.ok) {
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
  async anonKey(ref: string) {
    const keys = await this.req<any[]>(`/projects/${ref}/api-keys`);
    return (keys.find((k) => k.name === "anon") ?? keys.find((k) => k.type === "publishable"))?.api_key as string | undefined;
  }
}

export type Deployment = { id: string; name?: string; url: string; state: string; branch: string | null; commitSha?: string | null; created: number; target: string | null };

export class Vercel {
  constructor(private token: string) {}
  private req<T = any>(p: string, i?: RequestInit) { return call<T>("https://api.vercel.com", this.token, p, i); }
  user() { return this.req("/v2/user"); }
  async projects() {
    const r = await this.req<any>("/v9/projects?limit=100");
    return (r.projects as any[]).map((p) => ({ id: p.id as string, name: p.name as string, repo: (p.link?.org && p.link?.repo ? `${p.link.org}/${p.link.repo}` : null) as string | null }));
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
  await new Vercel(vercelToken).setEnv(vercelId, {
    SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_PUBLISHABLE_KEY: anon,
    NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon, VITE_SUPABASE_PUBLISHABLE_KEY: anon,
  });
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
