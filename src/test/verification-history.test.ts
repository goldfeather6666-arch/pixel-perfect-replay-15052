import { expect, it } from "vitest";
import { verificationHistory, type VerificationEvent } from "@/lib/verification-history";
const event = (payload: unknown, id = "1"): VerificationEvent => ({ id, run_id: "run", type: "budget.check", created_at: `2026-11-03T19:14:${id.padStart(2, "0")}Z`, payload });
it("preserves the measured commit and concrete limits", () => {
  const r = verificationHistory([event({ commit: "a".repeat(40), ok: true, measured: { jsKb: 120 }, limits: { jsKb: 200 } })])[0];
  expect(r?.commit).toBe("a".repeat(40)); expect(r?.status).toBe("passed"); expect(r?.measurements).toEqual([{ metric: "jsKb", actual: 120, limit: 200 }]);
});
it("never upgrades legacy or missing measurements to passing evidence", () => {
  expect(verificationHistory([event({ ok: true })])[0]?.status).toBe("unmeasured");
  expect(verificationHistory([event({ ok: true, commit: "a".repeat(40), measured: {}, limits: { jsKb: 200 } })])[0]?.status).toBe("unmeasured");
});
it("distinguishes breaches and revision changes", () => {
  const p = { ok: false, commit: "a".repeat(40), measured: { jsKb: 300 }, limits: { jsKb: 200 } };
  expect(verificationHistory([event(p)])[0]?.status).toBe("failed");
  expect(verificationHistory([event({ ...p, valid: false })])[0]?.status).toBe("stale");
});
it("filters, orders and bounds milestone history", () => {
  const rows = Array.from({ length: 60 }, (_, i) => event({}, String(i)));
  expect(verificationHistory(rows)).toHaveLength(50);
  expect(verificationHistory([{ ...event({}), type: "tool.end" }])).toEqual([]);
  expect(verificationHistory([event({}, "1"), event({}, "2")]).map((r) => r.id)).toEqual(["2", "1"]);
});