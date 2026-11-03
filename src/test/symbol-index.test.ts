import { describe, expect, it } from "vitest";
import { contentHash, indexFile, isIndexable, lookupSymbol, resolveImport } from "@/lib/engine/symbol-index";

describe("symbol index", () => {
  const a = indexFile("src/lib/math.ts", "export function add(a: number, b: number) { return a + b; }\nconst hidden = 1;\nexport type Sum = number;");
  const b = indexFile("src/app.tsx", "import { add } from '@/lib/math';\nexport default function App() { return add(1, 2); }");
  const c = indexFile("src/other/x.ts", "import { add } from '../lib/math';\n");
  it("extracts symbols with export flags and lines", () => {
    expect(a.symbols).toEqual([
      { name: "add", kind: "function", line: 1, exported: true },
      { name: "hidden", kind: "variable", line: 2, exported: false },
      { name: "Sum", kind: "type", line: 3, exported: true },
    ]);
  });
  it("finds definitions and importers via alias and relative paths", () => {
    const r = lookupSymbol([a, b, c], "add");
    expect(r.definitions[0]!.path).toBe("src/lib/math.ts");
    expect(r.importedBy.sort()).toEqual(["src/app.tsx", "src/other/x.ts"]);
  });
  it("resolves imports and hashes content", () => {
    expect(resolveImport("src/a/b.ts", "../c")).toBe("src/c");
    expect(resolveImport("src/a.ts", "react")).toBeNull();
    expect(contentHash("x")).not.toBe(contentHash("y"));
    expect(isIndexable("src/routeTree.gen.ts")).toBe(false);
  });
});
