import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog } from "@/lib/app.functions";

const LABELS: Record<string, string> = {
  "changes.approved": "Approved changes",
  "changes.rejected": "Rejected changes",
  "pr.opened": "Opened pull request",
  "task.deleted": "Deleted task",
};

export function ActivityLog() {
  const list = useServerFn(listAuditLog);
  const q = useQuery({ queryKey: ["audit-log"], queryFn: () => list() });
  return (
    <section className="panel rounded-2xl p-4 sm:p-6">
      <h2 className="font-semibold tracking-tight">Account activity</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your recent approvals, pull requests and deletions.</p>
      <ul className="mt-4 divide-y text-sm">
        {q.isLoading && <li className="py-2 text-muted-foreground">Loading…</li>}
        {q.data && !q.data.length && <li className="py-2 text-muted-foreground">Nothing yet.</li>}
        {q.data?.map((r) => {
          const files = (r.detail as { files?: string[] })?.files;
          return (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 truncate">{LABELS[r.action] ?? r.action}{r.target ? <span className="text-muted-foreground"> · {r.target}</span> : null}{files?.length ? <span className="text-muted-foreground"> · {files.length} file{files.length === 1 ? "" : "s"}</span> : null}</span>
              <time className="shrink-0 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
