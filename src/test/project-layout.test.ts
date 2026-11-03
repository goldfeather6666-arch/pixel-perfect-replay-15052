import { describe, expect, it } from "vitest";
import { pickAppDir } from "@/lib/project-layout";
import { repairToolInput } from "@/lib/engine/tool-repair";

const vite = { scripts: { dev: "vite" }, devDependencies: { vite: "7" } };

describe("monorepo app folder", () => {
  it("uses the root for a single app", () => {
    expect(pickAppDir({ pkg: vite, files: ["package.json"] }, [])).toBe("");
  });
  it("picks apps/web in a pnpm workspace", () => {
    const c = [
      { dir: "packages/ui", pkg: { devDependencies: { vite: "7" } }, files: [] },
      { dir: "apps/web", pkg: { dependencies: { next: "15" } }, files: [] },
    ];
    expect(pickAppDir({ pkg: { scripts: { dev: "turbo dev" } }, files: ["pnpm-workspace.yaml"] }, c)).toBe("apps/web");
  });
  it("returns null when nothing runs", () => {
    expect(pickAppDir({ pkg: null, files: [] }, [])).toBeNull();
  });
});

describe("tool input repair", () => {
  it("unwraps fenced json with trailing comma", () => {
    expect(repairToolInput('```json\n{"path":"a.ts",}\n```')).toBe('{"path":"a.ts"}');
  });
  it("gives up on prose", () => {
    expect(repairToolInput("I will edit the file")).toBeNull();
  });
});
