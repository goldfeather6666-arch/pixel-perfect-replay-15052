// Style memory: the design language already used in this owner's projects, extracted from real CSS so
// later work matches it instead of inventing a new palette every task.

export type StyleProfile = { colors: string[]; fonts: string[]; radii: number[]; tokens: Record<string, string> };

const GENERIC_FONTS = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans", "Liberation Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"]);

const cleanFont = (v: string) => v.replace(/^["']|["']$/g, "").trim();

/** Pull the palette, typefaces, corner radii and design tokens actually declared in a stylesheet. */
export function extractStyle(css: string): StyleProfile {
  const colors: string[] = [];
  const push = (list: string[], value: string, cap: number) => {
    if (!list.includes(value) && list.length < cap) list.push(value);
  };

  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) push(colors, (m[0] ?? "").toLowerCase(), 24);
  for (const m of css.matchAll(/\b(?:rgba?|hsla?)\([^)]*\)/gi)) push(colors, m[0].replace(/\s+/g, "").toLowerCase(), 24);

  const fonts: string[] = [];
  for (const m of css.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) {
    for (const part of (m[1] ?? "").split(",")) {
      const name = cleanFont(part);
      if (!name || name.startsWith("var(") || name.startsWith("$") || GENERIC_FONTS.has(name.toLowerCase())) continue;
      push(fonts, name, 12);
    }
  }

  const radii = new Set<number>();
  for (const m of css.matchAll(/border-radius\s*:\s*([^;{}]+)/gi)) {
    for (const v of (m[1] ?? "").split(/\s+/)) {
      const n = /^(\d+(?:\.\d+)?)(px|rem|em)$/.exec(v);
      if (!n?.[1] || !n[2]) continue;
      const px = Math.round(Number(n[1]) * (n[2] === "px" ? 1 : 16) * 100) / 100;
      if (px >= 0 && px <= 999) radii.add(px);
    }
  }

  const tokens: Record<string, string> = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;]/gi)) {
    const name = m[1] ?? "";
    const value = (m[2] ?? "").trim();
    if (!/^--(radius|background|foreground|primary|secondary|muted|accent|border|card|popover|destructive|input|ring|font|spacing|shadow)[\w-]*$/i.test(name)) continue;
    if (!tokens[name] && value) tokens[name] = value.slice(0, 80);
  }

  return { colors, fonts, radii: [...radii].sort((a, b) => a - b), tokens };
}

/** Combine profiles, keeping the earliest-seen values first. */
export function mergeStyleProfile(a: StyleProfile, b: StyleProfile): StyleProfile {
  const colors: string[] = [];
  const fonts: string[] = [];
  for (const c of [...a.colors, ...b.colors]) if (!colors.includes(c) && colors.length < 24) colors.push(c);
  for (const f of [...a.fonts, ...b.fonts]) if (!fonts.includes(f) && fonts.length < 12) fonts.push(f);
  return {
    colors,
    fonts,
    radii: [...new Set([...a.radii, ...b.radii])].sort((x, y) => x - y).slice(0, 12),
    tokens: { ...b.tokens, ...a.tokens },
  };
}

/** The line injected into a new task's context so the next build matches this project's language. */
export function formatStyleMemory(p: StyleProfile | null | undefined): string {
  if (!p || (!p.colors.length && !p.fonts.length && !p.radii.length && !Object.keys(p.tokens).length)) return "";
  const bits: string[] = [];
  if (p.colors.length) bits.push(`colours ${p.colors.slice(0, 10).join(", ")}`);
  if (p.fonts.length) bits.push(`typefaces ${p.fonts.join(", ")}`);
  if (p.radii.length) bits.push(`corner radii ${p.radii.map((r) => `${r}px`).join(", ")}`);
  const tokens = Object.entries(p.tokens).slice(0, 12).map(([k, v]) => `${k}: ${v}`);
  if (tokens.length) bits.push(`tokens ${tokens.join("; ")}`);
  return `\n\n<style_memory>Design language already used in this project: ${bits.join(" · ")}. Reuse these values and existing theme tokens rather than inventing new ones.</style_memory>`;
}
