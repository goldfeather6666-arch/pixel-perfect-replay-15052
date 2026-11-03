import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

function ProfileBadge() {
  const [label, setLabel] = useState({ initials: "", title: "Profile" });
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const name = String(u.user_metadata?.full_name || u.email || "");
      const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
      setLabel({ initials, title: `Profile — ${u.email ?? name}` });
    });
  }, []);
  return (
    <Link to="/settings" search={{ tab: "profile" }} aria-label="Profile" title={label.title}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary hover:ring-2 hover:ring-ring">
      {label.initials || "·"}
    </Link>
  );
}
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import forgeMark from "@/assets/forge-mark.png";
import { NightModeToggle } from "@/components/AppearanceProvider";

const NAV = [
  { to: "/app", label: "Workspace", icon: LayoutDashboard },
  { to: "/skills", label: "Skills", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppHeader({ children }: { children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex min-h-16 shrink-0 items-center gap-2 border-b bg-card px-3 py-2 sm:gap-5 sm:px-6">
      <Link to="/app" aria-label="Forge workspace" className="flex shrink-0 items-center gap-1.5 text-lg font-bold">
        <img src={forgeMark} alt="" width={40} height={40} className="size-10 object-contain" />
        <span className="hidden sm:inline">Forge</span>
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
      <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} aria-label={label} title={label}
            className="flex h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3"
            activeProps={{ className: "bg-accent text-foreground shadow-sm" }}>
            <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
          </Link>
        ))}
      </nav>
      <NightModeToggle />
      <ProfileBadge />
      <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" className="size-9 shrink-0 rounded-lg"
        onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}>
        <LogOut className="size-4" />
      </Button>
    </header>
  );
}
