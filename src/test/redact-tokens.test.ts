import { describe, expect, it } from "vitest";
import { redactTokens } from "@/lib/sandbox.server";

describe("shared sandbox tokens", () => {
  it("never returns a shared token in command output", () => {
    const out = redactTokens("auth ghp_abcdef123456 ok", { GH_TOKEN: "ghp_abcdef123456" });
    expect(out).toBe("auth [redacted] ok");
  });
});
