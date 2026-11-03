import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Eye, GitBranch, KeyRound, Network, Rocket, ShieldCheck, Sparkles, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NightModeToggle } from "@/components/AppearanceProvider";
import forgeMark from "@/assets/forge-mark.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forge — the AI coding studio that runs on your own key" },
      { name: "description", content: "Describe what you want, and a team of AI agents builds it in your GitHub repo, previews it live and ships it to your own Vercel and database." },
      { property: "og:title", content: "Forge — the AI coding studio that runs on your own key" },
      { property: "og:description", content: "A team of AI agents that builds in your repo, previews live and ships to your own accounts. No credits to buy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = [
  { n: "01", title: "Connect", body: "Add your AI key and GitHub once. Database and Vercel connect in one click." },
  { n: "02", title: "Describe", body: "Say what you want in plain words. Forge plans, asks when unsure, then builds." },
  { n: "03", title: "Ship", body: "Watch the live preview, approve changes and publish to your own site." },
];

const FEATURES = [
  { icon: Network, title: "An agent team, not one bot", body: "A lead agent splits big work across specialists that build, test and review in parallel.", wide: true },
  { icon: KeyRound, title: "Your key, your bill", body: "OpenAI, Anthropic, Gemini, OpenRouter or any compatible model. Free models are labelled." },
  { icon: Eye, title: "Live preview", body: "Your app runs privately while the agent works — with your real database connected." },
  { icon: ShieldCheck, title: "You stay in control", body: "Choose how much the agent may do alone. Risky steps always ask first, right in the chat." },
  { icon: Terminal, title: "Cloud workspace", body: "Installs, builds and tests run in a private cloud machine that keeps going when you close the tab." },
  { icon: Rocket, title: "One-tap publish", body: "Settings, sign-in links and secrets sync to your own Vercel and database automatically.", wide: true },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <img src={forgeMark} alt="" width={28} height={28} className="size-7 object-contain" /> Forge
          </span>
          <div className="flex items-center gap-1.5">
            <NightModeToggle />
            <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/auth">Sign in</Link></Button>
            <Button asChild size="sm" className="rounded-full"><Link to="/app">Start building</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[520px] max-w-4xl rounded-full bg-primary/15 blur-[120px]" />
          <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center sm:pt-28">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
              <Sparkles className="size-3.5 text-primary" /> Open source · bring your own key
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl">
              Build real apps by <span className="text-primary">just describing them.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              A team of AI agents works in your own GitHub repo, shows a live preview, and publishes to your own accounts. No credits to buy.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base shadow-[var(--workspace-shadow)]">
                <Link to="/app">Start building <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-base"><a href="#how">See how it works</a></Button>
            </div>
          </div>

          <div className="relative mx-auto max-w-5xl px-5 pb-20">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--workspace-shadow)]">
              <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-muted-foreground/25" /><span className="size-2.5 rounded-full bg-muted-foreground/25" /><span className="size-2.5 rounded-full bg-muted-foreground/25" />
                <span className="ml-3 flex items-center gap-1.5 font-mono text-xs text-muted-foreground"><GitBranch className="size-3" /> agent/booking-page</span>
              </div>
              <div className="grid md:grid-cols-[1fr_1.15fr]">
                <div className="space-y-3 border-b p-5 text-left text-sm md:border-b-0 md:border-r">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2">Add a booking page with sign-in and email reminders.</p>
                  <div className="space-y-2 rounded-xl border p-3">
                    {["Planned 3 phases", "Database tables + sign-in", "Booking page and calendar", "Preview ready · 0 errors"].map((t, i) => (
                      <p key={t} className="flex items-center gap-2 text-xs"><span className={`grid size-4 place-items-center rounded-full ${i < 3 ? "bg-success/15 text-success" : "bg-primary/15 text-primary"}`}><Check className="size-3" /></span>{t}</p>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">4 agents worked in parallel · 12 files changed</p>
                </div>
                <div className="bg-muted/40 p-5">
                  <div className="rounded-xl border bg-background p-4 text-left">
                    <p className="text-xs text-muted-foreground">Preview</p>
                    <p className="mt-1 font-semibold">Book a session</p>
                    <div className="mt-3 grid grid-cols-7 gap-1">
                      {Array.from({ length: 21 }, (_, i) => (
                        <span key={i} className={`aspect-square rounded-md ${i === 9 ? "bg-primary" : i % 4 === 0 ? "bg-secondary" : "bg-muted"}`} />
                      ))}
                    </div>
                    <span className="mt-3 block h-8 rounded-lg bg-primary/90" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-t bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-20 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <p className="font-mono text-xs text-primary">{s.n}</p>
                <h2 className="mt-2 text-xl font-semibold">{s.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-2xl text-3xl font-semibold sm:text-4xl">Everything a serious builder needs.</h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className={`rounded-2xl border bg-card p-6 transition hover:shadow-[var(--workspace-shadow)] ${f.wide ? "lg:col-span-2" : ""}`}>
                <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><f.icon className="size-4" /></span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="rounded-3xl border bg-card px-6 py-14 text-center">
            <h2 className="text-3xl font-semibold">Ready to build?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">Bring your key, connect a repo, and describe your first feature.</p>
            <Button asChild size="lg" className="mt-7 h-12 rounded-full px-6"><Link to="/app">Open Forge <ArrowRight /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Forge · Open source</span>
          <span>Your keys stay encrypted and never leave the server.</span>
        </div>
      </footer>
    </div>
  );
}
