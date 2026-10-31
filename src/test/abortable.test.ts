import { describe, it, expect } from "vitest";
import { abortable, abortableStream, errorText, toolErrorText } from "@/lib/abortable";
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
  it("Stop releases a stream blocked on a tool and does not wait for cleanup", async () => {
    const controller = new AbortController();
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise(() => {}),
        return: () => new Promise(() => {}),
      }),
    };
    const stream = abortableStream(source, controller.signal);
    const waiting = stream.next();
    controller.abort(new Error("Stopped"));
    await expect(waiting).rejects.toThrow("Stopped");
  });
  it("preserves stream events before a normal finish", async () => {
    async function* events() { yield 1; yield 2; }
    const received: number[] = [];
    for await (const value of abortableStream(events(), new AbortController().signal)) received.push(value);
    expect(received).toEqual([1, 2]);
  });
  it("shows Error messages instead of {}", () => {
    expect(errorText(new Error("GitHub 409 conflict"))).toBe("GitHub 409 conflict");
  });
});

describe("toolErrorText", () => {
  it("keeps the validation reason and drops the echoed input", () => {
    const msg = 'Invalid input for tool delegate: Type validation failed: Value: {"jobs":[' + "y".repeat(5000) + ']}.\nError message: [{"code":"too_big","path":["jobs",0,"task"]}]';
    const out = toolErrorText(new Error(msg));
    expect(out.startsWith("Invalid input for delegate:")).toBe(true);
    expect(out).toContain("too_big");
    expect(out.length).toBeLessThan(200);
  });
});
