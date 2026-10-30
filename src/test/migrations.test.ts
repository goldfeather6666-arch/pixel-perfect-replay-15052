import { describe, expect, it } from "vitest";
import { pendingMigrations } from "@/lib/integrations.server";

describe("pendingMigrations", () => {
  it("returns unapplied migration files in name order, ignoring other files", () => {
    const tree = ["supabase/migrations/002_b.sql", "README.md", "supabase/migrations/001_a.sql", "supabase/migrations/sub/x.sql", "supabase/seed.sql"];
    expect(pendingMigrations(tree, ["supabase/migrations/001_a.sql"])).toEqual(["supabase/migrations/002_b.sql"]);
  });
});
