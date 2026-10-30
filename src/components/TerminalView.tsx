import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runTerminal } from "@/lib/app.functions";

type Entry = { cmd: string; out?: string; code?: number; err?: string };

export function TerminalView({ id }: { id: string }) {
  const run = useServerFn(runTerminal);
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [log]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const command = cmd.trim();
    if (!command || busy) return;
    setCmd(""); setBusy(true);
    setLog((l) => [...l, { cmd: command }]);
    try {
      const r = await run({ data: { id, command } });
      setLog((l) => l.map((x, i) => i === l.length - 1 ? { ...x, out: [r.stdout, r.stderr].filter(Boolean).join("\n"), code: r.exit_code } : x));
    } catch (err: any) {
      setLog((l) => l.map((x, i) => i === l.length - 1 ? { ...x, err: String(err?.message ?? err) } : x));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3 font-mono text-xs">
        {log.length === 0 && <p className="text-muted-foreground">Runs in a private cloud sandbox with this task's branch and staged changes. The first command takes ~20s to start. Edits made here aren't saved to GitHub.</p>}
        {log.map((e, i) => (
          <div key={i} className="mb-3">
            <div className="text-primary">$ {e.cmd}</div>
            {e.out !== undefined && <pre className="whitespace-pre-wrap break-words text-foreground">{e.out || "(no output)"}</pre>}
            {e.code !== undefined && e.code !== 0 && <div className="text-destructive">exit {e.code}</div>}
            {e.err && <div className="text-destructive">{e.err}</div>}
            {e.out === undefined && !e.err && <Loader2 className="mt-1 size-3 animate-spin" />}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <Input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="npm test" className="font-mono" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <Button size="icon" aria-label="Run" disabled={busy || !cmd.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Play />}</Button>
      </form>
    </div>
  );
}
