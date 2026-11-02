type Completion = {
  text: string;
  toolCalls: number;
  finishReason: string;
  rawFinishReason?: string | undefined;
  plan: boolean;
  waiting: boolean;
  aborted: boolean;
  exhausted: boolean;
  continued: boolean;
};

const promise = /\b(?:i['’]ll|i will|i am going to|i'm going to|let me|next i['’]ll)\s+(?:now\s+)?(?:check|inspect|investigate|read|run|fix|implement|update|test|verify|review|look into)\b/i;
const terminal = /\b(?:refus(?:e|al|ed)|denied|not authorized|cannot|can't|unable|blocked|need your|awaiting|waiting for|approve|approval|please (?:provide|confirm|connect)|missing (?:access|credentials)|permission required)\b/i;

/** Only an explicit unfinished action promise qualifies; no empty-output/refusal retries. */
export function actionFollowThrough(f: Completion): "continue" | "blocked" | null {
  if (f.plan || f.waiting || f.aborted || f.exhausted || f.toolCalls > 0 || f.finishReason !== "stop") return null;
  if (/refus|denied|filter|error/i.test(f.rawFinishReason ?? "") || terminal.test(f.text) || !promise.test(f.text)) return null;
  return f.continued ? "blocked" : "continue";
}

export const ACTION_FOLLOW_THROUGH = "Your last response promised to investigate or act, but this response made no tool calls. Continue the existing request now using the relevant available tools, respecting task ownership, autonomy and approvals. Do not repeat the promise. If access is missing, permission is required, or the request cannot be performed, report the exact blocker instead. This is not permission to deploy or expand scope.";