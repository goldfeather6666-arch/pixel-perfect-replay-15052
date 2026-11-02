import { describe, expect, it } from "vitest";
import {
  MAX_INSTRUCTIONS,
  fallbackSkillName,
  parseSkillMarkdown,
  parseSkillSource,
  pickSkillFiles,
  listSkillCandidates,
} from "@/lib/skill-import.server";
import type { GitHub } from '@/lib/github.server';

describe("parseSkillSource", () => {
  it("reads plain owner/repo and owner/repo/folder forms", () => {
    expect(parseSkillSource("anthropics/skills")).toEqual({ repo: "anthropics/skills", branch: null, path: null });
    expect(parseSkillSource("https://github.com/anthropics/skills/tree/main/skills/pdf")).toEqual({
      repo: "anthropics/skills",
      branch: "main",
      path: "skills/pdf",
    });
    expect(parseSkillSource("https://raw.githubusercontent.com/acme/skills/dev/skills/pdf/SKILL.md")).toEqual({
      repo: "acme/skills",
      branch: "dev",
      path: "skills/pdf/SKILL.md",
    });
  });

  it("rejects anything that is not a repository", () => {
    expect(() => parseSkillSource("just-a-word")).toThrow(/owner\/repo/);
    expect(() => parseSkillSource("   ")).toThrow(/Enter a GitHub repository/);
  });
});

describe("pickSkillFiles", () => {
  const tree = [
    "README.md",
    "LICENSE",
    "docs/notes.md",
    "skills/pdf/SKILL.md",
    "skills/pdf/reference.md",
    "skills/xlsx/SKILL.md",
    "src/index.ts",
  ];

  it("prefers every SKILL.md in the repo", () => {
    expect(pickSkillFiles(tree, null)).toEqual(["skills/pdf/SKILL.md", "skills/xlsx/SKILL.md"]);
  });

  it("scopes to the pasted folder", () => {
    expect(pickSkillFiles(tree, "skills/pdf")).toEqual(["skills/pdf/SKILL.md"]);
  });

  it("falls back to plain docs when there is no SKILL.md", () => {
    expect(pickSkillFiles(["README.md", "docs/notes.md", "guide.md", "LICENSE"], "docs")).toEqual(["docs/notes.md"]);
    expect(pickSkillFiles(["README.md", "guide.md", "notes.md"], null)).toEqual(["guide.md", "notes.md"]);
  });

  it("returns a single pasted markdown file", () => {
    expect(pickSkillFiles(tree, "skills/pdf/SKILL.md")).toEqual(["skills/pdf/SKILL.md"]);
    expect(pickSkillFiles(tree, "skills/pdf/missing.md")).toEqual([]);
  });
});

describe("parseSkillMarkdown", () => {
  it("uses front-matter name, description and body", () => {
    const md = `---\nname: PDF tools\ndescription: "Edit PDFs"\n---\n\nOpen the file with pdftk.\n`;
    expect(parseSkillMarkdown(md, "pdf")).toEqual({
      name: "PDF tools",
      description: "Edit PDFs",
      instructions: "When to use: Edit PDFs\n\nOpen the file with pdftk.",
    });
  });

  it("uses the first heading when there is no front matter", () => {
    const parsed = parseSkillMarkdown("# Deploy rules\n\nAlways run tests first.", "deploy");
    expect(parsed.name).toBe("Deploy rules");
    expect(parsed.instructions).toBe("# Deploy rules\n\nAlways run tests first.");
  });

  it("keeps names free of characters that would break the agent prompt", () => {
    expect(parseSkillMarkdown('---\nname: a"b<c>d\n---\nbody', "x").name).toBe("abcd");
  });

  it("truncates very long files to the stored ceiling", () => {
    const parsed = parseSkillMarkdown(`# Big\n\n${"x".repeat(MAX_INSTRUCTIONS + 500)}`, "big");
    expect(parsed.instructions.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS);
    expect(parsed.instructions.endsWith("…(truncated)")).toBe(true);
  });
});

describe("fallbackSkillName", () => {
  it("uses the folder name for SKILL.md and the file name otherwise", () => {
    expect(fallbackSkillName("skills/pdf/SKILL.md", null)).toBe("pdf");
    expect(fallbackSkillName("skills/pdf/reference.md", null)).toBe("reference");
    expect(fallbackSkillName("SKILL.md", null)).toBe("Skill");
  });
});

describe('free-only import audit', () => {
  const mit = 'Permission is hereby granted, free of charge, to any person obtaining a copy. The software is provided "as is".';
  function client(files: Record<string,string>, privateRepo = false) {
    return {
      req: async () => ({ default_branch: 'main', private: privateRepo, archived: false, pushed_at: new Date().toISOString() }),
      headSha: async () => 'immutable-commit', tree: async () => Object.keys(files),
      getFile: async (_repo:string, ref:string, path:string) => { expect(ref).toBe('immutable-commit'); return files[path] ? { content: files[path], sha: 'blob' } : null; },
    } as unknown as GitHub;
  }
  it('rejects private repositories', async () => {
    await expect(listSkillCandidates(client({}, true), { repo:'acme/test', branch:null, path:null })).rejects.toThrow('public repositories only');
  });
  it('uses nearest restricted license instead of permissive root', async () => {
    const result = await listSkillCandidates(client({ LICENSE:mit, 'x/LICENSE.txt':'Proprietary. All rights reserved.', 'x/SKILL.md':'# Safe\nWrite tests.' }), { repo:'acme/test', branch:null, path:null });
    expect(result.candidates[0]?.registry.verificationStatus).toBe('blocked');
    expect(result.candidates[0]?.registry.licensePath).toBe('x/LICENSE.txt');
  });
  it('pins instructions and license and preserves activation metadata', async () => {
    const result = await listSkillCandidates(client({ LICENSE:mit, 'x/SKILL.md':'---\nactivation: manual\ntriggers: [testing]\n---\nWrite tests.' }), { repo:'acme/test', branch:null, path:null });
    expect(result.candidates[0]?.registry.version).toBe('immutable-commit');
    expect(result.candidates[0]?.registry.verificationStatus).toBe('verified');
    expect(result.candidates[0]?.instructions).toContain('activation: manual');
  });
  it('blocks script-bearing skills pending a complete manual audit', async () => {
    const result = await listSkillCandidates(client({ LICENSE:mit, 'x/SKILL.md':'Write tests.', 'x/scripts/run.py':'print(1)' }), { repo:'acme/test', branch:null, path:null });
    expect(result.candidates[0]?.registry.verificationStatus).toBe('blocked');
    expect(result.candidates[0]?.registry.dependencies).toContain('x/scripts/run.py');
  });
});
