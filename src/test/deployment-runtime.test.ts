import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDeploymentRuntime } from "@/lib/deployment-runtime.server";

afterEach(() => vi.unstubAllGlobals());
describe("deployed page verification", () => {
  it("rejects the HTTP 500 crash even when Vercel built successfully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private error", { status: 500 })));
    expect(await checkDeploymentRuntime("https://artelie3d-example.vercel.app")).toMatchObject({ state: "ERROR", status: 500 });
  });
  it("accepts a successfully served entry page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));
    expect(await checkDeploymentRuntime("https://app-example.vercel.app")).toMatchObject({ state: "PASSED", status: 200 });
  });
  it("does not bypass a protected preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    expect(await checkDeploymentRuntime("https://app-example.vercel.app")).toMatchObject({ state: "UNVERIFIED", status: 401 });
  });
  it("does not follow off-site redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await checkDeploymentRuntime("https://app-example.vercel.app")).toMatchObject({ state: "UNVERIFIED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports failed fetches as unverified", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await checkDeploymentRuntime("https://app-example.vercel.app")).toMatchObject({ state: "UNVERIFIED", status: null });
  });
  it("rejects non-deployment hosts before requesting them", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await checkDeploymentRuntime("https://vercel.app.evil.example")).toMatchObject({ state: "UNVERIFIED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns unverified for malformed URLs without throwing", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(checkDeploymentRuntime("not a url")).resolves.toMatchObject({ state: "UNVERIFIED", status: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
