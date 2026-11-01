import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, RefreshCw, X, Plug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMcpActions, resolveMcpActionRequest } from "@/lib/mcp-approval.functions";

export function McpActionApprovals({ sessionId, chat = false }: { sessionId: string; chat?: boolean }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const qc = useQueryClient();
  const list = useServerFn(listMcpActions);
  const resolve = useServerFn(resolveMcpActionRequest);
  const query = useQuery({ queryKey: ["mcp-actions", sessionId], queryFn: () => list({ data: { sessionId } }), refetchInterval: 3000, refetchOnWindowFocus: true, retry: false });
  const mutation = useMutation({
    mutationFn: (data: { id: string; approve: boolean }) => resolve({ data }),
    onSuccess: (r) => { setConfirmId(null); if (r.ok) toast.success(r.message); else toast.error(r.message); qc.invalidateQueries({ queryKey: ["mcp-actions", sessionId] }); qc.invalidateQueries({ queryKey: ["session", sessionId] }); },
    onError: () => { toast.error("Could not resolve action. Refresh to check its status before retrying."); qc.invalidateQueries({ queryKey: ["mcp-actions", sessionId] }); },
  });
  if (chat && !query.isError && !query.data?.items.length) return null;
  const titleId = `external-actions-${chat ? "chat" : "panel"}`;
  return (
    <section className="space-y-3" aria-labelledby={titleId} aria-live="polite">
      <h3 id={titleId} className="flex items-center gap-2 font-semibold"><Plug className="size-4" /> {chat ? "External action approvals" : "External actions"}</h3>
      {query.isPending && <p className="text-sm text-muted-foreground">Loading actions…</p>}
      {query.isError && <div role="alert"><p className="text-sm text-destructive">Could not load actions.</p><Button variant="ghost" size="sm" onClick={() => query.refetch()}><RefreshCw /> Retry</Button></div>}
      {query.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No external actions requested.</p>}
      <ul className="space-y-3">
        {(query.data?.items ?? []).map((action) => {
          const expired = Date.parse(action.expires_at) <= Date.now();
          return <li key={action.id} className="min-w-0 rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="min-w-0 flex-1 break-all text-sm font-medium">{action.server_name} · {action.tool_name}</h4>
              <span className="text-xs capitalize text-muted-foreground">{action.state === "pending" && expired ? "Expired" : action.state}</span>
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">{action.server_url}</p>
            <details className="my-3" open={confirmId === action.id || undefined}><summary className="cursor-pointer text-xs text-muted-foreground">Exact request details</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded border bg-muted p-2 font-mono text-xs">{JSON.stringify(action.arguments, null, 2)}</pre></details>
            {action.state === "pending" && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: action.id, approve: false })}><X /> Reject</Button>
              {confirmId === action.id ? <div className="w-full space-y-2 rounded border border-destructive/40 p-2">
                <p className="break-words text-xs">Execute this exact request? It may change or delete external data.</p>
                <div className="flex flex-wrap gap-2"><Button size="sm" disabled={expired || mutation.isPending} onClick={() => mutation.mutate({ id: action.id, approve: true })}><Check /> Confirm & execute</Button><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => setConfirmId(null)}>Cancel</Button></div>
              </div> : <Button size="sm" disabled={expired || mutation.isPending} onClick={() => setConfirmId(action.id)}><Check /> Approve & execute</Button>}
            </div>}
            {action.result && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Saved result</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all">{action.result}</pre></details>}
          </li>;
        })}
      </ul>
    </section>
  );
}