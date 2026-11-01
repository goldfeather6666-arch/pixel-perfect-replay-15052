import { describe, expect, it } from "vitest";
import { detectFramework, detectPackageManager, devCommand, gatewayBase, isHealthy, parseListening, pickPort } from "@/lib/preview-detect";
import { signPreviewToken, verifyPreviewToken } from "@/lib/preview-token.server";
import { injectBridge, parsePreviewPath, rewriteLocation, rewriteRootUrls } from "@/lib/preview-gateway";

const ID = "11111111-2222-3333-4444-555555555555";
const SECRET = "test-secret";

describe("preview detection", () => {
  it("detects Next.js and Vite", () => {
    expect(detectFramework({ dependencies: { next: "15" } }, [])).toBe("next");
    expect(detectFramework({ devDependencies: { vite: "7" } }, [])).toBe("vite");
    expect(detectFramework(null, ["index.html"])).toBe("static");
  });
  it("detects package manager from lockfile", () => {
    expect(detectPackageManager(["pnpm-lock.yaml"])).toBe("pnpm");
    expect(detectPackageManager(["bun.lockb"])).toBe("bun");
    expect(detectPackageManager([])).toBe("npm");
  });
  it("binds 0.0.0.0 and gives Vite the gateway base", () => {
    const base = gatewayBase(ID);
    expect(devCommand("vite", "npm", 5173, base)).toContain(`allowedHosts:true}`);
    expect(devCommand("vite", "npm", 5173, base)).toContain(`port:5173`);
    expect(devCommand("next", "npm", 3000, base)).toBe("npx next dev -H 0.0.0.0 -p 3000");
  });
  it("never picks a busy port", () => {
    const busy = parseListening("LISTEN 0 511 0.0.0.0:3000 0.0.0.0:*\nLISTEN 0 511 [::]:5173 [::]:*\n");
    expect(busy).toEqual(expect.arrayContaining([3000, 5173]));
    expect(pickPort(busy)).toBe(3001);
    expect(pickPort(busy, 3000)).toBe(3001);
  });
  it("treats 5xx as unhealthy", () => {
    expect(isHealthy(200)).toBe(true);
    expect(isHealthy(404)).toBe(true);
    expect(isHealthy(502)).toBe(false);
    expect(isHealthy(403)).toBe(false);
    expect(isHealthy(0)).toBe(false);
  });
});

describe("preview tokens", () => {
  it("round-trips valid claims", async () => {
    const t = await signPreviewToken({ p: ID, u: "u1", v: 1, e: Date.now() + 60_000, k: "own" }, SECRET);
    expect((await verifyPreviewToken(t, SECRET))?.p).toBe(ID);
  });
  it("rejects expired, tampered and wrong-secret tokens", async () => {
    const expired = await signPreviewToken({ p: ID, u: "u1", v: 1, e: Date.now() - 1, k: "own" }, SECRET);
    expect(await verifyPreviewToken(expired, SECRET)).toBeNull();
    const t = await signPreviewToken({ p: ID, u: "u1", v: 1, e: Date.now() + 60_000, k: "own" }, SECRET);
    const [body, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ p: ID, u: "attacker", v: 1, e: Date.now() + 60_000, k: "own" })).replace(/=+$/, "");
    expect(await verifyPreviewToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(await verifyPreviewToken(`${body}.${sig}`, "other-secret")).toBeNull();
  });
});

describe("preview gateway", () => {
  const base = gatewayBase(ID);
  it("only accepts preview-id paths", () => {
    expect(parsePreviewPath(`/api/preview/${ID}/about`)).toEqual({ id: ID, rest: "/about" });
    expect(parsePreviewPath("/api/preview/../../etc")).toBeNull();
  });
  it("rewrites root-relative assets but not external or prefixed URLs", () => {
    const html = `<script src="/_next/a.js"></script><link href="//cdn.x/y.css"><img src="${base}ok.png"><a href="/about">`;
    const out = rewriteRootUrls(html, base);
    expect(out).toContain(`src="${base}_next/a.js"`);
    expect(out).toContain(`href="//cdn.x/y.css"`);
    expect(out).toContain(`src="${base}ok.png"`);
    expect(out).toContain(`href="${base}about"`);
  });
  it("keeps redirects inside the gateway and leaves external ones", () => {
    expect(rewriteLocation("/login", "3000-abc.e2b.app", base)).toBe(`${base}login`);
    expect(rewriteLocation("https://3000-abc.e2b.app/x?y=1", "3000-abc.e2b.app", base)).toBe(`${base}x?y=1`);
    expect(rewriteLocation("https://github.com/login", "3000-abc.e2b.app", base)).toBe("https://github.com/login");
  });
  it("injects the error bridge into <head>", () => {
    expect(injectBridge("<html><head><title>x</title></head></html>")).toMatch(/<head><script>.*forgePreviewError/);
  });
});

import { devCommand as dc, installCommand as ic, nextMajor } from "../lib/preview-detect";
describe("preview speed", () => {
  it("uses Turbopack only for Next 15+", () => {
    expect(nextMajor({ dependencies: { next: "^15.1.0" } })).toBe(15);
    expect(dc("next", "npm", 3000, "/", { nextMajor: 15 })).toContain("--turbopack");
    expect(dc("next", "npm", 3000, "/", { nextMajor: 14 })).not.toContain("--turbopack");
  });
  it("installs from cache without audit and skips when installed", () => {
    expect(ic("npm", "vite")).toBe("[ -d node_modules ] || npm install --prefer-offline --no-audit --no-fund --progress=false --loglevel=error");
  });
});
