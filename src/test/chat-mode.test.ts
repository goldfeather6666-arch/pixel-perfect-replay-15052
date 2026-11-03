import { describe, it, expect } from "vitest";
import { CHAT_MODE, CHAT_REMOVED_TOOLS, CHAT_SYSTEM, chatBranchContext, chatOverclaim, chatToolNames } from "@/lib/chat-mode";
import { masterPromptIds } from "@/lib/engine/prompts";

const MANIFEST = [
  "list_files", "read_file", "read_files", "search_files", "recent_changes",
  ...CHAT_REMOVED_TOOLS,
  "ask_user", "suggest_improvement", "update_spec", "save_memory", "recall_memory",
  "tool_search", "tool_invoke", "mcp_resources", "mcp_prompts",
];

describe("chat mode keeps the repository, drops the workspace", () => {
  it("keeps every read-only repository tool", () => {
    const kept = chatToolNames(MANIFEST);
    for (const t of ["list_files", "read_file", "read_files", "search_files", "recent_changes"]) {
      expect(kept).toContain(t);
    }
  });
  it("drops every write, shell, preview, deploy and helper tool", () => {
    const kept = chatToolNames(MANIFEST);
    for (const t of ["write_file", "write_files", "delete_file", "run_command", "run_checks", "delegate", "apply_proposals", "apply_migrations", "deploy_status", "preview_start", "request_secret"]) {
      expect(kept).not.toContain(t);
    }
    expect(kept.length).toBe(MANIFEST.length - CHAT_REMOVED_TOOLS.length);
  });
  it("chat constitution offers only read tools and never advertises an executor", () => {
    expect(CHAT_SYSTEM).toContain("read_files");
    expect(CHAT_SYSTEM).toContain("search_files");
    expect(CHAT_SYSTEM).toContain("recent_changes");
    for (const forbidden of ["run_command", "write_files", "delegate", "preview_start", "apply_migrations"]) {
      expect(CHAT_SYSTEM).not.toContain(forbidden);
    }
    expect(CHAT_MODE).toContain("presses Build");
  });
  it("injects the work-in-progress picture so reviews cover pending and committed work", () => {
    const note = chatBranchContext({
      base: "main", head: "agent/x", aheadBy: 2,
      commits: [{ sha: "abcdef1234567890", message: "Add checkout flow\n\nbody" }],
      files: [{ filename: "src/checkout.ts", status: "modified" }],
      staged: [{ path: "src/cart.ts", action: "write" }],
    });
    expect(note).toContain('base="main"');
    expect(note).toContain('commits_ahead="2"');
    expect(note).toContain("abcdef1 Add checkout flow");
    expect(note).toContain("modified src/checkout.ts");
    expect(note).toContain("write src/cart.ts");
    expect(note).not.toContain("body");
  });
  it("says none when the branch is untouched", () => {
    const note = chatBranchContext({ base: "main", head: "agent/x", aheadBy: 0, commits: [], files: [], staged: [] });
    expect(note).toContain("Commits: none ahead of the base branch.");
    expect(note).toContain("Uncommitted changes awaiting approval: none.");
  });
  it("catches a chat reply that claims it changed the repository", () => {
    expect(chatOverclaim("I've updated the header component.")).toBe(true);
    expect(chatOverclaim("I have deployed the site.")).toBe(true);
    expect(chatOverclaim("I've reviewed the repository and read the files.")).toBe(false);
    expect(chatOverclaim("The header uses a sticky container.")).toBe(false);
    expect(chatOverclaim("I'll read the file next.")).toBe(false);
  });
  it("chat prompt library carries review discipline but no coding templates", () => {
    const ids = masterPromptIds("chat");
    expect(ids).toContain("G_review");
    expect(ids).toContain("C_understanding");
    expect(ids).not.toContain("E_coding");
    expect(ids).not.toContain("H_tool");
    expect(masterPromptIds("build")).toContain("E_coding");
  });
});
