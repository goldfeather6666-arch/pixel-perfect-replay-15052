// Google Gemini free-tier handling. Pure helpers plus a fetch wrapper; no keys are logged.

/** Google lists speech, image, video, embedding and live-audio models that cannot run a coding agent. */
export function isGoogleChatModel(id: string): boolean {
  return !/(tts|image|imagen|veo|embedding|embed|aqa|native-audio|live|audio|robotics|lyria|computer-use)/i.test(id);
}

export type GoogleQuota = { kind: "per_minute"; waitMs: number } | { kind: "per_day" | "no_free_access" } | null;

/** Reads Google's 429 body: per-minute limits are worth waiting for; daily or zero limits are not. */
export function parseGoogleQuota(body: string): GoogleQuota {
  if (!/quota|RESOURCE_EXHAUSTED/i.test(body)) return null;
  if (/limit:\s*0\b|"quotaValue":\s*"0"/i.test(body)) return { kind: "no_free_access" };
  if (/per\s*day|PerDay/i.test(body)) return { kind: "per_day" };
  const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) ?? body.match(/retry in (\d+(?:\.\d+)?)s/i);
  const secs = m ? Number(m[1]) : 20;
  return { kind: "per_minute", waitMs: Math.min(65_000, Math.ceil(secs * 1000) + 500) };
}

/** Waits out Gemini per-minute free-tier limits (up to 3 times) instead of failing the run. */
export function googleQuotaFetch(sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(input, init);
      if (res.status !== 429 || attempt >= 3) return res;
      const q = parseGoogleQuota(await res.clone().text());
      if (q?.kind !== "per_minute" || init?.signal?.aborted) return res;
      await sleep(q.waitMs);
    }
  }) as typeof fetch;
}

/** Plain-language explanation for a Gemini quota refusal. */
export function googleQuotaMessage(message: string): string | null {
  const q = parseGoogleQuota(message);
  if (!q) return null;
  if (q.kind === "no_free_access") return "Google gives this model no free use on your key (free limit is 0). Pick another Gemini model, such as a Flash model, or turn on billing for your Google key. Everything done so far is saved.";
  if (q.kind === "per_day") return "Your Google key used up today's free Gemini requests. Wait until tomorrow, switch to another model, or turn on billing for your Google key. Everything done so far is saved.";
  return "Google's free Gemini plan allows only a few requests per minute, and Forge waited but the limit stayed full. Wait a minute and send “continue”, or turn on billing for your Google key for faster work. Everything done so far is saved.";
}
