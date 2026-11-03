/**
 * Keeps a mobile tab alive while an agent run is streaming: a screen wake lock plus an
 * inaudible Web Audio loop (media-priority tabs are suspended far less aggressively).
 * Browser-only; call start/stop from effects or event handlers.
 */
type WakeLockLike = { release: () => Promise<void> };
let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let lock: WakeLockLike | null = null;
let active = false;

async function acquireLock() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> } }).wakeLock;
    if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
  } catch { /* unsupported or denied */ }
}

function onVisible() { if (active && document.visibilityState === "visible") { void acquireLock(); void ctx?.resume().catch(() => {}); } }

export function startKeepAlive() {
  if (typeof window === "undefined" || active) return;
  active = true;
  void acquireLock();
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // inaudible
      osc = ctx.createOscillator();
      osc.frequency.value = 20;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      void ctx.resume().catch(() => {});
    }
  } catch { /* audio unavailable */ }
  document.addEventListener("visibilitychange", onVisible);
}

export function stopKeepAlive() {
  if (typeof window === "undefined" || !active) return;
  active = false;
  document.removeEventListener("visibilitychange", onVisible);
  try { osc?.stop(); } catch { /* already stopped */ }
  void ctx?.close().catch(() => {});
  void lock?.release().catch(() => {});
  ctx = null; osc = null; lock = null;
}
