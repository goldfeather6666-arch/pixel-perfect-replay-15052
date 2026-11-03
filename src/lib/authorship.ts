// Exact blob evidence prevents an earlier agent write from hiding a later human edit.
export type Authorship = "agent" | "human" | "unknown";

export function tagAuthorship(files: { filename: string; sha?: string }[], evidence: { path: string; blob_sha: string | null }[]): Record<string, Authorship> {
  return Object.fromEntries(files.map((f) => {
    const history = evidence.filter((e) => e.path === f.filename);
    const matched = f.sha && history.some((e) => e.blob_sha === f.sha);
    return [f.filename, matched ? "agent" : history.some((e) => e.blob_sha) && f.sha ? "human" : "unknown"];
  }));
}

export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header); bytes.set(body, header.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}