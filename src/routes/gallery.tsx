import { createFileRoute } from "@tanstack/react-router";
import { getGallery } from "@/lib/sharing.functions";

export const Route = createFileRoute("/gallery")({
  loader: () => getGallery(),
  head: () => ({ meta: [
    { title: "Forge gallery — builds shared by makers" }, { name: "description", content: "Opt-in, read-only snapshots of apps and features built with the Forge coding agent." },
    { property: "og:title", content: "Forge gallery" }, { property: "og:description", content: "Opt-in, read-only snapshots of builds made with Forge." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Gallery,
});

function Gallery() {
  const items = Route.useLoaderData();
  return <main className="mx-auto max-w-5xl px-4 py-12">
    <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
    <p className="mt-1 text-sm text-muted-foreground">Builds their owners chose to share. Entries disappear when the link expires or is revoked.</p>
    {items.length === 0 ? <p className="mt-10 text-sm text-muted-foreground">Nothing shared yet.</p> :
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((i) => <article key={i.id} className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">{i.title}</h2>
        {i.prompt && <p className="line-clamp-3 text-sm text-muted-foreground">{i.prompt}</p>}
        {i.reply && <p className="line-clamp-4 border-t pt-2 text-xs">{i.reply}</p>}
        <p className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</p>
      </article>)}</div>}
  </main>;
}
