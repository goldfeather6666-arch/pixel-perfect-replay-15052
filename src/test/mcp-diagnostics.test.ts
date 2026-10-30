import { describe, it, expect } from "vitest";
import { diagnoseTool, connectionDiagnosticError } from "@/lib/mcp-diagnostics";

const read = { name: "read_project", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } };
describe("access diagnostics", () => {
  it("reports readable tools without claiming an invocation succeeded", () => {
    expect(diagnoseTool("https://mcp.framer.com/mcp", false, true, read, true)).toMatchObject({ status: "available", schemaValid: true, detail: "Discovered and validated; invocation not tested." });
  });
  it("requires approval for Framer actions even when opted in", () => {
    expect(diagnoseTool("https://mcp.framer.com/mcp", true, true, { ...read, annotations: { readOnlyHint: false } }, true).status).toBe("approval_required");
  });
  it("shows action tools blocked when not opted in", () => {
    expect(diagnoseTool("https://mcp.framer.com/mcp", false, true, { ...read, annotations: {} }, true).status).toBe("blocked");
  });
  it("reports paused connections as unavailable to the agent", () => {
    expect(diagnoseTool("https://mcp.framer.com/mcp", true, false, read, true).status).toBe("paused");
  });
  it("isolates unsupported schemas", () => {
    expect(diagnoseTool("https://mcp.framer.com/mcp", true, true, { ...read, inputSchema: { $schema: "https://unsupported.example/schema" } }, true)).toMatchObject({ status: "unsupported", schemaValid: false });
  });
  it("does not expose credentials or remote response bodies in errors", () => {
    const output = connectionDiagnosticError(new Error("401 Bearer secret-token https://example.com?token=secret-token"));
    expect(output).toContain("Authorization failed");
    expect(output).not.toContain("secret-token");
    expect(connectionDiagnosticError(new Error("sensitive server body"))).not.toContain("sensitive server body");
  });
});