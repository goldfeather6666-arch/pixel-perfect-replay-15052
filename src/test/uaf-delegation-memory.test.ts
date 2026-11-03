import { describe, it, expect } from "vitest";
import { contractFor, ownershipConflicts } from "@/lib/engine/delegation";
import { reviewMemory, liveMemories, normalizeType, memoryLine } from "@/lib/engine/memory-types";

describe("Delegation contracts", () => {
  it("writers own their paths; readers own nothing", () => {
    const w = contractFor({ label: "ui", role: "frontend", task: "build the form", paths: ["a.tsx"], after: [] }, 0, 18);
    const r = contractFor({ label: "rev", role: "reviewer", task: "review the form", paths: ["a.tsx"], after: ["ui"] }, 1, 10);
    expect(w.owned_paths).toEqual(["a.tsx"]);
    expect(r.owned_paths).toEqual([]);
    expect(r.read_only_paths).toEqual(["a.tsx"]);
    expect(r.dependencies).toEqual(["ui"]);
  });
  it("every worker is forbidden to merge, deploy or change credentials", () => {
    const c = contractFor({ label: "x", role: "coder", task: "do work", paths: ["b.ts"], after: [] }, 0, 18);
    expect(c.cannot).toEqual(expect.arrayContaining(["merge", "deploy", "change credentials"]));
    expect(c.subtask_id).toBe("worker-01");
  });
  it("detects two writers owning one path in the same wave", () => {
    const a = contractFor({ label: "a", role: "coder", task: "aaaaa", paths: ["x.ts"], after: [] }, 0, 18);
    const b = contractFor({ label: "b", role: "backend", task: "bbbbb", paths: ["x.ts"], after: [] }, 1, 18);
    expect(ownershipConflicts([a, b], [[0, 1]])).toHaveLength(1);
    expect(ownershipConflicts([a, b], [[0], [1]])).toHaveLength(0);
  });
});

describe("Memory tiers", () => {
  it("rejects credentials", () => {
    expect(reviewMemory({ category: "project", content: "api_key=sk-abcdefghijklmnopqrstuv", confidence: 1 }).verdict).toBe("REJECT");
  });
  it("procedural lessons need high confidence", () => {
    expect(reviewMemory({ category: "procedural", content: "run migrations before tests", confidence: 0.6 }).verdict).toBe("REJECT");
    expect(reviewMemory({ category: "procedural", content: "run migrations before tests", confidence: 0.9 }).verdict).toBe("STORE");
  });
  it("episodic memories expire after 90 days; preferences never", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(reviewMemory({ category: "episodic", content: "build failed on x", confidence: 0.9 }, now).expiresAt).toBe("2026-04-01T00:00:00.000Z");
    expect(reviewMemory({ category: "preference", content: "prefers dark mode", confidence: 1 }, now).expiresAt).toBeNull();
  });
  it("legacy decision/error map to episodic", () => {
    expect(normalizeType("decision")).toBe("episodic");
    expect(normalizeType("error")).toBe("episodic");
  });
  it("superseded and expired memories never reach the model", () => {
    const now = Date.parse("2026-06-01T00:00:00Z");
    const rows = [
      { category: "project", content: "a", updated_at: "2026-01-01", status: "active" },
      { category: "project", content: "b", updated_at: "2026-01-01", status: "superseded" },
      { category: "episodic", content: "c", updated_at: "2026-01-01", expires_at: "2026-02-01T00:00:00Z" },
    ];
    expect(liveMemories(rows, now).map((r) => r.content)).toEqual(["a"]);
  });
  it("memory lines carry provenance", () => {
    expect(memoryLine({ category: "project", content: "uses vite", updated_at: "2026-03-04T00:00:00Z", confidence: 0.9, source_ref: "commit:abc" })).toBe("[project conf=0.90 saved=2026-03-04 src=commit:abc] uses vite");
  });
});
