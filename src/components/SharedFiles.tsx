import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { readFileRaw } from "@/lib/app.functions";
import type { ToolLog } from "@/lib/providers";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf", md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json", html: "text/html", zip: "application/zip" };
const mimeOf = (path: string) => MIME[path.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";

/** Files the agent sent to the user with the share_file tool. */
export function SharedFiles({ sessionId, tools }: { sessionId: string; tools: ToolLog[] }) {
  const shared = tools.filter((t) => t.name === "share_file" && t.ok !== false && t.input?.path);
  if (!shared.length) return null;
  return <div className="flex flex-wrap gap-2">{shared.map((t) => <SharedFile key={t.id} sessionId={sessionId} path={String(t.input.path)} caption={t.input.caption} />)}</div>;
}

function SharedFile({ sessionId, path, caption }: { sessionId: string; path: string; caption?: string }) {
  const read = useServerFn(readFileRaw);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mime = mimeOf(path);
  const name = path.split("/").pop() ?? path;
  async function load() {
    if (url) return url;
    setBusy(true);
    try {
      const r = await read({ data: { id: sessionId, path } });
      if (!r?.data) throw new Error(`${name} was not found on the work branch`);
      const bytes = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      const u = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setUrl(u);
      return u;
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(false); }
  }
  async function download() {
    const u = await load();
    if (!u) return;
    const a = document.createElement("a");
    a.href = u; a.download = name; a.click();
  }
  const isImage = mime.startsWith("image/");
  return (
    <div className="max-w-xs overflow-hidden rounded-lg border bg-card">
      {isImage && (url
        ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={caption ?? name} className="max-h-64 w-full object-contain" /></a>
        : <button type="button" onClick={load} className="flex h-24 w-full items-center justify-center text-xs text-muted-foreground">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show image"}</button>)}
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name}</span>{caption && <span className="block truncate text-muted-foreground">{caption}</span>}</span>
        {mime === "application/pdf" && <button type="button" className="text-primary underline" onClick={async () => { const u = await load(); if (u) window.open(u, "_blank"); }}>Open</button>}
        <button type="button" aria-label={`Download ${name}`} onClick={download} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}
