// Notification-only worker: shows Forge alerts. It never caches pages or intercepts requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "Forge", body: "Your agent has an update.", url: "/app" };
  try { if (event.data) msg = { ...msg, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body, icon: "/icon-192.png", badge: "/icon-192.png", tag: msg.tag, renotify: !!msg.tag, data: { url: msg.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
