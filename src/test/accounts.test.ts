import { describe, expect, it } from "vitest";
import { accountSwitchPatch, cleanAccounts, resolveAccount } from "@/lib/accounts";

const rows = [
  { id: "11111111-1111-1111-1111-111111111111", provider: "github", created_at: "2026-01-01" },
  { id: "22222222-2222-2222-2222-222222222222", provider: "github", created_at: "2026-03-01" },
  { id: "33333333-3333-3333-3333-333333333333", provider: "vercel", created_at: "2026-02-01" },
];

describe("per-project accounts", () => {
  it("uses the project's chosen account", () => {
    expect(resolveAccount(rows, "github", { github: rows[0]!.id })?.id).toBe(rows[0]!.id);
  });
  it("falls back to the newest account when none is chosen", () => {
    expect(resolveAccount(rows, "github", {})?.id).toBe(rows[1]!.id);
  });
  it("falls back when the chosen account was deleted", () => {
    expect(resolveAccount(rows, "github", { github: "99999999-9999-9999-9999-999999999999" })?.id).toBe(rows[1]!.id);
  });
  it("never uses another service's account", () => {
    expect(resolveAccount(rows, "supabase", { supabase: rows[2]!.id })).toBeNull();
  });
  it("drops malformed choices", () => {
    expect(cleanAccounts({ github: "x", vercel: rows[2]!.id, other: rows[0]!.id })).toEqual({ vercel: rows[2]!.id });
  });
  it("clears the old Vercel project when switching accounts", () => {
    expect(accountSwitchPatch({ github: rows[0]?.id, vercel: rows[2]?.id }, "vercel", "44444444-4444-4444-4444-444444444444", rows[2]?.id ?? null)).toEqual({
      accounts: { github: rows[0]?.id, vercel: "44444444-4444-4444-4444-444444444444" }, vercel_project_id: null,
    });
  });
  it("keeps links when selecting the same effective account", () => {
    expect(accountSwitchPatch({}, "vercel", "33333333-3333-3333-3333-333333333333", "33333333-3333-3333-3333-333333333333")).toEqual({ accounts: { vercel: "33333333-3333-3333-3333-333333333333" } });
  });
  it("clears database and migration tracking without changing the website account", () => {
    expect(accountSwitchPatch({ vercel: rows[2]?.id }, "supabase", "55555555-5555-5555-5555-555555555555", null)).toEqual({
      accounts: { vercel: rows[2]?.id, supabase: "55555555-5555-5555-5555-555555555555" }, supabase_ref: null, applied_migrations: [],
    });
  });
});
