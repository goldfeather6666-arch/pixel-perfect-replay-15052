import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Download, Pencil, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSkill,
  importSkills,
  listSkills,
  previewSkillImport,
  upsertSkill,
  type Skill,
  type SkillCandidate,
} from "@/lib/app.functions";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => ({ meta: pageMeta("Skills — Forge", "Reusable instructions the agent follows on every task, including skills imported from GitHub repositories.") }),
  component: SkillsPage,
});

type Found = { repo: string; branch: string; candidates: SkillCandidate[] };

function SkillsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSkills);
  const upsert = useServerFn(upsertSkill);
  const del = useServerFn(deleteSkill);
  const find = useServerFn(previewSkillImport);
  const add = useServerFn(importSkills);
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => list() });
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const refresh = () => qc.invalidateQueries({ queryKey: ["skills"] });
  const saveM = useMutation({
    mutationFn: () => upsert({ data: { id: editId, name, instructions: text, enabled: true } }),
    onSuccess: () => { toast.success("Skill saved"); setEditId(null); setName(""); setText(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const edit = (s: Skill) => { setEditId(s.id); setName(s.name); setText(s.instructions); };

  const findM = useMutation({
    mutationFn: () => find({ data: { source } }),
    onSuccess: (r) => {
      setFound(r);
      setPicked(new Set(r.candidates.filter((c) => !c.already).map((c) => c.path)));
      toast.success(`${r.candidates.length} file${r.candidates.length === 1 ? "" : "s"} found in ${r.repo}`);
    },
    onError: (e: Error) => { setFound(null); setPicked(new Set()); toast.error(e.message); },
  });

  const addM = useMutation({
    mutationFn: () => add({ data: { source, paths: [...picked] } }),
    onSuccess: (r) => {
      toast.success(
        r.added.length
          ? `Added ${r.added.length} skill${r.added.length === 1 ? "" : "s"}${r.skipped.length ? ` · ${r.skipped.length} already saved` : ""}`
          : `Already saved — nothing new to add`,
      );
      setFound(null); setPicked(new Set()); setSource(""); refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (path: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="min-h-screen">
      <AppHeader><span className="text-sm text-muted-foreground">Skills</span></AppHeader>
      <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">Import skills from a GitHub repository</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste any repo link (or <span className="font-mono text-xs">owner/repo</span>, optionally with a folder). Folders holding a
            <span className="font-mono text-xs"> SKILL.md</span> are recognised automatically; otherwise the repo's markdown docs are listed.
          </p>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); findM.mutate(); }}>
            <Input
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://github.com/owner/repo/tree/main/skills"
              className="min-w-0 flex-1"
            />
            <Button disabled={findM.isPending} className="shrink-0">{findM.isPending ? "Searching…" : "Find skills"}</Button>
          </form>
          {found && (
            <div className="mt-4 space-y-2">
              <p className="truncate text-xs text-muted-foreground">
                {found.repo} · branch {found.branch} · tap to choose
              </p>
              <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
                {found.candidates.map((c) => {
                  const on = picked.has(c.path);
                  return (
                    <li key={c.path}>
                      <button
                        type="button"
                        onClick={() => toggle(c.path)}
                        aria-pressed={on}
                        className="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left hover:bg-muted/60"
                      >
                        <span
                          className={
                            on
                              ? "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border border-primary bg-primary text-primary-foreground"
                              : "mt-0.5 size-4 shrink-0 rounded-[4px] border border-input"
                          }
                        >
                          {on && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.already ? "already saved" : c.description || c.path}
                          </span>
                        </span>
                        <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">{Math.round(c.chars / 100) / 10}k</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button disabled={addM.isPending || picked.size === 0} onClick={() => addM.mutate()}>
                  <Download />
                  {addM.isPending ? "Adding…" : `Add ${picked.size} skill${picked.size === 1 ? "" : "s"}`}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setFound(null); setPicked(new Set()); }}>Cancel</Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">{editId ? "Edit skill" : "New skill"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enabled skills are added to every task. The agent also reads AGENTS.md or CLAUDE.md from the repo automatically.
          </p>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); saveM.mutate(); }}>
            <div className="space-y-1.5"><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Write tests first" /></div>
            <div className="space-y-1.5"><Label>Instructions</Label><Textarea required rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="When adding a feature, add or update a unit test next to it…" /></div>
            <div className="flex gap-2">
              <Button disabled={saveM.isPending}>Save</Button>
              {editId && <Button type="button" variant="ghost" onClick={() => { setEditId(null); setName(""); setText(""); }}>Cancel</Button>}
            </div>
          </form>
        </section>

        <ul className="space-y-2">
          {skills.data?.length === 0 && <p className="text-sm text-muted-foreground">No skills yet.</p>}
          {skills.data?.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-md border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.instructions}</p>
                {s.source && <p className="mt-1 truncate text-[11px] text-muted-foreground">from {s.source}</p>}
              </div>
              <Switch checked={s.enabled} aria-label="Enabled"
                onCheckedChange={async (v) => { await upsert({ data: { id: s.id, name: s.name, instructions: s.instructions, enabled: v } }); refresh(); }} />
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => edit(s)}><Pencil /></Button>
              <Button variant="ghost" size="icon" aria-label="Delete" onClick={async () => { await del({ data: { id: s.id } }); refresh(); }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
