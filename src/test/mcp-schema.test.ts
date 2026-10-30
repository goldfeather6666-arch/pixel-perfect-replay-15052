import { describe, it, expect } from "vitest";
import { compileMcpSchema } from "@/lib/mcp-schema";

describe("MCP schema compatibility", () => {
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