import { describe, it, expect } from "vitest";
import { brokerTools, ToolLedger, policyFor, classifyFailure, sideEffectAfterFailure, idempotencyKey, retryAdvice } from "@/lib/engine/tool-broker";

describe("UAF tool broker", () => {
  it("classifies risk; unknown tools are external effects", () => {
    expect(policyFor("read_file").risk).toBe("read");
    expect(policyFor("delete_file").risk).toBe("destructive");
    expect(policyFor("apply_migrations").risk).toBe("destructive");
    expect(policyFor("some_mcp_tool")).toEqual({ risk: "external_effect", idempotent: false });
  });
  it("idempotency key ignores argument order", () => {
    expect(idempotencyKey("t", "x", { a: 1, b: [2] })).toBe(idempotencyKey("t", "x", { b: [2], a: 1 }));
  });
  it("timeouts on writes are ambiguous, reads never are", () => {
    expect(sideEffectAfterFailure(policyFor("tool_invoke"), classifyFailure(new Error("request timed out")))).toBe("unknown");
    expect(sideEffectAfterFailure(policyFor("read_file"), "timeout")).toBe("none");
    expect(sideEffectAfterFailure(policyFor("tool_invoke"), classifyFailure(new Error("429 Too Many Requests")))).toBe("none");
  });
  it("auth failures never suggest switching accounts", () => {
    expect(classifyFailure(new Error("403 Forbidden"))).toBe("auth");
    expect(retryAdvice(policyFor("tool_invoke"), "auth")).toMatch(/Never switch accounts/);
  });
  it("does not re-execute a confirmed non-idempotent write", async () => {
    let calls = 0;
    const t = brokerTools({ tool_invoke: { execute: async (_i: unknown, _o: unknown) => { calls++; return "sent"; } } }, new ToolLedger("t"));
    await t.tool_invoke.execute({ n: 1 } as never, {} as never);
    const second = await t.tool_invoke.execute({ n: 1 } as never, {} as never);
    expect(calls).toBe(1);
    expect(second).toMatchObject({ deduplicated: true });
  });
  it("blocks blind retry after an ambiguous timeout", async () => {
    let calls = 0; const seen: string[] = [];
    const t = brokerTools({ tool_invoke: { execute: async (_i: unknown, _o: unknown) => { calls++; throw new Error("timeout"); } } }, new ToolLedger("t"), { onAmbiguous: (e) => seen.push(e.state) });
    await expect(t.tool_invoke.execute({} as never, {} as never)).rejects.toThrow(/sideEffect=unknown/);
    const retry = await t.tool_invoke.execute({} as never, {} as never);
    expect(retry).toMatchObject({ blocked: true });
    expect(calls).toBe(1);
    expect(seen).toEqual(["unknown"]);
  });
  it("re-runs idempotent tools like run_command freely", async () => {
    let calls = 0;
    const t = brokerTools({ run_command: { execute: async (_i: unknown, _o: unknown) => ++calls } }, new ToolLedger("t"));
    await t.run_command.execute({ c: "npm test" } as never, {} as never);
    await t.run_command.execute({ c: "npm test" } as never, {} as never);
    expect(calls).toBe(2);
  });
});
