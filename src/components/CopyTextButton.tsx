import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

// Compact copy control for a block of chat text. Shows a tick for a moment after a successful
// copy and a plain-language toast when the browser refuses clipboard access.
export function CopyTextButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={copied ? "Copied to clipboard" : label}
      className={cn("h-7 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground", className)}
      onClick={async () => {
        const ok = await copyText(text);
        if (!ok) {
          toast.error("Couldn't copy — your browser blocked access to the clipboard.");
          return;
        }
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
