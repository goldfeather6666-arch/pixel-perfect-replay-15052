import { describe, expect, it } from "vitest";
import { evaluateBudget, formatBudgetResult, parseAssetListing, parsePerfBudget, payloadKb } from "@/lib/perf-budget";

describe("parsePerfBudget", () => {
  it("reads a committed budget file", () => {
    const r = parsePerfBudget('{"lcpMs":2500,"cls":0.1,"jsKb":200}');
    expect(r.error).toBeUndefined();
    expect(r.budget).toEqual({ lcpMs: 2500, cls: 0.1, jsKb: 200 });
  });

  it("rejects an unknown limit instead of silently ignoring a typo", () => {
    const r = parsePerfBudget('{"lcp":2500}');
    expect(r.budget).toEqual({});
    expect(r.error).toContain("unknown limits: lcp");
  });

  it("rejects a non-numeric or negative limit", () => {
    expect(parsePerfBudget('{"jsKb":"200"}').error).toContain("jsKb must be a non-negative number");
    expect(parsePerfBudget('{"cls":-1}').error).toContain("cls must be a non-negative number");
  });

  it("rejects an empty budget", () => {
    expect(parsePerfBudget("{}").error).toContain("declares no limits");
  });
});

describe("payloadKb", () => {
  it("sums built js and css, skipping source maps", () => {
    const m = payloadKb([
      { path: "dist/assets/app-abc.js", bytes: 300_000 },
      { path: "dist/assets/app-abc.js.map", bytes: 900_000 },
      { path: "dist/assets/ui.mjs", bytes: 102_400 },
      { path: "dist/assets/style.css", bytes: 51_200 },
      { path: "dist/index.html", bytes: 2_000 },
    ]);
    expect(m.jsKb).toBeCloseTo(393, 0);
    expect(m.cssKb).toBeCloseTo(50, 1);
    expect(m.totalKb).toBeCloseTo(443, 0);
  });
});

describe("evaluateBudget", () => {
  it("breaches only the limit that is actually over", () => {
    const r = evaluateBudget({ jsKb: 200, cssKb: 100 }, { jsKb: 393.1, cssKb: 50 });
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBe(1);
    expect(r.violations[0]?.metric).toBe("jsKb");
    expect(r.violations[0]?.hint).toContain("Code-split");
    expect(r.checked).toEqual(["jsKb", "cssKb"]);
  });

  it("treats an unmeasured metric as no evidence, never as passing", () => {
    const r = evaluateBudget({ lcpMs: 2500, jsKb: 200 }, { jsKb: 120 });
    expect(r.ok).toBe(true);
    expect(r.unmeasured).toEqual(["lcpMs"]);
    expect(formatBudgetResult(r)).toContain("Not measured");
    expect(formatBudgetResult(r)).toContain("largest contentful paint");
  });

  it("passes when every declared limit is met", () => {
    const r = evaluateBudget({ cls: 0.1 }, { cls: 0.02 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(formatBudgetResult(r)).toBe("Performance budget met: cumulative layout shift.");
  });

  it("names the breached figure and the fix in the report", () => {
    const r = evaluateBudget({ lcpMs: 2500 }, { lcpMs: 4100 });
    const text = formatBudgetResult(r);
    expect(text).toContain("breached");
    expect(text).toContain("largest contentful paint 4100 over 2500");
    expect(text).toContain("fetchpriority=high");
  });
});

describe("parseAssetListing", () => {
  it("keeps real asset lines and ignores anything else", () => {
    const files = parseAssetListing(
      [
        "dist/assets/app-abc.js 300000",
        "dist/assets/style.css 51200",
        "dist/assets/app-abc.js.map 900000",
        "find: 'dist': No such file or directory",
        "dist/index.html",
        "",
      ].join("\n"),
    );
    expect(files).toEqual([
      { path: "dist/assets/app-abc.js", bytes: 300000 },
      { path: "dist/assets/style.css", bytes: 51200 },
    ]);
  });
});
