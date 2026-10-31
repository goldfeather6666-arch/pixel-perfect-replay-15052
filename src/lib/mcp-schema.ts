import { Validator, dereference, type Schema, type SchemaDraft } from "@cfworker/json-schema";

const DIALECTS: Record<string, SchemaDraft> = {
  "http://json-schema.org/draft-04/schema": "4",
  "http://json-schema.org/draft-07/schema": "7",
  "https://json-schema.org/draft-07/schema": "7",
  "https://json-schema.org/draft/2019-09/schema": "2019-09",
  "https://json-schema.org/draft/2020-12/schema": "2020-12",
};

export class McpSchemaError extends Error {}

function boundedJson(value: unknown, maxBytes: number) {
  let nodes = 0;
  const walk = (v: unknown, depth: number) => {
    if (++nodes > 20000 || depth > 64) throw new McpSchemaError("Tool schema or arguments exceed safe complexity limits.");
    if (v && typeof v === "object") for (const child of Object.values(v)) walk(child, depth + 1);
  };
  walk(value, 0);
  if (JSON.stringify(value).length > maxBytes) throw new McpSchemaError("Tool schema or arguments exceed safe size limits.");
}

export function compileMcpSchema(schema: Record<string, unknown>) {
  boundedJson(schema, 200000);
  const dialect = schema["$schema"];
  const draft = dialect === undefined ? "7" : typeof dialect === "string" ? DIALECTS[dialect.replace(/#$/, "")] : undefined;
  if (!draft) throw new McpSchemaError("This tool uses an unsupported JSON Schema version.");
  // The interpreter annotates its schema. Clone so saved approval schemas remain immutable.
  const copy = JSON.parse(JSON.stringify(schema)) as Schema;
  let lookup;
  try { lookup = dereference(copy); }
  catch { throw new McpSchemaError("Tool schema references or identifiers are invalid."); }
  for (const node of new Set(Object.values(lookup))) {
    if (typeof node === "boolean") continue;
    if (!node || typeof node !== "object") throw new McpSchemaError("Tool schema contains an invalid schema node.");
    if (node["$dynamicRef"] || node["$dynamicAnchor"]) throw new McpSchemaError("Dynamic schema references are not supported for this tool.");
    if (node.$ref && (!node.$ref.startsWith("#") || !node.__absolute_ref__ || lookup[node.__absolute_ref__] === undefined)) {
      throw new McpSchemaError("Tool schema contains an unresolved or external reference; self-contained references are required.");
    }
    const types = node.type === undefined ? [] : Array.isArray(node.type) ? node.type : [node.type];
    if (types.some((t) => !["object", "array", "string", "number", "integer", "boolean", "null"].includes(t))) throw new McpSchemaError("Tool schema contains an invalid type.");
    if (node.required !== undefined && (!Array.isArray(node.required) || node.required.some((p) => typeof p !== "string"))) throw new McpSchemaError("Tool schema contains an invalid required field list.");
    for (const pattern of [node.pattern, ...Object.keys(node.patternProperties ?? {})]) {
      if (pattern !== undefined) try { new RegExp(pattern, "u"); } catch { throw new McpSchemaError("Tool schema contains an invalid pattern."); }
    }
  }
  const validator = new Validator(copy, draft);
  return (args: unknown) => {
    try { boundedJson(args, 200000); return validator.validate(args).valid; }
    catch { return false; }
  };
}