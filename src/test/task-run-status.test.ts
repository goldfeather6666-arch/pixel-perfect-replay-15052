import { describe, expect, it } from "vitest";
import { taskRunStatus } from "../lib/task-run-status";

describe("task execution status", () => {
  const now = Date.parse("2026-10-31T03:38:00Z");
  const fresh = { running: true, updated_at: "2026-10-31T03:37:30Z" };
  it("requires a keeper before identifying cloud execution", () => {
    expect(taskRunStatus({ ...fresh, keeper_id: "keeper" }, now)).toBe("cloud");
    expect(taskRunStatus(fresh, now)).toBe("browser");
  });
  it("does not show inactive or stale tasks as live", () => {
    expect(taskRunStatus({ ...fresh, running: false, keeper_id: "keeper" }, now)).toBe("idle");
    expect(taskRunStatus({ ...fresh, updated_at: "2026-10-31T03:20:00Z", keeper_id: "keeper" }, now)).toBe("stale");
  });
  it("marks a missing heartbeat stale after two minutes, not fifteen", () => {
    expect(taskRunStatus({ running: true, updated_at: new Date(now - 119_999).toISOString() }, now)).toBe("browser");
    expect(taskRunStatus({ running: true, updated_at: new Date(now - 120_000).toISOString() }, now)).toBe("stale");
  });
});