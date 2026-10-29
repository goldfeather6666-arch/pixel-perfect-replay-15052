import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GitBranch, KeyRound, ShieldCheck, Terminal } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forge — bring-your-own-key AI coding agent" },
      { name: "description", content: "An open-source AI coding agent in your browser. Use your own AI key, connect GitHub, and let the agent edit real code." },
      { property: "og:title", content: "Forge — bring-your-own-key AI coding agent" },
      { property: "og:description", content: "Use your own AI key, connect GitHub, and delegate real coding tasks from any browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: KeyRound, title: "Your keys", body: "OpenAI, Anthropic, Gemini, OpenRouter or any compatible endpoint. Encrypted at rest." },
  { icon: GitBranch, title: "Real repos", body: "The agent reads and edits your GitHub code on its own branch, then opens a pull request." },
  { icon: ShieldCheck, title: "You approve", body: "Supervised mode stages every edit for review. Autonomous mode commits as it goes." },
  { icon: Terminal, title: "Terminal next", body: "Sandboxed commands and test runs are on the roadmap." },
];

function Index() {
  return (
    <main className="min-h-screen bg-grid">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <header className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold tracking-tight">
            <span className="text-primary">▲</span> forge
          </span>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>
        <section className="py-20 sm:py-28">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">open source · byok</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            A coding agent that runs on <span className="text-primary">your</span> key.
          </h1>
          <p className="mt-6 max-w-xl text-muted-foreground">
            Connect a GitHub repo, pick a model, describe the task. The agent inspects files, plans, and edits real code — no credits to buy.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg" className="shadow-glow">
              <Link to="/app">Open workspace</Link>
            </Button>
          </div>
        </section>
        <section className="grid gap-3 pb-16 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
