import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { sandboxSyncCommand } from "@/lib/sandbox-sync";

function probe(head: string, remote = "current") {
  const script = `git() {
    case "$*" in
      *ls-remote*) printf '${remote}\trefs/heads/agent/test\n';;
      'rev-parse HEAD') printf '${head}\n';;
      *fetch*) echo FETCH;;
      'reset -q --hard HEAD') echo RESET_HEAD;;
      'reset -q --hard FETCH_HEAD') echo RESET_FETCH;;
    esac
  }; ${sandboxSyncCommand("/tmp", "agent/test")}`;
  return spawnSync("bash", ["-c", script], { encoding: "utf8" });
}
describe("cloud branch synchronization", () => {
  it("skips fetching an unchanged branch but discards tracked shell edits", () => {
    const result = probe("current");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("RESET_HEAD");
  });
  it("fetches and resets a changed remote branch", () => {
    const result = probe("old");
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["FETCH", "RESET_FETCH"]);
  });
  it("fails closed when the remote reference is missing", () => {
    const result = probe("current", "");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});