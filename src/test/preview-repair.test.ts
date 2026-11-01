import { describe, expect, it } from "vitest";
import { canAutoRepair, previewNeedsRepair, previewRepairPrompt, redactPreviewDiagnostic } from "@/lib/preview-repair";

describe("preview crash repair", () => {
  it("offers repair for server crashes and real browser errors", () => {
    expect(previewNeedsRepair("crashed", [])).toBe(true);
    expect(previewNeedsRepair("error", [])).toBe(true);
    expect(previewNeedsRepair("ready", [{ m: "TypeError: rows.map is not a function", path: "/account" }])).toBe(true);
    expect(previewNeedsRepair("ready", [])).toBe(false);
    expect(previewNeedsRepair("starting", [])).toBe(false);
    expect(previewNeedsRepair("stopped", [])).toBe(false);
  });
  it("passes actual diagnostic values and logs to the repair request", () => {
    const prompt = previewRepairPrompt({ status: "error", lastHttp: 500, branch: "agent/repair", lastCheck: "2026-11-01T07:04:00Z" }, [{ m: "rows.map is not a function", path: "/account" }], "src/account.tsx:42 TypeError");
    const data = JSON.parse(prompt.slice(prompt.indexOf("{\n"), prompt.indexOf("\nInvestigate with")));
    expect(data.httpStatus).toBe(500);
    expect(data.branch).toBe("agent/repair");
    expect(data.browserErrors[0]).toEqual({ message: "rows.map is not a function", path: "/account" });
    expect(data.serverLog).toBe("src/account.tsx:42 TypeError");
  });
  it("removes credentials and signed preview tokens but preserves error locations", () => {
    const safe = redactPreviewDiagnostic("src/app.ts:42 SUPABASE_SERVICE_ROLE_KEY=private-value https://user:pass@example.com/api?forge_t=signed-link Bearer access-secret sk-abcdef123456 ghp_abcdef123456");
    for (const secret of ["private-value", "user:pass", "signed-link", "access-secret", "sk-abcdef123456", "ghp_abcdef123456"]) expect(safe).not.toContain(secret);
    expect(safe).toContain("src/app.ts:42");
  });
  it("does not invent absent diagnostic evidence", () => {
    const prompt = previewRepairPrompt({ status: "crashed" }, []);
    const data = JSON.parse(prompt.slice(prompt.indexOf("{\n"), prompt.indexOf("\nInvestigate with")));
    expect(data.httpStatus).toBe("not recorded");
    expect(data.browserErrors).toEqual([]);
  });
  it("auto repair requires explicit opt-in", () => {
    expect(canAutoRepair(false, false, 0, "failure", null)).toBe(false);
    expect(canAutoRepair(true, false, 0, "failure", null)).toBe(true);
  });
  it("does not interrupt an active agent", () => {
    expect(canAutoRepair(true, true, 0, "failure", null)).toBe(false);
  });
  it("limits automatic repair to three attempts", () => {
    expect(canAutoRepair(true, false, 2, "new failure", null)).toBe(true);
    expect(canAutoRepair(true, false, 3, "new failure", null)).toBe(false);
  });
  it("does not repeat an unchanged error or repair a healthy preview", () => {
    expect(canAutoRepair(true, false, 0, "same", "same")).toBe(false);
    expect(canAutoRepair(true, false, 0, null, null)).toBe(false);
  });
  it("sends service evidence without credentials", () => {
    const prompt = previewRepairPrompt({ status: "error" }, [], undefined, { checkedAt: "2026-11-01T07:40:00Z", checks: [{ service: "Vercel", state: "error", detail: "Build failed; SECRET_KEY=private-value" }] });
    const data = JSON.parse(prompt.slice(prompt.indexOf("{\n"), prompt.indexOf("\nInvestigate with")));
    expect(data.connectedServices.checks[0].state).toBe("error");
    expect(data.connectedServices.checkedAt).toBe("2026-11-01T07:40:00Z");
    expect(prompt).not.toContain("private-value");
  });
});