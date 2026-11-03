import { describe, expect, it } from "vitest";
import { contrastRatio, formatQualityScore, scorePage } from "@/lib/quality-score";

describe("contrastRatio", () => {
  it("matches the WCAG figures for known pairs", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("accepts shorthand hex and returns null for anything unparsable", () => {
    expect(contrastRatio("#000", "#fff")).toBe(21);
    expect(contrastRatio("red", "#fff")).toBeNull();
  });
});

describe("scorePage", () => {
  const clean = [
    '<!doctype html><html lang="en"><head><title>Account</title>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body><header><nav><a href="/a">A</a></nav></header><main><h1>Account</h1><h2>Details</h2>',
    '<label for="email">Email</label><input id="email" type="email">',
    '<img src="/x.png" alt="A chart of monthly signups">',
    '<button style="height:48px">Save</button></main><footer></footer></body></html>',
  ].join("");

  it("passes a page that satisfies every measurable rule", () => {
    const q = scorePage(clean);
    expect(q.findings).toEqual([]);
    expect(q.score).toBe(100);
    expect(q.measured.join(" ")).toContain("1 input(s)");
    expect(q.measured.join(" ")).toContain("1 image(s)");
  });

  it("blocks a page with no viewport, no title, no lang and no alt text", () => {
    const q = scorePage("<html><head></head><body><img src='/x.png'><input type='text'></body></html>");
    const areas = q.findings.map((f) => `${f.area}:${f.severity}`);
    expect(areas).toContain("metadata:blocker");
    expect(areas).toContain("metadata:major");
    expect(areas).toContain("media:major");
    expect(areas).toContain("labels:major");
    expect(areas).toContain("structure:major");
    expect(q.score).toBeLessThan(50);
  });

  it("reports an inline colour pair that fails contrast", () => {
    const q = scorePage(clean.replace("<h1>Account</h1>", '<h1 style="color:#777777;background-color:#ffffff">Account</h1>'));
    const contrast = q.findings.find((f) => f.area === "contrast");
    expect(contrast?.detail).toContain("4.48:1");
    expect(contrast?.fix).toContain("4.5:1");
    expect(q.grades.a11y).toBeLessThan(100);
  });

  it("catches a skipped heading level", () => {
    const q = scorePage(clean.replace("<h2>Details</h2>", "<h4>Details</h4>"));
    expect(q.findings.some((f) => f.area === "structure" && f.detail.includes("h1 to h4"))).toBe(true);
  });

  it("uses measured performance figures when the caller has them, and says nothing when it doesn't", () => {
    const slow = scorePage(clean, { lcpMs: 4100, totalKb: 900 });
    expect(slow.findings.filter((f) => f.area === "performance").length).toBe(2);
    expect(formatQualityScore(slow)).toContain("LCP 4100ms");
    expect(formatQualityScore(scorePage(clean))).not.toContain("LCP");
  });

  it("states the score and the blockers for handoff", () => {
    const text = formatQualityScore(scorePage("<html><body><input type='text'></body></html>"));
    expect(text).toContain("Creative-director score");
    expect(text).toContain("blocker");
    expect(text).toContain("Measured:");
  });
});
