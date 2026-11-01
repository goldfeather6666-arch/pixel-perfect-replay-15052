import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), from: vi.fn(), getUser: vi.fn(), generateLink: vi.fn(), verify: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from, auth: { admin: { getUserById: mocks.getUser, generateLink: mocks.generateLink } } } }));
vi.mock("@/lib/crypto.server", () => ({ decryptSecret: async () => "resume:a" }));
vi.mock("@/lib/background-run.server", () => ({ startKeeper: mocks.start, stopKeeper: mocks.stop }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { verifyOtp: mocks.verify } }) }));
import { resumeStaleRuns } from "@/lib/run-resume.server";

const now = Date.parse("2026-11-01T01:00:00Z");
const old = "2026-11-01T00:30:00Z";
let lease = true;
let fence = true;
let terminal = false;
let updates: { table: string; value: unknown }[];

beforeEach(() => {
  vi.clearAllMocks(); lease = true; fence = true; terminal = false; updates = [];
  mocks.getUser.mockResolvedValue({ data: { user: { email: "test@example.invalid" } } });
  mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "test-only" } } });
  mocks.verify.mockResolvedValue({ data: { session: { access_token: "test-only" }, user: { id: "owner" } } });
  mocks.start.mockResolvedValue({ ok: true });
  mocks.from.mockImplementation((table: string) => {
    let action = "select";
    const q: any = {};
    for (const method of ["select", "eq", "in", "lte", "limit", "order", "maybeSingle"]) q[method] = () => q;
    q.update = (value: unknown) => { action = "update"; updates.push({ table, value }); return q; };
    q.delete = () => { action = "delete"; return q; };
    q.then = (resolve: (value: unknown) => unknown) => {
      const data = table === "agent_runs" ? (terminal ? { stage: "AWAITING_APPROVAL", ended_at: null } : { stage: "EXECUTING", ended_at: null })
        : action === "delete" ? []
        : action === "update" ? ((table === "run_resume_secrets" ? lease : fence) ? [{ id: "a", session_id: "a" }] : [])
        : table === "run_resume_secrets" ? [{ session_id: "a", user_id: "owner", ciphertext: "test-only", iv: "test-only", attempts: 0, updated_at: old }]
        : [{ id: "a", user_id: "owner", running: true, stop_requested: false, updated_at: old, keeper_id: "old-keeper" }];
      return Promise.resolve({ data }).then(resolve);
    };
    return q;
  });
});

describe("scheduled liveness recovery", () => {
  it("fences and stops the unresponsive execution before resending from saved progress", async () => {
    expect((await resumeStaleRuns("https://example.invalid", now)).resumed).toBe(1);
    expect(updates.find((u) => u.table === "agent_sessions")?.value).toEqual({ execution_id: expect.any(String) });
    expect(mocks.stop).toHaveBeenCalledWith("old-keeper");
    expect(mocks.stop.mock.invocationCallOrder[0]).toBeLessThan(mocks.start.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ recovery: true, sessionId: "a", body: expect.stringContaining("skip completed work") }));
  });
  it("does not resend when another watchdog holds the recovery lease", async () => {
    lease = false;
    await resumeStaleRuns("https://example.invalid", now);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("does not restart when Stop or a fresh heartbeat defeats the fencing claim", async () => {
    fence = false;
    await resumeStaleRuns("https://example.invalid", now);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it("never automatically resends an approval wait", async () => {
    terminal = true;
    await resumeStaleRuns("https://example.invalid", now);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});