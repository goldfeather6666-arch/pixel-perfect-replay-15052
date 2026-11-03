import { describe, expect, it } from "vitest";
import {
  RUNG_ORDER,
  VERIFICATION_LADDER,
  allRequiredPassed,
  checkPassed,
  criteriaToItems,
  evidenceRows,
  renderEvidenceTable,
  type CheckRun,
} from "./verification-first";

const checks: CheckRun[] = [
  { name: "typecheck", exit: 0, ms: 1200 },
  { name: "lint", exit: 0, ms: 800 },
  { name: "test", exit: 0, ms: 5000 },
  { name: "build", exit: 0, ms: 30_000 },
  { name: "preview /", exit: 0, ms: 300 },
];

describe("verification ladder", () => {
  it("runs the cheapest rung before the expensive ones", () => {
    expect(VERIFICATION_LADDER).toEqual(["typecheck", "lint", "unit", "build", "preview", "e2e"]);
    expect(RUNG_ORDER.typecheck).toBeLessThan(RUNG_ORDER.lint);
    expect(RUNG_ORDER.build).toBeLessThan(RUNG_ORDER.preview);
    expect(RUNG_ORDER.preview).toBeLessThan(RUNG_ORDER.e2e);
  });
});

describe("evidence rows", () => {
  it("passes only on a measured zero exit", () => {
    expect(checkPassed({ name: "build", exit: 0 })).toBe(true);
    expect(checkPassed({ name: "build", exit: 1 })).toBe(false);
    expect(checkPassed({ name: "build", exit: null })).toBe(false);
    expect(checkPassed(undefined)).toBe(false);
  });

  it("marks a criterion with no matching check as unverified, never as passing", () => {
    const rows = evidenceRows(criteriaToItems([{ text: "Payments retry on network failure", required: true }], checks));
    expect(rows[0].result).toBe("unverified");
    expect(rows[0].testRun).toBe("no check ran");
  });

  it("reports a real failure as fail with its exit code", () => {
    const rows = evidenceRows([{ item: "build is clean", criteria: "required", check: { name: "build", exit: 2 } }]);
    expect(rows[0].result).toBe("fail");
    expect(rows[0].testRun).toContain("exit 2");
  });

  it("pairs a criterion with the check that proves it", () => {
    const rows = evidenceRows(criteriaToItems([{ text: "unit tests pass", required: true }], checks));
    expect(rows[0].result).toBe("pass");
    expect(rows[0].testRun).toContain("test");
  });

  it("treats a check that never finished as unverified", () => {
    const rows = evidenceRows([{ item: "e2e journey", criteria: "required", check: { name: "e2e", exit: null } }]);
    expect(rows[0].result).toBe("unverified");
  });
});

describe("handoff gate", () => {
  it("is verified only when every required row passed", () => {
    const good = evidenceRows(criteriaToItems([{ text: "unit tests pass", required: true }], checks));
    expect(allRequiredPassed(good)).toBe(true);
    const withGap = [...good, ...evidenceRows(criteriaToItems([{ text: "Password reset email arrives", required: true }], checks))];
    expect(allRequiredPassed(withGap)).toBe(false);
  });

  it("refuses to call an empty table verified", () => {
    expect(allRequiredPassed([])).toBe(false);
  });

  it("renders the four-column table the rule demands", () => {
    const table = renderEvidenceTable(evidenceRows([{ item: "build", criteria: "required", check: { name: "build", exit: 0 } }]));
    expect(table.split("\n")[0]).toBe("item | criteria | test run | result");
    expect(table).toContain("build | required | build (exit 0) | pass");
  });
});
