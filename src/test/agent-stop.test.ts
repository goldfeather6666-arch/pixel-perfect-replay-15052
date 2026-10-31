import { describe, expect, it, vi } from "vitest";
import { watchForStop } from "@/lib/agent-stop";
describe("background stop", () => {
  it("aborts while waiting, without needing a model step to finish", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let requested = false;
    const close = watchForStop(async () => requested, controller);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.signal.aborted).toBe(false);
    requested = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(true);
    close(); vi.useRealTimers();
  });
  it("cleans up polling when the run ends", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(false);
    const close = watchForStop(read, new AbortController());
    await vi.advanceTimersByTimeAsync(1);
    close();
    await vi.advanceTimersByTimeAsync(6000);
    expect(read).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});