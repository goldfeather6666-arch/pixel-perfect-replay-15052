import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Copy, ExternalLink, Globe, Link2, Loader2, Maximize2, Minimize2, Monitor, MoreHorizontal, Play, RefreshCw, RotateCcw, RotateCw, ScrollText, ShieldCheck, Smartphone, Square, Tablet, Wrench, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canAutoRepair, previewNeedsRepair, previewRepairPrompt, redactPreviewDiagnostic } from "@/lib/preview-repair";
import { diagnosePreviewFn, getPreview, previewAccessFn, previewActionFn, reportPreviewErrors, revokePreviewLinks, startPreviewFn } from "@/lib/preview.functions";
import { VisualComparison } from "@/components/VisualComparison";

const DEVICES = { desktop: { w: "100%", h: "100%", icon: Monitor, label: "Desktop" }, tablet: { w: "820px", h: "1180px", icon: Tablet, label: "Tablet" }, mobile: { w: "390px", h: "844px", icon: Smartphone, label: "Mobile" } } as const;

function IconBtn({ label, children, ...rest }: { label: string; children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground [&_svg]:size-3.5" aria-label={label} title={label} {...rest}>{children}</Button>;
}
type Device = keyof typeof DEVICES;

const TONE: Record<string, string> = { ready: "bg-primary", starting: "bg-accent-foreground animate-pulse", unhealthy: "bg-destructive animate-pulse", error: "bg-destructive", crashed: "bg-destructive", stopped: "bg-muted-foreground", expired: "bg-muted-foreground" };

export function PreviewPanel({ id, onSend, agentBusy = false }: { id: string; onSend?: (prompt: string) => void | Promise<void>; agentBusy?: boolean }) {
  const qc = useQueryClient();
  const fetchPreview = useServerFn(getPreview);
  const start = useServerFn(startPreviewFn);
  const act = useServerFn(previewActionFn);
  const access = useServerFn(previewAccessFn);
  const revoke = useServerFn(revokePreviewLinks);
  const report = useServerFn(reportPreviewErrors);
  const diagnose = useServerFn(diagnosePreviewFn);
  const [device, setDevice] = useState<Device>("desktop");
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState<"errors" | "logs" | "health" | null>(null);
  const showLogs = drawer === "logs";
  const [landscape, setLandscape] = useState(false);
  const [path, setPath] = useState("/");
  const [src, setSrc] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [errors, setErrors] = useState<Array<{ m: string; path?: string }>>([]);
  const [repairOpen, setRepairOpen] = useState(false);
  const [dismissedFailure, setDismissedFailure] = useState<string | null>(null);
  const [sendingRepair, setSendingRepair] = useState(false);
  const [autoRepair, setAutoRepair] = useState(false);
  const [repairAttempts, setRepairAttempts] = useState(0);
  const lastAutoFailure = useRef<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const pendingErr = useRef<Array<{ m: string; path?: string }>>([]);

  const q = useQuery({
    queryKey: ["preview", id],
    queryFn: () => fetchPreview({ data: { id } }),
    refetchInterval: (query) => { const s = query.state.data?.status; return s === "starting" || s === "unhealthy" ? 1500 : s === "ready" ? 20000 : false; },
  });
  const p = q.data;
  const running = !!p && ["starting", "ready", "unhealthy", "error"].includes(p.status);
  const needsRepair = previewNeedsRepair(p?.status, errors);
  const failureKey = needsRepair ? `${p?.id}:${p?.status}:${errors.at(-1)?.m ?? "server"}` : null;
  useEffect(() => {
    if (failureKey && failureKey !== dismissedFailure) setRepairOpen(true);
    if (!failureKey) { setRepairOpen(false); setDismissedFailure(null); }
  }, [failureKey, dismissedFailure]);

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
      const item = { m: redactPreviewDiagnostic(e.data.forgePreviewError.slice(0, 1000)), ...(typeof e.data.path === "string" ? { path: redactPreviewDiagnostic(e.data.path.slice(0, 300)) } : {}) };
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
  const logs = useQuery({ queryKey: ["preview-logs", id], queryFn: () => act({ data: { id, action: "logs" } }), enabled: (showLogs || repairOpen) && !!p, refetchInterval: showLogs && running ? 3000 : false });
  const health = useQuery({ queryKey: ["preview-diagnosis", id], queryFn: () => diagnose({ data: { id } }), enabled: drawer === "health" || repairOpen, staleTime: 30000, retry: false });
  async function fixPreview() {
    if (!p || !onSend || agentBusy || sendingRepair) return;
    setSendingRepair(true);
    try {
      const [latest, diagnosis] = await Promise.all([logs.refetch(), health.refetch()]);
      const output = latest.data && "logs" in latest.data ? latest.data.logs : undefined;
      const captured = [...(p.browserErrors ?? []), ...errors].slice(-20);
      await onSend(previewRepairPrompt(p, captured, output, diagnosis.data));
      lastAutoFailure.current = failureKey;
      setRepairAttempts((n) => n + 1);
      setErrors([]);
      setDismissedFailure(failureKey);
      setRepairOpen(false);
    } catch (e) { toast.error(`Could not send repair: ${(e as Error).message}`); }
    finally { setSendingRepair(false); }
  }

  useEffect(() => {
    if (!canAutoRepair(autoRepair, agentBusy || sendingRepair, repairAttempts, failureKey, lastAutoFailure.current) || !onSend) return;
    lastAutoFailure.current = failureKey;
    void fixPreview();
    // The current diagnostic is captured by fixPreview; no repeated repair for the same failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRepair, agentBusy, sendingRepair, repairAttempts, failureKey, onSend]);

  const healthView = <div className="space-y-2 text-xs">
    <div className="flex items-center justify-between gap-2"><p className="font-medium">Connected-service checks</p><Button variant="ghost" size="sm" disabled={health.isFetching} onClick={() => void health.refetch()}>{health.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}Check</Button></div>
    {health.error && <p className="text-destructive">Checks unavailable. Retry; the AI can still inspect the preview.</p>}
    {health.isFetching && !health.data && <p role="status" className="text-muted-foreground">Checking preview, database and Vercel…</p>}
    {health.data?.checks.map((c) => <div key={c.service} className="border-b pb-2 last:border-0"><p className={`font-medium ${c.state === "error" ? "text-destructive" : c.state === "ok" ? "text-primary" : "text-muted-foreground"}`}>{c.service} · {c.state === "unlinked" ? "not linked" : c.state}</p><pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words font-sans text-muted-foreground">{c.detail}</pre></div>)}
    {health.data && <p className="text-muted-foreground">Checked {new Date(health.data.checkedAt).toLocaleTimeString()} · Read-only</p>}
  </div>;

  // Address bar: the gateway sets a path-scoped cookie on first load, so same-origin sub-paths work without the token.
  const base = (p?.base ?? "").replace(/\/$/, "");
  function syncPath() {
    try { const loc = frame.current?.contentWindow?.location; if (loc && base && loc.pathname.startsWith(base)) setPath((loc.pathname.slice(base.length) || "/") + loc.search.replace(/[?&]forge_t=[^&]*/, "").replace(/^&/, "?")); } catch { /* cross-origin page */ }
  }
  function go(target: string) {
    const clean = "/" + target.trim().replace(/^\/+/, "");
    try { if (frame.current?.contentWindow && base) { frame.current.contentWindow.location.href = base + clean; return; } } catch { /* fall through */ }
    setReload((n) => n + 1);
  }
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
      <Dialog open={repairOpen} onOpenChange={(open) => { setRepairOpen(open); if (!open) setDismissedFailure(failureKey); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Preview needs a fix</DialogTitle>
            <DialogDescription>{p?.status === "crashed" ? "The preview server crashed." : p?.status === "error" ? "The preview returned a server error." : "The preview reported a browser error."}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border bg-muted p-3 font-mono text-xs text-destructive">{redactPreviewDiagnostic(errors.length ? errors.slice(-3).map((e) => `${e.path ?? ""}: ${e.m}`).join("\n") : p?.logTail || (logs.data && "logs" in logs.data ? logs.data.logs : "") || `Status: ${p?.status ?? "unknown"}; HTTP: ${p?.lastHttp ?? "not recorded"}. No error output captured yet.`)}</pre>
          {healthView}
          {agentBusy && <p role="status" className="text-xs text-muted-foreground">An agent is already working. Send the repair after it finishes, or stop it in Chat.</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDismissedFailure(failureKey); setRepairOpen(false); }}>Dismiss</Button>
            <Button onClick={fixPreview} disabled={!onSend || agentBusy || sendingRepair}>{sendingRepair ? <Loader2 className="animate-spin" /> : <Wrench />} {sendingRepair ? "Sending…" : "Fix with AI"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Toolbar: status · back/forward/reload · address · devices · more */}
      <div className="flex items-center gap-1 border-b bg-card/40 px-2 py-1.5">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground" title={p?.framework && p.framework !== "unknown" ? `Development preview · ${p.framework}` : "Development preview — not production"}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE[p?.status ?? "stopped"] ?? "bg-muted-foreground"}`} />
          <span className="capitalize">{p ? (p.status === "ready" ? "Live" : p.status) : "Off"}</span>
        </span>
        {running && <>
          <IconBtn label="Back" disabled={!src} onClick={() => { try { frame.current?.contentWindow?.history.back(); } catch { /* cross-origin */ } }}><ArrowLeft /></IconBtn>
          <IconBtn label="Forward" disabled={!src} onClick={() => { try { frame.current?.contentWindow?.history.forward(); } catch { /* cross-origin */ } }}><ArrowRight /></IconBtn>
          <IconBtn label="Reload" disabled={!src} onClick={() => setReload((n) => n + 1)}><RefreshCw /></IconBtn>
          <form className="flex min-w-0 flex-1 items-center gap-1 rounded-full border bg-background px-2.5 py-0.5" onSubmit={(e) => { e.preventDefault(); go(path); }}>
            <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input aria-label="Page address" value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} className="h-6 min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none" placeholder="/" />
          </form>
        </>}
        {!running && <div className="flex-1" />}
        <div className="hidden items-center rounded-full bg-secondary p-0.5 sm:flex">
          {(Object.keys(DEVICES) as Device[]).map((d) => { const I = DEVICES[d].icon; return (
            <button key={d} type="button" aria-label={DEVICES[d].label} aria-pressed={device === d} onClick={() => setDevice(d)} className={`rounded-full p-1.5 ${device === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}><I className="h-3.5 w-3.5" /></button>
          ); })}
        </div>
        {device !== "desktop" && <IconBtn label="Rotate" onClick={() => setLandscape((v) => !v)}><RotateCw /></IconBtn>}
        <IconBtn label={full ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFull((f) => !f)}>{full ? <Minimize2 /> : <Maximize2 />}</IconBtn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="More preview options"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="flex items-center justify-around px-1 py-1 sm:hidden">
              {(Object.keys(DEVICES) as Device[]).map((d) => { const I = DEVICES[d].icon; return <button key={d} type="button" aria-label={DEVICES[d].label} onClick={() => setDevice(d)} className={`rounded-md p-2 ${device === d ? "bg-accent text-primary" : "text-muted-foreground"}`}><I className="h-4 w-4" /></button>; })}
            </div>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem disabled={!absolute} onSelect={() => { void navigator.clipboard.writeText(absolute); toast.success("Private link copied (works for you, ~30 min)"); }}><Copy />Copy private link</DropdownMenuItem>
            <DropdownMenuItem disabled={!absolute} onSelect={() => window.open(absolute, "_blank", "noopener")}><ExternalLink />Open in new tab</DropdownMenuItem>
            <DropdownMenuItem disabled={!running} onSelect={() => void share()}><Link2 />Share for 60 minutes</DropdownMenuItem>
            {p?.shareUntil && new Date(p.shareUntil) > new Date() && <DropdownMenuItem className="text-destructive" onSelect={async () => { await revoke({ data: { id } }); toast.success("All links revoked"); qc.invalidateQueries({ queryKey: ["preview", id] }); }}><Link2 />Revoke shared links</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { setDrawer("health"); }}><ShieldCheck />Health checks</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setDrawer("logs"); }}><ScrollText />Server logs</DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={autoRepair} disabled={!onSend} onCheckedChange={(value) => { setAutoRepair(!!value); setRepairAttempts(0); lastAutoFailure.current = null; }}>Auto-repair with AI {autoRepair ? `(${repairAttempts}/3)` : ""}</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!running || actM.isPending} onSelect={() => actM.mutate("restart")}><RotateCcw />Restart server</DropdownMenuItem>
            <DropdownMenuItem disabled={!running || actM.isPending} className="text-destructive" onSelect={() => actM.mutate("stop")}><Square />Stop server</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {(needsRepair || onSend) && running && (
        <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
          {needsRepair
            ? <><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" /><span className="min-w-0 flex-1 truncate text-destructive">{errors.at(-1)?.m ?? (p?.status === "error" ? "The app is returning server errors" : "The preview has a problem")}</span><Button size="sm" className="h-6 rounded-full px-2.5 text-xs" onClick={() => setRepairOpen(true)}><Wrench />Fix with AI</Button></>
            : <span className="flex-1 truncate text-muted-foreground">Viewing <span className="font-mono">{path || "/"}</span>{device !== "desktop" ? ` · ${DEVICES[device].label}${landscape ? " landscape" : ""}` : ""}</span>}
          <VisualComparison id={id} onSend={onSend} agentBusy={agentBusy} />
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-auto bg-muted/30">
        {!running ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="max-w-xs space-y-3">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent"><Globe className="h-6 w-6 text-primary" /></div>
              <p className="text-base font-semibold">{p?.status === "crashed" ? "The preview stopped working" : p?.status === "expired" ? "Preview went to sleep" : "See your app live"}</p>
              <p className="text-xs text-muted-foreground">Runs this task's latest version privately. Only you can open it unless you share a link. Your live site is never touched.</p>
              {p?.status === "crashed" && p.logTail && <pre className="max-h-40 overflow-auto rounded-lg border bg-background p-2 text-left font-mono text-[10px] text-destructive">{p.logTail.slice(-1500)}</pre>}
              <div className="flex justify-center gap-2">
                <Button className="rounded-full" onClick={() => startM.mutate()} disabled={startM.isPending}>{startM.isPending ? <><Loader2 className="animate-spin" /> Starting…</> : <><Play /> Start preview</>}</Button>
                {p?.status === "crashed" && onSend && <Button variant="outline" className="rounded-full" onClick={() => setRepairOpen(true)}><Wrench />Fix with AI</Button>}
              </div>
            </div>
          </div>
        ) : (
          <div className={`mx-auto h-full transition-[width] ${device !== "desktop" ? "py-3" : ""}`} style={{ width: device === "desktop" ? "100%" : landscape ? DEVICES[device].h : DEVICES[device].w, maxWidth: "100%" }}>
            {p?.status !== "ready" && (
              <div className={`absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 py-2 text-xs backdrop-blur ${p?.status === "error" ? "bg-destructive/15 text-destructive" : "bg-background/90 text-muted-foreground"}`}>
                {p?.status === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                {p?.status === "error" ? "The app is returning errors — open Logs or tap Fix with AI" : p?.status === "unhealthy" ? "Server stopped answering — checking…" : "Starting your app… the first start can take 1–3 min"}
              </div>
            )}
            {src && <iframe key={`${src}-${reload}`} ref={frame} src={src} onLoad={syncPath} title="Live preview" className={`h-full w-full bg-background ${device !== "desktop" ? "rounded-2xl border shadow-lg" : ""}`} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" />}
          </div>
        )}
      </div>

      {/* Bottom console: errors · logs · health with counts */}
      {running && (
        <div className="border-t bg-card/60">
          <div className="flex items-center gap-1 px-2 py-1 text-xs">
            {(["errors", "logs", "health"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={drawer === t} onClick={() => setDrawer((d) => (d === t ? null : t))} className={`rounded-full px-2.5 py-0.5 capitalize ${drawer === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "errors" ? `Console${errors.length ? ` · ${errors.length}` : ""}` : t}
              </button>
            ))}
            {drawer === "errors" && errors.length > 0 && <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setErrors([])}>Clear</button>}
            {drawer && <button type="button" aria-label="Close console" className={`${drawer === "errors" && errors.length ? "" : "ml-auto"} rounded p-1 text-muted-foreground`} onClick={() => setDrawer(null)}><X className="h-3.5 w-3.5" /></button>}
          </div>
          {drawer && (
            <div className="max-h-56 min-h-0 overflow-y-auto border-t px-2 py-2 font-mono text-[11px]">
              {drawer === "errors" && (errors.length ? errors.slice(-20).map((e, i) => <p key={i} className="break-words py-0.5 text-destructive" title={e.m}>{e.path ? <span className="text-muted-foreground">{e.path} </span> : null}{e.m}</p>) : <p className="font-sans text-muted-foreground">No browser errors. The AI can read anything that shows up here.</p>)}
              {drawer === "logs" && <pre className="whitespace-pre-wrap text-muted-foreground">{logs.data && "logs" in logs.data ? logs.data.logs || "(no output yet)" : "Loading logs…"}</pre>}
              {drawer === "health" && <div className="font-sans">{healthView}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
