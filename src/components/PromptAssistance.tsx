import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Lightbulb, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { appendSuggestion, canApplyAssistance, parseAssistance, promptSuggestions } from "@/lib/prompt-assistance";

export function PromptAssistance({ draft, onChange, sessionId, disabled = false }: { draft: string; onChange: (value: string) => void; sessionId?: string; disabled?: boolean }) {
  const suggestions = useMemo(() => promptSuggestions(draft), [draft]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<{ original: string; refined: string; questions: string[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { abort.current?.abort(); setBusy(false); setProposal(null); setError(""); }, [sessionId]);
  async function improve() {
    if (!sessionId || busy) return;
    const original = draft;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(""); setProposal(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in to use prompt assistance.");
      const response = await fetch("/api/prompt-assist", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ sessionId, draft }), signal: controller.signal });
      if (!response.ok) { const problem = await response.json(); throw new Error(problem.message ?? "Prompt assistance is unavailable."); }
      if (!response.body) throw new Error("No response was received.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "result") setProposal({ original, ...parseAssistance(JSON.stringify(event)) });
        }
        if (done) break;
      }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Assistance unavailable."); }
    finally { if (abort.current === controller) { setBusy(false); abort.current = null; } }
  }
  if (!suggestions.length && draft.trim().length < 20) return null;
  return <div className="mx-auto mb-3 max-w-3xl space-y-2" aria-label="Prompt assistance">
    <div className="flex flex-wrap items-center gap-1.5">
      <Lightbulb className="mr-1 size-3.5 text-warning" aria-hidden="true" />
      {suggestions.map((item) => <Button key={item.id} type="button" variant="ghost" size="sm" disabled={disabled} className="h-7 text-xs text-muted-foreground" onClick={() => onChange(appendSuggestion(draft, item.addition))}>{item.label}<ArrowUpRight className="size-3" /></Button>)}
      {sessionId && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-primary" disabled={disabled || draft.trim().length < 20} title="Uses this task’s AI model and your own key. Charges apply only when you click." onClick={() => busy ? abort.current?.abort() : void improve()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}{busy ? "Cancel assistance" : "Improve with AI"}</Button>}
    </div>
    {busy && <p role="status" className="text-xs text-muted-foreground">Refining with your selected model…</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {proposal && <section className="rounded-lg border bg-card p-3" aria-label="Suggested prompt">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium">A clearer brief</h3><Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss suggested prompt" onClick={() => setProposal(null)}><X /></Button></div>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{proposal.refined}</p>
      {!!proposal.questions.length && <ul className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">{proposal.questions.map((q) => <li key={q}>{q}</li>)}</ul>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{draft !== proposal.original ? "Your draft changed. Improve it again to use a fresh suggestion." : "Your draft stays yours until you accept."}</span><Button type="button" size="sm" disabled={disabled || !canApplyAssistance(draft, proposal.original, proposal.refined)} onClick={() => { onChange(proposal.refined); setProposal(null); }}><Check />Use suggestion</Button></div>
    </section>}
  </div>;
}