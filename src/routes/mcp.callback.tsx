import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Plug, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { completeMcpOAuth } from "@/lib/mcp-oauth.functions";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/mcp/callback")({
  head: () => ({ meta: [...pageMeta("Connect external service — Forge", "Finish your private external tool connection."), { name: "referrer", content: "no-referrer" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s["code"] === "string" ? s["code"] : "", state: typeof s["state"] === "string" ? s["state"] : "", iss: typeof s["iss"] === "string" ? s["iss"] : "", error: typeof s["error"] === "string" ? s["error"] : "" }),
  component: Callback,
});

function Callback() {
  const search = Route.useSearch();
  const hydrated = useHydrated();
  const complete = useServerFn(completeMcpOAuth);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function finish() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setResult({ ok: false, message: "Sign in to Forge in another tab, then return here and try again." }); return; }
      const response = await complete({ data: { code: search.code, state: search.state, issuer: search.iss || undefined, denied: !!search.error } });
      setResult(response);
      window.history.replaceState(null, "", "/mcp/callback");
    } catch { setResult({ ok: false, message: "Could not finish sign-in. Check your Forge session and try again." }); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-lg space-y-5 px-5 py-16">
    <Plug className="size-7 text-primary" />
    <h1 className="text-2xl font-semibold">Connect external service</h1>
    {result && <p role="status" className={result.ok ? "text-success" : "text-destructive"}>{result.message}</p>}
    {!result?.ok && search.state && <Button onClick={finish} disabled={busy || !hydrated}>{busy ? <Loader2 className="animate-spin" /> : <Check />} {busy ? "Connecting…" : "Finish connection"}</Button>}
    {!search.state && !result && <p className="text-sm text-muted-foreground">This sign-in link is missing or expired.</p>}
    <div><Button variant="outline" asChild><Link to="/settings">Back to Settings</Link></Button></div>
  </main>;
}