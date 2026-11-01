import { describe, expect, it } from "vitest";
import { agentRequest, attachmentPart, attachmentType } from "../lib/agent-request";
describe("chat attachments", () => {
  it("accepts PDFs and text documents by extension", () => {
    expect(attachmentType("spec.md", "")).toBe("text/markdown");
    expect(attachmentType("brief.pdf", "application/pdf")).toBe("application/pdf");
    expect(attachmentType("app.exe", "")).toBeNull();
  });
  it("sends PDFs as file parts and inlines text docs", () => {
    expect(attachmentPart({ mediaType: "application/pdf", data: "AA==" }).type).toBe("file");
    const t = attachmentPart({ mediaType: "text/plain", data: btoa("hello"), name: "a.txt" });
    expect(t.type === "text" && t.text.includes("hello")).toBe(true);
  });
  it("allows up to six attachments", () => {
    const a = { mediaType: "image/png" as const, data: "AA==" };
    expect(agentRequest.safeParse({ sessionId: crypto.randomUUID(), message: "x", images: Array(6).fill(a) }).success).toBe(true);
    expect(agentRequest.safeParse({ sessionId: crypto.randomUUID(), message: "x", images: Array(7).fill(a) }).success).toBe(false);
  });
});
