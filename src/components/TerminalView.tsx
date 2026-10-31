import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Eraser, Loader2, Minus, Play, Plus, Search, TerminalSquare, X } from "lucide-react";
import { runTerminal } from "@/lib/app.functions";
import { extractCwd, parseAnsi, wrapCommand } from "@/lib/terminal";

type Entry = { cmd: string; cwd: string; out?: string; code?: number; err?: string; ms?: number };
type Tab = { id: number; name: string; cwd: string | null; log: Entry[]; busy: boolean };

const SNIPPETS = ["git status", "ls -la", "npm install", "npm run build", "npm test", "git log --oneline -10", "cat package.json", "npx tsc --noEmit"];
const KEYS = ["Tab", "↑", "↓", "|", "/", "-", "~", "&&", ">", "$", "*", "Esc"];

function Ansi({ text }: { text: string }) {
  const spans = useMemo(() => parseAnsi(text), [text]);
  return <>{spans.map((s, i) => (s.cls ? <span key={i} className={s.cls}>{s.text}</span> : s.text))}</>;
}

const short = (cwd: string | null) => (!cwd ? "~" : cwd.replace(/^\/home\/user\/[^/]+/, "~").replace(/^\/home\/user/, "~"));

export function TerminalView({ id }: { id: string }) {
  const run = useServerFn(runTerminal);
  const histKey = `forge:term-history:${id}`;
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, name: "shell 1", cwd: null, log: [], busy: false }]);
  const [active, setActive] = useState(1);
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [font, setFont] = useState(12);
  const [find, setFind] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0]!;

  useEffect(() => { try { setHistory(JSON.parse(localStorage.getItem(histKey) ?? "[]")); } catch { /* ignore */ } }, [histKey]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [tab.log]);

  const patch = (tid: number, fn: (t: Tab) => Tab) => setTabs((ts) => ts.map((t) => (t.id === tid ? fn(t) : t)));

  async function exec(raw: string) {
    const command = raw.trim();
    if (!command || tab.busy) return;
    const tid = tab.id;
    if (command === "clear") { patch(tid, (t) => ({ ...t, log: [] })); setCmd(""); return; }
    const nextHist = [command, ...history.filter((h) => h !== command)].slice(0, 200);
    setHistory(nextHist); localStorage.setItem(histKey, JSON.stringify(nextHist)); setHIdx(-1); setCmd("");
    const startCwd = short(tab.cwd);
    patch(tid, (t) => ({ ...t, busy: true, log: [...t.log, { cmd: command, cwd: startCwd }] }));
    const t0 = performance.now();
    const finish = (e: Partial<Entry>, cwd?: string | null) =>
      patch(tid, (t) => ({ ...t, busy: false, cwd: cwd ?? t.cwd, log: t.log.map((x, i) => (i === t.log.length - 1 ? { ...x, ...e, ms: Math.round(performance.now() - t0) } : x)) }));
    try {
      const r = await run({ data: { id, command: wrapCommand(command, tab.cwd) } });
      const o = "exit_code" in r ? r : { stdout: r.log, stderr: "", exit_code: 0, note: r.note };
      const { out, cwd } = extractCwd(o.stdout ?? "");
      finish({ out: [out, o.stderr, o.note].filter(Boolean).join("\n"), code: o.exit_code }, cwd);
    } catch (err) {
      finish({ err: String((err as Error)?.message ?? err) });
    }
    input.current?.focus();
  }

  function key(k: string) {
    if (k === "↑" || k === "↓") return walk(k === "↑" ? 1 : -1);
    if (k === "Esc") return setCmd("");
    if (k === "Tab") return complete();
    setCmd((c) => c + (k === "&&" ? " && " : k === "|" ? " | " : k));
    input.current?.focus();
  }
  function walk(d: number) {
    const n = Math.max(-1, Math.min(history.length - 1, hIdx + d));
    setHIdx(n); setCmd(n < 0 ? "" : history[n]!);
  }
  function complete() {
    const m = history.find((h) => h.startsWith(cmd) && h !== cmd) ?? SNIPPETS.find((s) => s.startsWith(cmd) && s !== cmd);
    if (m && cmd) setCmd(m);
    input.current?.focus();
  }
  const suggestion = cmd ? history.find((h) => h.startsWith(cmd) && h !== cmd) : undefined;

  function newTab() {
    const nid = Math.max(...tabs.map((t) => t.id)) + 1;
    setTabs((ts) => [...ts, { id: nid, name: `shell ${nid}`, cwd: null, log: [], busy: false }]);
    setActive(nid);
  }
  function closeTab(tid: number) {
    if (tabs.length === 1) return;
    const rest = tabs.filter((t) => t.id !== tid);
    setTabs(rest);
    if (active === tid) setActive(rest.at(-1)!.id);
  }
  const visible = find ? tab.log.filter((e) => `${e.cmd}\n${e.out ?? ""}${e.err ?? ""}`.toLowerCase().includes(find.toLowerCase())) : tab.log;

  return (
    <div className="flex h-full flex-col bg-term-bg">
      {/* Session tabs + toolbar */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div key={t.id} className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs ${t.id === active ? "border-primary/60 bg-accent text-foreground" : "border-transparent text-muted-foreground"}`}>
              <button type="button" onClick={() => setActive(t.id)} className="flex items-center gap-1.5">
                {t.busy ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <TerminalSquare className="h-3 w-3" />}{t.name}
              </button>
              {tabs.length > 1 && <button type="button" aria-label={`Close ${t.name}`} onClick={() => closeTab(t.id)}><X className="h-3 w-3" /></button>}
            </div>
          ))}
          <button type="button" aria-label="New shell" onClick={newTab} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <button type="button" aria-label="Search output" onClick={() => setFind(find === null ? "" : null)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent"><Search className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Smaller text" onClick={() => setFont((f) => Math.max(9, f - 1))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Larger text" onClick={() => setFont((f) => Math.min(18, f + 1))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent"><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Clear" onClick={() => patch(tab.id, (t) => ({ ...t, log: [] }))} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent"><Eraser className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {find !== null && (
        <div className="border-b px-2 py-1.5">
          <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in output…" className="h-8 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary" />
        </div>
      )}

      {/* Output */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono leading-relaxed" style={{ fontSize: font }} onClick={() => window.getSelection()?.isCollapsed && input.current?.focus()}>
        {tab.log.length === 0 && (
          <div className="text-muted-foreground">
            <p><span className="text-primary">forge</span> cloud shell — private sandbox with this task's branch and staged changes.</p>
            <p className="mt-1">First command takes ~20s to boot. `cd` is remembered per tab. Edits here aren't saved to GitHub.</p>
          </div>
        )}
        {visible.map((e, i) => (
          <div key={i} className="group mb-3">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 break-all"><span className="text-success">forge</span><span className="text-muted-foreground">:</span><span className="text-term-blue">{e.cwd}</span><span className="text-muted-foreground">$ </span><span className="text-foreground">{e.cmd}</span></span>
              {e.ms !== undefined && <span className={`shrink-0 text-[10px] ${e.code ? "text-destructive" : "text-muted-foreground"}`}>{e.code ? `✗ ${e.code} · ` : "✓ "}{(e.ms / 1000).toFixed(1)}s</span>}
              {e.out && <button type="button" aria-label="Copy output" className="shrink-0 text-muted-foreground opacity-60 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100" onClick={() => { void navigator.clipboard.writeText(e.out ?? ""); toast.success("Copied"); }}><Copy className="h-3 w-3" /></button>}
            </div>
            {e.out !== undefined && <pre className="whitespace-pre-wrap break-words text-foreground/90"><Ansi text={e.out || "(no output)"} /></pre>}
            {e.err && <div className="text-destructive">{e.err}</div>}
            {e.out === undefined && !e.err && <span className="inline-block h-4 w-2 animate-pulse bg-primary align-middle" />}
          </div>
        ))}
        <div ref={end} />
      </div>

      {/* Snippets */}
      <div className="flex gap-1.5 overflow-x-auto border-t px-2 py-1.5">
        {SNIPPETS.map((s) => (
          <button key={s} type="button" disabled={tab.busy} onClick={() => exec(s)} className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40">{s}</button>
        ))}
      </div>

      {/* Prompt */}
      <form onSubmit={(e) => { e.preventDefault(); void exec(cmd); }} className="flex items-center gap-2 border-t px-3 py-2 font-mono text-sm">
        <span className="hidden shrink-0 text-xs sm:inline"><span className="text-success">forge</span>:<span className="text-term-blue">{short(tab.cwd)}</span>$</span>
        <span className="shrink-0 text-primary sm:hidden">$</span>
        <div className="relative min-w-0 flex-1">
          {suggestion && <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-muted-foreground/40">{suggestion}</div>}
          <input ref={input} value={cmd} onChange={(e) => { setCmd(e.target.value); setHIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); walk(1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); walk(-1); }
              else if (e.key === "Tab" || (e.key === "ArrowRight" && suggestion)) { e.preventDefault(); complete(); }
              else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); patch(tab.id, (t) => ({ ...t, log: [] })); }
              else if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) { e.preventDefault(); setCmd(""); }
            }}
            aria-label="Terminal command" placeholder={tab.busy ? "running…" : "type a command"}
            className="relative h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/50 sm:text-sm"
            autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} />
        </div>
        <button aria-label="Run" disabled={tab.busy || !cmd.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40">
          {tab.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </button>
      </form>

      {/* Termux-style extra keys */}
      <div className="grid grid-cols-6 gap-px border-t bg-border sm:grid-cols-12">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => key(k)} className="flex h-10 items-center justify-center bg-term-bg font-mono text-xs text-muted-foreground active:bg-accent active:text-primary">
            {k === "↑" ? <ArrowUp className="h-3.5 w-3.5" /> : k === "↓" ? <ArrowDown className="h-3.5 w-3.5" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
