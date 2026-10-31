/** Probe remote HEAD first; always discard tracked shell edits before a check. */
export function sandboxSyncCommand(repoDir: string, branch: string): string {
  return `cd ${JSON.stringify(repoDir)} && remote=$(git -c http.extraHeader="$GH_AUTH" ls-remote --exit-code origin ${JSON.stringify(`refs/heads/${branch}`)} | cut -f1) && test -n "$remote" && { if test "$(git rev-parse HEAD)" != "$remote"; then git -c http.extraHeader="$GH_AUTH" fetch -q origin ${JSON.stringify(branch)} && git reset -q --hard FETCH_HEAD; else git reset -q --hard HEAD; fi; }`;
}