import { describe, it, expect } from "vitest";
import { abortable, errorText } from "@/lib/abortable";
describe("abortable", () => {
  it("rejects when stopped while work is still running", async () => {
    const c = new AbortController();
    const p = abortable(new Promise(() => {}), c.signal);
    c.abort(new Error("Stopped"));
    await expect(p).rejects.toThrow("Stopped");
  });
  it("resolves normally", async () => {
    await expect(abortable(Promise.resolve(2), new AbortController().signal)).resolves.toBe(2);
  });
  it("shows Error messages instead of {}", () => {
    expect(errorText(new Error("GitHub 409 conflict"))).toBe("GitHub 409 conflict");
  });
});
