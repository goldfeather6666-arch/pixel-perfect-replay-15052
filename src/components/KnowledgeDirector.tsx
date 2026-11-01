import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Brain, Pencil, Plug, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getRepoMemory, readFile, saveFile } from "@/lib/app.functions";
import { addMemory, deleteMemory, listMemories } from "@/lib/engine.functions";
import { listMcpConnections } from "@/lib/mcp.functions";

/** Every tab refreshes on its own so new agent memories and edits show up live. */
const LIVE = { refetchInterval: 5000, refetchOnWindowFocus: true } as const;
const RULE_FILES = ["AGENTS.md", "CLAUDE.md", ".cursorrules"];

export function KnowledgeDirector({ id, repo }: { id: string; repo: string }) {
  const [tab, setTab] = useState<"rules" | "memory" | "tools">("rules");
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1 text-xs">
        {([["rules", "Rules", BookOpen], ["memory", "Memory", Brain], ["tools", "Tools", Plug]] as const).map(([k, l, I]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex items-center justify-center gap-1 rounded-md py-1.5 ${tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}><I className="h-3 w-3" />{l}</button>
        ))}
      </div>
      {tab === "rules" && <Rules id={id} />}
      {tab === "memory" && <Memory repo={repo} />}
      {tab === "tools" && <Tools />}
    </div>
  );
}

function Rules({ id }: { id: string }) {
  const read = useServerFn(readFile);
  const [file, setFile] = useState(RULE_FILES[0]!);
  const save = useServerFn(saveFile);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["file", id, file], queryFn: () => read({ data: { id, path: file } }), ...LIVE, enabled: draft === null });
  const put = useMutation({
    mutationFn: (content: string) => save({ data: { id, path: file, content, message: `Update ${file}` } }),
    onSuccess: () => { toast.success(`${file} saved to the task branch`); setDraft(null); qc.invalidateQueries({ queryKey: ["file", id, file] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="panel overflow-hidden">
      <div className="flex gap-1 border-b p-1.5">
        {RULE_FILES.map((f) => <button key={f} type="button" onClick={() => { setFile(f); setDraft(null); }} className={`rounded px-2 py-1 font-mono text-[11px] ${f === file ? "bg-accent text-primary" : "text-muted-foreground"}`}>{f}</button>)}
        <span className="ml-auto flex gap-1">
          {draft === null
            ? <button type="button" aria-label={`Edit ${file}`} onClick={() => setDraft(typeof q.data === "string" ? q.data : `# ${file}\n\n- `)} className="rounded px-2 py-1 text-[11px] text-primary">{typeof q.data === "string" ? <Pencil className="h-3 w-3" /> : <span className="flex items-center gap-1"><Plus className="h-3 w-3" />Create</span>}</button>
            : <>
                <button type="button" aria-label="Save" disabled={put.isPending} onClick={() => put.mutate(draft)} className="rounded px-2 py-1 text-primary"><Save className="h-3 w-3" /></button>
                <button type="button" aria-label="Cancel" onClick={() => setDraft(null)} className="rounded px-2 py-1 text-muted-foreground"><X className="h-3 w-3" /></button>
              </>}
        </span>
      </div>
      {draft !== null ? <textarea aria-label={`${file} contents`} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-[55vh] w-full resize-none bg-transparent p-3 font-mono text-[11px] outline-none" /> : <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed">
        {q.isLoading ? "Loading…" : typeof q.data === "string" ? q.data : `No ${file} in this repository. The agent reads it automatically when present — tap Create to add one.`}
      </pre>}
    </section>
  );
}

function Memory({ repo }: { repo: string }) {
  const list = useServerFn(listMemories);
  const del = useServerFn(deleteMemory);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const mem = useQuery({ queryKey: ["memories", repo], queryFn: () => list({ data: { repo } }), ...LIVE });
  const notesFn = useServerFn(getRepoMemory);
  const notes = useQuery({ queryKey: ["repo-memory", repo], queryFn: () => notesFn({ data: { repo } }), ...LIVE });
  const addFn = useServerFn(addMemory);
  const [cat, setCat] = useState<"project" | "preference" | "decision" | "error">("preference");
  const [text, setText] = useState("");
  const add = useMutation({ mutationFn: () => addFn({ data: { repo, category: cat, content: text } }), onSuccess: () => { setText(""); toast.success("Memory saved"); qc.invalidateQueries({ queryKey: ["memories", repo] }); }, onError: (e: Error) => toast.error(e.message) });
  const rm = useMutation({ mutationFn: (mid: string) => del({ data: { id: mid } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["memories", repo] }), onError: (e: Error) => toast.error(e.message) });
  const rows = (mem.data ?? []).filter((m) => `${m.category} ${m.content}`.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set((mem.data ?? []).map((m) => m.category))];
  return (
    <section className="space-y-2">
      <form className="panel space-y-2 p-2.5" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 3) add.mutate(); }}>
        <div className="flex gap-2">
          <select aria-label="Memory type" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="preference">Preference</option><option value="project">Project</option><option value="decision">Decision</option><option value="error">Error</option>
          </select>
          <input aria-label="New memory" value={text} onChange={(e) => setText(e.target.value)} placeholder="Something the agent should always remember" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none" />
          <button type="submit" aria-label="Save memory" disabled={add.isPending || text.trim().length < 3} className="rounded-md border px-2 text-primary disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </form>
      {notes.data?.notes && (
        <details className="panel p-2.5 text-xs">
          <summary className="cursor-pointer font-medium">Repository notes <span className="text-muted-foreground">· updated {new Date(notes.data.updated_at).toLocaleString()}</span></summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{notes.data.notes}</pre>
        </details>
      )}
      <label className="flex items-center gap-2 rounded-md border bg-background px-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories" className="h-8 flex-1 bg-transparent text-xs outline-none" /></label>
      {!!cats.length && <div className="flex flex-wrap gap-1">{cats.map((c) => <button key={c} type="button" onClick={() => setQ(c)} className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary">{c}</button>)}</div>}
      {mem.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {mem.error && <p className="text-xs text-destructive">{(mem.error as Error).message}</p>}
      {!mem.isLoading && !rows.length && <p className="text-xs text-muted-foreground">No saved memories for {repo} yet — add one above, or the agent saves them as it works.</p>}
      <ul className="space-y-1.5">
        {rows.map((m) => (
          <li key={m.id} className="panel flex gap-2 p-2.5 text-xs">
            <div className="min-w-0 flex-1">
              <span className="rounded bg-accent px-1.5 font-mono text-[10px] text-primary">{m.category}</span>
              <p className="mt-1 break-words">{m.content}</p>
            </div>
            <button type="button" aria-label="Forget memory" disabled={rm.isPending} onClick={() => rm.mutate(m.id)} className="self-start text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tools() {
  const list = useServerFn(listMcpConnections);
  const q = useQuery({ queryKey: ["mcp-connections"], queryFn: () => list(), ...LIVE });
  const rows = (q.data ?? []) as Array<{ id: string; name: string; url: string; state?: string | null; enabled?: boolean; tool_names?: string[] | null; allow_actions?: boolean }>;
  return (
    <section className="space-y-1.5">
      {q.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!q.isLoading && !rows.length && <p className="text-xs text-muted-foreground">No external tools connected. Add them in Settings.</p>}
      {rows.map((c) => {
        const healthy = c.enabled !== false && (c.tool_names?.length ?? 0) > 0;
        return (
          <div key={c.id} className="panel p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${healthy ? "bg-primary" : c.enabled === false ? "bg-muted-foreground" : "bg-destructive"}`} />
              <span className="font-medium">{c.name}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{c.tool_names?.length ?? 0} tools</span>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{c.url}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{c.enabled === false ? "Disabled" : healthy ? "Discovered" : "No tools discovered — recheck in Settings"} · {c.allow_actions ? "actions need approval" : "read-only"}</p>
          </div>
        );
      })}
    </section>
  );
}
