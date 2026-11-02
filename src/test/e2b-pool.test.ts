import { describe, expect, it } from "vitest";
import { e2bKeysFrom, isQuotaError, keyOrder } from "@/lib/e2b-pool";

describe("e2b key pool", () => {
  it("collects up to four accounts without duplicates", () => {
    expect(e2bKeysFrom({ E2B_API_KEY: "a", E2B_API_KEYS: "b, c a", E2B_API_KEY_4: "d" })).toEqual(["a", "b", "c", "d"]);
  });
  it("rotates and pushes cooling accounts last", () => {
    expect(keyOrder(4, 1, (i) => i === 2)).toEqual([1, 3, 0, 2]);
    expect(keyOrder(2, 0, () => true)).toEqual([0, 1]);
  });
  it("treats rate/quota failures as rotatable", () => {
    expect(isQuotaError("429 Too Many Requests")).toBe(true);
    expect(isQuotaError("syntax error in command")).toBe(false);
  });
});
