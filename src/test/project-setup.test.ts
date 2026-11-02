import { describe, expect, it, vi, afterEach } from "vitest";
import { domainName, domainReady, domainSetupTemplate, dnsRecords, secretRequestInput } from "@/lib/project-setup";
import { customerAuthPatch } from "@/lib/connect";
import { Vercel } from "@/lib/integrations.server";

afterEach(() => vi.unstubAllGlobals());
describe("customer domain setup", () => {
  it("requires both Vercel ownership and DNS propagation, never just ownership", () => {
    expect(domainReady({ verified: true }, { misconfigured: false })).toBe(true);
    expect(domainReady({ verified: true }, { misconfigured: true })).toBe(false);
    expect(domainReady({ verified: false }, { misconfigured: false })).toBe(false);
    expect(domainReady({ verified: true }, {})).toBe(false);
    expect(domainReady({ verified: true, gitBranch: "preview" }, { misconfigured: false })).toBe(false);
    expect(domainReady({ verified: true, redirect: "old.example" }, { misconfigured: false })).toBe(false);
  });
  it("uses provider DNS recommendations and verification records verbatim", () => {
    expect(dnsRecords("www.customer.com", { verification: [{ type: "TXT", name: "_vercel.customer.com", value: "verification-test" }] }, { recommendedCNAME: [{ value: "assigned.vercel-dns.com" }] })).toEqual([{ type: "TXT", name: "_vercel.customer.com", value: "verification-test" }, { type: "CNAME", name: "www.customer.com", value: "assigned.vercel-dns.com" }]);
    expect(dnsRecords("customer.com", {}, {})).toEqual([]);
  });
  it("selects only an explicitly verified custom domain and preserves all prior return links", () => {
    const patch = customerAuthPatch({ mailer_autoconfirm: true, uri_allow_list: "https://old.example/**" }, ["app.vercel.app", "customer.com"], "customer.com");
    expect(patch.site_url).toBe("https://customer.com");
    expect(patch.uri_allow_list).toContain("https://old.example/**");
    expect(patch.uri_allow_list).toContain("https://customer.com/**");
    expect(customerAuthPatch({}, ["app.vercel.app"], "not-linked.com").site_url).toBe("https://app.vercel.app");
  });
  it("sets server website config without changing database endpoints or private credentials", () => {
    expect(domainSetupTemplate("Customer.com").env).toEqual({ APP_URL: "https://customer.com" });
    expect(domainSetupTemplate("customer.com").authPaths).toEqual(["/auth/callback", "/reset-password"]);
    expect(domainName.safeParse("https://customer.com/path").success).toBe(false);
    expect(domainName.safeParse("app.vercel.app").success).toBe(false);
  });
});
describe("secure integration request contract", () => {
  const request = { name: "STRIPE_SECRET_KEY", purpose: "Server payment processing", sourceUrl: "https://dashboard.stripe.com/apikeys", targets: ["production"] };
  it("accepts private payment credentials but rejects public and reserved variable names", () => {
    expect(secretRequestInput.parse(request).name).toBe("STRIPE_SECRET_KEY");
    for (const name of ["VITE_STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_TOKEN", "APP_URL", "INVALID-NAME"]) expect(secretRequestInput.safeParse({ ...request, name }).success).toBe(false);
  });
  it("sends a supplied secret only to the chosen Vercel environment without deploying", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    await new Vercel("vercel-test").setEnv("customer-project", { STRIPE_SECRET_KEY: "test-fixture" }, ["production"]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toContain("/projects/customer-project/env");
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body)).toEqual([{ key: "STRIPE_SECRET_KEY", value: "test-fixture", type: "encrypted", target: ["production"] }]);
  });
});