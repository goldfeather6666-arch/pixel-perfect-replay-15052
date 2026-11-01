import { describe, expect, it } from "vitest";
import { isRateLimit, modelConfigurationError, providerRequestError } from "@/lib/provider-request-error";
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
  it("recognises throttling from the status or the token-cap wording", () => {
    expect(isRateLimit({ statusCode: 429, message: "Too Many Requests" })).toBe(true);
    expect(isRateLimit({ message: "Rate limit reached: output token limit exceeded" })).toBe(true);
    expect(isRateLimit({ message: "connection reset" })).toBe(false);
  });
  it("tells the user to wait and continue instead of blaming the connection", () => {
    const text = providerRequestError({ statusCode: 429, message: "Rate limit reached: output token limit exceeded" });
    expect(text).toContain("rate limit");
    expect(text).toContain("continue");
  });
});
import { describe as d2, it as i2, expect as e2 } from "vitest";
import { providerRequestError as pre } from "@/lib/provider-request-error";
d2("refused keys", () => {
  i2("shows the provider's reason for a 403 key refusal", () => {
    const m = pre({ statusCode: 403, message: "This API key is paused: the Free plan uses only your newest key." });
    e2(m).toContain("refused this API key (403)");
    e2(m).toContain("API key is paused");
  });
});
