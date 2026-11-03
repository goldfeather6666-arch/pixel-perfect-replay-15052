// Adaptive reasoning profiles and capability-aware role routing. Profiles translate into real
// provider options only where the adapter and model support them; unknown models get nothing.
import { modelCaps } from "./model-registry";
import type { TaskClass } from "./discovery";

export const PROFILES = ["auto", "speed", "balanced", "deep"] as const;
export type Profile = (typeof PROFILES)[number];
export type Effective = Exclude<Profile, "auto">;

export function effectiveProfile(p: string | null | undefined, c: TaskClass): Effective {
  if (p === "speed" || p === "balanced" || p === "deep") return p;
  return c === "small" ? "speed" : c === "high_risk" ? "deep" : "balanced";
}

/** Provider-specific options. Returns {} whenever support is not documented for this adapter+model. */
export function reasoningOptions(provider: string, model: string, profile: Effective): { providerOptions?: Record<string, Record<string, unknown>>; applied: string } {
  const caps = modelCaps(model);
  if (!caps.known || !caps.reasoning) return { applied: caps.known ? "model has no reasoning controls" : "unknown model — no reasoning fields sent" };
  if (provider === "openai" && /^(gpt-5|o\d)/i.test(model)) {
    const effort = profile === "speed" ? "low" : profile === "deep" ? "high" : "medium";
    return { providerOptions: { openai: { reasoningEffort: effort } }, applied: `OpenAI reasoningEffort=${effort}` };
  }
  if (provider === "anthropic" && /claude/i.test(model)) {
    if (profile === "speed") return { applied: "Anthropic extended thinking off" };
    const budgetTokens = profile === "deep" ? 16_000 : 4_000;
    return { providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens } } }, applied: `Anthropic thinking budget ${budgetTokens}` };
  }
  if (provider === "google" && /gemini-2\.5|gemini-3/i.test(model)) {
    const thinkingBudget = profile === "speed" ? (/pro/i.test(model) ? 128 : 0) : profile === "deep" ? 16_384 : 2_048;
    return { providerOptions: { google: { thinkingConfig: { thinkingBudget } } }, applied: `Gemini thinkingBudget=${thinkingBudget}` };
  }
  return { applied: `${provider} adapter has no documented reasoning field — none sent` };
}

/** Execution policy per profile. */
export function profilePolicy(p: Effective): { stepCap: number; maxWorkers: number; maxJobs: number; text: string } {
  if (p === "speed") return { stepCap: 30, maxWorkers: 2, maxJobs: 3, text: "Speed profile: minimal planning, no unnecessary helpers, targeted checks, avoid duplicate reads." };
  if (p === "deep") return { stepCap: 60, maxWorkers: 4, maxJobs: 12, text: "Deep profile: compare alternatives, analyse risks, get adversarial review (security/reviewer role) and expand verification." };
  return { stepCap: 50, maxWorkers: 4, maxJobs: 8, text: "Balanced profile: requirements check, proportionate plan, selective helpers, relevant tests, independent review for material changes." };
}

/**
 * Adaptive team sizing: the smallest team that fits. Dispatch is only *required* for large or
 * high-risk work; small tasks never get a forced team.
 */
export function teamPolicy(c: TaskClass, p: Effective): { required: boolean; maxJobs: number; maxWorkers: number; reason: string } {
  const pol = profilePolicy(p);
  if (c === "small") return { required: false, maxJobs: Math.min(2, pol.maxJobs), maxWorkers: 1, reason: "small task — master works directly" };
  if (c === "medium") return { required: p !== "speed", maxJobs: Math.min(4, pol.maxJobs), maxWorkers: Math.min(3, pol.maxWorkers), reason: "medium task — parallel helpers for independent parts" };
  return { required: true, maxJobs: pol.maxJobs, maxWorkers: pol.maxWorkers, reason: `${c.replace("_", "-")} task — parallel specialists with exclusive file ownership` };
}

export type Routing = { master: string; coding: string | null; reviewer: string | null; fallback: string | null };
const CODING_ROLES = new Set(["coder", "frontend", "backend", "database", "integration", "tester", "qa", "debugger"]);
const REVIEW_ROLES = new Set(["reviewer", "security"]);

/** Role → model. Truthful: reports when every role shares the master model. */
export function routeModel(role: string, r: Routing): { model: string; reason: string } {
  if (CODING_ROLES.has(role) && r.coding) return { model: r.coding, reason: "configured coding model" };
  if (REVIEW_ROLES.has(role) && r.reviewer) return { model: r.reviewer, reason: "configured reviewer model (independent pass)" };
  if (REVIEW_ROLES.has(role)) return { model: r.master, reason: "no reviewer model — independent pass with the master model" };
  return { model: r.master, reason: "master model" };
}
export function routingSummary(r: Routing): string {
  const distinct = new Set([r.master, r.coding, r.reviewer].filter(Boolean));
  return distinct.size === 1 ? `All roles use ${r.master} (only one model configured).` : `Master ${r.master}; coding ${r.coding ?? r.master}; review ${r.reviewer ?? r.master}.`;
}
/** Validates a role override against registry capabilities. */
export function validateRoleModel(role: "coding" | "reviewer", model: string): string | null {
  const caps = modelCaps(model);
  if (caps.known && !caps.tools) return `${model} does not support tool calling, which the ${role} role needs.`;
  return null;
}
