import { describe, expect, it } from "vitest";
import { authorizeUrl, needsRefresh, packVercelToken, redirectUriFor, unpackVercelToken, withTeam } from "@/lib/deploy-oauth";

describe("one-click deploy sign-in", () => {
  it("database sign-in uses PKCE S256 and the exact callback", () => {
    const u = new URL(authorizeUrl("supabase", { clientId: "cid", redirectUri: "https://x.app/api/public/oauth/supabase/callback", state: "st", challenge: "ch" }));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.app/api/public/oauth/supabase/callback");
    expect(u.searchParams.get("state")).toBe("st");
  });
  it("Vercel sign-in uses the Vercel Apps authorize endpoint with PKCE and offline access", () => {
    const u = new URL(authorizeUrl("vercel", { clientId: "c", redirectUri: "https://x.app/api/public/oauth/vercel/callback", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://vercel.com/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("c");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.app/api/public/oauth/vercel/callback");
    expect(u.searchParams.get("scope")).toContain("offline_access");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });
  it("sends the provider back to exactly the address its console lists", () => {
    expect(redirectUriFor("vercel", "https://pixel-perfect-replay-15052.lovable.app")).toBe("https://pixel-perfect-replay-15052.lovable.app/api/public/oauth/vercel/callback");
    expect(redirectUriFor("supabase", "https://app.example/")).toBe("https://app.example/api/public/oauth/supabase/callback");
  });
  it("Vercel sign-in needs no integration slug", () => {
    expect(() => authorizeUrl("vercel", { clientId: "c", redirectUri: "r", state: "st", challenge: "ch" })).not.toThrow();
  });
  it("refreshes within 2 minutes of expiry, not before", () => {
    const now = 1_000_000;
    expect(needsRefresh(new Date(now + 60_000).toISOString(), now)).toBe(true);
    expect(needsRefresh(new Date(now + 5 * 60_000).toISOString(), now)).toBe(false);
    expect(needsRefresh(null, now)).toBe(false);
  });
  it("team tokens carry teamId on every Vercel call", () => {
    const u = unpackVercelToken(packVercelToken("tok", "team_1"));
    expect(u).toEqual({ token: "tok", teamId: "team_1" });
    expect(withTeam("/v9/projects?limit=100", u.teamId)).toBe("/v9/projects?limit=100&teamId=team_1");
    expect(unpackVercelToken("plain")).toEqual({ token: "plain", teamId: null });
  });
  it("picks a team only when the account has exactly one", () => {
    expect(soleTeam([{ id: "team_1", name: "One", slug: "one" }])).toBe("team_1");
    expect(soleTeam([])).toBeNull();
    expect(soleTeam([{ id: "team_1", name: "One", slug: "one" }, { id: "team_2", name: "Two", slug: "two" }])).toBeNull();
  });
  it("tells a permission-limited account apart from one with no websites", () => {
    expect(websiteVerdict([{ id: "prj_1" }], null)).toBe("ok");
    expect(websiteVerdict([], null)).toBe("limited");
    expect(websiteVerdict([], [])).toBe("empty");
    expect(websiteVerdict([], [{ id: "team_1", name: "One", slug: "one" }])).toBe("empty");
  });
  it("keeps the acting team when a Vercel token is refreshed", () => {
    expect(refreshedVercelToken(packVercelToken("old", "team_1"), "new", "vercel")).toBe(packVercelToken("new", "team_1"));
    expect(refreshedVercelToken("old", "new", "vercel")).toBe("new");
    expect(refreshedVercelToken("old", "new", "supabase")).toBe("new");
  });
});
