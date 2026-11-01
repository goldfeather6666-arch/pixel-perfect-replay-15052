import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deployOAuthStatus, startDeployOAuth } from "@/lib/deploy-oauth.functions";

/** Sign in to Vercel or the database host instead of pasting a token. Hidden per service until Forge is registered with it. */
export function OneClickConnect() {
  const qc = useQueryClient();
  const status = useServerFn(deployOAuthStatus);
  const start = useServerFn(startDeployOAuth);
  const s = useQuery({ queryKey: ["deploy-oauth-status"], queryFn: () => status() });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ok = q.get("connected"), err = q.get("connect_error");
    if (!ok && !err) return;
    if (ok) { toast.success(`Connected ${ok === "vercel" ? "Vercel" : "database"} account ${q.get("account") ?? ""}`.trim()); qc.invalidateQueries({ queryKey: ["creds"] }); }
    if (err) toast.error(err);
    window.history.replaceState(null, "", window.location.pathname);
  }, [qc]);

  const go = async (provider: "vercel" | "supabase") => {
    setBusy(provider);
    try { const { url } = await start({ data: { provider } }); window.location.assign(url); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start sign-in"); setBusy(null); }
  };

  if (!s.data || (!s.data.vercel && !s.data.supabase)) return null;
  return (
    <div className="mt-5 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">One-click sign-in</p>
      <p className="mt-1 text-xs text-muted-foreground">Sign in with your own account. No tokens to copy, and access renews itself.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.data.vercel && <Button type="button" size="sm" disabled={!!busy} onClick={() => go("vercel")}>{busy === "vercel" ? "Opening Vercel…" : "Connect with Vercel"}</Button>}
        {s.data.supabase && <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => go("supabase")}>{busy === "supabase" ? "Opening…" : "Connect database (Supabase)"}</Button>}
      </div>
    </div>
  );
}
