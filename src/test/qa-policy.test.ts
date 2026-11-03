import { describe, expect, it } from "vitest";
import { evaluateQaPolicy, parseQaPolicy } from "@/lib/qa-policy";
import { parseGateLog } from "@/lib/engine/qa-gate";
describe("consent-preserving QA policy", () => {
  it("requires actual successful exit evidence for every declared check", () => {
    const policy = { version: 1 as const, requiredChecks: ["test", "build"] as ("test" | "build")[] };
    expect(evaluateQaPolicy(policy, parseGateLog("[Forge check] bun run build\n[Forge exit] 0 1ms").steps).missing).toEqual(["test"]);
    expect(evaluateQaPolicy(policy, parseGateLog("[Forge check] bun run test\n[Forge exit] 0 1ms\n[Forge check] bun run build\n[Forge exit] 0 1ms").steps).ok).toBe(true);
  });
  it("does not accept a started or failed check as passed", () => {
    const policy = { version: 1 as const, requiredChecks: ["build" as const] };
    expect(evaluateQaPolicy(policy, parseGateLog("[Forge check] bun run build").steps).ok).toBe(false);
    expect(evaluateQaPolicy(policy, parseGateLog("[Forge check] bun run build\n[Forge exit] 1 1ms").steps).ok).toBe(false);
  });
  it("accepts existing typecheck aliases", () => {
    expect(evaluateQaPolicy({ version: 1, requiredChecks: ["typecheck"] }, parseGateLog("[Forge check] npm run check-types\n[Forge exit] 0 1ms").steps).ok).toBe(true);
  });
  it("rejects arbitrary commands, unknown settings and deployment permissions", () => {
    for (const text of ['{"version":1,"requiredChecks":["curl"]}', '{"version":1,"requiredChecks":["build"],"deploy":true}', '{}', 'invalid']) expect(parseQaPolicy(text).error).toBeTruthy();
    expect(parseQaPolicy('{"version":1,"requiredChecks":["lint","build"]}').policy?.requiredChecks).toEqual(["lint", "build"]);
  });
});