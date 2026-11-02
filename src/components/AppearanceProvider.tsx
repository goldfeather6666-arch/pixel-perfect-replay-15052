import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Appearance = "light" | "dark";
const storageKey = "forge-appearance";
const AppearanceContext = createContext<{ appearance: Appearance; toggle: () => void }>({ appearance: "light", toggle: () => {} });

export const appearanceScript = `try{var a=localStorage.getItem('${storageKey}');document.documentElement.classList.toggle('dark',a==='dark')}catch(e){}`;

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>("light");
  useEffect(() => {
    const sync = () => {
      let next: Appearance = "light";
      try { next = localStorage.getItem(storageKey) === "dark" ? "dark" : "light"; } catch { /* Storage can be blocked. */ }
      document.documentElement.classList.toggle("dark", next === "dark");
      setAppearance(next);
    };
    sync();
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) sync(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggle = () => {
    const next = appearance === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setAppearance(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the current session usable. */ }
  };
  return <AppearanceContext.Provider value={{ appearance, toggle }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { return useContext(AppearanceContext); }

export function NightModeToggle() {
  const { appearance, toggle } = useAppearance();
  const label = appearance === "dark" ? "Switch to day mode" : "Switch to night mode";
  return <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={label} title={label} aria-pressed={appearance === "dark"} onClick={toggle}>
    {appearance === "dark" ? <Sun /> : <Moon />}
  </Button>;
}