import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Copy, FileCode, Folder, Pencil, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTree, readFile, saveFile } from "@/lib/app.functions";

type Dir = { dirs: Map<string, Dir>; files: string[] };

export function buildTree(paths: string[]): Dir {
  const root: Dir = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let d = root;
    for (const seg of parts.slice(0, -1)) {
      if (!d.dirs.has(seg)) d.dirs.set(seg, { dirs: new Map(), files: [] });
      d = d.dirs.get(seg)!;
    }
    d.files.push(p);
  }
  return root;
}

export function FileWorkbench({ id }: { id: string }) {
  const fetchTree = useServerFn(getTree);
  const fetchFile = useServerFn(readFile);
  const save = useServerFn(saveFile);
  const qc = useQueryClient();
  const tree = useQuery({ queryKey: ["tree", id], queryFn: () => fetchTree({ data: { id } }) });
  const [path, setPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["src"]));
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [path]);
  const file = useQuery({ queryKey: ["file", id, path], queryFn: () => fetchFile({ data: { id, path: path! } }), enabled: !!path });
  const saveM = useMutation({
    mutationFn: () => save({ data: { id, path: path!, content: draft ?? "", message: `edit ${path}` } }),
    onSuccess: () => { toast.success("Committed to task branch"); setDraft(null); qc.invalidateQueries({ queryKey: ["file", id, path] }); qc.invalidateQueries({ queryKey: ["diff", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const all = tree.data ?? [];
  const matches = filter ? all.filter((f) => f.toLowerCase().includes(filter.toLowerCase())).slice(0, 500) : [];
  const root = useMemo(() => buildTree(all), [all]);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const lines = typeof file.data === "string" ? file.data.split("\n") : [];

  const renderDir = (d: Dir, prefix: string, depth: number): React.ReactNode => (
    <>
      {[...d.dirs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, sub]) => {
        const key = prefix ? `${prefix}/${name}` : name;
        const isOpen = open.has(key);
        return (
          <li key={key}>
            <button type="button" onClick={() => toggle(key)} style={{ paddingLeft: 8 + depth * 12 }} className="flex w-full items-center gap-1 py-1 pr-2 text-left hover:bg-accent">
              {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <Folder className="h-3 w-3 shrink-0 text-primary" /><span className="truncate">{name}</span>
            </button>
            {isOpen && <ul>{renderDir(sub, key, depth + 1)}</ul>}
          </li>
        );
      })}
      {d.files.sort().map((f) => <FileRow key={f} f={f} label={f.split("/").pop()!} depth={depth} active={f === path} onPick={setPath} />)}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className={`flex min-h-0 flex-col border-r md:w-64 ${path ? "hidden md:flex" : "flex flex-1 md:flex-none"}`}>
        <label className="m-2 flex items-center gap-2 rounded-md border bg-background px-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input className="h-8 flex-1 bg-transparent text-xs outline-none" placeholder={`Search ${all.length} files`} value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
        <ul className="min-h-0 flex-1 overflow-y-auto pb-4 font-mono text-xs">
          {tree.isLoading && <li className="px-3 text-muted-foreground">Loading…</li>}
          {tree.error && <li className="px-3 text-destructive">{(tree.error as Error).message}</li>}
          {filter ? matches.map((f) => <FileRow key={f} f={f} label={f} depth={0} active={f === path} onPick={setPath} />) : renderDir(root, "", 0)}
        </ul>
      </div>
      {path ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-1.5 font-mono text-xs">
            <button type="button" className="md:hidden" onClick={() => setPath(null)}>←</button>
            <span className="min-w-0 flex-1 truncate">{path.split("/").map((seg, i, a) => <span key={i} className={i === a.length - 1 ? "text-foreground" : "text-muted-foreground"}>{seg}{i < a.length - 1 ? " / " : ""}</span>)}</span>
            <span className="hidden text-muted-foreground sm:inline">{lines.length} lines</span>
            <Button size="icon" variant="ghost" aria-label="Copy file" className="h-7 w-7" disabled={typeof file.data !== "string"} onClick={() => { navigator.clipboard.writeText(file.data ?? ""); toast.success("Copied"); }}><Copy /></Button>
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
            <textarea spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget, a = t.selectionStart;
                  setDraft(draft.slice(0, a) + "  " + draft.slice(t.selectionEnd));
                  requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; });
                }
              }}
              className="min-h-0 flex-1 resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none" />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-relaxed">
              {file.isLoading ? <p className="p-3 text-muted-foreground">Loading…</p> : typeof file.data !== "string" ? <p className="p-3 text-muted-foreground">(file not found)</p> : (
                <table className="w-full border-collapse"><tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="hover:bg-accent/40">
                      <td className="sticky left-0 select-none border-r bg-card px-2 text-right text-muted-foreground/60">{i + 1}</td>
                      <td className="whitespace-pre px-3">{l || " "}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="hidden flex-1 place-items-center text-center text-xs text-muted-foreground md:grid">
          <div><FileCode className="mx-auto mb-2 h-6 w-6 text-primary" />Pick a file to view or edit it.<br />Edits commit to the task branch only.</div>
        </div>
      )}
    </div>
  );
}

function FileRow({ f, label, depth, active, onPick }: { f: string; label: string; depth: number; active: boolean; onPick: (f: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(f)} style={{ paddingLeft: 24 + depth * 12 }} className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left hover:bg-accent ${active ? "bg-accent text-primary" : ""}`}>
        <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" /><span className="truncate">{label}</span>
      </button>
    </li>
  );
}
