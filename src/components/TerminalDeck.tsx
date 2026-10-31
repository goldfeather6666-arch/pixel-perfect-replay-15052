import { useState } from "react";
import { Columns2, Square } from "lucide-react";
import { TerminalView } from "@/components/TerminalView";

/** One or two independent terminal panes side by side (stacked on narrow screens). */
export function TerminalDeck({ id }: { id: string }) {
  const [split, setSplit] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span className="hud-label">Terminal deck</span>
        <button type="button" onClick={() => setSplit((s) => !s)} aria-pressed={split}
          className={`ml-auto flex items-center gap-1 rounded-md border px-2 py-1 ${split ? "border-primary text-primary" : "text-muted-foreground"}`}>
          {split ? <Square className="h-3 w-3" /> : <Columns2 className="h-3 w-3" />}{split ? "Single pane" : "Split pane"}
        </button>
      </div>
      <div className={`grid min-h-0 flex-1 ${split ? "grid-rows-2 xl:grid-cols-2 xl:grid-rows-1" : ""}`}>
        <div className="min-h-0 overflow-hidden"><TerminalView id={id} /></div>
        {split && <div className="min-h-0 overflow-hidden border-t xl:border-l xl:border-t-0"><TerminalView id={id} /></div>}
      </div>
    </div>
  );
}
