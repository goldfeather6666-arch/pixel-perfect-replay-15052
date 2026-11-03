import { describe, expect, it } from "vitest";
import { productionInstructions } from "@/lib/deployment-quality";

describe("auth feedback rule for agent-built apps", () => {
  it("requires visible results on auth forms and bans generic errors", () => {
    expect(productionInstructions).toContain("Auth forms must never fail silently");
    expect(productionInstructions).toContain("Never replace these with a generic");
  });
  it("requires a clear message when database settings are missing", () => {
    expect(productionInstructions).toContain("Sign-in isn't configured for this environment yet");
  });
});
