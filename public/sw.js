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

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Intentar encontrar una pestaña de citofonía ya abierta
      for (let client of windowClients) {
        if (client.url.includes("/citofonia") && "focus" in client) {
          if (action === "answer" && event.notification.data?.callerPeerId) {
            client.postMessage({ 
              type: "ANSWER_CALL", 
              callerPeerId: event.notification.data.callerPeerId,
              callerName: event.notification.data.callerName
            });
          }
          return client.focus();
        }
      }
      
      // Si no hay pestaña abierta, abrir una nueva
      if (clients.openWindow) {
        let targetUrl = urlToOpen;
        if (action === "answer" && event.notification.data?.callerPeerId) {
          targetUrl = `${urlToOpen}?answerCall=true&callerPeerId=${encodeURIComponent(event.notification.data.callerPeerId)}&callerName=${encodeURIComponent(event.notification.data.callerName || "Portería")}`;
        } else if (event.notification.data?.callerPeerId) {
          targetUrl = `${urlToOpen}?incoming=true&callerPeerId=${encodeURIComponent(event.notification.data.callerPeerId)}&callerName=${encodeURIComponent(event.notification.data.callerName || "Portería")}`;
        }
        return clients.openWindow(targetUrl);
      }
    })
  );
});
