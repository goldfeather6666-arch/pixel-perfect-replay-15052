import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileCode, Plug, Sparkles } from "lucide-react";
import { getTree, listSkills } from "@/lib/app.functions";
import { listMcpConnections } from "@/lib/mcp.functions";
import { freeSkillLibrary } from "@/lib/free-skills";
import { activeMention, insertMention, type MentionKind } from "@/lib/mentions";

type Option = { kind: MentionKind; value: string; hint?: string };
const ICON = { file: FileCode, skill: Sparkles, mcp: Plug } as const;
const LABEL = { file: "Files", skill: "Skills", mcp: "MCP tools" } as const;

/** Popover above the prompt: type @ to pin a file, skill or MCP connection into this message. */
export function MentionPicker({ sessionId, text, caret, onPick }: { sessionId: string; text: string; caret: number; onPick: (text: string, caret: number) => void }) {
  const at = activeMention(text, caret);
  const open = !!at;
  const fetchTree = useServerFn(getTree);
  const fetchSkills = useServerFn(listSkills);
  const fetchMcp = useServerFn(listMcpConnections);
  const tree = useQuery({ queryKey: ["tree", sessionId], queryFn: () => fetchTree({ data: { id: sessionId } }), enabled: open, staleTime: 60_000 });
  const skills = useQuery({ queryKey: ["skills"], queryFn: () => fetchSkills(), enabled: open, staleTime: 60_000 });
  const mcp = useQuery({ queryKey: ["mcp-connections"], queryFn: () => fetchMcp(), enabled: open, staleTime: 60_000 });
  if (!at) return null;

  const q = at.query.toLowerCase();
  const skillNames = [...new Set([...freeSkillLibrary.map((s) => s.name), ...(skills.data ?? []).filter((s) => s.enabled).map((s) => s.name)])];
  const all: Option[] = [
    ...skillNames.map((value) => ({ kind: "skill" as const, value })),
    ...(mcp.data?.items ?? []).filter((c) => c.enabled).map((c) => ({ kind: "mcp" as const, value: c.name.replace(/\s+/g, "-"), hint: c.url })),
    ...(tree.data ?? []).map((value) => ({ kind: "file" as const, value })),
  ];
  const matches = all.filter((o) => (!at.kind || o.kind === at.kind) && o.value.toLowerCase().includes(q));
  const groups = (["skill", "mcp", "file"] as const).map((k) => [k, matches.filter((o) => o.kind === k).slice(0, k === "file" ? 8 : 6)] as const).filter(([, list]) => list.length);
  const loading = tree.isLoading || skills.isLoading || mcp.isLoading;

  return (
    <div role="listbox" aria-label="Mention a file, skill or tool" className="mx-auto mb-2 max-h-72 max-w-3xl overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
      {!groups.length && <p className="px-3 py-2 text-sm text-muted-foreground">{loading ? "Loading…" : "No matches. Try @file:, @skill: or @mcp:"}</p>}
      {groups.map(([kind, list]) => {
        const Icon = ICON[kind];
        return (
          <div key={kind}>
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">{LABEL[kind]}</p>
            {list.map((o) => (
              <button key={`${o.kind}:${o.value}`} type="button" role="option" aria-selected={false}
                onMouseDown={(e) => { e.preventDefault(); const r = insertMention(text, at, caret, o.kind, o.value); onPick(r.text, r.caret); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-accent">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">{o.value}</span>
                {o.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
