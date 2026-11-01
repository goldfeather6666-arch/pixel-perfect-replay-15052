import { describe, expect, it } from "vitest";
import { askInput, classifyTask, filterQuestions, questionInput, validateAnswer } from "@/lib/engine/discovery";
import { effectiveProfile, reasoningOptions, routeModel, routingSummary, teamPolicy } from "@/lib/engine/reasoning";
import { canTransition, finalStage } from "@/lib/engine/lifecycle";

describe("task classification", () => {
  it("simple one-file bug is small and gets no interview", () => {
    expect(classifyTask("Fix the typo in the footer").taskClass).toBe("small");
  });
  it("auth/billing work is high risk", () => {
    expect(classifyTask("Add Stripe subscription billing to the settings page with a checkout flow").taskClass).toBe("high_risk");
  });
  it("ambiguous SaaS brief is large", () => {
    expect(classifyTask("Build a SaaS dashboard for agencies to track client projects and invoices across teams").taskClass).toBe("large");
  });
});

describe("questions", () => {
  const sel = { title: "Processing architecture", type: "single_select" as const, options: [{ id: "sync", label: "Sync" }, { id: "queue", label: "Queue" }], recommended_option_ids: ["queue"] };
  it("rejects recommendations for options that do not exist", () => {
    expect(questionInput.safeParse({ ...sel, recommended_option_ids: ["nope"] }).success).toBe(false);
  });
  it("caps one discovery step at five questions", () => {
    expect(askInput.safeParse({ questions: Array.from({ length: 6 }, (_, i) => ({ ...sel, title: `Q number ${i}` })) }).success).toBe(false);
  });
  it("never re-asks an answered question and limits medium tasks to two", () => {
    const qs = ["Processing architecture", "Database", "Hosting", "Auth"].map((t) => questionInput.parse({ ...sel, title: t }));
    const { keep, dropped } = filterQuestions(qs, ["processing architecture"], "medium");
    expect(keep.map((q) => q.title)).toEqual(["Database", "Hosting"]);
    expect(dropped).toHaveLength(2);
  });
  it("validates answers against the stored question", () => {
    const q = questionInput.parse(sel);
    expect(validateAnswer(q, { option_ids: ["queue"], text: "", skip: false })).toBeNull();
    expect(validateAnswer(q, { option_ids: ["sync", "queue"], text: "", skip: false })).toMatch(/one/);
    expect(validateAnswer(q, { option_ids: [], text: "", skip: true })).toMatch(/cannot be skipped/);
    expect(validateAnswer(q, { option_ids: ["evil"], text: "", skip: false })).toMatch(/Unknown/);
  });
});

describe("lifecycle", () => {
  it("open questions pause the run instead of completing it", () => {
    const base = { aborted: false, errored: false, blocker: null, exhausted: false, plan: false, pendingChanges: 0, stagedActions: 0 };
    expect(finalStage({ ...base, openQuestions: 2 }).stage).toBe("AWAITING_INPUT");
    expect(canTransition("EXECUTING", "AWAITING_INPUT")).toBe(true);
    expect(canTransition("AWAITING_INPUT", "EXECUTING")).toBe(false);
  });
});

describe("reasoning profiles", () => {
  it("auto maps small to speed and high risk to deep", () => {
    expect(effectiveProfile("auto", "small")).toBe("speed");
    expect(effectiveProfile("auto", "high_risk")).toBe("deep");
    expect(effectiveProfile("balanced", "high_risk")).toBe("balanced");
  });
  it("sends only supported provider fields", () => {
    expect(reasoningOptions("openai", "gpt-5", "deep").providerOptions).toEqual({ openai: { reasoningEffort: "high" } });
    expect(reasoningOptions("anthropic", "claude-sonnet-4-5", "deep").providerOptions).toEqual({ anthropic: { thinking: { type: "enabled", budgetTokens: 16000 } } });
    expect(reasoningOptions("compatible", "mercury-3", "deep").providerOptions).toBeUndefined();
    expect(reasoningOptions("compatible", "some-unknown-model", "deep").providerOptions).toBeUndefined();
    expect(reasoningOptions("openai", "gpt-4o", "deep").providerOptions).toBeUndefined();
  });
});

describe("routing and team sizing", () => {
  it("single-model config routes every role to the master truthfully", () => {
    const r = { master: "m", coding: null, reviewer: null, fallback: null };
    expect(routeModel("coder", r).model).toBe("m");
    expect(routingSummary(r)).toMatch(/only one model/);
  });
  it("multi-model config routes coders and reviewers separately", () => {
    const r = { master: "m", coding: "c", reviewer: "v", fallback: null };
    expect(routeModel("frontend", r).model).toBe("c");
    expect(routeModel("security", r).model).toBe("v");
    expect(routeModel("explorer", r).model).toBe("m");
  });
  it("small tasks never force a team; large ones do unless speed", () => {
    expect(teamPolicy("small", "balanced").required).toBe(false);
    expect(teamPolicy("large", "balanced").required).toBe(true);
    expect(teamPolicy("large", "speed").required).toBe(false);
    expect(teamPolicy("small", "deep").maxWorkers).toBe(1);
  });
});
