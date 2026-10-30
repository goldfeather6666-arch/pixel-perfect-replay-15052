import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diagnoseMcpAccess } from "@/lib/mcp.functions";

export function McpDiagnostics() {
  const diagnose = useServerFn(diagnoseMcpAccess);
  const check = useMutation({ mutationFn: () => diagnose() });
  const result = check.data;
  return <section className="space-y-4 border-t pt-6" aria-labelledby="access-diagnostics-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="access-diagnostics-title" className="flex items-center gap-2 font-semibold"><Activity className="size-4" /> Access diagnostics</h2>
      <Button variant="outline" size="sm" disabled={check.isPending} onClick={() => check.mutate()}><RefreshCw className={check.isPending ? "animate-spin motion-reduce:animate-none" : ""} />{check.isPending ? "Checking…" : "Check access"}</Button>
    </div>
    {check.isError && <p role="alert" className="text-sm text-destructive">Access check failed. Check your sign-in and retry.</p>}
    {result && <div className="space-y-4 text-sm">
      <p className="text-xs text-muted-foreground">Checked {new Date(result.checkedAt).toLocaleString()} · Discovery only; no external actions executed.</p>
      <details open><summary className="cursor-pointer font-medium">Saved skills · {result.skills.items.filter((s) => s.accessible).length} accessible</summary>
        {result.skills.error && <p role="alert" className="mt-2 text-destructive">{result.skills.error}</p>}
        {!result.skills.error && !result.skills.items.length && <p className="mt-2 text-muted-foreground">No saved skills.</p>}
        <ul className="mt-2 divide-y">{result.skills.items.map((s, i) => <li key={`${s.name}-${i}`} className="flex items-start gap-2 py-2"><StatusIcon ok={s.accessible} /><div className="min-w-0"><p className="break-words font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.accessible ? "Agent can read instructions" : s.enabled ? "Access failed" : "Disabled; not provided to the agent"} · {s.chars.toLocaleString()} characters</p></div></li>)}</ul>
      </details>
      {result.connectionsError && <p role="alert" className="text-destructive">{result.connectionsError}</p>}
      {!result.connectionsError && !result.connections.length && <p className="text-muted-foreground">No saved MCP connections.</p>}
      {result.connections.map((c) => <details key={c.id} open className="border-t pt-3">
        <summary className="cursor-pointer break-words font-medium">{c.name} · {c.error ? "Connection failed" : `${c.tools.length} tools discovered`}</summary>
        <p className="mt-1 break-all text-xs text-muted-foreground">{c.url} · {c.enabled ? "Enabled" : "Paused"} · Saved state: {c.savedState}</p>
        {c.error && <p role="alert" className="mt-2 text-destructive">{c.error}</p>}
        <ul className="mt-2 divide-y">{c.tools.map((t) => <li key={t.name} className="flex items-start gap-2 py-2"><StatusIcon ok={t.status === "available" || t.status === "approval_required"} /><div className="min-w-0"><p className="break-all font-mono text-xs">{t.name}</p><p className={t.error ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"}>{t.detail}</p></div></li>)}</ul>
        {!c.error && !c.tools.length && <p className="mt-2 text-muted-foreground">Server returned no tools.</p>}
      </details>)}
    </div>}
  </section>;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 aria-label="Accessible" className="mt-0.5 size-4 shrink-0 text-primary" /> : <AlertCircle aria-label="Needs attention" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}