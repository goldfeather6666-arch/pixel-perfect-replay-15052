import { describe, expect, it } from "vitest";
import { gitBlobSha, tagAuthorship } from "@/lib/authorship";

describe("tagAuthorship", () => {
  it("tags a file agent-authored only when an agent write was recorded", () => {
    expect(tagAuthorship([{ filename: "a.ts", sha: "new" }, { filename: "b.ts", sha: "human" }], [{ path: "a.ts", blob_sha: "new" }, { path: "b.ts", blob_sha: "old" }])).toEqual({ "a.ts": "agent", "b.ts": "human" });
  });
  it("does not invent authorship for historical files without evidence", () => {
    expect(tagAuthorship([{ filename: "x.ts", sha: "x" }], [])).toEqual({ "x.ts": "unknown" });
  });
  it("uses Git's content hash for exact evidence", async () => {
    expect(await gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});