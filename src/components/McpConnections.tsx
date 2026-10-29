import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plug, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { connectionInput } from "@/lib/mcp-policy";
import { changeMcpConnection, connectMcp, listMcpConnections } from "@/lib/mcp.functions";

export function McpConnections() {
  const qc = useQueryClient();
  const list = useServerFn(listMcpConnections);
  const connect = useServerFn(connectMcp);
  const change = useServerFn(changeMcpConnection);
  const connections = useQuery({ queryKey: ["mcp-connections"], queryFn: () => list(), retry: false });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [trusted, setTrusted] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["mcp-connections"] });
  const save = useMutation({
    mutationFn: async () => {
      const parsed = connectionInput.safeParse({ name, url, token, trusted });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check connection details");
      return connect({ data: parsed.data });
    },
    onSuccess: (result) => {
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(result.message); setName(""); setUrl(""); setToken(""); setTrusted(false); refresh();
    },
    onError: () => toast.error("Could not save connection. Check the URL and sign-in, then retry."),
  });
  const update = useMutation({
    mutationFn: (data: { id: string; enabled?: boolean; remove?: boolean; retry?: boolean }) => change({ data: { remove: false, retry: false, ...data } }),
    onSuccess: (result) => { if (!result.ok) toast.error(result.message); refresh(); },
    onError: () => toast.error("Could not update connection. Please retry."),
  });
  return (
    <section className="space-y-4 border-t pt-8" aria-labelledby="mcp-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="mcp-title" className="flex items-center gap-2 font-semibold"><Plug className="size-4" /> External tools (MCP)</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => { setName("DeepWiki"); setUrl("https://mcp.deepwiki.com/mcp"); setToken(""); setTrusted(false); }}>DeepWiki</Button>
      </div>
      <p className="text-sm text-muted-foreground">Public or bearer-token servers only. OAuth sign-in is not available yet. Read-only tools only, including DeepWiki's three documentation tools.</p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="space-y-1.5"><Label htmlFor="mcp-name">Connection name</Label><Input id="mcp-name" required maxLength={80} placeholder="e.g. Project docs" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="mcp-url">Server URL</Label><Input id="mcp-url" type="url" required maxLength={2048} placeholder="https://server.example/mcp" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="mcp-token">Bearer token (optional)</Label><Input id="mcp-token" type="password" autoComplete="off" maxLength={4000} value={token} onChange={(e) => setToken(e.target.value)} /></div>
        <div className="flex items-start gap-2"><Checkbox id="mcp-trust" checked={trusted} onCheckedChange={(v) => setTrusted(v === true)} /><Label htmlFor="mcp-trust" className="text-sm leading-5 font-normal">I trust this server with the task information sent to its tools. Read-only labels are supplied by the server, not guaranteed by Forge.</Label></div>
        <Button disabled={!trusted || save.isPending}><Plug /> {save.isPending ? "Connecting…" : "Verify & connect"}</Button>
      </form>
      {connections.isPending && <p className="text-sm text-muted-foreground">Loading connections…</p>}
      {connections.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">Could not load connections. Check that you are signed in and retry.</p><Button variant="outline" size="sm" onClick={() => connections.refetch()}><RefreshCw /> Retry</Button></div>}
      {connections.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No external tools connected.</p>}
      <ul className="space-y-2">
        {(connections.data?.items ?? []).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="break-all text-xs text-muted-foreground">{item.url}</p><p className="mt-1 text-xs text-muted-foreground">{item.state === "failed" ? "Connection failed" : item.enabled ? "Enabled" : "Paused"} · {Array.isArray(item.tool_names) ? item.tool_names.length : 0} read-only tools</p></div>
            <Switch aria-label={`Enable ${item.name}`} disabled={update.isPending} checked={item.enabled} onCheckedChange={(enabled) => update.mutate({ id: item.id, enabled })} />
            <Button type="button" variant="ghost" size="icon" title="Recheck connection" aria-label={`Recheck ${item.name}`} disabled={update.isPending} onClick={() => update.mutate({ id: item.id, retry: true })}><RefreshCw /></Button>
            <Button type="button" variant="ghost" size="icon" title="Disconnect" aria-label={`Disconnect ${item.name}`} disabled={update.isPending} onClick={() => { if (window.confirm(`Disconnect ${item.name}?`)) update.mutate({ id: item.id, remove: true }); }}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </section>
  );
}