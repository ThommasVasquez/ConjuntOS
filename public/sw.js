// ─── ConjuntOS Service Worker ─────────────────────────────────────────────────
// Version: 1.4.0
// Background Web Push (app closed + screen locked) with sound, vibration and
// immediate activation across iOS PWA (APNs Web Push) and Android (FCM).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Returns an absolute URL anchored to this SW's origin, regardless of input. */
function sameOriginUrl(path) {
  const scope = new URL(self.registration.scope);
  try {
    const parsed = new URL(path || "/inicio", scope.origin);
    if (parsed.origin !== scope.origin) {
      return new URL("/inicio", scope.origin).href;
    }
    return parsed.href;
  } catch {
    return new URL("/inicio", scope.origin).href;
  }
}

// ─── Push Handler (fires even when the PWA is closed and screen is off) ───────
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: "ConjuntOS®",
        body: event.data.text(),
      };
    }
  }

  const payloadData = data.data || {};
  const room = payloadData.room;
  const callerName = payloadData.callerName;
  const isCall = Boolean(room);

  const title = data.title || (isCall ? "Llamada de Citofonía" : "ConjuntOS®");
  const body = data.body || (isCall ? "Tienes una llamada entrante de portería." : "Tienes una nueva notificación.");

  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    silent: false, // Force OS notification sound & vibration when screen is locked
    vibrate: isCall
      ? [300, 120, 300, 120, 300, 120, 500]
      : [220, 100, 220],
    tag: isCall
      ? "citofonia-incoming-call"
      : (payloadData.tag || `conjuntos-${Date.now()}`),
    renotify: true,
    requireInteraction: isCall || payloadData.tipo === "EMERGENCIA",
    timestamp: Date.now(),
    data: {
      url: payloadData.url || (isCall ? "/citofonia" : "/inicio"),
      room,
      callerName,
    },
  };

  if (isCall) {
    options.actions = [
      { action: "answer", title: "Contestar" },
      { action: "close", title: "Ignorar" },
    ];
  }

  event.waitUntil(
    (async () => {
      // If a tab is already open (foreground push), ring in-app immediately so the
      // user does not have to tap the notification to get the incoming-call HUD.
      if (isCall) {
        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
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

  const data = event.notification.data || {};
  const urlToOpen = data.url || "/inicio";
  const room = data.room;

  if (event.action === "close") {
    return;
  }

  const targetHref = room
    ? sameOriginUrl(
        `${urlToOpen}?answerCall=true&room=${encodeURIComponent(room)}&callerName=${encodeURIComponent(data.callerName || "Portería")}`
      )
    : sameOriginUrl(urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
      const selfUrl = new URL(self.registration.scope);

      // 1. Existing tab on /citofonia for calls
      if (room) {
        for (const client of windowClients) {
          if (client.url.includes("/citofonia") && "focus" in client) {
            client.postMessage({
              type: "ANSWER_CALL",
              room,
              callerName: data.callerName,
              redirectToCallPage: true,
            });
            return client.focus();
          }
        }
      }

      // 2. Any open tab on the same origin
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === selfUrl.origin && "focus" in client) {
          if (room) {
            client.postMessage({
              type: "ANSWER_CALL",
              room,
              callerName: data.callerName,
              redirectToCallPage: true,
            });
          } else if ("navigate" in client && clientUrl.pathname !== new URL(targetHref).pathname) {
            try {
              await client.navigate(targetHref);
            } catch {}
          }
          return client.focus();
        }
      }

      // 3. App was closed: open a new window at the destination
      if (clients.openWindow) {
        return clients.openWindow(targetHref);
      }
    })
  );
});
