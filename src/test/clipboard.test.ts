import { describe, expect, it } from "vitest";
import { copyToClipboard, type CopyDocument, type CopyField } from "@/lib/clipboard";

function fakeDoc(copyResult = true) {
  const field: CopyField = { value: "", style: {}, focus: () => {}, select: () => {} };
  const appended: CopyField[] = [];
  const removed: CopyField[] = [];
  const commands: string[] = [];
  const doc: CopyDocument = {
    body: {
      appendChild: (f) => appended.push(f),
      removeChild: (f) => removed.push(f),
    },
    createElement: () => field,
    execCommand: (command) => {
      commands.push(command);
      return copyResult;
    },
  };
  return { doc, field, appended, removed, commands };
}

describe("copyToClipboard", () => {
  it("writes through the clipboard API and reports success", async () => {
    const written: string[] = [];
    const ok = await copyToClipboard("hello forge", { writeText: async (t) => void written.push(t) }, undefined);
    expect(ok).toBe(true);
    expect(written).toEqual(["hello forge"]);
  });

  it("copies nothing when there is no text", async () => {
    let called = 0;
    const ok = await copyToClipboard("", { writeText: async () => void called++ }, undefined);
    expect(ok).toBe(false);
    expect(called).toBe(0);
  });

  it("falls back to a hidden textarea when the clipboard API is missing", async () => {
    const { doc, field, appended, removed, commands } = fakeDoc();
    const ok = await copyToClipboard("fallback text", undefined, doc);
    expect(ok).toBe(true);
    expect(field.value).toBe("fallback text");
    expect(appended).toEqual([field]);
    expect(commands).toEqual(["copy"]);
    expect(removed).toEqual([field]);
  });

  it("falls back to the textarea when the clipboard API rejects", async () => {
    const { doc, commands } = fakeDoc();
    const ok = await copyToClipboard("retry me", { writeText: async () => { throw new Error("denied"); } }, doc);
    expect(ok).toBe(true);
    expect(commands).toEqual(["copy"]);
  });

  it("reports failure when the browser refuses the copy command", async () => {
    const { doc, removed } = fakeDoc(false);
    const ok = await copyToClipboard("nope", undefined, doc);
    expect(ok).toBe(false);
    expect(removed.length).toBe(1);
  });

  it("reports failure when no copy path exists", async () => {
    expect(await copyToClipboard("text", undefined, undefined)).toBe(false);
    expect(await copyToClipboard("text", { writeText: async () => { throw new Error("denied"); } }, undefined)).toBe(false);
  });
});
