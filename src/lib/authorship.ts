// Auto-tagging: a changed file is agent-authored only when Forge recorded an agent write for it.
// Anything else on the task branch came from a person (or another tool) and is tagged human-edited.
export type Authorship = "agent" | "human";

export function tagAuthorship(files: string[], agentPaths: Iterable<string>): Record<string, Authorship> {
  const agent = new Set(agentPaths);
  return Object.fromEntries(files.map((f) => [f, agent.has(f) ? "agent" : "human"]));
}