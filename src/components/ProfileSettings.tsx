import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileSettings() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setName(String(data.user?.user_metadata?.["full_name"] ?? ""));
    });
  }, []);

  const hasPassword = user?.identities?.some((i) => i.provider === "email") ?? false;
  const methods = user?.identities?.map((i) => (i.provider === "email" ? "Email" : (i.provider[0] ?? "").toUpperCase() + i.provider.slice(1))).join(", ");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingName(false);
    if (error) toast.error(error.message);
    else toast.success("Name saved");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("New password must be at least 8 characters.");
    if (pw !== pw2) return toast.error("The two new passwords don't match.");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser(hasPassword ? { password: pw, current_password: current } : { password: pw });
    setSavingPw(false);
    if (error) return toast.error(error.message);
    setCurrent(""); setPw(""); setPw2("");
    toast.success("Password changed");
    return undefined;
  }

  return (
    <>
      <section className="panel rounded-2xl p-4 sm:p-6">
        <h2 className="font-semibold tracking-tight">Profile</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Email</dt><dd className="truncate">{user?.email ?? "…"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Member since</dt><dd>{user ? new Date(user.created_at).toLocaleDateString() : "…"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Sign-in method</dt><dd>{methods || "…"}</dd></div>
        </dl>
        <form className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={saveName}>
          <div className="flex-1 space-y-1.5"><Label htmlFor="pname">Display name</Label><Input id="pname" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
          <Button disabled={savingName || !user}>{savingName ? "Saving…" : "Save name"}</Button>
        </form>
      </section>
      <section className="panel rounded-2xl p-4 sm:p-6">
        <h2 className="font-semibold tracking-tight">{hasPassword ? "Change password" : "Set a password"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hasPassword ? "Enter your current password, then choose a new one." : "You signed in with Google. Add a password to also sign in with your email."}</p>
        <form className="mt-4 space-y-3" onSubmit={savePassword}>
          {hasPassword && <div className="space-y-1.5"><Label htmlFor="cur">Current password</Label><Input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="npw">New password</Label><Input id="npw" type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="npw2">Confirm new password</Label><Input id="npw2" type="password" autoComplete="new-password" required minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          </div>
          <Button disabled={savingPw || !user}>{savingPw ? "Updating…" : "Update password"}</Button>
        </form>
      </section>
    </>
  );
}
