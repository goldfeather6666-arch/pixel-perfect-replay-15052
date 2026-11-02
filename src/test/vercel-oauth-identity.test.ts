import { afterEach, describe, expect, it, vi } from "vitest";
import { Vercel } from "@/lib/integrations.server";

afterEach(() => vi.unstubAllGlobals());

describe("Vercel account identity", () => {
  it("identifies authorized Apps accounts through POST userinfo and the stable subject", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ sub: "user-123", preferred_username: "developer", email: "dev@example.com" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await new Vercel("test-token|team:team-123").oauthIdentity()).toEqual({ key: "user-123", name: "developer" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://api.vercel.com/login/oauth/userinfo", expect.objectContaining({ method: "POST", redirect: "manual", headers: { Authorization: "Bearer test-token", Accept: "application/json" } }));
  });
  it("keeps pasted management-token identity on the REST endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ user: { id: "user-123", username: "developer" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await new Vercel("management-token").identity()).toEqual({ key: "user-123", name: "developer" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.vercel.com/v2/user");
  });
  it("identifies saved Apps accounts even when REST reports user not found", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "Vercel user not found" } }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ sub: "oauth-user", email: "dev@example.com" })));
    expect(await new Vercel("oauth-token").identity()).toEqual({ key: "oauth-user", name: "dev@example.com" });
  });
  it("rejects an account without a stable subject", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ email: "dev@example.com" })));
    await expect(new Vercel("oauth-token").oauthIdentity()).rejects.toThrow("no account identity");
  });
  it("does not expose provider response bodies on failed identity requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-provider-details", { status: 401 })));
    await expect(new Vercel("oauth-token").oauthIdentity()).rejects.toThrow("Vercel couldn't identify the authorized account (401). Connect with Vercel again.");
  });
});