import { describe, expect, it } from "vitest";
import { isFailedRelease, pickRollbackTarget, rollbackMethod } from "./release-rollback";
import { sourceLocations } from "./runtime-source-map";
import { detectPerfRegression } from "./perf-regression";
import { checkDocDrift, envNamesFromTemplate } from "./docs-drift";
import { dependents, remapMovedPaths, versionConflicts, workspaceDirs, workspaceGlobs } from "./workspaces";
import { costBudget, qualityGate } from "./quality-governance";
import { changedDependencies, floorVersion, osvCheck, secretAge } from "./security-watch";
import { correctionMemory } from "./feedback-relearn";
import { coldStartGaps, isColdStart, coldStartBrief } from "./cold-start";
import { triageBuildFailure } from "./build-triage";
import { parseQaPolicy } from "./qa-policy";

const d = (id: string, state: string, created: number, target: string | null = null, commitSha = id) => ({ id, state, created, target, commitSha, url: `https://${id}.vercel.app` });

describe("C18 rollback", () => {
  it("treats a build error or runtime error as a failed release", () => {
    expect(isFailedRelease("ERROR", null)).toBe(true);
    expect(isFailedRelease("READY", "ERROR")).toBe(true);
    expect(isFailedRelease("READY", "PASSED")).toBe(false);
  });
  it("restores the newest earlier READY build on the same target, preferring verified ones", () => {
    const list = [d("bad", "ERROR", 50), d("ok2", "READY", 40), d("ok1", "READY", 30), d("prod", "READY", 45, "production"), d("newer", "READY", 60)];
    expect(pickRollbackTarget(list, "bad")?.id).toBe("ok2");
    expect(pickRollbackTarget(list, "bad", new Set(["ok1"]))?.id).toBe("ok1");
    expect(pickRollbackTarget([d("bad", "ERROR", 50)], "bad")).toBeNull();
  });
  it("promotes production and rebuilds branch deployments", () => {
    expect(rollbackMethod(d("p", "READY", 1, "production"))).toBe("promote");
    expect(rollbackMethod(d("b", "READY", 1))).toBe("redeploy");
  });
});

describe("C18 runtime source mapping", () => {
  it("maps a browser stack to repo file and line", () => {
    const stack = "TypeError: x is undefined\n    at Cart (http://localhost:5173/src/components/Cart.tsx?t=123:42:7)\n    at renderWithHooks (http://localhost:5173/node_modules/.vite/deps/react-dom.js:100:1)";
    expect(sourceLocations(stack, ["src/components/Cart.tsx", "src/main.tsx"])).toEqual([{ file: "src/components/Cart.tsx", line: 42, column: 7, fn: "Cart" }]);
  });
});

describe("C18 perf alerting", () => {
  it("alerts at ≥1.5× and ≥300 ms over the median, only with a 3-sample baseline", () => {
    expect(detectPerfRegression([400, 420], 2000).regressed).toBe(false);
    expect(detectPerfRegression([400, 420, 410], 1000).regressed).toBe(true);
    expect(detectPerfRegression([400, 420, 410], 700).regressed).toBe(false);
  });
});

describe("C19 docs drift", () => {
  it("flags a stale doc that references removed files, scripts and env vars", () => {
    const md = "Run `npm run dev` then `bun run seed`.\nConfig lives in `src/config.ts` and `src/old/legacy.ts`.\nSet `STRIPE_SECRET_KEY` and `OLD_API_TOKEN`.";
    const f = checkDocDrift("README.md", md, { files: ["src/config.ts", "package.json"], scripts: ["dev", "build"], envNames: envNamesFromTemplate("STRIPE_SECRET_KEY=\n") });
    expect(f.map((x) => x.value).sort()).toEqual(["OLD_API_TOKEN", "seed", "src/old/legacy.ts"]);
  });
  it("passes an in-sync doc", () => {
    expect(checkDocDrift("README.md", "Edit `src/config.ts`, run `npm run dev`.", { files: ["src/config.ts"], scripts: ["dev"], envNames: null })).toEqual([]);
  });
});

describe("C20 monorepo durability", () => {
  const files = ["package.json", "packages/ui/package.json", "packages/core/package.json", "apps/web/package.json"];
  it("finds workspace packages, version conflicts and dependents", () => {
    const dirs = workspaceDirs(workspaceGlobs({ workspaces: ["packages/*"] }, "packages:\n  - 'apps/*'\n"), files);
    expect(dirs).toEqual(["apps/web", "packages/core", "packages/ui"]);
    const pkgs = [{ name: "core", dir: "packages/core", deps: { react: "^18.2.0" } }, { name: "ui", dir: "packages/ui", deps: { core: "workspace:*", react: "^19.0.0" } }, { name: "web", dir: "apps/web", deps: { ui: "workspace:*" } }];
    expect(versionConflicts(pkgs)).toEqual([{ dependency: "react", ranges: { "^18.2.0": ["core"], "^19.0.0": ["ui"] } }]);
    expect(dependents(pkgs, "core")).toEqual(["ui", "web"]);
  });
  it("keeps index entries alive across a move and drops deleted ones", () => {
    expect(remapMovedPaths(["src/a/Button.tsx", "src/gone.ts", "src/keep.ts"], ["src/ui/Button.tsx", "src/keep.ts"])).toEqual({ moved: { "src/a/Button.tsx": "src/ui/Button.tsx" }, removed: ["src/gone.ts"] });
  });
});

describe("C21 quality governance", () => {
  it("blocks deploy below the per-model minimum or with no score", () => {
    const gov = { minQualityScore: { "*": 70, "gpt-5": 85 } };
    expect(qualityGate(gov, "openai/gpt-5", 80).ok).toBe(false);
    expect(qualityGate(gov, "claude", 75).ok).toBe(true);
    expect(qualityGate(gov, "claude", null).ok).toBe(false);
    expect(qualityGate(undefined, "claude", null).ok).toBe(true);
  });
  it("checks run cost against the budget; unknown cost is unverified", () => {
    expect(costBudget({ maxRunCostUsd: 0.5 }, 0.6).ok).toBe(false);
    expect(costBudget({ maxRunCostUsd: 0.5 }, 0.2).ok).toBe(true);
    expect(costBudget({ maxRunCostUsd: 0.5 }, null).ok).toBe(false);
  });
  it("accepts the governance settings in forge.policy.json", () => {
    expect(parseQaPolicy(JSON.stringify({ version: 1, requiredChecks: ["build"], minQualityScore: 80, maxRunCostUsd: 1 })).policy?.minQualityScore).toBe(80);
  });
});

describe("C22 continuous security", () => {
  it("detects bumped dependencies and queries OSV for them", async () => {
    const changes = changedDependencies('{"dependencies":{"lodash":"^4.17.20","react":"^18.0.0"}}', '{"dependencies":{"lodash":"^4.17.21","react":"^18.0.0","axios":"~1.6.0"}}');
    expect(changes).toEqual([{ name: "lodash", from: "^4.17.20", to: "^4.17.21" }, { name: "axios", from: null, to: "~1.6.0" }]);
    expect(floorVersion("latest")).toBeNull();
    const fake = (async () => new Response(JSON.stringify({ results: [{ vulns: [] }, { vulns: [{ id: "GHSA-1" }] }] }))) as unknown as typeof fetch;
    expect(await osvCheck(changes, fake)).toEqual([{ package: "axios", version: "1.6.0", ids: ["GHSA-1"] }]);
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await osvCheck(changes, down)).toBeNull();
  });
  it("reminds to rotate a secret at 90 days", () => {
    const now = Date.parse("2026-11-04T00:00:00Z");
    expect(secretAge("2026-08-05T00:00:00Z", now).due).toBe(true);
    expect(secretAge("2026-10-01T00:00:00Z", now).due).toBe(false);
  });
});

describe("C23 relearn from comments", () => {
  it("turns a comment into a correction and ignores empty ones", () => {
    expect(correctionMemory("Used inline styles", "use theme tokens")).toContain("use theme tokens");
    expect(correctionMemory("x", "  ")).toBeNull();
  });
});

describe("C24 cold start", () => {
  it("runs the basics pass on a brand-new repo only", () => {
    expect(coldStartGaps(["src/index.ts", "package.json"])).toEqual(["readme", "env_example", "ci", "license", "roadmap"]);
    expect(isColdStart(["package.json"], false)).toBe(true);
    expect(isColdStart(["package.json"], true)).toBe(false);
    expect(isColdStart(["README.md", ".env.example", ".github/workflows/ci.yml", "LICENSE", "package.json"], false)).toBe(false);
    expect(coldStartBrief(["license"])).toContain("ask_user");
  });
});

describe("C25 build triage", () => {
  it("classifies and proposes a fix", () => {
    expect(triageBuildFailure("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory").kind).toBe("oom");
    const t = triageBuildFailure("src/app.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect([t.kind, t.proposal?.file, t.proposal?.line]).toEqual(["type_error", "src/app.tsx", 12]);
    expect(triageBuildFailure("Module not found: Can't resolve 'zod'").proposal?.title).toBe("Add zod as a dependency");
    expect(triageBuildFailure("npm ERR! ERESOLVE could not resolve").kind).toBe("dep_conflict");
    expect(triageBuildFailure("npm ERR! network ECONNRESET").retryable).toBe(true);
  });
});
