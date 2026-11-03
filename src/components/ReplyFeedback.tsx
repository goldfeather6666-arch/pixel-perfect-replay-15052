import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { submitReplyFeedback } from "@/lib/app.functions";

/** "This is wrong" on an agent reply: the note is saved as a correction Forge applies in every later run. */
export function ReplyFeedback({ taskId, reply }: { taskId: string; reply: string }) {
  const save = useServerFn(submitReplyFeedback);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" aria-label="Tell Forge this reply is wrong" className="h-7 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"><ThumbsDown className="h-3.5 w-3.5" />Wrong?</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <p className="text-sm font-medium">What's wrong here?</p>
        <p className="text-xs text-muted-foreground">Forge remembers this for every future message in this project.</p>
        <Textarea aria-label="What is wrong with this reply" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Don't use inline styles — use the theme colors" rows={3} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={busy || comment.trim().length < 3} onClick={async () => {
            setBusy(true);
            try { await save({ data: { id: taskId, excerpt: reply.slice(0, 4000), comment: comment.trim() } }); toast.success("Got it — Forge will apply this from now on"); setComment(""); setOpen(false); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Could not save your feedback"); }
            finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Save correction"}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
