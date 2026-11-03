import { describe, expect, it } from "vitest";
import { tagAuthorship } from "@/lib/authorship";

describe("tagAuthorship", () => {
  it("tags a file agent-authored only when an agent write was recorded", () => {
    expect(tagAuthorship(["a.ts", "b.ts"], ["a.ts"])).toEqual({ "a.ts": "agent", "b.ts": "human" });
  });
  it("tags every file human-edited when no agent write exists", () => {
    expect(tagAuthorship(["x.ts"], [])).toEqual({ "x.ts": "human" });
  });
});