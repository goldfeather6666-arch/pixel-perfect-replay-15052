import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";

export function compileMcpSchema(schema: Record<string, unknown>) {
  const modern = typeof schema.$schema === "string" && schema.$schema.includes("2020-12");
  return (modern ? new Ajv2020({ strict: false }) : new Ajv({ strict: false })).compile(schema);
}