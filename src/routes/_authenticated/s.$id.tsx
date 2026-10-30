import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { ImagePlus, Check, ChevronRight, ListChecks, Coins, History, Pencil, Save, FileCode, GitPullRequest, Loader2, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getRepoMemory, clearRepoMemory, stopSession, deleteSession, getDiff, getSession, getTree, openPullRequest, readFile, resolvePending, restoreCheckpoint, saveFile, updateSession } from "@/lib/app.functions";
import type { AgentEvent, ChatMessage, PendingChange, ToolLog } from "@/lib/providers";
import { pageMeta } from "@/lib/page-meta";
import { McpActionApprovals } from "@/components/McpActionApprovals";
import { TerminalView } from "@/components/TerminalView";
import { DeployPanel } from "@/components/DeployPanel";

export const Route = createFileRoute("/_authenticated/s/$id")({
  head: () => ({ meta: pageMeta("Task — Forge", "Review your coding agent's conversation, files and proposed changes.") }),
  component: Workspace,
});

function Workspace() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const fetchSession = useServerFn(getSession);
  const update = useServerFn(updateSession);
  const remove = useServerFn(deleteSession);
  const stop = useServerFn(stopSession);
  const [running, setRunning] = useState(false);
  const session = useQuery({
    queryKey: ["session", id],
    queryFn: () => fetchSession({ data: { id } }),
    // While a run continues in the background (tab was closed/reopened), follow its saved progress.
    refetchInterval: (q) => (!running && (q.state.data as { running?: boolean } | undefined)?.running ? 3000 : false),
  });
  const bgRunning = !running && !!(session.data as { running?: boolean } | undefined)?.running;
  const [images, setImages] = useState<{ mediaType: string; data: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  async function addImages(files: FileList | null) {
    for (const f of Array.from(files ?? []).slice(0, 4 - images.length)) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.size > 5_000_000) { toast.error(`${f.name}: use PNG/JPEG/WebP/GIF under 5 MB`); continue; }
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
      setImages((x) => [...x, { mediaType: f.type, data, name: f.name }]);
    }
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [input, setInput] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [usage, setUsage] = useState({ input: 0, output: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const lastWasPlan = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (session.data && !running) {
      setMessages(session.data.messages ?? []);
      setPending(session.data.pending ?? []);
      setUsage(((session.data as { usage?: { input: number; output: number } }).usage) ?? { input: 0, output: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  useEffect(() => { taRef.current?.focus(); }, [running]);

  async function send(override?: string, forcePlan?: boolean) {
    let text = (override ?? input).trim();
    if (!text || running || bgRunning) return;
    let plan = forcePlan ?? planMode;
    const cmd = text.match(/^\/(\w+)\s*([\s\S]*)$/);
    if (cmd) {
      const [, name, rest] = cmd;
      if (name === "plan") { plan = true; text = rest || "Make a plan for the next step."; }
      else if (name === "test") text = `Run the project's tests/typecheck/build in the sandbox. Fix any failures and re-run until they pass. ${rest}`.trim();
      else if (name === "review") text = `Review the changes on this task branch versus the base branch for bugs, security issues and missing tests. Do not edit files; list findings by severity. ${rest}`.trim();
      else if (name === "explain") text = `Explain how this part of the codebase works, citing files: ${rest || "overall architecture"}`;
      else if (name === "help") { toast.info("Commands: /plan, /test, /review, /explain"); setInput(""); return; }
    }
    setInput("");
    setImages([]);
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    setRunning(true);
    lastWasPlan.current = plan;
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", tools: [] }]);
    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((ms) => { const last = ms.at(-1); return last ? [...ms.slice(0, -1), fn(last)] : ms; });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ sessionId: id, message: text, plan, images: images.map(({ mediaType, data }) => ({ mediaType, data })) }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const e = JSON.parse(line) as AgentEvent;
          if (e.t === "text") patchLast((m) => ({ ...m, content: m.content + e.d }));
          else if (e.t === "tool")
            patchLast((m) => ({
              ...m,
              content: "",
              tools: [
                ...(m.tools ?? []),
                ...(m.content.trim() ? [{ id: `note-${e.id}`, name: "note", input: {}, ok: true, summary: m.content.trim() }] : []),
                { id: e.id, name: e.name, input: e.input },
              ],
            }));
          else if (e.t === "tool-result")
            patchLast((m) => ({ ...m, tools: m.tools?.map((t) => (t.id === e.id ? { ...t, ok: e.ok, summary: e.summary } : t)) }));
          else if (e.t === "pending") setPending([...e.pending]);
          else if (e.t === "usage") setUsage({ input: ((session.data as { usage?: { input: number } } | undefined)?.usage?.input ?? 0) + e.input, output: ((session.data as { usage?: { output: number } } | undefined)?.usage?.output ?? 0) + e.output });
          else if (e.t === "error") toast.error(e.m);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Forge", { body: "Your agent finished." });
      qc.invalidateQueries({ queryKey: ["session", id] });
      qc.invalidateQueries({ queryKey: ["diff", id] });
      qc.invalidateQueries({ queryKey: ["tree", id] });
      qc.invalidateQueries({ queryKey: ["mcp-actions", id] });
    }
  }

  const s = session.data;
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        {s && (
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="truncate font-mono text-muted-foreground">{s.repo} · {s.work_branch}</span>
            <button
              className="shrink-0 rounded border px-2 py-0.5 font-mono capitalize hover:border-primary"
              title="Toggle mode"
              onClick={async () => {
                await update({ data: { id, mode: s.mode === "supervised" ? "autonomous" : "supervised" } });
                qc.invalidateQueries({ queryKey: ["session", id] });
              }}
            >
              {s.mode}
            </button>
            {usage.input + usage.output > 0 && (
              <span className="hidden shrink-0 items-center gap-1 font-mono text-muted-foreground sm:flex" title="Tokens used by this task (input / output)">
                <Coins className="h-3 w-3" />{fmt(usage.input)} / {fmt(usage.output)}
              </span>
            )}
          </div>
        )}
      </AppHeader>
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="deploy">Deploy</TabsTrigger>
          <TabsTrigger value="changes">Changes{pending.length ? ` (${pending.length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.length === 0 && (
                <p className="py-16 text-center text-sm text-muted-foreground">Describe a task. The agent will read the repo and make changes on <span className="font-mono">{s?.work_branch}</span>.</p>
              )}
              {messages.map((m, i) => (
                <MessageView key={i} m={m} live={running && i === messages.length - 1} />
              ))}
              {!running && messages.at(-1)?.role === "assistant" && lastWasPlan.current && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { lastWasPlan.current = false; setPlanMode(false); send("The plan is approved. Implement it now, then verify with tests.", false); }}><Check /> Approve plan & build</Button>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>
          <form className="border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 text-xs">
              <button type="button" onClick={() => setPlanMode(!planMode)} aria-pressed={planMode}
                className={`flex items-center gap-1 rounded border px-2 py-0.5 ${planMode ? "border-primary text-primary" : "text-muted-foreground"}`}>
                <ListChecks className="h-3 w-3" /> Plan first
              </button>
              <span className="hidden text-muted-foreground sm:inline">Type / for commands: /plan /test /review /explain</span>
            </div>
            {bgRunning && <p className="mx-auto mb-2 flex max-w-3xl items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Still working in the background — progress updates here.</p>}
            {images.length > 0 && (
              <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
                {images.map((im, i) => (
                  <span key={i} className="relative">
                    <img src={`data:${im.mediaType};base64,${im.data}`} alt={im.name} className="h-14 w-14 rounded border object-cover" />
                    <button type="button" aria-label={`Remove ${im.name}`} className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5" onClick={() => setImages((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={planMode ? "Describe the task — the agent will plan first" : "e.g. Add a dark-mode toggle to the header"}
                className="max-h-48 min-h-11 resize-none"
                rows={1}
              />
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              <Button type="button" size="icon" variant="ghost" aria-label="Attach image" disabled={images.length >= 4} onClick={() => fileRef.current?.click()}><ImagePlus /></Button>
              {running || bgRunning ? (
                <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={() => { stop({ data: { id } }).catch(() => {}); }}><Square /></Button>
              ) : (
                <Button size="icon" aria-label="Send" disabled={!input.trim()}><Send /></Button>
              )}
            </div>
          </form>
        </TabsContent>
        <TabsContent value="files" className="min-h-0 flex-1 overflow-hidden">
          <FilesView id={id} />
        </TabsContent>
        <TabsContent value="terminal" className="min-h-0 flex-1 overflow-hidden">
          <TerminalView id={id} />
        </TabsContent>
        <TabsContent value="deploy" className="min-h-0 flex-1 overflow-y-auto">
          <DeployPanel id={id} />
        </TabsContent>
        <TabsContent value="changes" className="min-h-0 flex-1 overflow-y-auto">
          <ChangesView id={id} pending={pending} onResolved={(rem) => { setPending(rem ?? []); qc.invalidateQueries({ queryKey: ["diff", id] }); qc.invalidateQueries({ queryKey: ["tree", id] }); }} />
          {s && <MemoryView repo={s.repo} />}
          <div className="mx-auto max-w-3xl px-3 pb-8">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => { await remove({ data: { id } }); nav({ to: "/app" }); }}>
              <Trash2 /> Delete task (branch stays on GitHub)
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MessageView({ m, live }: { m: ChatMessage; live: boolean }) {
  if (m.role === "user")
    return <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-secondary px-4 py-2.5 text-sm">{m.content}</div>;
  return (
    <div className="space-y-2 text-sm">
      {!!m.tools?.length && <ActivityView tools={m.tools} live={live} />}
      {m.content && <div className="prose-agent"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
      {live && !m.content && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
    </div>
  );
}

function ActivityView({ tools, live }: { tools: ToolLog[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const busy = live && tools.some((t) => t.ok === undefined);
  const failed = tools.filter((t) => t.ok === false).length;
  const current = [...tools].reverse().find((t) => t.ok === undefined);
  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground" onClick={() => setOpen(!open)}>
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Wrench className="h-3 w-3" />}
        <span>{busy ? `Working… ${current ? current.name : ""}` : `Background activity · ${tools.filter((t) => t.name !== "note").length} steps`}</span>
        {failed > 0 && <span className="text-destructive">{failed} failed</span>}
      </button>
      {open && <div className="space-y-1 border-t p-2">{tools.map((t) => <ToolView key={t.id} t={t} />)}</div>}
    </div>
  );
}

function ToolView({ t }: { t: ToolLog }) {
  const [open, setOpen] = useState(false);
  if (t.name === "note") return <p className="px-1 py-0.5 text-xs italic text-muted-foreground">{t.summary}</p>;
  const arg = (t.input as { path?: string; prefix?: string; query?: string }) ?? {};
  const label = arg.path ?? arg.query ?? (arg.prefix || "/");
  return (
    <div className="rounded-md border bg-muted/40 font-mono text-xs">
      <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left" onClick={() => setOpen(!open)}>
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <Wrench className="h-3 w-3 text-muted-foreground" />
        <span className="text-primary">{t.name}</span>
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="ml-auto">
          {t.ok === undefined ? <Loader2 className="h-3 w-3 animate-spin" /> : t.ok ? <Check className="h-3 w-3 text-success" /> : <X className="h-3 w-3 text-destructive" />}
        </span>
      </button>
      {open && <pre className="max-h-60 overflow-auto whitespace-pre-wrap border-t px-3 py-2 text-muted-foreground">{t.summary ?? "running…"}</pre>}
    </div>
  );
}

function FilesView({ id }: { id: string }) {
  const fetchTree = useServerFn(getTree);
  const fetchFile = useServerFn(readFile);
  const tree = useQuery({ queryKey: ["tree", id], queryFn: () => fetchTree({ data: { id } }) });
  const [path, setPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const file = useQuery({ queryKey: ["file", id, path], queryFn: () => fetchFile({ data: { id, path: path! } }), enabled: !!path });
  const save = useServerFn(saveFile);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [path]);
  const saveM = useMutation({
    mutationFn: () => save({ data: { id, path: path!, content: draft ?? "", message: `edit ${path}` } }),
    onSuccess: () => {
      toast.success("Committed to task branch");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["file", id, path] });
      qc.invalidateQueries({ queryKey: ["diff", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const files = tree.data?.filter((f) => f.toLowerCase().includes(filter.toLowerCase())) ?? [];
  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className={`flex min-h-0 flex-col border-r md:w-72 ${path ? "hidden md:flex" : "flex flex-1 md:flex-none"}`}>
        <input className="m-2 rounded-md border bg-background px-2 py-1.5 text-sm" placeholder="Filter files" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="min-h-0 flex-1 overflow-y-auto pb-4 font-mono text-xs">
          {tree.isLoading && <li className="px-3 text-muted-foreground">Loading…</li>}
          {tree.error && <li className="px-3 text-destructive">{(tree.error as Error).message}</li>}
          {files.slice(0, 1000).map((f) => (
            <li key={f}>
              <button onClick={() => setPath(f)} className={`flex w-full items-center gap-1.5 truncate px-3 py-1 text-left hover:bg-accent ${f === path ? "bg-accent text-primary" : ""}`}>
                <FileCode className="h-3 w-3 shrink-0" /> <span className="truncate">{f}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {path && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2 font-mono text-xs">
            <button className="md:hidden" onClick={() => setPath(null)}>← </button>
            <span className="flex-1 truncate">{path}</span>
            {draft === null ? (
              <Button size="sm" variant="ghost" disabled={typeof file.data !== "string"} onClick={() => setDraft(file.data ?? "")}><Pencil /> Edit</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button size="sm" disabled={saveM.isPending || draft === file.data} onClick={() => saveM.mutate()}><Save /> Commit</Button>
              </>
            )}
          </div>
          {draft !== null ? (
            <textarea
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget, a = t.selectionStart;
                  setDraft(draft.slice(0, a) + "  " + draft.slice(t.selectionEnd));
                  requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; });
                }
              }}
              className="min-h-0 flex-1 resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none"
            />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
              {file.isLoading ? "Loading…" : file.data ?? "(file not found)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ChangesView({ id, pending, onResolved }: { id: string; pending: PendingChange[]; onResolved: (remaining?: PendingChange[]) => void }) {
  const fetchDiff = useServerFn(getDiff);
  const resolve = useServerFn(resolvePending);
  const pr = useServerFn(openPullRequest);
  const diff = useQuery({ queryKey: ["diff", id], queryFn: () => fetchDiff({ data: { id } }) });
  const resolveM = useMutation({
    mutationFn: (v: { approve: boolean; paths?: string[] }) => resolve({ data: { id, ...v } }),
    onSuccess: (r) => { toast.success(r.committed.length ? `Committed ${r.committed.length} file(s)` : "Discarded"); onResolved(r.remaining as PendingChange[]); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useServerFn(restoreCheckpoint);
  const restoreM = useMutation({
    mutationFn: (sha: string) => restore({ data: { id, sha } }),
    onSuccess: () => { toast.success("Branch restored"); onResolved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const prM = useMutation({
    mutationFn: () => pr({ data: { id } }),
    onSuccess: (url) => { toast.success("Pull request opened"); window.open(url, "_blank", "noopener"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-3">
      <McpActionApprovals sessionId={id} />
      {pending.length > 0 && (
        <section className="rounded-lg border border-primary/50 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <h3 className="flex-1 font-semibold">Waiting for your approval</h3>
            <Button size="sm" variant="outline" onClick={() => resolveM.mutate({ approve: false })} disabled={resolveM.isPending}><X /> Discard</Button>
            <Button size="sm" onClick={() => resolveM.mutate({ approve: true })} disabled={resolveM.isPending}><Check /> Approve & commit</Button>
          </div>
          {pending.map((c, i) => (
            <PendingView key={i} c={c} busy={resolveM.isPending}
              onAccept={() => resolveM.mutate({ approve: true, paths: [c.path] })}
              onReject={() => resolveM.mutate({ approve: false, paths: [c.path] })} />
          ))}
        </section>
      )}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 font-semibold">Committed on branch</h3>
          <Button size="sm" variant="outline" disabled={!diff.data?.ahead_by || prM.isPending} onClick={() => prM.mutate()}><GitPullRequest /> Open pull request</Button>
        </div>
        {diff.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {diff.data && diff.data.commits.length > 0 && (
          <div className="mb-4 rounded-md border bg-card">
            <p className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold text-muted-foreground"><History className="h-3 w-3" /> Checkpoints</p>
            <ul className="divide-y text-xs">
              {[...diff.data.commits].reverse().map((c, i) => (
                <li key={c.sha} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-mono text-muted-foreground">{c.sha.slice(0, 7)}</span>
                  <span className="flex-1 truncate">{c.message.split("\n")[0]}</span>
                  {i > 0 && (
                    <Button size="sm" variant="ghost" disabled={restoreM.isPending}
                      onClick={() => confirm("Rewind the task branch to this point? Later commits are removed from the branch.") && restoreM.mutate(c.sha)}>
                      Restore
                    </Button>
                  )}
                </li>
              ))}
              <li className="flex items-center gap-2 px-3 py-1.5">
                <span className="font-mono text-muted-foreground">{diff.data.base_sha.slice(0, 7)}</span>
                <span className="flex-1 truncate text-muted-foreground">Start (base branch)</span>
                <Button size="sm" variant="ghost" disabled={restoreM.isPending}
                  onClick={() => confirm("Undo all of this task's commits?") && restoreM.mutate(diff.data!.base_sha)}>
                  Undo all
                </Button>
              </li>
            </ul>
          </div>
        )}
        {diff.data && diff.data.files.length === 0 && <p className="text-sm text-muted-foreground">No commits yet.</p>}
        <div className="space-y-3">
          {diff.data?.files.map((f) => (
            <div key={f.filename} className="overflow-hidden rounded-md border">
              <div className="border-b bg-muted px-3 py-1.5 font-mono text-xs">{f.status} · {f.filename}</div>
              <PatchView patch={f.patch} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PatchView({ patch }: { patch: string }) {
  return (
    <pre className="max-h-96 overflow-auto font-mono text-xs">
      {patch.split("\n").map((l, i) => (
        <div key={i} className={`px-3 ${l.startsWith("+") ? "bg-added" : l.startsWith("-") ? "bg-removed" : l.startsWith("@@") ? "text-muted-foreground" : ""}`}>{l || " "}</div>
      ))}
    </pre>
  );
}

function simpleDiff(a: string, b: string) {
  // Line-level diff via LCS (bounded for large files).
  const x = a.split("\n"), y = b.split("\n");
  if (x.length * y.length > 4_000_000) return [...x.map((l) => "-" + l), ...y.map((l) => "+" + l)].join("\n");
  const dp = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push(" " + x[i]); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push("-" + x[i++]);
    else out.push("+" + y[j++]);
  }
  while (i < x.length) out.push("-" + x[i++]);
  while (j < y.length) out.push("+" + y[j++]);
  return out.join("\n");
}

function PendingView({ c, busy, onAccept, onReject }: { c: PendingChange; busy: boolean; onAccept: () => void; onReject: () => void }) {
  const patch = c.action === "delete" ? simpleDiff(c.original ?? "", "") : simpleDiff(c.original ?? "", c.content ?? "");
  return (
    <div className="border-b last:border-0">
      <div className="flex items-center gap-1 px-3 py-1.5 font-mono text-xs text-muted-foreground">
        <span className="flex-1 truncate">{c.action === "delete" ? "delete" : c.original == null ? "create" : "modify"} · {c.path}</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReject} aria-label={`Reject ${c.path}`}><X /></Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onAccept} aria-label={`Accept ${c.path}`}><Check /></Button>
      </div>
      <PatchView patch={c.original == null && c.action === "write" ? (c.content ?? "").split("\n").map((l) => "+" + l).join("\n") : patch} />
    </div>
  );
}

function fmt(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

function MemoryView({ repo }: { repo: string }) {
  const get = useServerFn(getRepoMemory);
  const clear = useServerFn(clearRepoMemory);
  const qc = useQueryClient();
  const mem = useQuery({ queryKey: ["memory", repo], queryFn: () => get({ data: { repo } }) });
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-auto max-w-3xl px-3 pb-4">
      <div className="rounded-md border bg-card">
        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold" onClick={() => setOpen(!open)}>
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="flex-1">Repo memory</span>
          <span className="text-xs font-normal text-muted-foreground">{mem.data ? `saved ${new Date(mem.data.updated_at).toLocaleDateString()}` : "none yet"}</span>
        </button>
        {open && (
          <div className="border-t p-3">
            {mem.data ? (
              <>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{mem.data.notes}</pre>
                <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={async () => { await clear({ data: { repo } }); qc.invalidateQueries({ queryKey: ["memory", repo] }); toast.success("Memory cleared"); }}><Trash2 /> Forget</Button>
              </>
            ) : <p className="text-xs text-muted-foreground">The agent saves notes about this repo after exploring it, so later tasks skip the full scan.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
