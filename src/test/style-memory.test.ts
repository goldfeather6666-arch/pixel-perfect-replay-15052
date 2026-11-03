import { describe, expect, it } from "vitest";
import { extractStyle, formatStyleMemory, mergeStyleProfile } from "@/lib/style-memory";

const CSS = [
  ":root { --background: 0 0% 100%; --foreground: 240 10% 3.9%; --radius: 0.5rem; --primary: #1a1a2e; }",
  ".hero { color: #1A1A2E; background: rgb(255 255 255 / 0.8); font-family: 'Space Grotesk', 'DM Sans', sans-serif; border-radius: 8px; }",
  ".card { border-radius: 0.5rem 12px; color: hsl(220 40% 50%); font-family: var(--font-display); }",
  ".chip { border-radius: 999px; background: #1a1a2e; }",
].join("\n");

describe("extractStyle", () => {
  it("collects the palette without duplicates and keeps declaration order", () => {
    const p = extractStyle(CSS);
    expect(p.colors[0]).toBe("#1a1a2e");
    expect(p.colors.filter((c) => c === "#1a1a2e").length).toBe(1);
    expect(p.colors).toContain("hsl(220 40% 50%)");
    expect(p.colors).toContain("rgb(255 255 255 / 0.8)");
  });

  it("keeps named typefaces and drops generic stacks and var() indirection", () => {
    const p = extractStyle(CSS);
    expect(p.fonts).toEqual(["Space Grotesk", "DM Sans"]);
  });

  it("normalises radii to px and sorts them", () => {
    expect(extractStyle(CSS).radii).toEqual([8, 12, 999]);
  });

  it("captures theme tokens but ignores unrelated custom properties", () => {
    const p = extractStyle(":root { --radius: 0.5rem; --primary: #1a1a2e; --z-index-thing: 4; }");
    expect(p.tokens["--radius"]).toBe("0.5rem");
    expect(p.tokens["--primary"]).toBe("#1a1a2e");
    expect(p.tokens["--z-index-thing"]).toBeUndefined();
  });

  it("caps very large stylesheets", () => {
    const p = extractStyle(Array.from({ length: 200 }, (_, i) => `.x${i}{color:#0000${(i % 100).toString().padStart(2, "0")}}`).join(""));
    expect(p.colors.length).toBeLessThanOrEqual(24);
  });
});

describe("mergeStyleProfile", () => {
  it("keeps the earliest values first and dedupes", () => {
    const m = mergeStyleProfile(
      { colors: ["#ffffff", "#000000"], fonts: ["Space Grotesk"], radii: [8], tokens: { "--radius": "0.5rem" } },
      { colors: ["#000000", "#1a1a2e"], fonts: ["DM Sans", "Space Grotesk"], radii: [4, 8], tokens: { "--radius": "0.25rem", "--primary": "#1a1a2e" } },
    );
    expect(m.colors).toEqual(["#ffffff", "#000000", "#1a1a2e"]);
    expect(m.fonts).toEqual(["Space Grotesk", "DM Sans"]);
    expect(m.radii).toEqual([4, 8]);
    expect(m.tokens["--radius"]).toBe("0.5rem");
    expect(m.tokens["--primary"]).toBe("#1a1a2e");
  });
});

describe("formatStyleMemory", () => {
  it("names the values so a later build can match them", () => {
    const text = formatStyleMemory(extractStyle(CSS));
    expect(text).toContain("<style_memory>");
    expect(text).toContain("#1a1a2e");
    expect(text).toContain("Space Grotesk");
    expect(text).toContain("8px");
    expect(text).toContain("--radius: 0.5rem");
    expect(text).toContain("Reuse these values");
  });

  it("says nothing when there is no recorded language", () => {
    expect(formatStyleMemory(null)).toBe("");
    expect(formatStyleMemory({ colors: [], fonts: [], radii: [], tokens: {} })).toBe("");
  });
});
