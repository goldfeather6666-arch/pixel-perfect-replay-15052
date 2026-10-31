import { describe, expect, it } from "vitest";
import { modelConfigurationError, providerRequestError } from "@/lib/provider-request-error";
describe("provider request failures", () => {
  it("identifies invalid Inception display names without changing the selected model", () => {
    expect(modelConfigurationError("https://api.inceptionlabs.ai/v1", "mercury 3")).toContain("mercury-3");
    expect(modelConfigurationError("https://api.inceptionlabs.ai/v1", "mercury-3")).toBeNull();
    expect(modelConfigurationError("https://example.org/v1", "mercury 3")).toBeNull();
  });
  it("distinguishes provider rejection from the Forge prompt limit", () => {
    expect(providerRequestError({ statusCode: 400, message: "Bad Request" })).toContain("after Forge accepted your prompt");
  });
  it("never exposes raw provider bodies or secrets", () => {
    expect(providerRequestError({ message: "secret-key raw response" })).not.toContain("secret-key");
  });
});