import { isStaleServerFunctionError, recoverChunkLoad } from "@/lib/chunk-recovery";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Lightbulb, Check, X, MessageSquare, Star, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { answerQuestion, decideSuggestion, listInteractions, type TaskQuestion, type TaskSuggestion } from "@/lib/interactions.functions";

/** Question cards, improvement suggestions and the task spec, inline in the chat. */
export function TaskInteractions({ sessionId, busy, onSend }: { sessionId: string; busy: boolean; onSend: (message: string) => void }) {
  const fetchAll = useServerFn(listInteractions);
  const qcPoll = useQueryClient();
  const q = useQuery({ queryKey: ["interactions", sessionId], queryFn: async () => { try { return await fetchAll({ data: { sessionId } }); } catch (e) { if (isStaleServerFunctionError(e)) recoverChunkLoad(); throw e; } }, refetchInterval: 4000, retry: false, throwOnError: false });
  const open = q.data?.questions.filter((x) => x.status === "open") ?? [];
  const sugs = q.data?.suggestions.filter((x) => x.status === "proposed") ?? [];
  const spec = q.data?.spec;
  if (!open.length && !sugs.length && !spec && !q.isError) return null;
  return (
    <div className="space-y-3">
      {q.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Questions and suggestions are temporarily unavailable. Your conversation is still saved.</span><Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}>Retry</Button></div>}
      {open.length > 0 && (
        <div className="panel space-y-3 border-primary/50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><HelpCircle className="h-4 w-4 text-primary" /> The agent needs {open.length === 1 ? "one answer" : `${open.length} answers`} to continue</p>
          {open.map((x) => <QuestionCard key={x.id} q={x} busy={busy} onResume={onSend} />)}
        </div>
      )}
      {sugs.map((x) => <SuggestionCard key={x.id} s={x} busy={busy} onSend={onSend} />)}
      {spec && <SpecCard spec={spec} />}
    </div>
  );
}

function QuestionCard({ q, busy, onResume }: { q: TaskQuestion; busy: boolean; onResume: (m: string) => void }) {
  const qc = useQueryClient();
  const submit = useServerFn(answerQuestion);
  const [picked, setPicked] = useState<string[]>(q.type === "single_select" ? q.recommended_option_ids.slice(0, 1) : q.recommended_option_ids);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const options = q.type === "confirmation" ? [{ id: "yes", label: "Yes", description: "" }, { id: "no", label: "No", description: "" }] : q.options;

  async function send(skip = false) {
    setSaving(true);
    try {
      const r = await submit({ data: { questionId: q.id, key, answer: { option_ids: skip ? [] : picked, text: skip ? "" : text, skip } } });
      await qc.invalidateQueries({ queryKey: ["interactions"] });
      if (r.resume) { if (busy) toast.info("Answers saved. Send them once the current run ends."); else onResume(r.resume); }
      else if (r.changed) toast.success(r.remaining ? `Saved. ${r.remaining} question(s) left.` : "Saved.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save answer"); }
    finally { setSaving(false); }
  }

  const toggle = (id: string) => setPicked((p) => q.type === "multi_select" ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]);
  return (
    <div className="rounded-md border bg-card/60 p-3">
      <p className="text-sm font-medium">{q.title}{q.required && <span className="ml-1 text-xs text-destructive">required</span>}</p>
      {q.description && <p className="mt-1 text-xs text-muted-foreground">{q.description}</p>}
      {q.type !== "text" && (
        <div className="mt-2 grid gap-2" role={q.type === "multi_select" ? "group" : "radiogroup"} aria-label={q.title}>
          {options.map((o) => {
            const on = picked.includes(o.id);
            const rec = q.recommended_option_ids.includes(o.id);
            return (
              <button key={o.id} type="button" role={q.type === "multi_select" ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(o.id)}
                className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm transition-colors ${on ? "border-primary bg-primary/10" : "hover:border-primary/60"}`}>
                <span className="flex items-center gap-2 font-medium">{o.label}{rec && <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 text-[10px] text-primary"><Star className="h-2.5 w-2.5" /> Recommended</span>}</span>
                {o.description && <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>}
              </button>
            );
          })}
        </div>
      )}
      {q.recommendation_reason && <p className="mt-2 text-xs text-muted-foreground"><span className="text-primary">Why recommended:</span> {q.recommendation_reason}</p>}
      {(q.type === "text" || q.allow_custom_answer) && (
        <Textarea className="mt-2 min-h-16 text-sm" placeholder={q.type === "text" ? "Your answer" : "Or describe your own answer"} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" className="h-10" disabled={saving} onClick={() => send(false)}><Check /> Submit</Button>
        {q.allow_skip && <Button size="sm" variant="outline" className="h-10" disabled={saving} onClick={() => send(true)}>Use default{q.safe_default ? `: ${q.safe_default}` : ""}</Button>}
      </div>
    </div>
  );
}

function SuggestionCard({ s, busy, onSend }: { s: TaskSuggestion; busy: boolean; onSend: (m: string) => void }) {
  const qc = useQueryClient();
  const decide = useServerFn(decideSuggestion);
  const [saving, setSaving] = useState(false);
  async function act(decision: "accepted" | "rejected" | "discussed") {
    setSaving(true);
    try {
      const r = await decide({ data: { id: s.id, decision } });
      await qc.invalidateQueries({ queryKey: ["interactions"] });
      if (r.message) { if (busy) toast.info("Decision saved; the agent will see it on the next message."); else onSend(r.message); }
      else toast.success("Kept your original approach.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  }
  return (
    <div className="panel p-3">
      <p className="flex items-center gap-2 text-sm font-medium"><Lightbulb className="h-4 w-4 text-primary" /> Suggestion: {s.title}</p>
      {s.description && <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>}
      <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
        {s.requested_approach && <div><dt className="text-muted-foreground">You asked for</dt><dd>{s.requested_approach}</dd></div>}
        <div><dt className="text-muted-foreground">Recommended</dt><dd>{s.recommended_approach}</dd></div>
        {s.rationale && <div className="sm:col-span-2"><dt className="text-muted-foreground">Why</dt><dd>{s.rationale}</dd></div>}
        {s.risk && <div className="sm:col-span-2"><dt className="text-muted-foreground">Risk</dt><dd>{s.risk}</dd></div>}
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">Impact {s.estimated_impact} · effort {s.complexity}{s.expected_benefit.length ? ` · ${s.expected_benefit.join(", ")}` : ""}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" className="h-10" disabled={saving} onClick={() => act("accepted")}><Check /> Accept</Button>
        <Button size="sm" variant="outline" className="h-10" disabled={saving} onClick={() => act("rejected")}><X /> Keep mine</Button>
        <Button size="sm" variant="ghost" className="h-10" disabled={saving} onClick={() => act("discussed")}><MessageSquare /> Discuss</Button>
      </div>
    </div>
  );
}

function SpecCard({ spec }: { spec: { version: number; task_class: string; spec: unknown } }) {
  const sp = spec.spec as { objective?: string; acceptance_criteria?: string[]; non_goals?: string[]; assumptions?: string[] };
  return (
    <details className="panel p-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium"><ListChecks className="h-4 w-4 text-primary" /> Task plan v{spec.version} · {spec.task_class.replace("_", "-")}</summary>
      <p className="mt-2">{sp.objective}</p>
      {[["Done when", sp.acceptance_criteria], ["Not included", sp.non_goals], ["Assumptions", sp.assumptions]].map(([label, items]) =>
        Array.isArray(items) && items.length ? <div key={label as string} className="mt-2"><p className="text-xs text-muted-foreground">{label as string}</p><ul className="list-disc pl-5 text-xs">{(items as string[]).map((i) => <li key={i}>{i}</li>)}</ul></div> : null)}
    </details>
  );
}
