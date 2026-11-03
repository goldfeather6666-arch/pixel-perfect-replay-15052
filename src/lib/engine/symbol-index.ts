// Lightweight per-file symbol index (no parser dependency). Extracts declared
// symbols and imports from JS/TS/Python/Go/SQL so later runs can find where a
// symbol lives and who imports a file without re-reading the whole repository.

export type SymbolEntry = { name: string; kind: string; line: number; exported: boolean };
export type FileIndex = { path: string; hash: string; symbols: SymbolEntry[]; imports: string[] };

const INDEXABLE = /\.(m?[jt]sx?|cjs|py|go|sql)$/i;
export const isIndexable = (path: string) => INDEXABLE.test(path) && !/(^|\/)(node_modules|dist|build|\.next)\//.test(path) && !/\.gen\.|\.d\.ts$|lock/i.test(path);

/** FNV-1a content hash; cheap and stable for change detection. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0") + text.length.toString(16);
}

const RULES: Array<{ re: RegExp; kind: string }> = [
  { re: /^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/, kind: "function" },
  { re: /^\s*(export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: "class" },
  { re: /^\s*(export\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/, kind: "interface" },
  { re: /^\s*(export\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/, kind: "type" },
  { re: /^\s*(export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/, kind: "enum" },
  { re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/, kind: "variable" },
  { re: /^()def\s+([A-Za-z_]\w*)/, kind: "function" },
  { re: /^()class\s+([A-Za-z_]\w*)/, kind: "class" },
  { re: /^()func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, kind: "function" },
  { re: /^()create\s+(?:or\s+replace\s+)?(?:table|function|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([A-Za-z_]\w*)/i, kind: "sql" },
];

export function indexFile(path: string, text: string): FileIndex {
  const symbols: SymbolEntry[] = [];
  const imports = new Set<string>();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && symbols.length < 300; i++) {
    const line = lines[i]!;
    for (const m of line.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g)) imports.add((m[1] ?? m[2] ?? m[3])!);
    for (const { re, kind } of RULES) {
      const m = line.match(re);
      if (m && m[2]) {
        const exported = !!m[1] || (/\.(py|go)$/.test(path) ? !m[2].startsWith("_") : false);
        symbols.push({ name: m[2], kind, line: i + 1, exported });
        break;
      }
    }
    const named = line.match(/^\s*export\s*\{([^}]+)\}/);
    if (named) for (const part of named[1]!.split(",")) { const n = part.trim().split(/\s+as\s+/).pop()?.trim(); if (n && /^[\w$]+$/.test(n)) symbols.push({ name: n, kind: "export", line: i + 1, exported: true }); }
  }
  return { path, hash: contentHash(text), symbols, imports: [...imports].slice(0, 100) };
}

/** Resolve a relative/alias import against the importing file, without extension. */
export function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith("@/")) return "src/" + spec.slice(2).replace(/\.[mc]?[jt]sx?$/, "");
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/").replace(/\.[mc]?[jt]sx?$/, "");
}

const stem = (p: string) => p.replace(/\.[mc]?[jt]sx?$/, "").replace(/\/index$/, "");

/** Find definitions of a symbol and files importing the defining files. */
export function lookupSymbol(files: FileIndex[], name: string) {
  const q = name.toLowerCase();
  const defs = files.flatMap((f) => f.symbols.filter((s) => s.name.toLowerCase() === q).map((s) => ({ path: f.path, ...s })));
  const fuzzy = defs.length ? [] : files.flatMap((f) => f.symbols.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ path: f.path, ...s }))).slice(0, 20);
  const targets = new Set((defs.length ? defs : fuzzy).map((d) => stem(d.path)));
  const importers = files.filter((f) => f.imports.some((spec) => { const r = resolveImport(f.path, spec); return r != null && targets.has(stem(r)); })).map((f) => f.path).slice(0, 40);
  return { definitions: defs.slice(0, 20), similar: fuzzy, importedBy: importers };
}
