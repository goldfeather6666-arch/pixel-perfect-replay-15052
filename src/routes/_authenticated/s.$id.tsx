import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Check, ChevronRight, History, Pencil, Save, FileCode, GitPullRequest, Loader2, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { deleteSession, getDiff, getSession, getTree, openPullRequest, readFile, resolvePending, restoreCheckpoint, saveFile, updateSession } from "@/lib/app.functions";
import type { AgentEvent, ChatMessage, PendingChange, ToolLog } from "@/lib/providers";
import { pageMeta } from "@/lib/page-meta";

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
  const session = useQuery({ queryKey: ["session", id], queryFn: () => fetchSession({ data: { id } }) });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (session.data && !running) {
      setMessages(session.data.messages ?? []);
      setPending(session.data.pending ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages]);
  useEffect(() => taRef.current?.focus(), [running]);

  async function send() {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setRunning(true);
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", tools: [] }]);
    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1]!)]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ sessionId: id, message: text }),
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
          else if (e.t === "tool") patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { id: e.id, name: e.name, input: e.input }] }));
          else if (e.t === "tool-result")
            patchLast((m) => ({ ...m, tools: m.tools?.map((t) => (t.id === e.id ? { ...t, ok: e.ok, summary: e.summary } : t)) }));
          else if (e.t === "pending") setPending([...e.pending]);
          else if (e.t === "error") toast.error(e.m);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ["session", id] });
      qc.invalidateQueries({ queryKey: ["diff", id] });
      qc.invalidateQueries({ queryKey: ["tree", id] });
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
          </div>
        )}
      </AppHeader>
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
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
              <div ref={endRef} />
            </div>
          </div>
          <form className="border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <Textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="e.g. Add a dark-mode toggle to the header"
                className="max-h-48 min-h-11 resize-none"
                rows={1}
              />
              {running ? (
                <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={() => abortRef.current?.abort()}><Square /></Button>
              ) : (
                <Button size="icon" aria-label="Send" disabled={!input.trim()}><Send /></Button>
              )}
            </div>
          </form>
        </TabsContent>
        <TabsContent value="files" className="min-h-0 flex-1 overflow-hidden">
          <FilesView id={id} />
        </TabsContent>
        <TabsContent value="changes" className="min-h-0 flex-1 overflow-y-auto">
          <ChangesView id={id} pending={pending} onResolved={() => { setPending([]); qc.invalidateQueries({ queryKey: ["diff", id] }); qc.invalidateQueries({ queryKey: ["tree", id] }); }} />
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
      {m.tools?.map((t) => <ToolView key={t.id} t={t} />)}
      {m.content && <div className="prose-agent"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
      {live && !m.content && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
    </div>
  );
}

function ToolView({ t }: { t: ToolLog }) {
  const [open, setOpen] = useState(false);
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
  useEffect(() => setDraft(null), [path]);
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

function ChangesView({ id, pending, onResolved }: { id: string; pending: PendingChange[]; onResolved: () => void }) {
  const fetchDiff = useServerFn(getDiff);
  const resolve = useServerFn(resolvePending);
  const pr = useServerFn(openPullRequest);
  const diff = useQuery({ queryKey: ["diff", id], queryFn: () => fetchDiff({ data: { id } }) });
  const resolveM = useMutation({
    mutationFn: (approve: boolean) => resolve({ data: { id, approve } }),
    onSuccess: (r) => { toast.success(r.committed.length ? `Committed ${r.committed.length} file(s)` : "Discarded staged changes"); onResolved(); },
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
      {pending.length > 0 && (
        <section className="rounded-lg border border-primary/50 bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <h3 className="flex-1 font-semibold">Waiting for your approval</h3>
            <Button size="sm" variant="outline" onClick={() => resolveM.mutate(false)} disabled={resolveM.isPending}><X /> Discard</Button>
            <Button size="sm" onClick={() => resolveM.mutate(true)} disabled={resolveM.isPending}><Check /> Approve & commit</Button>
          </div>
          {pending.map((c, i) => <PendingView key={i} c={c} />)}
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

function PendingView({ c }: { c: PendingChange }) {
  const patch = c.action === "delete" ? simpleDiff(c.original ?? "", "") : simpleDiff(c.original ?? "", c.content ?? "");
  return (
    <div className="border-b last:border-0">
      <div className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{c.action === "delete" ? "delete" : c.original == null ? "create" : "modify"} · {c.path}</div>
      <PatchView patch={c.original == null && c.action === "write" ? (c.content ?? "").split("\n").map((l) => "+" + l).join("\n") : patch} />
    </div>
  );
}
