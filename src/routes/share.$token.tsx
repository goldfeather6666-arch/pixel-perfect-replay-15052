import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicShare } from "@/lib/sharing.functions";

export const Route = createFileRoute("/share/$token")({
  loader: ({ params }) => getPublicShare({ data: { token: params.token } }),
  head: () => ({ meta: [
    { title: "Shared Forge build" }, { name: "description", content: "A read-only snapshot of a task built with Forge." },
    { property: "og:title", content: "Shared Forge build" }, { property: "og:description", content: "A read-only snapshot of a task built with Forge." },
    { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: SharePage,
});

function SharePage() {
  const share = Route.useLoaderData();
  if (!share) return <main className="mx-auto max-w-2xl px-4 py-24 text-center"><h1 className="text-xl font-semibold">This link has expired or was revoked.</h1><Link to="/gallery" className="mt-4 inline-block text-sm underline">Browse the gallery</Link></main>;
  const s = share.snapshot;
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
    <header><p className="text-xs uppercase tracking-wide text-muted-foreground">Read-only · built with Forge</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{s.title}</h1>{s.repo && <p className="text-sm text-muted-foreground">{s.repo}</p>}<p className="mt-1 text-xs text-muted-foreground">Available until {new Date(share.expires_at).toLocaleDateString()}</p></header>
    {s.prompts.length > 0 && <section className="space-y-2"><h2 className="text-sm font-semibold">Requests</h2>{s.prompts.map((p, i) => <p key={i} className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">{p}</p>)}</section>}
    {s.reply && <section className="space-y-2"><h2 className="text-sm font-semibold">Agent's final reply</h2><div className="whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm">{s.reply}</div></section>}
  </main>;
}
