import { useState } from "react";
import { transientRetry } from "@/lib/chunk-recovery";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plug, RefreshCw, Trash2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { connectionInput } from "@/lib/mcp-policy";
import { changeMcpConnection, connectMcp, listMcpConnections, setMcpToolPolicy } from "@/lib/mcp.functions";
import { beginMcpOAuth } from "@/lib/mcp-oauth.functions";
import { McpDiagnostics } from "./McpDiagnostics";

export function McpConnections() {
  const qc = useQueryClient();
  const list = useServerFn(listMcpConnections);
  const connect = useServerFn(connectMcp);
  const change = useServerFn(changeMcpConnection);
  const begin = useServerFn(beginMcpOAuth);
  const connections = useQuery({ queryKey: ["mcp-connections"], queryFn: () => list(), ...transientRetry });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [allowActions, setAllowActions] = useState(false);
  const [authMode, setAuthMode] = useState<"token" | "oauth">("token");
  const refresh = () => qc.invalidateQueries({ queryKey: ["mcp-connections"] });
  const save = useMutation({
    mutationFn: async () => {
      const parsed = connectionInput.safeParse({ name, url, token, trusted, transport, allowActions });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check connection details");
      if (authMode === "oauth") return begin({ data: parsed.data });
      return { ...await connect({ data: parsed.data }), authUrl: "" };
    },
    onSuccess: (result) => {
      if (!result.ok) { toast.error(result.message); return; }
      if (result.authUrl) { refresh(); window.location.assign(result.authUrl); return; }
      toast.success(result.message); setName(""); setUrl(""); setToken(""); setTrusted(false); setTransport("http"); setAllowActions(false); refresh();
    },
    onError: () => toast.error("Could not save connection. Check the URL and sign-in, then retry."),
  });
  const update = useMutation({
    mutationFn: (data: { id: string; enabled?: boolean; remove?: boolean; retry?: boolean }) => change({ data: { remove: false, retry: false, ...data } }),
    onSuccess: (result) => { if (!result.ok) toast.error(result.message); refresh(); },
    onError: () => toast.error("Could not update connection. Please retry."),
  });
  const reconnect = useMutation({
    mutationFn: (item: NonNullable<typeof connections.data>["items"][number]) => begin({ data: { id: item.id, name: item.name, url: item.url, transport: item.transport_mode === "sse" ? "sse" : "http", token: "", allowActions: item.allow_actions, trusted: true } }),
    onSuccess: (r) => { refresh(); if (!r.ok) toast.error(r.message); else if (r.authUrl) window.location.assign(r.authUrl); else toast.success(r.message); },
    onError: () => toast.error("Could not start sign-in. Please retry."),
  });
  return (
    <section className="space-y-4 border-t pt-8" aria-labelledby="mcp-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mcp-title" className="flex items-center gap-2 font-semibold"><Plug className="size-4" /> External tools (MCP)</h2>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { setName("DeepWiki"); setUrl("https://mcp.deepwiki.com/mcp"); setToken(""); setTrusted(false); setTransport("http"); setAllowActions(false); setAuthMode("token"); }}>DeepWiki</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setName("Notion"); setUrl("https://mcp.notion.com/mcp"); setToken(""); setTrusted(false); setTransport("http"); setAuthMode("oauth"); }}>Notion</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setName("Framer"); setUrl("https://mcp.framer.com/mcp"); setToken(""); setTrusted(false); setTransport("http"); setAllowActions(false); setAuthMode("oauth"); }}>Framer</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setName("Motion docs"); setUrl("https://mcp.motion.dev"); setToken(""); setTrusted(false); setTransport("http"); setAllowActions(false); setAuthMode("token"); }}>Motion docs · Free</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setName("Motion Plus"); setUrl("https://mcp.motion.dev/plus"); setToken(""); setTrusted(false); setTransport("http"); setAllowActions(false); setAuthMode("oauth"); }}>Motion Plus · Paid</Button></div>
      </div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="space-y-1.5"><Label htmlFor="mcp-name">Connection name</Label><Input id="mcp-name" required maxLength={80} placeholder="e.g. Project docs" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="mcp-url">Server URL</Label><Input id="mcp-url" type="url" required maxLength={2048} placeholder="https://server.example/mcp" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        {/^https:\/\/mcp\.motion\.dev\/?$/.test(url) && <p className="text-xs text-muted-foreground">Free documentation search; no account or bearer token required. Some example source requires Motion Plus. Your AI provider usage still applies.</p>}
        {url === "https://mcp.motion.dev/plus" && <p className="text-xs text-muted-foreground">Requires a paid Motion Plus membership and service sign-in.</p>}
        <div className="space-y-1.5"><Label htmlFor="mcp-transport">Transport</Label><Select value={transport} onValueChange={(v) => setTransport(v === "sse" ? "sse" : "http")}><SelectTrigger id="mcp-transport"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="http">Streamable HTTP</SelectItem><SelectItem value="sse">SSE</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="mcp-auth">Authentication</Label><Select value={authMode} onValueChange={(v) => setAuthMode(v === "oauth" ? "oauth" : "token")}><SelectTrigger id="mcp-auth"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="token">Public / bearer token</SelectItem><SelectItem value="oauth">Sign in with service</SelectItem></SelectContent></Select></div>
        {authMode === "token" && <div className="space-y-1.5"><Label htmlFor="mcp-token">Bearer token (optional)</Label><Input id="mcp-token" type="password" autoComplete="off" maxLength={4000} value={token} onChange={(e) => setToken(e.target.value)} /></div>}
        <div className="flex items-start gap-2"><Checkbox id="mcp-actions" checked={allowActions} onCheckedChange={(v) => setAllowActions(v === true)} /><Label htmlFor="mcp-actions" className="text-sm leading-5 font-normal">Allow external action requests. Each action requires separate approval in the task's Changes tab, including in autonomous mode.</Label></div>
        <div className="flex items-start gap-2"><Checkbox id="mcp-trust" checked={trusted} onCheckedChange={(v) => setTrusted(v === true)} /><Label htmlFor="mcp-trust" className="text-sm leading-5 font-normal">I trust this server with the task information sent to its tools. Read-only labels are supplied by the server, not guaranteed by Forge.</Label></div>
        <Button disabled={!trusted || save.isPending}>{authMode === "oauth" ? <LogIn /> : <Plug />} {save.isPending ? "Connecting…" : authMode === "oauth" ? "Connect & sign in" : "Verify & connect"}</Button>
      </form>
      {connections.isPending && <p className="text-sm text-muted-foreground">Loading connections…</p>}
      {connections.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">Could not load connections. Check that you are signed in and retry.</p><Button variant="outline" size="sm" onClick={() => connections.refetch()}><RefreshCw /> Retry</Button></div>}
      {connections.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No external tools connected.</p>}
      <ul className="space-y-2">
        {(connections.data?.items ?? []).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="break-all text-xs text-muted-foreground">{item.url}</p><p className="mt-1 text-xs text-muted-foreground">{item.oauth_status === "authenticating" ? "Awaiting sign-in" : item.state === "failed" ? "Connection failed" : item.enabled ? "Enabled" : "Paused"} · {item.transport_mode === "sse" ? "SSE" : "HTTP"} · {Array.isArray(item.tool_names) ? item.tool_names.length : 0} tools · {item.allow_actions ? "Actions need approval" : "Read-only"}</p></div>
            {item.auth_mode === "oauth" && <Button type="button" variant="outline" size="sm" disabled={reconnect.isPending} onClick={() => reconnect.mutate(item)}><LogIn /> Sign in</Button>}
            <Switch aria-label={`Enable ${item.name}`} disabled={update.isPending} checked={item.enabled} onCheckedChange={(enabled) => update.mutate({ id: item.id, enabled })} />
            <Button type="button" variant="ghost" size="icon" title="Recheck connection" aria-label={`Recheck ${item.name}`} disabled={update.isPending} onClick={() => update.mutate({ id: item.id, retry: true })}><RefreshCw /></Button>
            {Array.isArray(item.tool_names) && item.tool_names.length > 0 && <ToolPermissions id={item.id} tools={item.tool_names as string[]} policies={(item.tool_policies ?? {}) as Record<string, string>} />}
            <Button type="button" variant="ghost" size="icon" title="Disconnect" aria-label={`Disconnect ${item.name}`} disabled={update.isPending} onClick={() => { if (window.confirm(`Disconnect ${item.name}?`)) update.mutate({ id: item.id, remove: true }); }}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <McpDiagnostics />
    </section>
  );
}
function ToolPermissions({ id, tools, policies }: { id: string; tools: string[]; policies: Record<string, string> }) {
  const qc = useQueryClient();
  const save = useServerFn(setMcpToolPolicy);
  const [open, setOpen] = useState(false);
  return (
    <div className="basis-full">
      <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Set"} per-tool permissions</button>
      {open && (
        <ul className="mt-2 space-y-1">
          {tools.map((t) => (
            <li key={t} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono">{t}</span>
              <select aria-label={`Permission for ${t}`} className="h-9 rounded-md border bg-background px-2" value={policies[t] ?? "allow"}
                onChange={async (e) => {
                  try { await save({ data: { id, tool: t, policy: e.target.value as "allow" | "ask" | "deny" | "always" } }); await qc.invalidateQueries({ queryKey: ["mcp-connections"] }); }
                  catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
                }}>
                <option value="allow">Default</option>
                <option value="always">Always allow</option>
                <option value="ask">Always ask</option>
                <option value="deny">Never use</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
