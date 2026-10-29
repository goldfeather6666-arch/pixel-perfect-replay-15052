import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteSkill, listSkills, upsertSkill, type Skill } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/skills")({
  head: () => ({ meta: [{ title: "Skills — Forge" }, { name: "description", content: "Reusable instructions the agent follows on every task." }] }),
  component: SkillsPage,
});

function SkillsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSkills);
  const upsert = useServerFn(upsertSkill);
  const del = useServerFn(deleteSkill);
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => list() });
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["skills"] });
  const saveM = useMutation({
    mutationFn: () => upsert({ data: { id: editId, name, instructions: text, enabled: true } }),
    onSuccess: () => { toast.success("Skill saved"); setEditId(null); setName(""); setText(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const edit = (s: Skill) => { setEditId(s.id); setName(s.name); setText(s.instructions); };

  return (
    <div className="min-h-screen">
      <AppHeader><span className="text-sm text-muted-foreground">Skills</span></AppHeader>
      <main className="mx-auto max-w-2xl space-y-8 p-4 sm:p-8">
        <section className="rounded-lg border bg-card p-5">
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
                <p className="text-sm font-medium">{s.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.instructions}</p>
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
