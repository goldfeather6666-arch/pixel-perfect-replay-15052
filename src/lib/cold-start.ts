/** C24: repository basics a brand-new repo should get before its first feature build. */
export type ColdStartGap = "readme" | "env_example" | "ci" | "license" | "roadmap";

export function coldStartGaps(files: string[]): ColdStartGap[] {
  const has = (re: RegExp) => files.some((f) => re.test(f));
  const gaps: ColdStartGap[] = [];
  if (!has(/^readme(\.md|\.mdx|\.txt)?$/i)) gaps.push("readme");
  if (!has(/^\.env\.(example|sample|template)$/i)) gaps.push("env_example");
  if (!has(/^\.github\/workflows\/[^/]+\.ya?ml$/i)) gaps.push("ci");
  if (!has(/^(licen[cs]e|copying)(\.md|\.txt)?$/i)) gaps.push("license");
  if (!has(/^roadmap\.md$/i)) gaps.push("roadmap");
  return gaps;
}

/** A first run on a repo with few files and at least two missing basics is a cold start. */
export function isColdStart(files: string[], hadPreviousRun: boolean): boolean {
  return !hadPreviousRun && files.length <= 400 && coldStartGaps(files).length >= 2;
}

const STEPS: Record<ColdStartGap, string> = {
  readme: "README.md: purpose, stack, install/run/test/build commands taken from package.json, environment variable names.",
  env_example: ".env.example: every variable name the code reads, blank values only, never real secrets.",
  ci: ".github/workflows/ci.yml: install with the repo's package manager, then the existing lint/typecheck/test/build scripts only.",
  license: "LICENSE: a legal choice — ask the user with ask_user (offer MIT, Apache-2.0, proprietary/none); never pick one silently.",
  roadmap: "roadmap.md: the requested feature as the first open task.",
};

export function coldStartBrief(gaps: ColdStartGap[]): string {
  return `<cold_start_runbook note="new repository; do this before the first feature">\nThis repository is missing basics. Before feature work, add them in one small commit using the normal write tools and autonomy rules:\n${gaps.map((g, i) => `${i + 1}. ${STEPS[g]}`).join("\n")}\nKeep each file short and accurate to the code; then continue with the user's request.\n</cold_start_runbook>`;
}
