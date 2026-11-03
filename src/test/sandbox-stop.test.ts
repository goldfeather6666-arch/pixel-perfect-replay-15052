import { describe, expect, it, vi } from "vitest";
import { runInSandbox } from "@/lib/sandbox.server";

const fake = vi.hoisted(() => ({ kill: vi.fn(), run: vi.fn() }));
vi.mock("e2b", () => ({ Sandbox: { connect: async () => ({ sandboxId: "box", setTimeout: async () => {}, commands: { run: fake.run }, kill: fake.kill }) } }));

describe("sandbox Stop", () => {
  it("kills the task sandbox when Stop arrives during a shell command", async () => {
    vi.stubEnv("E2B_API_KEY", "test-key");
    const controller = new AbortController();
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => { started = resolve; });
    let end: () => void = () => {};
    fake.kill.mockImplementation(async () => { end(); return true; });
    // Setup commands (swap, env seeding, checkout) succeed; only the user's long command hangs until Stop.
    fake.run.mockImplementation((cmd: string) => {
      if (!String(cmd).includes("long command") && !String(cmd).includes("cmd.sh")) return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      started();
      return new Promise((resolve) => { end = () => resolve({ exitCode: -1, stdout: "", stderr: "" }); });
    });
    const chain: any = { update: () => chain, eq: () => chain, then: (resolve: (v: unknown) => void) => Promise.resolve({}).then(resolve) };
    const work = runInSandbox({ from: () => chain }, { id: "task", user_id: "owner", repo: "owner/repo", work_branch: "agent/test", sandbox_id: "box" }, "test-token", "long command", [], undefined, controller.signal);
    await ready;
    controller.abort(new Error("Stopped"));
    await expect(work).rejects.toThrow("Stopped");
    expect(fake.kill).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});