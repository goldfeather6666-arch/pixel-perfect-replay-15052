import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, LayoutDashboard, LogOut, Moon, Settings, Sun, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import forgeMark from "@/assets/forge-mark.png";
import { useAppearance } from "@/components/AppearanceProvider";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/app", label: "Projects", icon: LayoutDashboard },
  { to: "/skills", label: "Skills", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function useUserLabel() {
  const [label, setLabel] = useState({ initials: "", email: "", name: "" });
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const name = String(u.user_metadata?.["full_name"] || "");
      const src = name || u.email || "";
      const initials = src.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
      setLabel({ initials, email: u.email ?? "", name });
    });
  }, []);
  return label;
}

/** Account menu: holds navigation on phones plus appearance, profile and sign-out everywhere. */
function AccountMenu() {
  const nav = useNavigate();
  const me = useUserLabel();
  const { appearance, toggle } = useAppearance();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-primary outline-none ring-offset-background transition hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring">
        {me.initials || <User className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{me.name || "Your account"}</p>
          <p className="truncate text-xs text-muted-foreground">{me.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="md:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <DropdownMenuItem key={to} onSelect={() => nav({ to })}><Icon /> {label}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
        </div>
        <DropdownMenuItem onSelect={() => nav({ to: "/settings", search: { tab: "profile" } as never })}><User /> Profile</DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {appearance === "dark" ? <Sun /> : <Moon />} {appearance === "dark" ? "Day mode" : "Night mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Calm top bar: brand, page context (children), optional page actions, desktop nav and one account menu. */
export function AppHeader({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-xl sm:gap-4 sm:px-5">
      <Link to="/app" aria-label="Forge projects" className="flex shrink-0 items-center gap-2">
        <img src={forgeMark} alt="" width={28} height={28} className="size-7 object-contain" />
        <span className="hidden text-[15px] font-semibold sm:inline">Forge</span>
      </Link>
      {children && <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />}
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <nav aria-label="Main navigation" className="hidden items-center gap-0.5 md:flex">
        {NAV.map(({ to, label }) => (
          <Link key={to} to={to}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground bg-secondary" }}>
            {label}
          </Link>
        ))}
      </nav>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      <AccountMenu />
    </header>
  );
}
