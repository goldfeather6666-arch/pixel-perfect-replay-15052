import { describe, expect, it } from "vitest";
import { RECOVERY_COOLDOWN_MS, resumeCandidates } from "@/lib/run-resume";

const now = Date.parse("2026-11-01T01:00:00Z");
const old = "2026-11-01T00:30:00Z";
const fresh = "2026-11-01T00:59:00Z";
const STALE = 15 * 60_000;

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
