import { describe, expect, it } from "vitest";
import { platformSkillLibrary } from "@/lib/free-skills";
import { parseSkill, selectSkills } from "@/lib/engine/skill-meta";

const metas = platformSkillLibrary.map((s) => parseSkill(s.name, s.instructions));
const names = (req: string) => selectSkills(req, metas).selected.map((p) => p.skill.name);

describe("platform skills", () => {
  it("core quality and security are always on", () => {
    expect(names("hello")).toEqual(expect.arrayContaining(["forge-core-quality", "forge-core-security"]));
  });
  it("realtime loads for live chat requests, including plurals", () => {
    expect(names("add live notifications to the app")).toContain("forge-realtime");
    expect(names("build a todo list")).not.toContain("forge-realtime");
  });
});
