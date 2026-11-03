// Bug autopsy: when a run fails, this assembles a repro artifact — the environment it failed in,
// the redacted evidence, what changed just before, a minimal reproduction and a replay prompt the
// user can send to try again. Nothing here re-runs anything on its own.

import { redact } from "./engine/errors";

export type ReproInput = {
  objective: string;
  provider: string;
  model: string;
  autonomy: string;
  stage: string;
  branch: string;
  commit: string;
  root: string;
  outcome: string | null;
  failedStep?: string | null;
  failureKind?: string | null;
  logs: string[];
  changed: { path: string; action: string }[];
  startedAt?: string | null;
  endedAt?: string | null;
};

export type ReproBundle = {
  title: string;
  environment: { provider: string; model: string; autonomy: string; stage: string; branch: string; commit: string; root: string; outcome: string };
  failure: { kind: string; step: string; headline: string };
  evidence: string[];
  changed: { path: string; action: string }[];
  minimalRepro: string;
  replayPrompt: string;
  window: string;
};

const MAX_LOGS = 6;
const LOG_CHARS = 500;

const headlineFor = (kind: string | null | undefined, step: string | null | undefined) => {
  if (kind === "config") return `Configuration stopped the run${step ? ` at ${step}` : ""}`;
  if (kind === "flaky") return `A flaky dependency broke the run${step ? ` at ${step}` : ""}`;
  if (kind === "regression") return `The code regressed${step ? ` at ${step}` : ""}`;
  if (step) return `The run failed at ${step}`;
  return "The run stopped without a recorded cause";
};

export function buildReproBundle(input: ReproInput): ReproBundle {
  const kind = input.failureKind ?? (input.outcome === "cancelled" ? "stopped" : "unknown");
  const step = input.failedStep ?? null;
  const evidence = input.logs
    .filter((l) => typeof l === "string" && l.trim().length > 0)
    .slice(0, MAX_LOGS)
    .map((l) => redact(l, LOG_CHARS));
  const firstLine = evidence[0]?.split("\n").find((l) => l.trim().length > 0) ?? "";
  const changed = input.changed.slice(0, 8);
  const window =
    input.startedAt && input.endedAt
      ? `${new Date(input.startedAt).toLocaleString()} → ${new Date(input.endedAt).toLocaleString()}`
      : input.startedAt
        ? `started ${new Date(input.startedAt).toLocaleString()}`
        : "no time recorded";

  const minimalRepro = [
    `On branch ${input.branch || "?"} at commit ${(input.commit || "?").slice(0, 7)} (app root ${input.root || "."}), ${input.provider}/${input.model} was asked:`,
    `"${redact(input.objective, 300)}"`,
    step ? `It stopped at ${step} (${kind}).` : `It stopped (${kind}).`,
    firstLine ? `First evidence: ${firstLine.slice(0, 200)}` : "No log evidence was captured.",
    changed.length ? `Files changed just before: ${changed.map((c) => c.path).join(", ")}.` : "No files had changed.",
  ].join("\n");

  const replayPrompt = [
    `Replay of a failed run: reproduce then fix, don't start from scratch.`,
    `Environment: ${input.provider}/${input.model}, ${input.autonomy} autonomy, branch ${input.branch || "?"}, commit ${(input.commit || "?").slice(0, 7)}, app root ${input.root || "."}.`,
    `Original request: ${redact(input.objective, 400)}`,
    step ? `Last known failure: ${step} (${kind}).` : `Last known failure: ${kind}.`,
    `First reproduce it (preview_start / deployment_preflight as relevant), read the real error, then fix the cause and re-verify the same journey. Report what was wrong.`,
  ].join("\n");

  return {
    title: headlineFor(input.failureKind, step),
    environment: {
      provider: input.provider,
      model: input.model,
      autonomy: input.autonomy,
      stage: input.stage,
      branch: input.branch,
      commit: input.commit,
      root: input.root,
      outcome: input.outcome ?? "open",
    },
    failure: { kind, step: step ?? "not recorded", headline: headlineFor(input.failureKind, step) },
    evidence,
    changed,
    minimalRepro,
    replayPrompt,
    window,
  };
}
