// ─── ConjuntOS Service Worker ─────────────────────────────────────────────────
// Version: 1.1.0
// Always builds absolute URLs using the SW's own scope to prevent cross-origin
// navigation errors when the app is accessed from preview/staging domains.

/** Returns an absolute URL anchored to this SW's origin, regardless of input. */
function sameOriginUrl(path) {
  const scope = new URL(self.registration.scope);
  // If path is already an absolute URL on a different origin, strip to path only
  try {
    const parsed = new URL(path, scope.origin);
    if (parsed.origin !== scope.origin) {
      // Fallback to citofonia on this origin
      return new URL("/citofonia", scope.origin).href;
    }
    return parsed.href;
  } catch {
    return new URL("/citofonia", scope.origin).href;
  }
}

// ─── Push Handler ─────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: "Llamada Entrante",
        body: event.data.text()
      };
    }
  }

  const title = data.title || "Llamada de Citofonía";
  const room = data.data?.room;
  const callerName = data.data?.callerName;
  const options = {
    body: data.body || "Tienes una llamada entrante de citofonía.",
    icon: "/logo.png",
    badge: "/solo.svg",
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    data: {
      // Store only the pathname — resolved to correct origin at click time
      url: data.data?.url || "/citofonia",
      room: room,
      callerName: callerName
    },
    actions: [
      { action: "answer", title: "Contestar" },
      { action: "close", title: "Ignorar" }
    ],
    tag: "citofonia-incoming-call",
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(
    (async () => {
      // If a tab is already open (foreground push), ring in-app immediately so the
      // user does not have to tap the notification to get the incoming-call HUD.
      if (room) {
        const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windowClients) {
          client.postMessage({ type: "INCOMING_CALL", room, callerName });
        }
      }
      await self.registration.showNotification(title, options);
    })()
  );
});

// ─── Notification Click Handler ───────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

<<<<<<< Updated upstream
  const data = event.notification.data || {};
  const urlToOpen = data.url || "/citofonia";
  const room = data.room;

  if (event.action === "close") {
    return;
=======
  const action = event.action;
  if (action === "close") return;

  // Always resolve the target URL against THIS SW's origin
  const targetPath = event.notification.data?.url || "/citofonia";
  const callerPeerId = event.notification.data?.callerPeerId;
  const callerName = event.notification.data?.callerName;

  let targetUrl = sameOriginUrl(targetPath);
  if (callerPeerId) {
    targetUrl += `?answerCall=true&callerPeerId=${encodeURIComponent(callerPeerId)}&callerName=${encodeURIComponent(callerName || "Portería")}`;
>>>>>>> Stashed changes
  }

  const scopeOrigin = new URL(self.registration.scope).origin;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
<<<<<<< Updated upstream
      // 1. Una pestaña de citofonía ya abierta
      for (let client of windowClients) {
        if (client.url.includes("/citofonia") && "focus" in client) {
          if (room) {
            client.postMessage({
              type: "ANSWER_CALL",
              room,
              callerName: data.callerName,
=======
      // 1. Prefer a citofonia tab that's already open on the SAME origin
      for (const client of windowClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          if (clientOrigin !== scopeOrigin) continue; // skip cross-origin tabs
        } catch { continue; }

        if (client.url.includes("/citofonia") && "focus" in client) {
          if (callerPeerId) {
            client.postMessage({
              type: "ANSWER_CALL",
              callerPeerId,
              callerName,
>>>>>>> Stashed changes
              redirectToCallPage: true
            });
          }
          return client.focus();
        }
      }

<<<<<<< Updated upstream
      // 2. Cualquier pestaña de la aplicación abierta
      const selfUrl = new URL(self.registration.scope);
      for (let client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === selfUrl.origin && "focus" in client) {
          if (room) {
            client.postMessage({
              type: "ANSWER_CALL",
              room,
              callerName: data.callerName,
=======
      // 2. Fall back to any app tab on the same origin
      for (const client of windowClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          if (clientOrigin !== scopeOrigin) continue;
        } catch { continue; }

        if ("focus" in client) {
          if (callerPeerId) {
            client.postMessage({
              type: "ANSWER_CALL",
              callerPeerId,
              callerName,
>>>>>>> Stashed changes
              redirectToCallPage: true
            });
          }
          return client.focus();
        }
      }

<<<<<<< Updated upstream
      // 3. Sin pestaña abierta: abrir una nueva con los datos de la sala
      if (clients.openWindow) {
        let targetUrl = urlToOpen;
        if (room) {
          targetUrl = `${urlToOpen}?answerCall=true&room=${encodeURIComponent(room)}&callerName=${encodeURIComponent(data.callerName || "Portería")}`;
        }
=======
      // 3. No app tab open — open a new window (same-origin URL guaranteed)
      if (clients.openWindow) {
>>>>>>> Stashed changes
        return clients.openWindow(targetUrl);
      }
    })
  );
});
