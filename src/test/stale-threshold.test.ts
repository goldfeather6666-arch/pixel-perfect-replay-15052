import { describe, expect, it } from "vitest";
import { STALE_MS, taskRunStatus } from "@/lib/task-run-status";

describe("stale run threshold", () => {
  it("tolerates late heartbeats: a run 2 minutes quiet is still live", () => {
    expect(taskRunStatus({ running: true, updated_at: new Date(0).toISOString() }, 120_000)).toBe("browser");
  });
  it("needs at least 3 minutes of silence before a run counts as dead", () => {
    expect(STALE_MS).toBeGreaterThanOrEqual(180_000);
  });
});
