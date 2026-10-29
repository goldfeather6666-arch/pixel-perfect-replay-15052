import { b64ToUtf8, utf8ToB64 } from "./crypto.server";

export class GitHub {
  constructor(private token: string) {}

  async req<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.github.com/${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "byok-coding-agent",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : (null as T);
  }

  user() {
    return this.req<{ login: string }>("user");
  }
  async repos() {
    const r = await this.req<any[]>("user/repos?sort=updated&per_page=100");
    return r.map((x) => ({ full_name: x.full_name as string, default_branch: x.default_branch as string, private: x.private as boolean }));
  }
  async branches(repo: string) {
    const r = await this.req<any[]>(`repos/${repo}/branches?per_page=100`);
    return r.map((b) => b.name as string);
  }
  async createBranch(repo: string, from: string, name: string) {
    const ref = await this.req<any>(`repos/${repo}/git/ref/heads/${encodeURIComponent(from)}`);
    await this.req(`repos/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${name}`, sha: ref.object.sha }) });
  }
  async tree(repo: string, branch: string) {
    const t = await this.req<any>(`repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    return (t.tree as any[]).filter((e) => e.type === "blob").map((e) => e.path as string);
  }
  private enc(path: string) {
    return path.split("/").map(encodeURIComponent).join("/");
  }
  async getFile(repo: string, branch: string, path: string): Promise<{ content: string; sha: string } | null> {
    try {
      const f = await this.req<any>(`repos/${repo}/contents/${this.enc(path)}?ref=${encodeURIComponent(branch)}`);
      if (Array.isArray(f)) throw new Error(`${path} is a directory`);
      return { content: b64ToUtf8(f.content ?? ""), sha: f.sha };
    } catch (e) {
      if (String(e).includes("GitHub 404")) return null;
      throw e;
    }
  }
  async putFile(repo: string, branch: string, path: string, content: string, message: string) {
    const existing = await this.getFile(repo, branch, path);
    const r = await this.req<any>(`repos/${repo}/contents/${this.enc(path)}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: utf8ToB64(content), branch, ...(existing ? { sha: existing.sha } : {}) }),
    });
    return r.commit.sha as string;
  }
  async deleteFile(repo: string, branch: string, path: string, message: string) {
    const existing = await this.getFile(repo, branch, path);
    if (!existing) throw new Error(`${path} does not exist`);
    const r = await this.req<any>(`repos/${repo}/contents/${this.enc(path)}`, {
      method: "DELETE",
      body: JSON.stringify({ message, sha: existing.sha, branch }),
    });
    return r.commit.sha as string;
  }
  async compare(repo: string, base: string, head: string) {
    const c = await this.req<any>(`repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
    return {
      ahead_by: c.ahead_by as number,
      commits: (c.commits as any[]).map((x) => ({ sha: x.sha as string, message: x.commit.message as string })),
      files: ((c.files ?? []) as any[]).map((f) => ({ filename: f.filename as string, status: f.status as string, patch: (f.patch ?? "") as string })),
    };
  }
  async openPr(repo: string, base: string, head: string, title: string, body: string) {
    const p = await this.req<any>(`repos/${repo}/pulls`, { method: "POST", body: JSON.stringify({ title, body, head, base }) });
    return p.html_url as string;
  }
}
