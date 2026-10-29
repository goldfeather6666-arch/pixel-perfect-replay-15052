import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Forge" },
      { name: "description", content: "Sign in to your Forge coding agent workspace." },
      { property: "og:title", content: "Sign in — Forge" },
      { property: "og:description", content: "Sign in to your Forge coding agent workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && nav({ to: "/app" }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => s && nav({ to: "/app" }));
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/app" } });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (mode === "up" && !data.session) setSent(true);
    return undefined;
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(String(r.error.message ?? r.error));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-glow">
        <p className="font-mono text-sm font-semibold"><span className="text-primary">▲</span> forge</p>
        <h1 className="mt-4 text-2xl font-semibold">{mode === "in" ? "Welcome back" : "Create account"}</h1>
        {sent ? (
          <p className="mt-4 text-sm text-muted-foreground">Check your email to confirm your account, then sign in.</p>
        ) : (
          <>
            <Button variant="outline" className="mt-6 w-full" onClick={google}>Continue with Google</Button>
            <div className="my-4 text-center text-xs text-muted-foreground">or</div>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
            </form>
            <button className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
