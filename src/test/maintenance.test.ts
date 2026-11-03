import { describe, expect, it } from "vitest";
import { inspectMaintenance, maintenanceDue, maintenancePaths } from "@/lib/maintenance";
describe("opt-in maintenance", () => {
  it("never scans by default", () => expect(maintenanceDue(false, false, null)).toBe(false));
  it("never scans during execution", () => expect(maintenanceDue(true, true, null)).toBe(false));
  it("caps automatic scans at one per day", () => expect(maintenanceDue(true, false, new Date(0).toISOString(), 86_399_999)).toBe(false));
  it("runs after the daily interval", () => expect(maintenanceDue(true, false, new Date(0).toISOString(), 86_400_000)).toBe(true));
  it("excludes secrets and generated code", () => expect(maintenancePaths([".env", "private.key", "node_modules/a.ts", "dist/a.js", "src/a.ts", "package.json"])).toEqual(["src/a.ts", "package.json"]));
  it("finds actionable unbounded dependencies without pretending an advisory audit ran", () => {
    const report = inspectMaintenance([{ path: "package.json", content: '{"dependencies":{"example":"*"}}' }]);
    expect(report[0]?.category).toBe("dependencies"); expect(report[0]?.recommendation).toContain("not a vulnerability-advisory scan");
  });
  it("returns recommendations without any replacement code or external effects", () => {
    expect(inspectMaintenance([{ path: "a.ts", content: "eval(input); if (false) {}" }]).map((f) => f.category)).toEqual(["security", "dead-code"]);
  });
});