import { describe, expect, it } from "vitest";
import { duplicateGroups, identityLabel, sameAccount } from "@/lib/account-identity";

describe("account identity", () => {
  const a = { id: "1", last4: "PMZM", identity: { key: "user_1", name: "gold" } };
  const b = { id: "2", last4: "Hb37", identity: { key: "user_1", name: "gold" } };
  const c = { id: "3", last4: "XX99", identity: { key: "user_2", name: "other" } };

  it("refuses a second token for the same Vercel account", () => {
    expect(sameAccount([a, c], { key: "user_1", name: "gold" })?.last4).toBe("PMZM");
  });
  it("accepts a token for a different account", () => {
    expect(sameAccount([a], { key: "user_2", name: "other" })).toBeNull();
  });
  it("reports saved tokens that are the same account", () => {
    expect(duplicateGroups([a, b, c]).map((g) => g.map((t) => t.last4))).toEqual([["PMZM", "Hb37"]]);
  });
  it("names generic labels after the real account but keeps custom labels", () => {
    expect(identityLabel("vercel", "Vercel", { key: "u", name: "gold" })).toBe("Vercel · gold");
    expect(identityLabel("vercel", "Work", { key: "u", name: "gold" })).toBe("Work");
  });
});
