import { useEffect, useRef, useState } from "react";
import { Check, Copy, ImagePlus, Loader2, ScanEye, Square, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { screenshotError, VISUAL_BUCKET, visualFixPrompt, comparisonResult, type VisualComparison as Comparison, type VisualEvent } from "@/lib/visual-comparison";

type Screenshot = { path: string; url: string; name: string; width: number; height: number };
export function VisualComparison({ id, onSend, agentBusy }: { id: string; onSend: ((prompt: string) => void | Promise<void>) | undefined; agentBusy: boolean }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState<Screenshot | null>(null);
  const [current, setCurrent] = useState<Screenshot | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState("");
  const [error, setError] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [result, setResult] = useState<Comparison | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const paths = useRef(new Set<string>());
  const urls = useRef(new Set<string>());
  useEffect(() => () => {
    abort.current?.abort();
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    const files = [...paths.current];
    if (files.length) void supabase.storage.from(VISUAL_BUCKET).remove(files);
  }, []);

  async function upload(file: File | undefined, role: "reference" | "current") {
    if (!file || busy || uploading) return;
    setError("");
    const validation = screenshotError(file);
    if (validation) { setError(validation); return; }
    setUploading(role);
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth > 10000 || image.naturalHeight > 10000) throw new Error("Choose a screenshot with dimensions under 10,000 pixels.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in to upload screenshots.");
      const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${auth.user.id}/${id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(VISUAL_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("Screenshot upload failed. Please try again.");
      paths.current.add(path); urls.current.add(url);
      const previous = role === "reference" ? reference : current;
      const screenshot = { path, url, name: file.name, width: image.naturalWidth, height: image.naturalHeight };
      if (role === "reference") setReference(screenshot); else setCurrent(screenshot);
      setResult(null); setSelected([]); setReasoning("");
      if (previous) { URL.revokeObjectURL(previous.url); urls.current.delete(previous.url); await supabase.storage.from(VISUAL_BUCKET).remove([previous.path]); paths.current.delete(previous.path); }
    } catch (e) { if (url && !urls.current.has(url)) URL.revokeObjectURL(url); setError((e as Error).message); }
    finally { setUploading(null); }
  }
  async function compare() {
    if (!reference || !current || busy) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(""); setResult(null); setReasoning(""); setSelected([]);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Sign in to compare screenshots.");
      const response = await fetch("/api/visual-compare", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}` }, body: JSON.stringify({ taskId: id, reference: reference.path, current: current.path, context }) });
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.message ?? "Comparison unavailable."); }
      if (!response.body) throw new Error("No comparison response received.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "", received = false;
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as VisualEvent;
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "reasoning") setReasoning((text) => (text + event.text).slice(-12000));
        if (event.type === "result") { const parsed = comparisonResult.parse(event.result); setResult(parsed); setSelected(parsed.differences.map((_, i) => i)); received = true; }
      };
      while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; lines.forEach(consume); }
      consume(buffer + decoder.decode());
      if (!received) throw new Error("Comparison ended without a result. Your screenshots are preserved.");
    } catch (e) { setError(controller.signal.aborted ? "Comparison stopped. Your screenshots are preserved." : (e as Error).message); }
    finally { setBusy(false); abort.current = null; }
  }
  const prompt = result ? visualFixPrompt(result, selected) : "";
  async function send() {
    if (!prompt || !onSend || agentBusy || sending) return;
    setSending(true);
    try { await onSend(prompt); setOpen(false); } catch (e) { setError((e as Error).message); }
    finally { setSending(false); }
  }
  function slot(role: "reference" | "current", screenshot: Screenshot | null) {
    return <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">{role === "reference" ? "Reference" : "Current app"}</h3>{screenshot && <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy || !!uploading} aria-label={`Remove ${role} screenshot`} onClick={() => {
        if (role === "reference") setReference(null); else setCurrent(null); setResult(null); setSelected([]);
        URL.revokeObjectURL(screenshot.url); urls.current.delete(screenshot.url); void supabase.storage.from(VISUAL_BUCKET).remove([screenshot.path]); paths.current.delete(screenshot.path);
      }}><X /></Button>}</div>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded border bg-muted/30">
        {screenshot ? <img src={screenshot.url} alt={`${role === "reference" ? "Reference" : "Current app"} screenshot`} className="h-full w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}
      </div>
      {screenshot && <p className="truncate text-xs text-muted-foreground" title={screenshot.name}>{screenshot.name} · {screenshot.width} × {screenshot.height}</p>}
      <label className="block"><span className="sr-only">Upload {role} screenshot</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || !!uploading} className="block w-full min-w-0 text-xs text-muted-foreground file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-1.5 file:text-secondary-foreground" onChange={(e) => { void upload(e.target.files?.[0], role); e.target.value = ""; }} /></label>
      {uploading === role && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Uploading…</p>}
    </div>;
  }
  return <>
    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}><ScanEye />Compare</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanEye className="h-5 w-5 text-primary" />Visual comparison</DialogTitle><DialogDescription>Reference screenshot vs. current app screenshot · AI Gateway credits apply · No automatic edits</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{slot("reference", reference)}{slot("current", current)}</div>
        {reference && current && (reference.width !== current.width || reference.height !== current.height) && <p className="text-xs text-muted-foreground">Different image sizes: layout findings may be affected by viewport or scroll position.</p>}
        <label className="space-y-2 text-sm">Page / viewport notes<Textarea value={context} disabled={busy} maxLength={2000} onChange={(e) => { setContext(e.target.value); setResult(null); }} placeholder="e.g. /dashboard, 1440 × 900, top of page" className="mt-2 min-h-16" /></label>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2"><Button disabled={!reference || !current || busy || !!uploading} onClick={() => void compare()}>{busy ? <Loader2 className="animate-spin" /> : <ScanEye />}{busy ? "Comparing…" : "Compare screenshots"}</Button>{busy && <Button variant="outline" onClick={() => abort.current?.abort()}><Square />Stop</Button>}</div>
        {busy && <p role="status" className="text-xs text-muted-foreground">Inspecting layout differences…</p>}
        {reasoning && <details className="text-xs text-muted-foreground"><summary>Analysis notes</summary><p className="mt-2 whitespace-pre-wrap break-words">{reasoning}</p></details>}
        {result && <div className="space-y-3 border-t pt-4">
          <h3 className="font-medium">{result.differences.length ? `${result.differences.length} visual differences` : "No visible layout differences"}</h3><p className="break-words text-sm">{result.summary}</p><p className="break-words text-xs text-muted-foreground">{result.viewportNotes}</p>
          {result.differences.map((d, i) => <div key={i} className="flex items-start gap-3 border-b pb-3">
            <Checkbox checked={selected.includes(i)} aria-label={`Select fix for ${d.area}`} onCheckedChange={(checked) => setSelected((prev) => checked ? [...prev, i] : prev.filter((n) => n !== i))} className="mt-1" />
            <div className="min-w-0 space-y-1 text-sm"><p className="font-medium break-words">{d.area} <span className="text-xs font-normal text-muted-foreground">· {d.priority} priority · {d.confidence} confidence</span></p><p className="break-words text-muted-foreground"><span className="font-medium">Current:</span> {d.observed}</p><p className="break-words text-muted-foreground"><span className="font-medium">Reference:</span> {d.expected}</p><p className="break-words"><span className="font-medium text-primary">Fix:</span> {d.fix}</p></div>
          </div>)}
          {result.differences.length > 0 && <div className="flex flex-wrap gap-2"><Button disabled={!prompt || !onSend || agentBusy || sending} onClick={() => void send()}>{sending ? <Loader2 className="animate-spin" /> : <Wrench />}Send selected fixes to Chat</Button><Button variant="outline" disabled={!prompt} onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setError("Could not copy the fix brief."); } }}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy fixes"}</Button></div>}
          {agentBusy && <p className="text-xs text-muted-foreground">An agent is already working. Send selected fixes after it finishes.</p>}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}