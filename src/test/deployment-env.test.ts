import { describe, expect, it, vi, afterEach } from "vitest";
import { deploymentEnv, deploymentTemplate, isPublicDatabaseKey } from "@/lib/deployment-env";
import { Vercel, syncSupabaseToVercel } from "@/lib/integrations.server";

afterEach(() => vi.unstubAllGlobals());
describe("deployment settings rules", () => {
  it("syncs public settings to production and previews automatically", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ name: "anon", api_key: "public-test" }]))).mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetcher);
    await syncSupabaseToVercel("test-db", "test-vercel", "testproject", "project");
    const body = JSON.parse(fetcher.mock.calls[1]?.[1]?.body);
    expect(body.find((v: any) => v.key === "VITE_SUPABASE_PUBLISHABLE_KEY")).toMatchObject({ value: "public-test", target: ["production", "preview", "development"] });
    expect(body.find((v: any) => v.key === "VITE_SUPABASE_PROJECT_ID")).toMatchObject({ value: "testproject", target: ["production", "preview", "development"] });
  });
  it("syncs the project reference for generated Vite and server clients", () => {
    const vars = deploymentEnv("https://ref.supabase.co", "sb_publishable_test", undefined, "ref");
    expect(vars).toMatchObject({
      SUPABASE_PROJECT_ID: "ref",
      VITE_SUPABASE_PROJECT_ID: "ref",
    });
    expect(deploymentTemplate().split("\n")).toContain("VITE_SUPABASE_PROJECT_ID=");
  });
  it("never emits Next public URL variables in customer settings or templates", () => {
    const vars = deploymentEnv("https://database.example", "sb_publishable_test", undefined, "ref");
    expect(vars).not.toHaveProperty("NEXT_PUBLIC_SUPABASE_URL");
    expect(vars).not.toHaveProperty("NEXT_PUBLIC_URL");
    expect(Object.keys(vars).some((name) => name.startsWith("NEXT_PUBLIC_"))).toBe(false);
    expect(deploymentTemplate().split("\n")).not.toContain("NEXT_PUBLIC_SUPABASE_URL=");
    expect(deploymentTemplate().split("\n")).not.toContain("NEXT_PUBLIC_URL=");
    expect(vars.SUPABASE_URL).toBe("https://database.example");
  });
  it("never maps a privileged key to a public variable", () => {
    const vars = deploymentEnv("https://example.test", "public-test", "private-test");
    expect(Object.entries(vars).filter(([, value]) => value === "private-test")).toEqual([["SUPABASE_SERVICE_ROLE_KEY", "private-test"]]);
  });
  it("commits only empty configuration values to GitHub", () => {
    expect(deploymentTemplate().split("\n").filter((s) => s.includes("=")).every((s) => s.endsWith("="))).toBe(true);
    expect(deploymentTemplate()).toContain("SUPABASE_SERVICE_ROLE_KEY=\n");
  });
  it("rejects privileged keys in the public field", () => {
    expect(isPublicDatabaseKey("sb_secret_test-only")).toBe(false);
    expect(isPublicDatabaseKey(`header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`)).toBe(false);
    expect(isPublicDatabaseKey("sb_publishable_test-only")).toBe(true);
    expect(isPublicDatabaseKey(`header.${btoa(JSON.stringify({ role: "anon" }))}.signature`)).toBe(true);
  });
  it("does not echo secret-bearing Vercel errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-test", { status: 403 })));
    await expect(new Vercel("test").setEnv("project", { SUPABASE_SERVICE_ROLE_KEY: "private-test" })).rejects.toThrow("Vercel settings sync failed (403)");
  });
});