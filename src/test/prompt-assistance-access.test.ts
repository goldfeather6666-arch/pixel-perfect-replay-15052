import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  auth: vi.fn(),
  task: vi.fn(),
  credential: vi.fn(),
  eq: vi.fn(),
  stream: vi.fn(),
  model: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: fake.auth },
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: fake.eq,
      maybeSingle: table === "agent_sessions" ? fake.task : fake.credential,
    }),
  }),
}));
vi.mock("ai", () => ({ streamText: fake.stream }));
vi.mock("@/lib/providers.server", () => ({
  createModel: fake.model,
  assertPublicEndpoint: vi.fn(),
}));
vi.mock("@/lib/crypto.server", () => ({ decryptSecret: fake.decrypt }));
import { handlePromptAssistance } from "@/lib/prompt-assistance.server";

const request = (auth = true) =>
  new Request("http://localhost/api/prompt-assist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer test-session" } : {}),
    },
    body: JSON.stringify({
      sessionId: "00000000-0000-4000-8000-000000000000",
      draft: "Build a calendar with existing project conventions",
    }),
  });
describe("owner-scoped BYOK prompt refinement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.eq.mockReturnThis();
    fake.auth.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    fake.task.mockResolvedValue({
      data: {
        credential_id: "chosen-key",
        model: "chosen-model",
        repo: "owner/repo",
        messages: [],
      },
    });
    fake.credential.mockResolvedValue({
      data: {
        provider: "openai",
        ciphertext: "encrypted",
        iv: "iv",
        base_url: null,
        extra_body: null,
      },
    });
    fake.decrypt.mockResolvedValue("private-key");
    fake.stream.mockReturnValue({
      textStream: (async function* () {
        yield '{"refined":"Build the calendar and verify it","questions":[]}';
      })(),
    });
  });
  it("rejects missing authentication before reading task data", async () => {
    expect(
      (
        await handlePromptAssistance(request(false), {
          url: "https://database.test",
          key: "public",
        })
      ).status,
    ).toBe(401);
    expect(fake.task).not.toHaveBeenCalled();
  });
  it("cannot use another owner's task", async () => {
    fake.task.mockResolvedValue({ data: null });
    expect(
      (await handlePromptAssistance(request(), { url: "https://database.test", key: "public" }))
        .status,
    ).toBe(404);
    expect(fake.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(fake.decrypt).not.toHaveBeenCalled();
  });
  it("uses only the task-selected owner credential and model", async () => {
    const response = await handlePromptAssistance(request(), {
      url: "https://database.test",
      key: "public",
    });
    const body = await response.text();
    expect(fake.eq.mock.calls.filter(([field]) => field === "user_id")).toEqual([
      ["user_id", "owner"],
      ["user_id", "owner"],
    ]);
    expect(fake.model).toHaveBeenCalledWith("openai", "private-key", null, "chosen-model", null);
    expect(body).toContain('"type":"result"');
    expect(body).not.toContain("private-key");
  });
  it("does not retry failures or return private error details", async () => {
    fake.stream.mockImplementation(() => {
      throw new Error("private-key secret diagnostics");
    });
    const body = await (
      await handlePromptAssistance(request(), { url: "https://database.test", key: "public" })
    ).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain("private-key");
    expect(fake.stream).toHaveBeenCalledOnce();
  });
});
