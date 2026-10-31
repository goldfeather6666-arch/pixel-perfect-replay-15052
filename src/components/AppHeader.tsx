import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, LayoutDashboard, LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/app", label: "Workspace", icon: LayoutDashboard },
  { to: "/skills", label: "Skills", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppHeader({ children }: { children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4">
      <Link to="/app" className="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground shadow-glow">▲</span>
        <span className="hidden sm:inline">forge</span>
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
      <nav className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-card/60 p-0.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} aria-label={label}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "bg-accent text-foreground" }}>
            <Icon className="h-4 w-4" /><span className="hidden lg:inline">{label}</span>
          </Link>
        ))}
      </nav>
      <Button variant="ghost" size="icon" aria-label="Sign out" className="shrink-0"
        onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}>
        <LogOut />
      </Button>
    </header>
  );
}
