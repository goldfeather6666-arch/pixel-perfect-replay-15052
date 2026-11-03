import { VAPID_PUBLIC_KEY, b64uDecode, b64uEncode } from "./web-push";
import { savePushSubscription } from "./push.functions";

/** Asks once for permission and registers this device for Forge alerts. Never throws. */
export async function enablePushAlerts(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return false;
    if (Notification.permission === "denied") return false;
    if (Notification.permission === "default" && (await Notification.requestPermission()) !== "granted") return false;
    const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/push/" }).catch(() => navigator.serviceWorker.register("/push-sw.js"));
    await navigator.serviceWorker.ready.catch(() => {});
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDecode(VAPID_PUBLIC_KEY) as BufferSource }));
    const j = sub.toJSON();
    const p256dh = j.keys?.p256dh ?? b64uEncode(new Uint8Array(sub.getKey("p256dh")!));
    const auth = j.keys?.auth ?? b64uEncode(new Uint8Array(sub.getKey("auth")!));
    await savePushSubscription({ data: { endpoint: sub.endpoint, p256dh, auth } });
    return true;
  } catch {
    return false;
  }
}
