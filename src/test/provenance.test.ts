import { describe, expect, it } from "vitest";
import { provenanceChain, stepOutcome } from "@/lib/provenance";

const change = (runId: string | null, prompt: string, createdAt: string, tool = "write_file") => ({
  runId, tool, action: "write", prompt, createdAt,
});
const gate = (runId: string, passed: boolean, createdAt: string, extra: Record<string, unknown> = {}) => ({
  runId, passed, cached: false, failedStep: null, failureKind: null, totalMs: 1200, createdAt, ...extra,
});

describe("provenanceChain", () => {
  it("groups a run's changes under the prompt that drove them, newest request first", () => {
    const chain = provenanceChain(
      [change("r1", "older ask", "2026-11-01T10:00:00Z"), change("r2", "newer ask", "2026-11-02T10:00:00Z"), change("r2", "newer ask", "2026-11-02T11:00:00Z")],
      [],
      [],
    );
    expect(chain.steps.map((s) => s.prompt)).toEqual(["newer ask", "older ask"]);
    expect(chain.steps[0]?.changes.length).toBe(2);
  });

  it("calls a change verified only when a passing check exists for the run that made it", () => {
    const chain = provenanceChain(
      [change("r1", "add login", "2026-11-01T10:00:00Z"), change("r2", "add signup", "2026-11-02T10:00:00Z")],
      [gate("r2", true, "2026-11-02T10:05:00Z")],
      [],
    );
    const signup = chain.steps.find((s) => s.runId === "r2");
    const login = chain.steps.find((s) => s.runId === "r1");
    expect(signup?.verified).toBe(true);
    expect(signup?.unverified).toBe(false);
    expect(login?.verified).toBe(false);
    expect(login?.unverified).toBe(true);
    expect(stepOutcome(login!).label).toBe("No checks recorded");
  });

  it("reports a failed run with the step and kind that failed", () => {
    const chain = provenanceChain(
      [change("r1", "fix checkout", "2026-11-01T10:00:00Z")],
      [gate("r1", false, "2026-11-01T10:05:00Z", { failedStep: "typecheck", failureKind: "regression" })],
      [],
    );
    const step = chain.steps[0]!;
    expect(step.failed).toBe(true);
    expect(stepOutcome(step)).toEqual({ label: "Checks failed at typecheck · regression", ok: false });
  });

  it("keeps changes with no run id as their own unverified step", () => {
    const chain = provenanceChain([change(null, "legacy edit", "2026-10-01T10:00:00Z")], [gate("r9", true, "2026-10-01T10:05:00Z")], ["tests pass"]);
    expect(chain.steps.length).toBe(1);
    expect(chain.steps[0]?.runId).toBeNull();
    expect(chain.steps[0]?.unverified).toBe(true);
    expect(chain.criteria).toEqual(["tests pass"]);
  });
});
