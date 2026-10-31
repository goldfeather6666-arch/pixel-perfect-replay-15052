import { describe, it, expect, vi } from "vitest";
import { compileMcpSchema } from "@/lib/mcp-schema";

describe("MCP schema compatibility", () => {
  it("validates without dynamic code generation, as required in production", () => {
    const original = globalThis.Function;
    vi.stubGlobal("Function", function () { throw new Error("Code generation from strings disallowed"); });
    try {
      const validate = compileMcpSchema({ type: "object", properties: { query: { type: "string" } }, required: ["query"] });
      expect(validate({ query: "animation" })).toBe(true);
      expect(validate({ query: 42 })).toBe(false);
    } finally { vi.stubGlobal("Function", original); }
  });
  it("resolves self-contained definitions without changing the saved schema", () => {
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", $defs: { query: { type: "string", minLength: 1 } }, properties: { query: { $ref: "#/$defs/query" } }, required: ["query"], additionalProperties: false };
    const before = JSON.stringify(schema);
    const validate = compileMcpSchema(schema);
    expect(validate({ query: "motion" })).toBe(true);
    expect(validate({ query: "" })).toBe(false);
    expect(validate({ query: "motion", extra: true })).toBe(false);
    expect(JSON.stringify(schema)).toBe(before);
  });
  it("rejects unresolved references and unknown dialects before tool discovery", () => {
    expect(() => compileMcpSchema({ $ref: "https://example.test/schema" })).toThrow("reference");
    expect(() => compileMcpSchema({ $ref: "#/$defs/missing" })).toThrow("reference");
    expect(() => compileMcpSchema({ $schema: "https://unsupported.example/schema" })).toThrow("version");
  });
  it("validates Framer's JSON Schema 2020-12 tools without weakening argument checks", () => {
    const validate = compileMcpSchema({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { project: { type: "string" } }, required: ["project"] });
    expect(validate({ project: "landing" })).toBe(true);
    expect(validate({ project: 42 })).toBe(false);
    expect(validate({})).toBe(false);
  });
  it("still validates older MCP tool schemas", () => {
    const validate = compileMcpSchema({ type: "object", required: ["repo"], properties: { repo: { type: "string" } } });
    expect(validate({ repo: "owner/repo" })).toBe(true);
    expect(validate({})).toBe(false);
  });
});