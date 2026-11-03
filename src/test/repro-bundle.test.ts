import { describe, expect, it } from "vitest";
import { buildReproBundle, type ReproInput } from "@/lib/repro-bundle";

const base: ReproInput = {
  objective: "Add password reset to the settings page",
  provider: "openrouter",
  model: "gpt-6-astra",
  autonomy: "auto",
  stage: "CODING",
  branch: "agent/task-1",
  commit: "abcdef1234567890",
  root: "apps/web",
  outcome: "failed",
  failedStep: "build",
  failureKind: "regression",
  logs: ["TypeError: cannot read x", "  at Settings.tsx:12"],
  changed: [{ path: "apps/web/Settings.tsx", action: "write" }],
  startedAt: "2026-11-03T10:00:00Z",
  endedAt: "2026-11-03T10:02:00Z",
};

describe("buildReproBundle", () => {
  it("keeps the environment and the failing step in the artifact", () => {
    const b = buildReproBundle(base);
    expect(b.environment.model).toBe("gpt-6-astra");
    expect(b.environment.commit).toBe("abcdef1234567890");
    expect(b.failure.step).toBe("build");
    expect(b.title).toBe("The code regressed at build");
  });

  it("redacts secrets that appear in captured logs", () => {
    const b = buildReproBundle({ ...base, logs: ["failed with sk-live-secret-abcdef123456"] });
    expect(b.evidence.join(" ")).not.toContain("sk-live-secret-abcdef123456");
    expect(b.minimalRepro).not.toContain("sk-live-secret-abcdef123456");
    expect(b.replayPrompt).not.toContain("sk-live-secret-abcdef123456");
  });

  it("caps evidence at six entries and changed files at eight", () => {
    const b = buildReproBundle({
      ...base,
      logs: Array.from({ length: 12 }, (_, i) => `log line ${i}`),
      changed: Array.from({ length: 11 }, (_, i) => ({ path: `src/f${i}.ts`, action: "write" })),
    });
    expect(b.evidence.length).toBe(6);
    expect(b.evidence[5]).toBe("log line 5");
    expect(b.changed.length).toBe(8);
  });

  it("states honestly when nothing was captured", () => {
    const b = buildReproBundle({ ...base, logs: [], changed: [], failedStep: null, failureKind: null, outcome: "cancelled" });
    expect(b.failure.kind).toBe("stopped");
    expect(b.minimalRepro).toContain("No log evidence was captured.");
    expect(b.minimalRepro).toContain("No files had changed.");
    expect(b.failure.step).toBe("not recorded");
  });

  it("writes a replay prompt that asks to reproduce before fixing", () => {
    const b = buildReproBundle(base);
    expect(b.replayPrompt).toContain("reproduce then fix");
    expect(b.replayPrompt).toContain("Add password reset");
    expect(b.replayPrompt).toContain("build (regression)");
    expect(b.minimalRepro).toContain("apps/web/Settings.tsx");
  });
});
