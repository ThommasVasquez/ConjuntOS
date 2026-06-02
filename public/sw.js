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
  const options = {
    body: data.body || "Tienes una llamada entrante de citofonía.",
    icon: "/logo.png",
    badge: "/solo.svg",
    vibrate: [200, 100, 200, 100, 200, 100, 400],
    data: {
      url: data.data?.url || "/citofonia",
      callerName: data.data?.callerName,
      callerPeerId: data.data?.callerPeerId
    },
    actions: [
      { action: "answer", title: "Contestar" },
      { action: "close", title: "Ignorar" }
    ],
    tag: "citofonia-incoming-call",
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/citofonia";
  const action = event.action;

  if (action === "close") {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // 1. Intentar encontrar una pestaña de citofonía ya abierta
      for (let client of windowClients) {
        if (client.url.includes("/citofonia") && "focus" in client) {
          if (event.notification.data?.callerPeerId) {
            client.postMessage({ 
              type: "ANSWER_CALL", 
              callerPeerId: event.notification.data.callerPeerId,
              callerName: event.notification.data.callerName,
              redirectToCallPage: true
            });
          }
          return client.focus();
        }
      }

      // 2. Si no hay pestaña de citofonía, buscar cualquier pestaña de la aplicación abierta
      const selfUrl = new URL(self.registration.scope);
      for (let client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === selfUrl.origin && "focus" in client) {
          if (event.notification.data?.callerPeerId) {
            client.postMessage({ 
              type: "ANSWER_CALL", 
              callerPeerId: event.notification.data.callerPeerId,
              callerName: event.notification.data.callerName,
              redirectToCallPage: true
            });
          }
          return client.focus();
        }
      }
      
      // 3. Si no hay pestaña abierta, abrir una nueva
      if (clients.openWindow) {
        let targetUrl = urlToOpen;
        if (event.notification.data?.callerPeerId) {
          targetUrl = `${urlToOpen}?answerCall=true&callerPeerId=${encodeURIComponent(event.notification.data.callerPeerId)}&callerName=${encodeURIComponent(event.notification.data.callerName || "Portería")}`;
        }
        return clients.openWindow(targetUrl);
      }
    })
  );
});
