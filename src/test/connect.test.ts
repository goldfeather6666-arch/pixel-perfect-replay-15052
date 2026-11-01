import { describe, expect, it } from "vitest";
import { autoFixPrompt, mergeAllowList, orderDomains, overall, pickSiteUrl, requiredAuthUrls } from "@/lib/connect";

describe("connect & sync rules", () => {
  it("allows the live site, Vercel previews and local dev for sign-in", () => {
    const urls = requiredAuthUrls(["shop.example.com"]);
    expect(urls).toContain("https://shop.example.com/**");
    expect(urls).toContain("https://*.vercel.app/**");
    expect(urls).toContain("http://localhost:3000/**");
  });
  it("keeps existing allowed links and only adds missing ones", () => {
    const r = mergeAllowList("https://old.com/**", ["https://old.com/**", "https://*.vercel.app/**"]);
    expect(r.value).toBe("https://old.com/**,https://*.vercel.app/**");
    expect(r.added).toEqual(["https://*.vercel.app/**"]);
  });
  it("replaces a localhost site address but keeps a real one", () => {
    expect(pickSiteUrl("http://localhost:3000", ["app.vercel.app"])).toBe("https://app.vercel.app");
    expect(pickSiteUrl("https://mysite.com", ["app.vercel.app"])).toBeNull();
  });
  it("prefers a custom domain over vercel.app", () => {
    expect(orderDomains(["my-app-x1.vercel.app", "my-app.vercel.app", "shop.com"])).toEqual(["shop.com", "my-app.vercel.app", "my-app-x1.vercel.app"]);
  });
  it("any failure makes the overall state fail", () => {
    expect(overall([{ key: "a", label: "A", state: "ok", note: "" }, { key: "b", label: "B", state: "fail", note: "" }])).toBe("fail");
  });
  it("Auto-fix has nothing to do when everything passes", () => {
    expect(autoFixPrompt([{ key: "a", label: "A", state: "ok", note: "" }], [])).toBeNull();
    expect(autoFixPrompt([{ key: "b", label: "Build", state: "fail", note: "ERROR" }], ["x"])).toContain("Build: ERROR");
  });
});
