import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Bell, Link2, PenLine, ShieldAlert, ShieldCheck, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { copyText } from "@/lib/clipboard";
import { createShare, getNotifySettings, getReview, listShares, revokeShare, saveNotifySettings, submitReview } from "@/lib/sharing.functions";
import type { Badge } from "@/lib/sharing";

const BADGE: Record<Badge, { label: string; Icon: typeof BadgeCheck; cls: string }> = {
  reviewed: { label: "Reviewed", Icon: BadgeCheck, cls: "bg-primary/10 text-primary" },
  changes_requested: { label: "Changes requested", Icon: PenLine, cls: "bg-destructive/10 text-destructive" },
  unreviewed: { label: "Not reviewed", Icon: CircleDashed, cls: "bg-muted text-muted-foreground" },
  checks_passed: { label: "Checks passed", Icon: ShieldCheck, cls: "bg-primary/10 text-primary" },
  checks_blocked: { label: "Checks failing", Icon: ShieldAlert, cls: "bg-destructive/10 text-destructive" },
};

export function ReviewBadges({ badges }: { badges: Badge[] }) {
  return <div className="flex flex-wrap gap-1.5">{badges.map((b) => { const { label, Icon, cls } = BADGE[b]; return <span key={b} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}><Icon className="size-3" />{label}</span>; })}</div>;
}

export function ReviewPanel({ id, running }: { id: string; running: boolean }) {
  const get = useServerFn(getReview); const submit = useServerFn(submitReview);
  const qc = useQueryClient(); const [note, setNote] = useState("");
  const q = useQuery({ queryKey: ["review", id], queryFn: () => get({ data: { id } }) });
  const m = useMutation({ mutationFn: (verdict: "approved" | "changes_requested") => submit({ data: { id, verdict, note } }), onSuccess: () => { setNote(""); toast.success("Review saved"); void qc.invalidateQueries({ queryKey: ["review", id] }); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="mx-auto max-w-3xl space-y-3 px-3 pb-4" aria-label="Review">
    <div className="flex flex-wrap items-center gap-2 border-b pb-2"><BadgeCheck className="size-4 text-muted-foreground" /><h3 className="flex-1 text-sm font-semibold">Review</h3>{q.data && <ReviewBadges badges={q.data.badges} />}</div>
    <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Optional review note" className="min-h-16 text-sm" />
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={running || m.isPending} onClick={() => m.mutate("approved")}><BadgeCheck />Mark reviewed</Button>
      <Button size="sm" variant="outline" disabled={running || m.isPending} onClick={() => m.mutate("changes_requested")}><PenLine />Request changes</Button>
    </div>
    {q.data?.reviews.slice(0, 3).map((r: any) => <p key={r.id} className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.verdict === "approved" ? "Reviewed" : "Changes requested"}{r.note ? ` — ${r.note}` : ""}</p>)}
  </section>;
}

export function SharePanel({ id }: { id: string }) {
  const list = useServerFn(listShares); const create = useServerFn(createShare); const revoke = useServerFn(revokeShare);
  const qc = useQueryClient();
  const [days, setDays] = useState<1 | 7 | 30>(7); const [gallery, setGallery] = useState(false); const [showRepo, setShowRepo] = useState(false);
  const q = useQuery({ queryKey: ["shares", id], queryFn: () => list({ data: { id } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["shares", id] });
  const mk = useMutation({ mutationFn: () => create({ data: { id, days, gallery, showRepo } }), onSuccess: async ({ token }) => { const url = `${window.location.origin}/share/${token}`; await copyText(url).catch(() => {}); toast.success("Share link copied — it is shown only once."); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const rv = useMutation({ mutationFn: (shareId: string) => revoke({ data: { shareId } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  return <section className="mx-auto max-w-3xl space-y-3 px-3 pb-4" aria-label="Share">
    <div className="flex items-center gap-2 border-b pb-2"><Link2 className="size-4 text-muted-foreground" /><h3 className="flex-1 text-sm font-semibold">Share read-only</h3><a href="/gallery" className="text-xs text-muted-foreground underline">Gallery</a></div>
    <p className="text-xs text-muted-foreground">Shares a frozen copy of your requests and the agent's final reply. No code, files, logs or secrets.</p>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <div className="flex gap-1">{([1, 7, 30] as const).map((d) => <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d}d</Button>)}</div>
      <label className="flex items-center gap-1.5"><Switch checked={showRepo} onCheckedChange={setShowRepo} />Show repo name</label>
      <label className="flex items-center gap-1.5"><Switch checked={gallery} onCheckedChange={setGallery} />List in gallery</label>
      <Button size="sm" disabled={mk.isPending} onClick={() => mk.mutate()}>Create link</Button>
    </div>
    {q.data?.map((s: any) => <div key={s.id} className="flex items-center gap-2 text-xs"><span className="flex-1 text-muted-foreground">{new Date(s.created_at).toLocaleDateString()} · {s.active ? `expires ${new Date(s.expires_at).toLocaleDateString()}` : "inactive"}{s.in_gallery ? " · in gallery" : ""}</span>{s.active && <Button size="sm" variant="ghost" className="text-destructive" disabled={rv.isPending} onClick={() => rv.mutate(s.id)}>Revoke</Button>}</div>)}
  </section>;
}

export function NotifySettings() {
  const get = useServerFn(getNotifySettings); const save = useServerFn(saveNotifySettings);
  const qc = useQueryClient(); const [url, setUrl] = useState("");
  const q = useQuery({ queryKey: ["notify"], queryFn: () => get() });
  const m = useMutation({ mutationFn: (v: string | null) => save({ data: { url: v, test: !!v } }), onSuccess: () => { setUrl(""); toast.success("Saved"); void qc.invalidateQueries({ queryKey: ["notify"] }); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="space-y-3 rounded-2xl border bg-card p-4">
    <div className="flex items-center gap-2"><Bell className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Slack / Teams notices</h2></div>
    <p className="text-xs text-muted-foreground">{q.data?.configured ? `Connected to ${q.data.host}. Reviews and shares are posted there.` : "Paste an incoming webhook URL to get a message when you review or share a task."}</p>
    <div className="flex flex-col gap-2 sm:flex-row"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" /><Button disabled={!url || m.isPending} onClick={() => m.mutate(url.trim())}>Save & test</Button>{q.data?.configured && <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate(null)}>Disconnect</Button>}</div>
  </section>;
}
