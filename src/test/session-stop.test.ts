import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { stopAgentSession } from "@/lib/session-stop.server";

const stop = vi.hoisted(() => vi.fn());
vi.mock("@/lib/background-run.server", () => ({ stopKeeper: stop }));

function database(row: unknown, error: unknown = null) {
  const filters: unknown[][] = [];
  const update = vi.fn();
  const q: any = {};
  q.update = (value: unknown) => { update(value); return q; };
  q.eq = (...args: unknown[]) => { filters.push(args); return q; };
  q.select = () => q;
  q.maybeSingle = async () => ({ data: row, error });
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: row, error }).then(resolve);
  return { db: { from: () => q }, update, filters };
}

beforeEach(() => { vi.useFakeTimers(); stop.mockReset(); stop.mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());

describe("manual session Stop", () => {
  it("atomically stops and fences the owner's run without heartbeat comparison", async () => {
    const d = database({ id: "task", keeper_id: null });
    expect(await stopAgentSession(d.db, "task", "owner")).toEqual({ ok: true });
    expect(d.update).toHaveBeenCalledWith(expect.objectContaining({ stop_requested: true, running: false, execution_id: expect.any(String) }));
    expect(d.filters).toContainEqual(["user_id", "owner"]);
    expect(d.filters.some(([column]) => column === "updated_at")).toBe(false);
  });
  it("returns without waiting for remote cleanup and kills only the captured keeper", async () => {
    const d = database({ id: "task", keeper_id: "old-keeper" });
    expect(await stopAgentSession(d.db, "task", "owner")).toEqual({ ok: true });
    expect(stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(stop).toHaveBeenCalledExactlyOnceWith("old-keeper");
    expect(d.filters).toContainEqual(["keeper_id", "old-keeper"]);
    expect(d.filters.some(([column]) => column === "execution_id")).toBe(true);
  });
  it("does not cancel another owner's task when no authorized row exists", async () => {
    const d = database(null);
    await expect(stopAgentSession(d.db, "task", "other-owner")).rejects.toThrow("Task not found");
    expect(stop).not.toHaveBeenCalled();
  });
});