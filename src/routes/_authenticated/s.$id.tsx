import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resumeForcePlan } from "@/lib/approval-resume";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getDeployments, syncDeployEnv } from "@/lib/integrations.functions";
import { autoFix } from "@/lib/connect.functions";
import { autoHealLabel } from "@/lib/preview-repair";
import { FileText, ImagePlus, Check, ChevronRight, ListChecks, Coins, History, Pencil, Save, FileCode, GitPullRequest, Loader2, Send, Square, Trash2, Wrench, X, MessageSquare, Activity, FolderTree, TerminalSquare, Rocket, GitCompare, Network, BookOpen, PanelRightClose, Globe, MoreHorizontal } from "lucide-react";
import { PreviewPanel } from "@/components/PreviewPanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { RunTimeline } from "@/components/RunTimeline";
import { StreamTimeline } from "@/components/StreamTimeline";
import { AUTONOMY, AUTONOMY_LABEL, asAutonomy, type Autonomy } from "@/lib/engine/autonomy";
import { supabase } from "@/integrations/supabase/client";
import { getRepoMemory, clearRepoMemory, stopSession, deleteSession, getDiff, getSession, getTree, openPullRequest, readFile, resolvePending, restoreCheckpoint, saveFile, updateSession } from "@/lib/app.functions";
import type { AgentEvent, ChatMessage, PendingChange, ToolLog } from "@/lib/providers";
import { pageMeta } from "@/lib/page-meta";
import { McpActionApprovals } from "@/components/McpActionApprovals";
import { TerminalDeck } from "@/components/TerminalDeck";
import { DeployPanel } from "@/components/DeployPanel";
import { ModelSwitcher } from "@/components/ModelSwitcher";
import { SwarmMatrix } from "@/components/SwarmMatrix";
import { KnowledgeDirector } from "@/components/KnowledgeDirector";
import { FileWorkbench } from "@/components/FileWorkbench";
import { applyHunks, diffFile, groupByIntent, type Hunk } from "@/lib/diff-engine";
import { MAX_PROMPT_CHARS, promptCapacity, promptError } from "@/lib/agent-request";
import { STALE_MS, taskRunStatus } from "@/lib/task-run-status";
import { ATTACH_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, attachmentType } from "@/lib/agent-request";
import { SharedFiles } from "@/components/SharedFiles";
import { DatabaseApproval } from "@/components/DatabaseApproval";
import { TaskInteractions } from "@/components/TaskInteractions";
import { createAgentEventDecoder } from "@/lib/agent-stream";
import { PromptAssistance } from "@/components/PromptAssistance";
import { MentionPicker } from "@/components/MentionPicker";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { CopyTextButton } from "@/components/CopyTextButton";
import { ReplyFeedback } from "@/components/ReplyFeedback";
import { FileProvenance } from "@/components/FileProvenance";
import { BugAutopsy } from "@/components/BugAutopsy";
import { MaintenancePanel } from "@/components/MaintenancePanel";
import { ReviewPanel, SharePanel } from "@/components/ReviewShare";
import { VerificationHistory } from "@/components/VerificationHistory";
import { RunEvidence } from "@/components/RunEvidence";
import { RESUME_MESSAGE } from "@/lib/run-resume";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import forgeMark from "@/assets/forge-mark.png";

export const Route = createFileRoute("/_authenticated/s/$id")({
  head: () => ({ meta: pageMeta("Task — Forge", "Review your coding agent's conversation, files and proposed changes.") }),
  component: Workspace,
});

type PanelKey = "timeline" | "preview" | "chat" | "swarm" | "run" | "knowledge" | "changes" | "deploy" | "terminal" | "files";
// Studio layout: the canvas shows the product (preview, code, changes); power tools live in a
// collapsible drawer beneath it; going live lives behind the header Publish button.
const MAIN = [["preview", "Preview", Globe], ["files", "Code", FolderTree], ["changes", "Changes", GitCompare]] as const;
const MORE = [
  ["terminal", "Terminal", TerminalSquare], ["swarm", "Agents", Network],
  ["run", "Activity", Activity], ["knowledge", "Knowledge", BookOpen],
] as const;

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setD(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

function Workspace() {
  const desktop = useIsDesktop();
  const [view, setView] = useState<PanelKey>("chat");
  const [right, setRight] = useState<PanelKey | null>("preview");
  const [moreOpen, setMoreOpen] = useState(false);
  const [tool, setTool] = useState<PanelKey | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [dockPct, setDockPct] = useState(46);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => setDockPct(Math.min(75, Math.max(25, ((window.innerWidth - ev.clientX) / window.innerWidth) * 100)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const fetchSession = useServerFn(getSession);
  const update = useServerFn(updateSession);
  const remove = useServerFn(deleteSession);
  const stop = useServerFn(stopSession);
  const deployNow = useServerFn(syncDeployEnv);
  const [deploying, setDeploying] = useState(false);
  // Background deploy healing: watch the build after Publish; on failure send only the real blockers/build errors (max 3 rounds).
  const [watchDeploy, setWatchDeploy] = useState<number | null>(null);
  const deployHealTries = useRef(0);
  const fetchDeploys = useServerFn(getDeployments);
  const runAutoFix = useServerFn(autoFix);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const session = useQuery({
    queryKey: ["session", id],
    queryFn: () => fetchSession({ data: { id } }),
    // While a run continues in the background (tab was closed/reopened), follow its saved progress.
    refetchInterval: running ? false : 3000,
    refetchIntervalInBackground: true,
    retry: (n) => n < 10,
    retryDelay: (n) => Math.min(10_000, 1000 * 2 ** n),
  });
  const sd = session.data;
  // The server beats every 30s while alive; no beat for 1 min means the run died (e.g. hosting cut it off).
  const [, force] = useState(0);
  useEffect(() => { if (!sd?.running || running) return; const t = setInterval(() => force((n) => n + 1), 5000); return () => clearInterval(t); }, [sd?.running, running]);
  // Keep the phone screen awake while a run streams: a sleeping phone drops the connection and the run is cut off.
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => { if (document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    get();
    const onVis = () => { get(); if (document.visibilityState === "visible") void qc.invalidateQueries({ queryKey: ["session", id] }); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); void lock?.release().catch(() => {}); };
  }, [running, qc, id]);
  // Cloud-kept runs: notify when the saved run flips from running to finished.
  const wasBgRunning = useRef(false);
  useEffect(() => {
    if (wasBgRunning.current && !sd?.running && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Forge", { body: "Your agent finished." });
    wasBgRunning.current = !!sd?.running;
  }, [sd?.running]);
  // Measure silence on this device's clock (time since the heartbeat last changed), never by
  // comparing the server timestamp with a possibly skewed phone clock.
  const seenBeat = useRef<{ at: string | null; local: number }>({ at: null, local: 0 });
  if (sd?.updated_at !== seenBeat.current.at) {
    const serverAge = sd?.updated_at ? Date.now() - new Date(sd.updated_at).getTime() : 0;
    // A run the server already marked dead (backdated past STALE_MS) is stale at once.
    seenBeat.current = { at: sd?.updated_at ?? null, local: serverAge > STALE_MS + 60_000 ? Date.now() - STALE_MS - 1 : Date.now() };
  }
  const stale = !!sd?.running && !!sd.updated_at && Date.now() - seenBeat.current.local > STALE_MS;
  const bgRunning = !running && !!sd?.running && !stale;
  const runStart = useRef<number>(0);
  const runPlan = useRef(false);
  const [images, setImages] = useState<{ mediaType: string; data: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  async function addImages(files: FileList | null) {
    for (const f of Array.from(files ?? []).slice(0, MAX_ATTACHMENTS - images.length)) {
      const type = attachmentType(f.name, f.type);
      if (!type || f.size > MAX_ATTACHMENT_BYTES) { toast.error(`${f.name}: use images, PDF, TXT, MD, CSV or JSON under 10 MB`); continue; }
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
      setImages((x) => [...x, { mediaType: type, data, name: f.name }]);
    }
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [input, setInput] = useState("");
  const [caret, setCaret] = useState(-1);
  useEffect(() => {
    const key = `forge:draft:${id}`;
    const saved = sessionStorage.getItem(key);
    if (saved) { setInput(saved); sessionStorage.removeItem(key); }
  }, [id]);
  // Preserve an in-progress mobile prompt across accidental reloads or app/browser exits.
  useEffect(() => {
    const key = `forge:draft:${id}`;
    try {
      if (input.trim()) sessionStorage.setItem(key, input);
      else sessionStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in private/restricted browser contexts; composing still works.
    }
  }, [id, input]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState<string | null>(null);
  const [streamInterrupted, setStreamInterrupted] = useState(false);
  const capacity = promptCapacity(input);
  const [chatMode, setChatMode] = useState<"chat" | "plan" | "build">("build");
  const planMode = chatMode === "plan";
  const setPlanMode = (v: boolean) => setChatMode(v ? "plan" : "build");
  const [usage, setUsage] = useState({ input: 0, output: 0 });
  const sendLockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const manualStopRef = useRef(false);
  const lastWasPlan = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (session.data && !running) {
      setMessages(session.data.messages ?? []);
      setPending(session.data.pending ?? []);
      setUsage(((session.data as { usage?: { input: number; output: number } }).usage) ?? { input: 0, output: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending.length]);
  useEffect(() => { taRef.current?.focus(); }, [running]);
  useEffect(() => { if (!running && !sd?.running) setStopping(false); }, [running, sd?.running]);
  // Keep the phone tab awake while the agent works so switching apps doesn't cut the connection.
  useEffect(() => {
    if (!(running || sd?.running)) return;
    let stop = () => {};
    void import("@/lib/background-keepalive").then((m) => { m.startKeepAlive(); stop = m.stopKeepAlive; });
    return () => stop();
  }, [running, sd?.running]);
  // Network comes back / app reopened / window refocused: resync saved progress right away.
  useEffect(() => {
    const resync = () => { if (document.visibilityState === "visible") void qc.invalidateQueries({ queryKey: ["session", id] }); };
    window.addEventListener("online", resync);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    document.addEventListener("visibilitychange", resync);
    const offline = () => toast.info("You're offline — the agent keeps working. Progress will sync when you're back.");
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", resync);
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("offline", offline);
    };
  }, [qc, id]);

  /** The server keeps running after a dropped stream; follow its saved progress instead of failing. */
  async function followIfStillRunning(): Promise<boolean> {
    if (manualStopRef.current) return false;
    for (let i = 0; i < 5; i++) {
      try {
        const fresh = await fetchSession({ data: { id } });
        if (fresh?.running) {
          qc.setQueryData(["session", id], fresh);
          toast.info("Connection dropped — the agent is still working. Following live progress.");
          return true;
        }
        return false;
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** i)));
      }
    }
    return false;
  }

  async function stopWork() {
    if (stopping) return;
    manualStopRef.current = true;
    setStopping(true);
    try {
      await stop({ data: { id } });
      abortRef.current?.abort();
      setRunning(false);
      await qc.invalidateQueries({ queryKey: ["session", id] });
    } catch (error) {
      setStopping(false);
      toast.error(`Could not stop: ${(error as Error).message}. Try again.`);
    }
  }

  // A run that goes quiet is first re-checked (refresh) and followed if still alive; only a truly dead run is
  // resumed, silently — no new chat message, the reply continues in the same bubble. At most 3 times per visit.
  const autoResumes = useRef(0);
  const resumedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!stale || running || stopping || manualStopRef.current || sd?.stop_requested || !sd?.updated_at) return;
    if (resumedFor.current === sd.updated_at || autoResumes.current >= 10) return;
    resumedFor.current = sd.updated_at;
    void (async () => {
      const fresh = await session.refetch().then((r) => r.data, () => null);
      const freshAt = (fresh as { updated_at?: string } | null)?.updated_at;
      if (fresh?.running && freshAt && freshAt !== sd.updated_at) return; // still alive: keep following
      if (fresh?.stop_requested || manualStopRef.current) return;
      autoResumes.current++;
      void send(RESUME_MESSAGE, undefined, undefined, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, running, stopping, sd?.updated_at]);


  async function send(override?: string, forcePlan?: boolean, publish?: boolean, silent = false) {
    let text = (override ?? input).trim();
    if (text && override === undefined && (running || bgRunning)) {
      // Live chat: the running agent reads this before its next step — no waiting, no queue.
      const sentText = text;
      setInput("");
      setMessages((ms) => { const last = ms.at(-1); return last?.role === "assistant" ? [...ms.slice(0, -1), { role: "user", content: sentText }, last] : [...ms, { role: "user", content: sentText }]; });
      const { error } = await supabase.from("session_interjections").insert({ session_id: id, content: sentText });
      if (error) { setInput(sentText); toast.error(`Message not delivered: ${error.message}`); }
      else if (images.length) toast.info("Attachments can only be sent with a new run; your text reached the agent.");
      return;
    }
    // State updates render asynchronously; this ref closes the same-tick double-submit race.
    if (!text || running || bgRunning || sendLockRef.current) return;
    manualStopRef.current = false;
    let plan = forcePlan ?? planMode;
    runStart.current = Date.now();
    const cmd = text.match(/^\/(\w+)\s*([\s\S]*)$/);
    if (cmd) {
      const [, name, rest] = cmd;
      if (name === "plan") { plan = true; text = rest || "Make a plan for the next step."; }
      else if (name === "publish") { publish = true; text = rest || "Publish the current version."; }
      else if (name === "test") text = `Run the project's tests/typecheck/build in the sandbox. Fix any failures and re-run until they pass. ${rest}`.trim();
      else if (name === "review") text = `Review the changes on this task branch versus the base branch for bugs, security issues and missing tests. Do not edit files; list findings by severity. ${rest}`.trim();
      else if (name === "explain") text = `Explain how this part of the codebase works, citing files: ${rest || "overall architecture"}`;
      else if (name === "help") { toast.info("Commands: /plan, /publish, /test, /review, /explain"); setInput(""); return; }
    }
    const validationError = promptError(text);
    if (validationError) { setSendError(validationError); return; }
    sendLockRef.current = true;
    setSendError(null);
    setStreamInterrupted(false);
    if (!silent) setWaitNote(null);
    const sentImages = images;
    let accepted = false;
    setInput("");
    setImages([]);
    void import("@/lib/push-client").then((m) => m.enablePushAlerts());
    setRunning(true);
    lastWasPlan.current = !publish && (plan || (forcePlan === undefined && chatMode !== "build"));
    if (silent) {
      setWaitNote("Reconnecting to the agent…");
      setMessages((m) => {
        const last = m.at(-1);
        if (last?.role !== "assistant") return [...m, { role: "assistant", content: "", tools: [] }];
        const cleaned = last.content.replace(/\n*(No signs of life detected\.[^\n]*|\S+ did not start replying within 4 minutes[^\n]*)\s*$/, "").trimEnd();
        return [...m.slice(0, -1), { ...last, content: cleaned ? `${cleaned}\n\n` : "" }];
      });
    } else
    setMessages((m) => [...m, { role: "user", content: sentImages.length ? `${text}\n\n📎 ${sentImages.map((im) => im.name).join(", ")}` : text }, { role: "assistant", content: "", tools: [] }]);
    const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((ms) => { const last = ms.at(-1); return last ? [...ms.slice(0, -1), fn(last)] : ms; });
    const ac = new AbortController();
    abortRef.current = ac;
    let backgrounded = false;
    try {
      const runMode = publish ? "build" : plan ? "plan" : forcePlan === false ? "build" : chatMode;
      // Chat replies stream straight back for an instant answer; plan/build runs go to a cloud keeper so
      // long work survives the phone sleeping (that keeper needs a fresh token and takes a few seconds to start).
      const direct = runMode === "chat";
      const current = (await supabase.auth.getSession()).data.session;
      const expiresSoon = !current?.expires_at || current.expires_at * 1000 - Date.now() < 50 * 60_000;
      const refreshed = !direct && expiresSoon ? await supabase.auth.refreshSession().catch(() => null) : null;
      const token = refreshed?.data.session?.access_token ?? current?.access_token;
      const body = JSON.stringify((runPlan.current = plan, { sessionId: id, message: text, plan, mode: runMode, publish: !!publish, images: sentImages.map(({ mediaType, data, name }) => ({ mediaType, data, name })) }));
      const bg = direct ? null : await fetch("/api/agent-background", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body, signal: ac.signal });
      if (bg && !bg.ok) throw new Error(await bg.text());
      if (bg && (await bg.json() as { mode?: string }).mode === "background") {
        accepted = true;
        backgrounded = true;
        if (!silent) toast.success("Running in the cloud — you can switch apps or lock your phone.");
        return;
      }
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body,
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      accepted = true;
      const reader = res.body.getReader();
      const decoder = createAgentEventDecoder();
      let receivedDoneEvent = false;
      let receivedErrorEvent = false;
      for (;;) {
        const { done, value } = await reader.read();
        const events = done ? decoder.finish() : decoder.push(value!);
        for (const e of events) {
          if (e.t === "wait") { setWaitNote(e.d); continue; }
          if (e.t === "text" || e.t === "tool" || e.t === "error" || e.t === "done") setWaitNote(null);
          if (e.t === "text") patchLast((m) => ({ ...m, content: m.content + e.d }));
          else if (e.t === "tool")
            patchLast((m) => ({
              ...m,
              content: "",
              tools: [
                ...(m.tools ?? []),
                ...(m.content.trim() ? [{ id: `note-${e.id}`, name: "note", input: {}, ok: true, summary: m.content.trim() }] : []),
                { id: e.id, name: e.name, input: e.input },
              ],
            }));
          else if (e.t === "tool-result")
            patchLast((m) => ({ ...m, tools: m.tools?.map((t) => (t.id === e.id ? { ...t, ok: e.ok, summary: e.summary } : t)) }));
          else if (e.t === "progress")
            patchLast((m) => ({ ...m, tools: m.tools?.map((t) => (t.id === e.id ? { ...t, summary: e.summary } : t)) }));
          else if (e.t === "pending") setPending([...e.pending]);
          else if (e.t === "usage") setUsage({ input: ((session.data as { usage?: { input: number } } | undefined)?.usage?.input ?? 0) + e.input, output: ((session.data as { usage?: { output: number } } | undefined)?.usage?.output ?? 0) + e.output });
          else if (e.t === "error") {
            receivedErrorEvent = true;
            setSendError(e.m);
            // The server reported a terminal run error even though the transport may close cleanly.
            // Offer the same safe continuation used for interrupted streams; never replay the prompt.
            setStreamInterrupted(true);
            patchLast((m) => ({ ...m, content: `${m.content}\n\n${e.m}` }));
            toast.error(e.m);
          }
          if (e.t === "done") receivedDoneEvent = true;
        }
        if (done) break;
      }
      // A clean EOF is not proof the agent finished: the API emits an explicit done event.
      if (!receivedDoneEvent && !receivedErrorEvent && !(await followIfStillRunning()) && !silent) {
        const detail = "The agent stream ended before completion was confirmed. Your saved progress is preserved; continue from the latest state.";
        setSendError(detail);
        setStreamInterrupted(true);
        toast.error("Agent connection ended before completion.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const detail = (err as Error).message;
        if (!accepted && silent) {
          // Invisible recovery: retry quietly on the next stale check instead of showing an error.
          setMessages((ms) => { const last = ms.at(-1); return last?.role === "assistant" && !last.content && !last.tools?.length ? ms.slice(0, -1) : ms; });
          setWaitNote(null);
          setTimeout(() => { resumedFor.current = null; void session.refetch(); }, 10_000);
        } else if (!accepted) {
          setSendError(detail);
          toast.error(detail);
          setInput(text);
          setImages(sentImages);
          setMessages((ms) => ms.slice(0, -2));
        } else if (!(await followIfStillRunning()) && !silent) {
          // Server-side actions may have completed before the stream disconnected.
          // Do not replay the original prompt automatically; offer a safe continuation.
          setSendError(detail);
          toast.error(detail);
          setStreamInterrupted(true);
        }
      }
    } finally {
      sendLockRef.current = false;
      setRunning(false);
      abortRef.current = null;
      if (!backgrounded && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Forge", { body: "Your agent finished." });
      qc.invalidateQueries({ queryKey: ["session", id] });
      qc.invalidateQueries({ queryKey: ["diff", id] });
      qc.invalidateQueries({ queryKey: ["tree", id] });
      qc.invalidateQueries({ queryKey: ["mcp-actions", id] });
    }
  }

  const s = session.data;
  // Auto-fix runs in publish mode: once the fix lands the agent deploys and verifies it (up to 3 repair rounds).
  const autoFixSend = (prompt: string) => { void send(prompt, false, true); };
  // Header Publish: starts the live build directly instead of asking the agent in chat.
  const publishNow = async () => {
    if (deploying) return;
    setDeploying(true);
    const t = toast.loading("Starting your live build…");
    try {
      const r = await deployNow({ data: { id, redeploy: true } });
      toast.success(r.redeployed ? "Deployment started — your site is rebuilding with the latest version" : "Settings synced", { id: t });
      if (r.redeployed) { deployHealTries.current = 0; setWatchDeploy(Date.now()); }
    } catch (e) {
      toast.error(`${(e as Error).message}. Finish setup in Publish.`, { id: t });
      setPublishOpen(true);
    } finally { setDeploying(false); }
  };
  const agentBusyNow = running || bgRunning;
  useEffect(() => {
    if (!watchDeploy || agentBusyNow) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - watchDeploy > 15 * 60_000) { setWatchDeploy(null); return; }
      try {
        const d = await fetchDeploys({ data: { id } });
        const latest = d.deployments[0];
        if (cancelled || !latest || latest.created < watchDeploy - 60_000) return;
        const failed = latest.state === "ERROR" || d.runtime?.state === "ERROR";
        if (latest.state === "READY" && d.runtime?.state !== "ERROR") { setWatchDeploy(null); return; }
        if (!failed) return;
        setWatchDeploy(null);
        if (deployHealTries.current >= 3) { toast.error("The live build still fails after 3 automatic fixes. Open Publish to see the remaining problem."); return; }
        deployHealTries.current += 1;
        const r = await runAutoFix({ data: { id } });
        if (r.prompt) autoFixSend(r.prompt);
      } catch { /* transient; next tick retries */ }
    }, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchDeploy, agentBusyNow, id]);
  const renderPanel = (k: PanelKey) => {
    if (!s) return null;
    switch (k) {
      case "swarm": return <SwarmMatrix messages={messages} usage={usage} model={s.model} running={running || bgRunning} />;
      case "timeline": return <StreamTimeline sessionId={id} running={running || bgRunning} />;
      case "run": return <RunTimeline sessionId={id} repo={s.repo} running={running || bgRunning} />;
      case "knowledge": return <KnowledgeDirector id={id} repo={s.repo} />;
      case "deploy": return <DeployPanel id={id} onSend={autoFixSend} />;
      case "preview": return <PreviewPanel id={id} agentBusy={running || bgRunning || stopping} onSend={async (prompt) => { await send(prompt, false); }} />;
      case "terminal": return <TerminalDeck id={id} />;
      case "files": return <FileWorkbench id={id} />;
      case "changes": return (
        <>
          <ChangesView id={id} pending={pending} onResolved={(rem) => { setPending(rem ?? []); qc.invalidateQueries({ queryKey: ["diff", id] }); qc.invalidateQueries({ queryKey: ["tree", id] }); }} />
          <ReviewPanel id={id} running={running || bgRunning} />
          <SharePanel id={id} />
          <MemoryView repo={s.repo} />
          <BugAutopsy id={id} onReplay={(text) => void send(text)} />
          <VerificationHistory id={id} running={running || bgRunning} />
          <RunEvidence id={id} running={running || bgRunning} />
          <MaintenancePanel id={id} running={running || bgRunning || stopping} onRequest={(text) => { if (!desktop) setView("chat"); void send(text); }} />
          <div className="px-3 pb-8">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
              if (!confirm("Delete this task from Forge? The GitHub branch and commits will remain untouched.")) return;
              try {
                await remove({ data: { id } });
                toast.success("Task deleted");
                nav({ to: "/app" });
              } catch (error) {
                toast.error("Could not delete task: " + (error as Error).message);
              }
            }}>
              <Trash2 /> Delete task (branch stays on GitHub)
            </Button>
          </div>
        </>
      );
      default: return null;
    }
  };
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader actions={s ? (
        <>
          <ModelSwitcher id={id} credentialId={s.credential_id} model={s.model} fallbackModel={s.fallback_model ?? null} profile={s.reasoning_profile ?? "auto"} codingModel={s.coding_model ?? null} reviewerModel={s.reviewer_model ?? null} codingCredentialId={s.coding_credential_id ?? null} reviewerCredentialId={s.reviewer_credential_id ?? null} disabled={running || bgRunning} />
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-full px-2.5 text-xs" aria-label="Open pull request" title="Open a pull request on GitHub" disabled={openingPr || running || bgRunning} onClick={async () => {
            setOpeningPr(true);
            try {
              const url = await openPr({ data: { id } });
              toast.success("Pull request opened");
              window.open(url, "_blank", "noopener");
            } catch (error) {
              toast.error("Could not open pull request: " + (error as Error).message);
            } finally { setOpeningPr(false); }
          }}>{openingPr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}<span className="hidden sm:inline">PR</span></Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 rounded-full px-3.5 text-xs" disabled={deploying} onClick={() => { void publishNow(); }}><Rocket className="h-3.5 w-3.5" /> {deploying ? "Deploying…" : "Publish"}</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full px-2 text-xs" aria-label="Publish settings" onClick={() => setPublishOpen(true)}>Setup</Button>
        </>
      ) : undefined}>
        {s && (
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className={`size-2 shrink-0 rounded-full ${running || bgRunning ? "animate-pulse bg-primary" : pending.length ? "bg-warning" : "bg-success"}`} role="status" aria-label={running || bgRunning ? "Working" : pending.length ? "Needs review" : "Idle"} />
            <span className="min-w-0 truncate" title={`${s.repo} · ${s.work_branch}`}>
              <span className="text-sm font-medium text-foreground">{s.title || s.repo.split("/").pop()}</span>
              <span className="hidden font-mono text-muted-foreground sm:inline"> · {s.work_branch}</span>
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 rounded-full px-2 text-xs text-muted-foreground" aria-label="Task settings"><Wrench className="h-3 w-3" /><span className="hidden xl:inline">{AUTONOMY_LABEL[asAutonomy(s.mode)].title}</span></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">How much the agent may do alone</p>
                {AUTONOMY.map((a) => (
                  <DropdownMenuItem key={a} onSelect={async () => {
                    if (a === asAutonomy(s.mode)) return;
                    try {
                      await update({ data: { id, mode: a as Autonomy } });
                      toast.success("Autonomy level updated");
                    } catch (error) {
                      toast.error("Could not update autonomy: " + (error as Error).message);
                    }
                    await qc.invalidateQueries({ queryKey: ["session", id] });
                  }} className="flex-col items-start gap-0.5">
                    <span className="flex w-full items-center gap-1.5 text-sm">{AUTONOMY_LABEL[a].title}{a === asAutonomy(s.mode) && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}</span>
                    <span className="text-xs text-muted-foreground">{AUTONOMY_LABEL[a].hint}</span>
                  </DropdownMenuItem>
                ))}
                {usage.input + usage.output > 0 && (
                  <p className="flex items-center gap-1.5 border-t px-2 py-2 font-mono text-xs text-muted-foreground"><Coins className="h-3 w-3" />{fmt(usage.input)} in / {fmt(usage.output)} out tokens</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </AppHeader>
      {!s && (
        <main className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center p-5">
          <section className="w-full rounded-xl border bg-card p-5 text-center">
            {session.isLoading ? (
              <><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" /><h1 className="font-semibold">Opening your workspace…</h1><p className="mt-1 text-sm text-muted-foreground">Loading the task, conversation and saved progress.</p></>
            ) : (
              <><h1 className="font-semibold">Could not open this task</h1><p role="alert" className="mt-2 break-words text-sm text-muted-foreground">{(session.error as Error | null)?.message ?? "This task may have been deleted or you may not have access."}</p><div className="mt-4 flex justify-center gap-2"><Button variant="outline" onClick={() => nav({ to: "/app" })}>Back to workspace</Button><Button onClick={() => session.refetch()} disabled={session.isFetching}>{session.isFetching ? <Loader2 className="animate-spin" /> : "Try again"}</Button></div></>
            )}
          </section>
        </main>
      )}
      <div className={`${!s ? "hidden " : ""}flex min-h-0 flex-1 bg-aurora`}
        onTouchStart={(e) => { if (desktop) return; const t = e.touches[0]!; swipe.current = { x: t.clientX, y: t.clientY }; }}
        onTouchEnd={(e) => {
          const st = swipe.current; swipe.current = null;
          if (desktop || !st) return;
          const t = e.changedTouches[0]!; const dx = t.clientX - st.x; const dy = t.clientY - st.y;
          if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          // Ignore swipes that start inside horizontally scrollable areas (code, tables, tab strips).
          if ((e.target as HTMLElement).closest("pre, table, [data-no-swipe], iframe, textarea")) return;
          const order: PanelKey[] = ["chat", ...MAIN.map((m) => m[0])];
          const i = Math.max(0, order.indexOf(view));
          const next = order[Math.min(order.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1)))]!;
          if (next !== view) setView(next);
        }}>
        <section className={`${!desktop && view !== "chat" ? "hidden" : "flex"} min-w-0 flex-1 flex-col`}>
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
              {messages.length === 0 && (
                <div className="py-10 text-center sm:py-16">
                  <img src={forgeMark} alt="Forge" width={64} height={64} className="mx-auto mb-4 size-16 object-contain" />
                  <h2 className="text-2xl font-semibold">Let’s make it happen.</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Work happens on <span className="font-mono text-foreground">{s?.work_branch}</span> — your base branch stays untouched.</p>
                  <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
                    {[
                      ["Map the codebase", "/explain overall architecture and key modules"],
                      ["Run & fix checks", "/test"],
                      ["Review for bugs", "/review"],
                      ["Plan a feature", "/plan "],
                    ].map(([t, p]) => (
                      <Button key={t} type="button" variant="outline" onClick={() => { setInput(p ?? ""); taRef.current?.focus(); }}
                        className="h-auto items-start justify-start whitespace-normal px-4 py-3 text-left text-sm shadow-none">
                        <span>
                        <span className="font-medium">{t}</span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{p}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                isRecoveryMessage(m) ? null : <MessageView key={i} sessionId={id} m={m} live={running && i === messages.length - 1} onOpenTimeline={() => (desktop ? setRight("timeline") : setView("timeline"))} />
              ))}
              <PendingApprovals id={id} pending={pending} onResolved={(rem) => { setPending(rem); void qc.invalidateQueries({ queryKey: ["session", id] }); void qc.invalidateQueries({ queryKey: ["diff", id] }); void qc.invalidateQueries({ queryKey: ["tree", id] }); }} />
              <McpActionApprovals sessionId={id} chat busy={running || bgRunning || stopping} onResume={(m) => void send(m, false)} />
              <DatabaseApproval id={id} busy={running || bgRunning || stopping} />
              <TaskInteractions sessionId={id} busy={running || bgRunning || stopping} onSend={(m) => send(m, resumeForcePlan(chatMode))} />
              {!running && messages.at(-1)?.role === "assistant" && lastWasPlan.current && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { lastWasPlan.current = false; setChatMode("build"); send("Approved — build what we discussed above now. Do not ask for confirmation again; implement it fully, then verify with tests and a preview.", false); }}><Check /> Build</Button>
                </div>
              )}
              <div ref={endRef} />
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="bg-gradient-to-t from-background via-background to-background/0 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 sm:px-4 sm:pb-4">
            {(running || bgRunning) && (
              <RunStatus
                start={running ? runStart.current : null}
                lastUpdate={running ? null : sd?.updated_at ?? null}
                steps={(messages.at(-1)?.role === "assistant" ? messages.at(-1)?.tools ?? [] : []).filter((t) => t.name !== "note" && t.ok !== undefined).length}
                limit={running && runPlan.current ? 20 : 50}
                background={bgRunning}
                cloud={taskRunStatus(sd ?? {}) === "cloud"}
                stopping={stopping}
                note={running ? waitNote : null}
                onStop={stopWork}
              />
            )}
            {sendError && <div role="alert" className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2 text-sm"><p className="min-w-0 flex-1 break-words text-destructive">{sendError}</p>{streamInterrupted && <Button type="button" size="sm" variant="outline" disabled={running || bgRunning} onClick={() => void send("The previous response stream disconnected. Inspect the current repository and task state, identify what was completed, then continue only unfinished work. Do not repeat completed actions.")}>Continue from saved progress</Button>}</div>}
            {images.length > 0 && (
              <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
                {images.map((im, i) => (
                  <span key={i} className="relative">
                    {im.mediaType.startsWith("image/")
                      ? <img src={`data:${im.mediaType};base64,${im.data}`} alt={im.name} className="h-14 w-14 rounded border object-cover" />
                      : <span className="flex h-14 max-w-40 items-center gap-1.5 rounded border bg-secondary px-2 text-xs"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{im.name}</span></span>}
                    <button type="button" aria-label={`Remove ${im.name}`} className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5" onClick={() => setImages((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <PromptAssistance key={id} sessionId={id} draft={input} onChange={setInput} disabled={stopping} />
            <MentionPicker sessionId={id} text={input} caret={caret} onPick={(t, c) => { setInput(t); setCaret(c); requestAnimationFrame(() => { taRef.current?.focus(); taRef.current?.setSelectionRange(c, c); }); }} />
            <PromptInput className="mx-auto max-w-3xl [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:bg-card [&_[data-slot=input-group]]:shadow-[var(--workspace-shadow)]" onSubmit={() => { void send(); }}>
              <PromptInputTextarea
                ref={taRef}
                aria-label="Task prompt"
                aria-describedby="prompt-capacity"
                aria-invalid={capacity.overLimit}
                value={input}
                onChange={(e) => { setInput(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                                placeholder={chatMode === "chat" ? "Ask anything — no changes will be made" : planMode ? "Describe the task — the agent will plan first" : "e.g. Add a dark-mode toggle to the header"}
                className="max-h-48 min-h-14 px-4 pt-3.5 text-base leading-relaxed md:text-sm"
                rows={2}
                submitOnEnter={false}
              />
              <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              <PromptInputFooter className="gap-1 px-2.5 pb-2.5">
                <Button type="button" size="icon" variant="ghost" className="size-8 rounded-full text-muted-foreground" aria-label="Attach image or document" title="Attach image or document" disabled={images.length >= MAX_ATTACHMENTS} onClick={() => fileRef.current?.click()}><ImagePlus /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon" variant="ghost" className="size-8 rounded-full font-mono text-sm text-muted-foreground" aria-label="Quick commands" title="Quick commands">/</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {([["/test", "Run and fix checks"], ["/review", "Review for bugs"], ["/explain", "Explain the code"], ["/plan", "Plan before building"]] as const).map(([c, hint]) => (
                      <DropdownMenuItem key={c} onSelect={() => { setInput((v) => `${c} ${v.replace(/^\/\w+\s*/, "")}`); requestAnimationFrame(() => taRef.current?.focus()); }}>
                        <span className="font-mono text-xs">{c}</span><span className="ml-auto text-xs text-muted-foreground">{hint}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div role="radiogroup" aria-label="Agent mode" className="ml-1 flex shrink-0 rounded-full bg-secondary p-0.5">
                  {(["chat", "plan", "build"] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={chatMode === m} onClick={() => setChatMode(m)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition ${chatMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{m}</button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <PromptInputSubmit className="size-8 rounded-full" status="ready" aria-label={running || bgRunning ? "Send to agent now" : "Send"} disabled={!input.trim() || capacity.overLimit}><Send /></PromptInputSubmit>
                </div>
              </PromptInputFooter>
            </PromptInput>
            <div id="prompt-capacity" aria-live="polite" className={`mx-auto mt-1.5 flex max-w-3xl justify-end px-1 text-[11px] tabular-nums ${capacity.overLimit || capacity.nearLimit ? "text-destructive" : "text-muted-foreground/80"} ${capacity.used ? "" : "sr-only"}`}>
              {capacity.overLimit ? `${Math.abs(capacity.remaining).toLocaleString("en-US")} over limit — shorten before sending` : `${capacity.used.toLocaleString("en-US")} / ${MAX_PROMPT_CHARS.toLocaleString("en-US")} · ${capacity.remaining.toLocaleString("en-US")} left${capacity.nearLimit ? " — nearing limit" : ""}`}
            </div>
          </div>
        </section>
        {desktop && right && (
          <aside className="relative m-2 ml-0 flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-[var(--workspace-shadow)]" style={{ width: `${dockPct}%` }}>
            <div role="separator" aria-label="Resize panels" onPointerDown={startResize} className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize hover:bg-primary/30" />
            <div role="tablist" aria-label="Canvas" className="flex items-center gap-1 border-b px-2 py-1.5">
              <div className="flex rounded-full bg-muted p-0.5">
                {MAIN.map(([k, label, Icon]) => (
                  <button key={k} type="button" role="tab" aria-selected={right === k} onClick={() => setRight(k)} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${right === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon className="h-3.5 w-3.5" />{label}
                    {k === "changes" && pending.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{pending.length}</span>}
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Close canvas" onClick={() => setRight(null)} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"><PanelRightClose className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{renderPanel(right)}</div>
            <div className="border-t bg-card">
              <div role="tablist" aria-label="Power tools" className="flex items-center gap-1 overflow-x-auto px-2 py-1">
                {MORE.map(([k, label, Icon]) => (
                  <button key={k} type="button" role="tab" aria-selected={tool === k} onClick={() => setTool(tool === k ? null : k)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${tool === k ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon className="h-3.5 w-3.5" />{label}
                    {k === "swarm" && (running || bgRunning) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
                  </button>
                ))}
                {tool && <button type="button" aria-label="Close tools" onClick={() => setTool(null)} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
              </div>
              {tool && <div className="h-[42vh] overflow-hidden border-t">{renderPanel(tool)}</div>}
            </div>
          </aside>
        )}
        {desktop && !right && (
          <button type="button" onClick={() => setRight("preview")} className="flex w-10 shrink-0 flex-col items-center gap-2 border-l bg-card/30 py-3 text-xs text-muted-foreground hover:text-foreground" aria-label="Open canvas"><Globe className="h-4 w-4" /></button>
        )}
        {!desktop && view !== "chat" && <div className="min-h-0 flex-1 overflow-y-auto">{renderPanel(view)}</div>}
      </div>
      {!desktop && (
        <nav className="glass mx-2 mb-[calc(env(safe-area-inset-bottom)+0.4rem)] flex shrink-0 overflow-x-auto rounded-2xl border px-1 shadow-[var(--workspace-shadow)]" aria-label="Workspace panels">
          {([["chat", "Chat", MessageSquare] as const, ...MAIN]).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setView(k)} className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] transition-colors ${view === k ? "text-primary" : "text-muted-foreground"}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${view === k ? "bg-accent" : ""}`}><Icon className="h-[18px] w-[18px]" /></span>{label}
              {k === "chat" && (running || bgRunning) && <span className="absolute right-1/3 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
              {k === "changes" && pending.length > 0 && <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{pending.length}</span>}
            </button>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${MORE.some((m) => m[0] === view) ? "text-primary" : "text-muted-foreground"}`}>
            <MoreHorizontal className="h-5 w-5" />{MORE.find((m) => m[0] === view)?.[1] ?? "Tools"}
          </button>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <SheetHeader><SheetTitle>Power tools</SheetTitle></SheetHeader>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {MORE.map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => { setView(k); setMoreOpen(false); }} className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${view === k ? "border-primary text-primary" : "text-muted-foreground"}`}>
                    <Icon className="h-5 w-5" />{label}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      )}
      <Sheet open={publishOpen} onOpenChange={setPublishOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="space-y-3 border-b p-4">
            <div className="flex items-center gap-3 pr-8">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Rocket className="size-5" /></span>
              <div className="min-w-0">
                <SheetTitle className="text-base">Publish setup</SheetTitle>
                <p className="truncate text-xs text-muted-foreground">Database, website, domain and keys for this project</p>
              </div>
            </div>
            <Button className="h-10 w-full gap-2 rounded-xl" disabled={deploying} onClick={() => { setPublishOpen(false); void publishNow(); }}>
              {deploying ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} {deploying ? "Deploying…" : "Deploy now"}
            </Button>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{publishOpen && s && <DeployPanel id={id} onSend={(p) => { setPublishOpen(false); autoFixSend(p); }} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Recovery is automatic and invisible: hide internal resume prompts and stall notes from the transcript.
const RECOVERY_USER = /^(continue the previous command from saved progress|continue \(the previous run was cut off|Continue from the latest saved progress\.)/i;
const RECOVERY_NOTE = /\s*(No signs of life detected\.[^\n]*|\S+ did not start replying within 4 minutes[^\n]*)/g;
function isRecoveryMessage(m: ChatMessage) { return m.role === "user" && RECOVERY_USER.test(m.content.trim()); }

function MessageView({ m: raw, live, sessionId, onOpenTimeline }: { m: ChatMessage; live: boolean; sessionId: string; onOpenTimeline: () => void }) {
  const m = raw.role === "assistant" ? { ...raw, content: raw.content.replace(RECOVERY_NOTE, "").trimEnd() } : raw;
  const heal = m.role === "user" ? autoHealLabel(m.content) : null;
  if (heal)
    return <div className="flex justify-center"><span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1 text-xs text-muted-foreground"><Wrench className="size-3" />{heal}</span></div>;
  if (m.role === "user")
    return <Message from="user"><MessageContent className="whitespace-pre-wrap break-words group-[.is-user]:bg-secondary group-[.is-user]:text-secondary-foreground">{m.content}</MessageContent></Message>;
  return (
    <Message from="assistant" className="max-w-full space-y-2 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold"><img src={forgeMark} alt="" width={24} height={24} className="size-6 object-contain" />Forge</div>
      {!!m.tools?.length && <ActivityView tools={m.tools} live={live} onOpen={onOpenTimeline} />}
      {m.content && <MessageContent className="w-full"><MessageResponse isAnimating={live}>{m.content}</MessageResponse></MessageContent>}
      {!live && m.content.trim() && (
        <div className="-mt-1 flex items-center gap-1">
          <CopyTextButton text={m.content} label="Copy reply" />
          <ReplyFeedback taskId={sessionId} reply={m.content} />
        </div>
      )}
      <SharedFiles sessionId={sessionId} tools={m.tools ?? []} />
      {live && !m.content && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      {!live && !raw.content.trim() && !m.tools?.length && <p className="text-xs italic text-muted-foreground">No reply — the model didn't answer before this attempt ended (stopped, replaced by a newer message, or the model's service was too slow).</p>}
    </Message>
  );
}

// Lovable-style compact timeline card: the latest steps fade upward while live; clicking opens the Timeline page.
function ActivityView({ tools, live, onOpen }: { tools: ToolLog[]; live: boolean; onOpen: () => void }) {
  const steps = tools.filter((t) => t.name !== "note");
  const busy = live && steps.some((t) => t.ok === undefined);
  const failed = steps.filter((t) => t.ok === false).length;
  const recent = steps.slice(-3);
  const label = (t: ToolLog) => {
    const arg = (t.input as { path?: string; query?: string; command?: string }) ?? {};
    const what = arg.path ?? arg.query ?? arg.command ?? "";
    return `${t.name === "worker" ? "Helper" : t.name.replace(/_/g, " ")}${what ? ` · ${what}` : ""}`;
  };
  return (
    <button type="button" onClick={onOpen} className="group w-full rounded-xl border bg-card p-2.5 text-left text-xs transition-colors hover:border-primary/40">
      <div className="flex items-center gap-2">
        {busy ? <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
          : failed ? <X className="size-3.5 text-destructive" /> : <Check className="size-3.5 text-primary" />}
        <span className="font-medium">{busy ? "Working…" : `${steps.length} steps${failed ? ` · ${failed} failed` : ""}`}</span>
        <span className="ml-auto flex items-center gap-0.5 text-muted-foreground group-hover:text-primary">Timeline<ChevronRight className="size-3.5" /></span>
      </div>
      {busy && recent.length > 0 && (
        <ul className="mt-2 space-y-1 border-l pl-3">
          {recent.map((t, i) => (
            <li key={t.id} style={{ opacity: (i + 1) / recent.length }} className="truncate text-muted-foreground transition-opacity">
              {t.ok === undefined ? <Loader2 className="mr-1 inline size-3 animate-spin text-primary" /> : null}{label(t)}
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}

function FilesView({ id }: { id: string }) {
  const fetchTree = useServerFn(getTree);
  const fetchFile = useServerFn(readFile);
  const tree = useQuery({ queryKey: ["tree", id], queryFn: () => fetchTree({ data: { id } }) });
  const [path, setPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const file = useQuery({ queryKey: ["file", id, path], queryFn: () => fetchFile({ data: { id, path: path! } }), enabled: !!path });
  const save = useServerFn(saveFile);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [path]);
  const saveM = useMutation({
    mutationFn: () => save({ data: { id, path: path!, content: draft ?? "", message: `edit ${path}` } }),
    onSuccess: () => {
      toast.success("Committed to task branch");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["file", id, path] });
      qc.invalidateQueries({ queryKey: ["diff", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const files = tree.data?.filter((f) => f.toLowerCase().includes(filter.toLowerCase())) ?? [];
  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className={`flex min-h-0 flex-col border-r md:w-72 ${path ? "hidden md:flex" : "flex flex-1 md:flex-none"}`}>
        <input className="m-2 rounded-md border bg-background px-2 py-1.5 text-sm" placeholder="Filter files" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="min-h-0 flex-1 overflow-y-auto pb-4 font-mono text-xs">
          {tree.isLoading && <li className="px-3 text-muted-foreground">Loading…</li>}
          {tree.error && <li className="px-3 text-destructive">{(tree.error as Error).message}</li>}
          {files.slice(0, 1000).map((f) => (
            <li key={f}>
              <button onClick={() => setPath(f)} className={`flex w-full items-center gap-1.5 truncate px-3 py-1 text-left hover:bg-accent ${f === path ? "bg-accent text-primary" : ""}`}>
                <FileCode className="h-3 w-3 shrink-0" /> <span className="truncate">{f}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {path && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2 font-mono text-xs">
            <button className="md:hidden" onClick={() => setPath(null)}>← </button>
            <span className="flex-1 truncate">{path}</span>
            {draft === null ? (
              <Button size="sm" variant="ghost" disabled={typeof file.data !== "string"} onClick={() => setDraft(file.data ?? "")}><Pencil /> Edit</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button size="sm" disabled={saveM.isPending || draft === file.data} onClick={() => saveM.mutate()}><Save /> Commit</Button>
              </>
            )}
          </div>
          {draft !== null ? (
            <textarea
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget, a = t.selectionStart;
                  setDraft(draft.slice(0, a) + "  " + draft.slice(t.selectionEnd));
                  requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; });
                }
              }}
              className="min-h-0 flex-1 resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none"
            />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
              {file.isLoading ? "Loading…" : file.data ?? "(file not found)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function PendingApprovals({ id, pending, onResolved }: { id: string; pending: PendingChange[]; onResolved: (remaining: PendingChange[]) => void }) {
  const resolve = useServerFn(resolvePending);
  const resolveM = useMutation({
    mutationFn: (v: { approve: boolean; paths?: string[]; edits?: Record<string, string> | undefined; openPr?: boolean }) => resolve({ data: { id, ...v } }),
    onSuccess: (r) => {
      if ("prUrl" in r && r.prUrl) toast.success(`Committed ${r.committed.length} file(s) and opened a pull request`, { action: { label: "Open", onClick: () => window.open(r.prUrl as string, "_blank", "noopener") } });
      else toast.success(r.committed.length ? `Committed ${r.committed.length} file(s)` : "Discarded");
      onResolved(r.remaining as PendingChange[]); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!pending.length) return null;
  const acceptOne = (c: PendingChange, edited?: string) =>
    resolveM.mutate({ approve: true, paths: [c.path], edits: edited === undefined ? undefined : { [c.path]: edited } });
  return <section className="space-y-2" aria-label="File and data change approvals" aria-live="polite">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="flex-1 font-semibold">Changes awaiting approval · {pending.length}</h3>
      <Button size="sm" variant="outline" onClick={() => resolveM.mutate({ approve: false })} disabled={resolveM.isPending}><X /> Reject all</Button>
      <Button size="sm" onClick={() => resolveM.mutate({ approve: true })} disabled={resolveM.isPending}><Check /> Approve & commit</Button>
      <Button size="sm" variant="secondary" onClick={() => resolveM.mutate({ approve: true, openPr: true })} disabled={resolveM.isPending}><GitPullRequest /> Approve & open PR</Button>
    </div>
    {groupByIntent(pending.map((c) => ({ oldPath: c.path, newPath: c.path, isNew: c.original == null, isDeleted: c.action === "delete", isRename: false, hunks: [], additions: 0, deletions: 0 }))).map((g) => {
      const paths = g.files.map((f) => f.newPath);
      return (
        <div key={g.intent} className="overflow-hidden rounded-md border bg-card">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
            <span className="flex-1 truncate font-mono font-medium">{g.intent}</span>
            <span className="text-muted-foreground">{paths.length} file{paths.length === 1 ? "" : "s"}</span>
            {paths.length > 1 && <>
              <Button size="sm" variant="ghost" className="h-6 px-2" disabled={resolveM.isPending} onClick={() => resolveM.mutate({ approve: false, paths })} aria-label={`Reject all in ${g.intent}`}><X /></Button>
              <Button size="sm" variant="ghost" className="h-6 px-2" disabled={resolveM.isPending} onClick={() => resolveM.mutate({ approve: true, paths })} aria-label={`Accept all in ${g.intent}`}><Check /></Button>
            </>}
          </div>
          {pending.filter((c) => paths.includes(c.path)).map((c) => <PendingView key={c.path} id={id} c={c} busy={resolveM.isPending} onAccept={(edited) => acceptOne(c, edited)} onReject={() => resolveM.mutate({ approve: false, paths: [c.path] })} />)}
        </div>
      );
    })}
  </section>;
}

function ChangesView({ id, pending, onResolved }: { id: string; pending: PendingChange[]; onResolved: (remaining?: PendingChange[]) => void }) {
  const fetchDiff = useServerFn(getDiff);
  const pr = useServerFn(openPullRequest);
  const diff = useQuery({ queryKey: ["diff", id], queryFn: () => fetchDiff({ data: { id } }) });
  const restore = useServerFn(restoreCheckpoint);
  const restoreM = useMutation({
    mutationFn: (sha: string) => restore({ data: { id, sha } }),
    onSuccess: () => { toast.success("Branch restored"); onResolved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const prM = useMutation({
    mutationFn: () => pr({ data: { id } }),
    onSuccess: (url) => { toast.success("Pull request opened"); window.open(url, "_blank", "noopener"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-3">
      <McpActionApprovals sessionId={id} />
      <PendingApprovals id={id} pending={pending} onResolved={onResolved} />
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 font-semibold">Committed on branch</h3>
          <Button size="sm" variant="outline" disabled={!diff.data?.ahead_by || prM.isPending} onClick={() => prM.mutate()}><GitPullRequest /> Open pull request</Button>
        </div>
        {diff.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {diff.data && diff.data.commits.length > 0 && (
          <div className="mb-4 rounded-md border bg-card">
            <p className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold text-muted-foreground"><History className="h-3 w-3" /> Checkpoints</p>
            <ul className="divide-y text-xs">
              {[...diff.data.commits].reverse().map((c, i) => (
                <li key={c.sha} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="font-mono text-muted-foreground">{c.sha.slice(0, 7)}</span>
                  <span className="flex-1 truncate">{c.message.split("\n")[0]}</span>
                  {i > 0 && (
                    <Button size="sm" variant="ghost" disabled={restoreM.isPending}
                      onClick={() => confirm("Rewind the task branch to this point? Later commits are removed from the branch.") && restoreM.mutate(c.sha)}>
                      Restore
                    </Button>
                  )}
                </li>
              ))}
              <li className="flex items-center gap-2 px-3 py-1.5">
                <span className="font-mono text-muted-foreground">{diff.data.base_sha.slice(0, 7)}</span>
                <span className="flex-1 truncate text-muted-foreground">Start (base branch)</span>
                <Button size="sm" variant="ghost" disabled={restoreM.isPending}
                  onClick={() => confirm("Undo all of this task's commits?") && restoreM.mutate(diff.data!.base_sha)}>
                  Undo all
                </Button>
              </li>
            </ul>
          </div>
        )}
        {diff.data && diff.data.files.length === 0 && <p className="text-sm text-muted-foreground">No commits yet.</p>}
        <div className="space-y-3">
          {diff.data?.files.map((f) => <DiffFile key={f.filename} id={id} filename={f.filename} status={f.status} patch={f.patch} author={diff.data?.authorship?.[f.filename] ?? "unknown"} />)}
        </div>
      </section>
    </div>
  );
}

function DiffFile({ id, filename, status, patch, author }: { id: string; filename: string; status: string; patch: string; author?: "agent" | "human" | "unknown" }) {
  const [open, setOpen] = useState(true);
  const lines = patch.split("\n");
  const add = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const del = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2 font-mono text-xs">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="truncate"><span className="mr-2 rounded border px-1 py-px text-[10px] uppercase text-muted-foreground">{status}</span>{filename}</span>
        </button>
        <span className="shrink-0 tabular-nums"><span className="text-success">+{add}</span> <span className="text-destructive">−{del}</span></span>
        {author && author !== "unknown" && <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground" title={author === "agent" ? "Exact content recorded from the agent" : "Content differs from recorded agent writes"}>{author === "agent" ? "Agent" : "Human edited"}</span>}
        <FileProvenance id={id} path={filename} />
      </div>
      {open && <PatchView patch={patch} />}
    </div>
  );
}

function PatchView({ patch }: { patch: string }) {
  // Track old/new line numbers from hunk headers for a gutter.
  let o = 0, n = 0;
  const rows = patch.split("\n").map((l) => {
    const h = l.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
    if (h) { o = Number(h[1] ?? 0); n = Number(h[2] ?? 0); return { l, a: "", b: "", k: "h" }; }
    if (l.startsWith("+")) return { l, a: "", b: String(n++), k: "+" };
    if (l.startsWith("-")) return { l, a: String(o++), b: "", k: "-" };
    return { l, a: String(o++), b: String(n++), k: " " };
  });
  return (
    <pre className="max-h-[28rem] overflow-auto font-mono text-xs leading-5">
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)] ${r.k === "+" ? "bg-added" : r.k === "-" ? "bg-removed" : r.k === "h" ? "bg-muted/50 text-primary/80" : ""}`}>
          <span className="select-none border-r pr-1 text-right text-muted-foreground/60">{r.a}</span>
          <span className="select-none border-r pr-1 text-right text-muted-foreground/60">{r.b}</span>
          <span className="whitespace-pre px-3">{r.l || " "}</span>
        </div>
      ))}
    </pre>
  );
}

function HunkView({ hunk }: { hunk: Hunk }) {
  let o = hunk.oldStart, n = hunk.newStart;
  return (
    <pre className="max-h-72 overflow-auto font-mono text-xs leading-5">
      <div className="bg-muted/50 px-3 text-primary/80">@@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</div>
      {hunk.lines.map((l, i) => {
        const a = l.kind !== "add" ? String(o++) : "";
        const b = l.kind !== "del" ? String(n++) : "";
        return (
          <div key={i} className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)] ${l.kind === "add" ? "bg-added" : l.kind === "del" ? "bg-removed" : ""}`}>
            <span className="select-none border-r pr-1 text-right text-muted-foreground/60">{a}</span>
            <span className="select-none border-r pr-1 text-right text-muted-foreground/60">{b}</span>
            <span className="whitespace-pre px-3">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}{l.text || " "}</span>
          </div>
        );
      })}
    </pre>
  );
}

function PendingView({ id, c, busy, onAccept, onReject }: { id: string; c: PendingChange; busy: boolean; onAccept: (edited?: string) => void; onReject: () => void }) {
  const original = c.original ?? "";
  const target = c.action === "delete" ? "" : (c.content ?? "");
  const hunks = useMemo(() => diffFile(original, target), [original, target]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setRejected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const adds = hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === "add").length, 0);
  const dels = hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === "del").length, 0);
  const accept = () => {
    if (!rejected.size) return onAccept(); // whole file accepted as-is
    const chosen = hunks.map((h) => h.index).filter((i) => !rejected.has(i));
    onAccept(applyHunks(original, { hunks }, chosen));
  };
  return (
    <div className="border-b last:border-0">
      <div className="flex items-center gap-1 px-3 py-1.5 font-mono text-xs text-muted-foreground">
        <span className="flex-1 truncate">
          {c.action === "delete" ? "delete" : c.original == null ? "create" : "modify"} · {c.path}
          <span className="ml-2 tabular-nums"><span className="text-success">+{adds}</span> <span className="text-destructive">−{dels}</span></span>
          {rejected.size > 0 && <span className="ml-2 text-warning">{rejected.size} hunk(s) excluded</span>}
        </span>
        <FileProvenance id={id} path={c.path} />
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReject} aria-label={`Reject ${c.path}`}><X /></Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={accept} aria-label={`Accept ${c.path}`}><Check /></Button>
      </div>
      <div className="divide-y">
        {hunks.map((h) => (
          <div key={h.index} className="relative">
            <label className="absolute right-2 top-1.5 z-10 flex cursor-pointer items-center gap-1 rounded border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <input type="checkbox" className="accent-primary" checked={!rejected.has(h.index)} onChange={() => toggle(h.index)} aria-label={`Include change ${h.index + 1} in ${c.path}`} />
              {rejected.has(h.index) ? "excluded" : "included"}
            </label>
            <div className={rejected.has(h.index) ? "opacity-40" : ""}><HunkView hunk={h} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

function MemoryView({ repo }: { repo: string }) {
  const get = useServerFn(getRepoMemory);
  const clear = useServerFn(clearRepoMemory);
  const qc = useQueryClient();
  const mem = useQuery({ queryKey: ["memory", repo], queryFn: () => get({ data: { repo } }) });
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-auto max-w-3xl px-3 pb-4">
      <div className="rounded-md border bg-card">
        <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold" onClick={() => setOpen(!open)}>
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="flex-1">Repo memory</span>
          <span className="text-xs font-normal text-muted-foreground">{mem.data ? `saved ${new Date(mem.data.updated_at).toLocaleDateString()}` : "none yet"}</span>
        </button>
        {open && (
          <div className="border-t p-3">
            {mem.data ? (
              <>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{mem.data.notes}</pre>
                <Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={async () => { await clear({ data: { repo } }); qc.invalidateQueries({ queryKey: ["memory", repo] }); toast.success("Memory cleared"); }}><Trash2 /> Forget</Button>
              </>
            ) : <p className="text-xs text-muted-foreground">The agent saves notes about this repo after exploring it, so later tasks skip the full scan.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function mmss(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Real timings only: elapsed time, finished steps and their measured average. No invented ETA. */
function RunStatus({ start, lastUpdate, steps, limit, background, cloud, stopping, note, onStop }: { start: number | null; lastUpdate: string | null; steps: number; limit: number; background: boolean; cloud: boolean; stopping: boolean; note?: string | null; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const elapsed = start ? now - start : 0;
  const avg = start && steps > 0 ? elapsed / steps : 0;
  return (
    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2.5 rounded-full border bg-card py-1 pl-3 pr-1 text-xs text-muted-foreground shadow-sm">
      <span className="relative flex size-2 shrink-0"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
      <span className="min-w-0 flex-1 truncate" title={note ?? undefined}>
        {stopping ? "Stopping — saving progress" : note ? note : background
          ? `${cloud ? "Working in the cloud" : "Working"} · ${steps} steps · updated ${lastUpdate ? `${mmss(now - new Date(lastUpdate).getTime())} ago` : "just now"}`
          : `Working · ${mmss(elapsed)} · ${steps} step${steps === 1 ? "" : "s"}${avg > 0 ? ` · ≤${Math.ceil(((limit - steps) * avg) / 60000)} min left` : ""}`}
      </span>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 rounded-full px-2.5 text-xs" disabled={stopping} onClick={onStop} aria-label="Stop work"><Square className="h-3 w-3 fill-current" />{stopping ? "Stopping…" : "Stop"}</Button>
    </div>
  );
}
