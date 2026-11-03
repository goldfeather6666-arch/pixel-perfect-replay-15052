import { describe, expect, it } from "vitest";
import { hasTokenLink, TOKEN_LINKS } from "@/lib/token-links";

describe("token deep links", () => {
  it("opens the token page for the services that sign in with a token", () => {
    expect(hasTokenLink("github")).toBe(true);
    expect(TOKEN_LINKS.github.url).toContain("github.com/settings/tokens/new");
    expect(hasTokenLink("vercel")).toBe(true);
    expect(TOKEN_LINKS.vercel.steps).toContain("Full Account");
  });

  it("keeps the database on its existing one-click sign-in instead of a pasted token", () => {
    expect(hasTokenLink("supabase")).toBe(false);
    expect("supabase" in TOKEN_LINKS).toBe(false);
  });
});
