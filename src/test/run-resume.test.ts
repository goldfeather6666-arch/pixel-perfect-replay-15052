import { describe, expect, it } from "vitest";
import { QUIET_MS, RECOVERY_COOLDOWN_MS, quietStopCandidates, resumeCandidates } from "@/lib/run-resume";

const now = Date.parse("2026-11-01T01:00:00Z");
const old = "2026-11-01T00:30:00Z";
const fresh = "2026-11-01T00:59:00Z";
const STALE = 2 * 60_000;

describe("auto-resume while app is closed", () => {
  it("restarts a dead run that was not stopped", () => {
    const r = resumeCandidates([{ session_id: "a", attempts: 0 }], [{ id: "a", running: true, stop_requested: false, updated_at: old }], now, STALE);
    expect(r.resume.map((s) => s.session_id)).toEqual(["a"]);
  });
  it("leaves a live run alone", () => {
    const r = resumeCandidates([{ session_id: "a", attempts: 0 }], [{ id: "a", running: true, stop_requested: false, updated_at: fresh }], now, STALE);
    expect(r).toEqual({ resume: [], clean: [] });
  });
  it("never restarts a stopped run", () => {
    const r = resumeCandidates([{ session_id: "a", attempts: 0 }], [{ id: "a", running: true, stop_requested: true, updated_at: old }], now, STALE);
    expect(r).toEqual({ resume: [], clean: ["a"] });
  });
  it("gives up after 3 automatic restarts", () => {
    const r = resumeCandidates([{ session_id: "a", attempts: 3 }], [{ id: "a", running: true, stop_requested: false, updated_at: old }], now, STALE);
    expect(r).toEqual({ resume: [], clean: ["a"] });
  });
  it("does not resend completed or inactive tasks", () => {
    const r = resumeCandidates([{ session_id: "a", attempts: 0 }], [{ id: "a", running: false, stop_requested: false, updated_at: old }], now, STALE);
    expect(r.resume).toEqual([]);
  });
  it("waits five minutes after a claimed recovery before trying again", () => {
    const session = [{ id: "a", running: true, stop_requested: false, updated_at: old }];
    const secret = { session_id: "a", attempts: 1, updated_at: new Date(now - RECOVERY_COOLDOWN_MS + 1).toISOString() };
    expect(resumeCandidates([secret], session, now, STALE).resume).toEqual([]);
    expect(resumeCandidates([secret], session, now + 1, STALE).resume).toHaveLength(1);
  });
});

const quiet = (over: Record<string, unknown> = {}) => ({
  id: "a", user_id: "u", running: true, stop_requested: false, updated_at: new Date(now - QUIET_MS).toISOString(), last_stage: "VERIFYING", ...over,
});

describe("auto-stop a run that stays silent", () => {
  it("waits ten minutes of silence, ten times the two-minute detection window", () => {
    expect(QUIET_MS).toBe(10 * 60_000);
    expect(QUIET_MS).toBe(5 * STALE);
  });
  it("spares a run nine minutes quiet", () => {
    expect(quietStopCandidates([quiet({ updated_at: new Date(now - QUIET_MS + 60_000).toISOString() })], now)).toEqual([]);
  });
  it("stops a run ten minutes quiet", () => {
    expect(quietStopCandidates([quiet()], now).map((s) => s.id)).toEqual(["a"]);
  });
  it("never stops a run the owner stopped", () => {
    expect(quietStopCandidates([quiet({ stop_requested: true })], now)).toEqual([]);
  });
  it("never stops a finished run", () => {
    expect(quietStopCandidates([quiet({ running: false })], now)).toEqual([]);
  });
  it("spares a run waiting on an approval or an answer", () => {
    expect(quietStopCandidates([quiet({ last_stage: "AWAITING_APPROVAL" }), quiet({ id: "b", last_stage: "AWAITING_INPUT" })], now)).toEqual([]);
  });
  it("stops a run whose last word was mid-verification", () => {
    expect(quietStopCandidates([quiet({ last_stage: "VERIFYING" }), quiet({ id: "b", last_stage: null })], now).map((s) => s.id)).toEqual(["a", "b"]);
  });
});
