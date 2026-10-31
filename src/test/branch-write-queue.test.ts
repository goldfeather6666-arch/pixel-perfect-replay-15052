import { describe, expect, it } from "vitest";
import { commitSafely, isBranchConflict, retryOnConflict } from "@/lib/branch-write-queue";

describe("branch write queue", () => {
  it("runs parallel commits on the same branch one at a time", async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    await Promise.all([1, 2, 3, 4].map((n) => commitSafely("o/r", "forge/x", async () => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      order.push(n); active--;
    })));
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("a failed commit does not block the next one", async () => {
    const a = commitSafely("o/r", "b", async () => { throw new Error("boom"); });
    const b = commitSafely("o/r", "b", async () => "ok");
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("ok");
  });

  it("retries GitHub 409 branch conflicts then succeeds", async () => {
    let calls = 0;
    const r = await retryOnConflict(async () => {
      calls++;
      if (calls < 3) throw new Error("GitHub 409: refs/heads/x is at abc but expected def");
      return "sha";
    }, 5, 1);
    expect(r).toBe("sha");
    expect(calls).toBe(3);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(retryOnConflict(async () => { calls++; throw new Error("GitHub 404: Not Found"); }, 5, 1)).rejects.toThrow("404");
    expect(calls).toBe(1);
  });

  it("detects conflict shapes", () => {
    expect(isBranchConflict(new Error("GitHub 409: conflict"))).toBe(true);
    expect(isBranchConflict(new Error('GitHub 422: {"message":"sha wasn\'t supplied"}'))).toBe(true);
    expect(isBranchConflict(new Error("GitHub 422: Invalid name"))).toBe(false);
  });
});
