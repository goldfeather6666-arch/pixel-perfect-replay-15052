import { useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { costSummary, isFreeCost, type ModelCost, type ModelOption } from "@/lib/model-pricing";

const BADGE: Record<ModelCost, string> = {
  free: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "free-tier": "bg-emerald-500/10 text-emerald-700/80 dark:text-emerald-300/80",
  paid: "bg-muted text-muted-foreground",
  unknown: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

/** Small right-aligned tag telling the user what a model will cost them. */
export function ModelCostBadge({ cost }: { cost: ModelCost }) {
  const text = cost === "free" ? "Free" : cost === "free-tier" ? "Free tier" : cost === "paid" ? "Paid" : "Cost unknown";
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE[cost]}`}>{text}</span>;
}

/**
 * Model dropdown that shows each model's cost and can narrow the list to the free ones.
 * `extraItems` keeps caller-owned options such as "No backup" or "Lead model".
 */
export function ModelSelect({ models, value, onChange, placeholder = "Choose model", ariaLabel, disabled, className, extraItems, displayValue }: {
  models: ModelOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  extraItems?: ReactNode;
  displayValue?: string;
}) {
  const [freeOnly, setFreeOnly] = useState(false);
  const shown = freeOnly ? models.filter((m) => isFreeCost(m.cost)) : models;
  const summary = costSummary(models);
  const trigger = className ?? "h-11 w-full min-w-0 [&>span]:truncate [&>span]:text-left";
  return (
    <div className="min-w-0 space-y-1">
      {models.length > 0 && (
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-muted-foreground">{summary}</p>
          <button
            type="button"
            aria-pressed={freeOnly}
            onClick={() => setFreeOnly((v) => !v)}
            className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${freeOnly ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            Free only
          </button>
        </div>
      )}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={ariaLabel} className={trigger}>
          <SelectValue placeholder={placeholder}>{displayValue ?? (value || undefined)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)]">
          {extraItems}
          {shown.map((m) => (
            <SelectItem key={m.id} value={m.id} className="break-all" title={m.note}>
              <span className="flex w-full min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 break-all">{m.id}</span>
                <ModelCostBadge cost={m.cost} />
              </span>
            </SelectItem>
          ))}
          {freeOnly && shown.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">This key has no free models — turn off “Free only” to see the rest.</p>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
