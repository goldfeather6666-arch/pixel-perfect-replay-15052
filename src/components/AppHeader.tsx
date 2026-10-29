import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function AppHeader({ children }: { children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <Link to="/app" className="font-mono text-sm font-semibold">
        <span className="text-primary">▲</span> forge
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
      <Button asChild variant="ghost" size="icon" aria-label="Settings">
        <Link to="/settings"><Settings /></Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign out"
        onClick={async () => {
          await supabase.auth.signOut();
          nav({ to: "/auth" });
        }}
      >
        <LogOut />
      </Button>
    </header>
  );
}
