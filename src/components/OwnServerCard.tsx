import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { addRunnerModel, getRunner, pairRunner, removeRunner } from "@/lib/runner.functions";
import { runnerUsable } from "@/lib/runner-protocol";

export function OwnServerCard() {
  const qc = useQueryClient();
  const fetchRunner = useServerFn(getRunner);
  const pair = useServerFn(pairRunner);
  const remove = useServerFn(removeRunner);
  const addModel = useServerFn(addRunnerModel);
  const [code, setCode] = useState("");
  const q = useQuery({ queryKey: ["owner-runner"], queryFn: () => fetchRunner(), refetchInterval: 30_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["owner-runner"] });
  const pairM = useMutation({ mutationFn: () => pair({ data: { code } }), onSuccess: () => { setCode(""); toast.success("Your server is connected"); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const removeM = useMutation({ mutationFn: () => remove(), onSuccess: () => { toast.success("Server disconnected"); refresh(); } });
  const modelM = useMutation({ mutationFn: () => addModel({ data: { model: "qwen2.5-coder:7b" } }), onSuccess: () => { toast.success("Free local model added to your AI models"); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const install = `curl -fsSL ${origin}/runner/install.sh | sudo FORGE_URL=${origin} bash`;
  const r = q.data?.runner;
  const online = r ? runnerUsable(r as never) : false;
  const cap = (r?.capacity ?? {}) as { free_slots?: number; boxes?: number; mem_free_mb?: number };

  return (
    <section className="panel rounded-2xl p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Server className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold tracking-tight">Your server</h2>
            {r && <Badge variant={online ? "default" : "secondary"}>{online ? "Online" : "Offline"}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Run agent workspaces, live previews, background runs and a free AI model on your own server, like Oracle's free tier. {q.data?.e2bFallback ? "If it goes offline, Forge switches to E2B automatically." : ""}</p>
        </div>
      </div>

      {r ? (
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">Workspaces running</div><div className="font-medium">{cap.boxes ?? 0}</div></div>
            <div><div className="text-xs text-muted-foreground">Free slots</div><div className="font-medium">{cap.free_slots ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Free memory</div><div className="font-medium">{cap.mem_free_mb ? `${(cap.mem_free_mb / 1024).toFixed(1)} GB` : "—"}</div></div>
          </div>
          <p className="text-xs text-muted-foreground">Last heard from {r.last_seen ? new Date(r.last_seen).toLocaleTimeString() : "never"}.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={q.data?.localModel || modelM.isPending} onClick={() => modelM.mutate()}>
              {q.data?.localModel ? "Free local model added" : modelM.isPending ? "Checking model…" : "Add free local AI model"}
            </Button>
            <Button size="sm" variant="ghost" disabled={removeM.isPending} onClick={() => removeM.mutate()}>Disconnect</Button>
          </div>
        </div>
      ) : (
        <ol className="mt-4 space-y-3 text-sm">
          <li><span className="font-medium">1.</span> In Oracle Cloud, create an <b>Ampere A1</b> VM (4 cores, 24 GB) with Ubuntu.</li>
          <li>
            <span className="font-medium">2.</span> Connect to it and paste this once:
            <div className="mt-2 flex items-start gap-2 rounded-lg border bg-background p-2 font-mono text-xs">
              <code className="min-w-0 flex-1 break-all">{install}</code>
              <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label="Copy install command" onClick={() => { void navigator.clipboard.writeText(install); toast.success("Copied"); }}><Copy className="size-3.5" /></Button>
            </div>
          </li>
          <li>
            <span className="font-medium">3.</span> Paste the pairing code it prints:
            <Textarea className="mt-2 font-mono text-xs" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="eyJ1cmwiOi..." />
            <Button className="mt-2" size="sm" disabled={code.trim().length < 20 || pairM.isPending} onClick={() => pairM.mutate()}>{pairM.isPending ? "Connecting…" : "Connect server"}</Button>
          </li>
        </ol>
      )}
    </section>
  );
}
