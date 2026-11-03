import { describe, expect, it } from "vitest";
import { classifyFailure, parseGateLog } from "@/lib/engine/qa-gate";

describe("qa gate", () => {
  it("measures each passing step", () => {
    const r = parseGateLog("[Forge check] npm run lint\nok\n[Forge exit] 0 1200ms\n[Forge check] npm run build\n[Forge exit] 0 8000ms");
    expect(r.passed).toBe(true);
    expect(r.steps.map((s) => s.name)).toEqual(["lint", "build"]);
    expect(r.totalMs).toBe(9200);
  });
  it("stops at the failed step and calls a code error a regression", () => {
    const r = parseGateLog("[Forge check] npm run typecheck\nsrc/a.ts(1,1): error TS2304: Cannot find name 'x'.\n[Forge exit] 2 900ms");
    expect(r.passed).toBe(false);
    expect(r.failedStep).toBe("typecheck");
    expect(r.failureKind).toBe("regression");
  });
  it("classifies network timeouts as flaky and missing scripts as config", () => {
    expect(classifyFailure("Error: connect ETIMEDOUT 1.2.3.4")).toBe("flaky");
    expect(classifyFailure("npm ERR! Missing script: \"build\"")).toBe("config");
  });
  it("reads old logs without durations", () => {
    expect(parseGateLog("[Forge check] npm run build\n[Forge exit] 1").steps[0]!.durationMs).toBeNull();
  });
});
