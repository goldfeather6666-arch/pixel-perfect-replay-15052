import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, Globe, Link2, Loader2, Maximize2, Minimize2, Monitor, Play, RefreshCw, RotateCcw, ScrollText, ShieldCheck, Smartphone, Square, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPreview, previewAccessFn, previewActionFn, reportPreviewErrors, revokePreviewLinks, startPreviewFn } from "@/lib/preview.functions";

const DEVICES = { desktop: { w: "100%", icon: Monitor, label: "Desktop" }, tablet: { w: "820px", icon: Tablet, label: "Tablet" }, mobile: { w: "390px", icon: Smartphone, label: "Mobile" } } as const;
type Device = keyof typeof DEVICES;

const TONE: Record<string, string> = { ready: "bg-primary", starting: "bg-accent-foreground animate-pulse", unhealthy: "bg-destructive animate-pulse", error: "bg-destructive", crashed: "bg-destructive", stopped: "bg-muted-foreground", expired: "bg-muted-foreground" };

export function PreviewPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const fetchPreview = useServerFn(getPreview);
  const start = useServerFn(startPreviewFn);
  const act = useServerFn(previewActionFn);
  const access = useServerFn(previewAccessFn);
  const revoke = useServerFn(revokePreviewLinks);
  const report = useServerFn(reportPreviewErrors);
  const [device, setDevice] = useState<Device>("desktop");
  const [full, setFull] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [errors, setErrors] = useState<Array<{ m: string; path?: string }>>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const pendingErr = useRef<Array<{ m: string; path?: string }>>([]);

  const q = useQuery({
    queryKey: ["preview", id],
    queryFn: () => fetchPreview({ data: { id } }),
    refetchInterval: (query) => { const s = query.state.data?.status; return s === "starting" || s === "unhealthy" ? 3000 : s === "ready" ? 20000 : false; },
  });
  const p = q.data;
  const running = !!p && ["starting", "ready", "unhealthy", "error"].includes(p.status);

  // Get a signed gateway URL once the server is running; refresh before the 30-min token expires.
  useEffect(() => {
    if (!running || !p) { setSrc(null); return; }
    let alive = true;
    const issue = () => access({ data: { id, kind: "own" } }).then((r) => alive && setSrc(r.url)).catch(() => {});
    void issue();
    const t = setInterval(issue, 25 * 60_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, p?.id, id]);

  // Reload the frame when the server transitions to ready.
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => { if (prevStatus.current && prevStatus.current !== "ready" && p?.status === "ready") setReload((n) => n + 1); prevStatus.current = p?.status; }, [p?.status]);

  // Runtime errors from the preview's injected bridge → panel + batched report so the agent can read them.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data?.forgePreviewError !== "string") return;
      const item = { m: e.data.forgePreviewError as string, path: typeof e.data.path === "string" ? e.data.path : undefined };
      setErrors((x) => [...x, item].slice(-30));
      pendingErr.current.push(item.path ? item : { m: item.m });
    };
    window.addEventListener("message", on);
    const flush = setInterval(() => {
      if (!pendingErr.current.length) return;
      const batch = pendingErr.current.splice(0, 20).map((x) => (x.path ? { m: x.m, path: x.path } : { m: x.m }));
      void report({ data: { id, errors: batch } }).catch(() => {});
    }, 4000);
    return () => { window.removeEventListener("message", on); clearInterval(flush); };
  }, [id, report]);

  const startM = useMutation({ mutationFn: () => start({ data: { id } }), onSuccess: () => { setErrors([]); qc.invalidateQueries({ queryKey: ["preview", id] }); }, onError: (e: Error) => toast.error(e.message) });
  const actM = useMutation({ mutationFn: (action: "stop" | "restart") => act({ data: { id, action } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["preview", id] }), onError: (e: Error) => toast.error(e.message) });
  const logs = useQuery({ queryKey: ["preview-logs", id], queryFn: () => act({ data: { id, action: "logs" } }), enabled: showLogs && !!p, refetchInterval: showLogs && running ? 3000 : false });

  const absolute = src ? `${typeof window !== "undefined" ? window.location.origin : ""}${src}` : "";
  async function share() {
    try {
      const r = await access({ data: { id, kind: "share", minutes: 60 } });
      await navigator.clipboard.writeText(`${window.location.origin}${r.url}`);
      toast.success("Share link copied — anyone with it can view for 60 minutes. Revoke anytime.");
      qc.invalidateQueries({ queryKey: ["preview", id] });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className={`flex min-h-0 flex-col bg-background ${full ? "fixed inset-0 z-50" : "h-full"}`}>
      <div className="flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
        <span className="flex items-center gap-1 rounded-md border border-primary/40 bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary" title="Development preview — not production">
          <ShieldCheck className="h-3 w-3" /> Preview
        </span>
        <span className={`h-2 w-2 rounded-full ${TONE[p?.status ?? "stopped"] ?? "bg-muted-foreground"}`} />
        <span className="text-xs capitalize text-muted-foreground">{p ? p.status : "not started"}{p?.framework && p.framework !== "unknown" ? ` · ${p.framework}` : ""}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {(Object.keys(DEVICES) as Device[]).map((d) => { const I = DEVICES[d].icon; return (
            <button key={d} type="button" aria-label={DEVICES[d].label} aria-pressed={device === d} onClick={() => setDevice(d)} className={`rounded p-1.5 ${device === d ? "bg-accent text-primary" : "text-muted-foreground"}`}><I className="h-3.5 w-3.5" /></button>
          ); })}
          <button type="button" aria-label="Refresh" disabled={!src} onClick={() => setReload((n) => n + 1)} className="rounded p-1.5 text-muted-foreground disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Logs" aria-pressed={showLogs} onClick={() => setShowLogs((s) => !s)} className={`rounded p-1.5 ${showLogs ? "text-primary" : "text-muted-foreground"}`}><ScrollText className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label={full ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFull((f) => !f)} className="rounded p-1.5 text-muted-foreground">{full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        </div>
      </div>

      {running && (
        <div className="flex items-center gap-1.5 border-b px-2 py-1 text-xs">
          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{p?.base}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Copy private link" disabled={!absolute} onClick={() => { navigator.clipboard.writeText(absolute); toast.success("Private link copied (works for you, ~30 min)"); }}><Copy /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Open in new tab" disabled={!absolute} asChild={!!absolute}>{absolute ? <a href={absolute} target="_blank" rel="noreferrer"><ExternalLink /></a> : <span><ExternalLink /></span>}</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={share}><Link2 /> Share</Button>
          {p?.shareUntil && new Date(p.shareUntil) > new Date() && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={async () => { await revoke({ data: { id } }); toast.success("All links revoked"); qc.invalidateQueries({ queryKey: ["preview", id] }); }}>Revoke</Button>}
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Restart server" disabled={actM.isPending} onClick={() => actM.mutate("restart")}><RotateCcw /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Stop server" disabled={actM.isPending} onClick={() => actM.mutate("stop")}><Square /></Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-auto bg-muted/30">
        {!running ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-xs space-y-3">
              <Globe className="mx-auto h-8 w-8 text-primary" />
              <p className="text-sm font-medium">{p?.status === "crashed" ? "The dev server crashed" : p?.status === "expired" ? "Preview expired" : "Live preview"}</p>
              <p className="text-xs text-muted-foreground">Runs this task's branch in its private cloud workspace. Only you can open it unless you share a link. Production is never touched.</p>
              {p?.status === "crashed" && p.logTail && <pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-left font-mono text-[10px] text-destructive">{p.logTail.slice(-1500)}</pre>}
              <Button onClick={() => startM.mutate()} disabled={startM.isPending}>{startM.isPending ? <><Loader2 className="animate-spin" /> Starting…</> : <><Play /> Start preview</>}</Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto h-full transition-[width]" style={{ width: DEVICES[device].w, maxWidth: "100%" }}>
            {p?.status !== "ready" && (
              p?.status === "error" ? <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-destructive/15 py-2 text-xs text-destructive backdrop-blur"><AlertTriangle className="h-3.5 w-3.5" />The app is returning server errors — tap Logs to see why, or ask the agent to fix it.</div> :
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-background/90 py-2 text-xs text-muted-foreground backdrop-blur">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />{p?.status === "error" ? "The app is returning server errors — open Logs to see why" : p?.status === "unhealthy" ? "Server stopped answering — checking…" : "Installing & starting the dev server… first start can take 1–3 min"}
              </div>
            )}
            {src && <iframe key={`${src}-${reload}`} ref={frame} src={src} title="Live preview" className={`h-full w-full bg-background ${device !== "desktop" ? "border-x shadow-lg" : ""}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" />}
          </div>
        )}
      </div>

      {(errors.length > 0 || showLogs) && (
        <div className="max-h-[40%] min-h-0 overflow-y-auto border-t bg-card/60 font-mono text-[11px]">
          {errors.length > 0 && (
            <div className="border-b p-2">
              <p className="mb-1 flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> Browser errors ({errors.length}) — the agent can read these <button type="button" className="ml-auto text-muted-foreground" onClick={() => setErrors([])}>clear</button></p>
              {errors.slice(-8).map((e, i) => <p key={i} className="truncate text-destructive/90" title={e.m}>{e.path ? `${e.path}: ` : ""}{e.m}</p>)}
            </div>
          )}
          {showLogs && <pre className="whitespace-pre-wrap p-2 text-muted-foreground">{logs.data && "logs" in logs.data ? logs.data.logs || "(no output yet)" : "Loading logs…"}</pre>}
        </div>
      )}
    </div>
  );
}
