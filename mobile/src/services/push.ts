/**
 * Push notifications (native, Expo).
 *
 * Registers the device's Expo push token with the backend and wires the
 * foreground/response listeners that bridge an incoming citófono call into the
 * CallProvider ring/join flow (via useCall().answerFromPush).
 *
 * The web counterpart lives in CallContext (Web Push + service worker); on
 * native we use Expo's push service. The backend stores both kinds of
 * subscriptions in the same `push_subscriptions` table, keyed by platform.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";
import { getNotifTarget } from "@/lib/notif-routing";
import { useCall } from "@/providers/CallProvider";

/**
 * Show incoming notifications even while the app is in the foreground. A
 * citófono call must ring on screen the instant the push lands, so we surface
 * the banner + sound rather than silently queueing it in the tray.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** EAS project id (needed by getExpoPushTokenAsync on a dev/standalone build). */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

/** Stable-ish per-install device identifier sent alongside the push token. */
function getDeviceId(): string {
  return (
    Device.osInternalBuildId ??
    Constants.sessionId ??
    `${Device.modelName ?? "device"}-${Platform.OS}`
  );
}

/**
 * Pull the {room, callerName} payload out of a citófono notification. Returns
 * undefined when the push isn't a call (no `room`), so callers can ignore it.
 */
function extractCall(
  data: Record<string, unknown> | undefined,
): { room: string; callerName?: string } | undefined {
  if (!data) return undefined;
  const room = typeof data.room === "string" ? data.room : undefined;
  if (!room) return undefined;
  const callerName =
    typeof data.callerName === "string" ? data.callerName : undefined;
  return { room, callerName };
}

/**
 * Everything that is NOT a call: the push carries the same `{tipo, titulo,
 * huespedId}` shape as an in-app notification row, so a tap can be routed with
 * the very same map the header panel and the dashboard banner use
 * (`getNotifTarget`) — one place decides where a "paquete en portería" or a
 * "PQRS respondida" lands, per role.
 */
function extractNotif(
  data: Record<string, unknown> | undefined,
): { tipo?: string; titulo?: string; huespedId?: string | null } | undefined {
  if (!data) return undefined;
  const tipo = typeof data.tipo === "string" ? data.tipo : undefined;
  const titulo = typeof data.titulo === "string" ? data.titulo : undefined;
  const huespedId = typeof data.huespedId === "string" ? data.huespedId : null;
  if (!tipo && !titulo) return undefined;
  return { tipo, titulo, huespedId };
}

/**
 * Request permissions, mint an Expo push token, and register it with the
 * backend. Idempotent on the server (upserts by token). No-op off a physical
 * device — simulators/emulators can't receive push.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return;

  try {
    // Android needs a channel before tokens/notifications behave; make a
    // high-importance one so calls ring with sound + heads-up.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Notificaciones",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        // Android notification LED / accent — the brand teal accent
        // (--color-accent), not the retired pure-white palette value.
        lightColor: "#2dd4bf",
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = getProjectId();
    if (!projectId) {
      // Loud on purpose: this is the one push failure that looks like "the
      // backend never sends anything". Fix = `eas init` (writes
      // extra.eas.projectId) or set EAS_PROJECT_ID before the build.
      console.warn(
        "Push deshabilitado: falta extra.eas.projectId (corre `eas init` o define EAS_PROJECT_ID).",
      );
      return;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await api.post("/usuarios/me/push-subscriptions", {
      platform: "expo",
      token,
      deviceId: getDeviceId(),
    });
  } catch (err) {
    console.error("Error al registrar notificaciones push:", err);
  }
}

/**
 * Register push (once `ready` — i.e. the profile/user is loaded) and install
 * the received + response listeners that bridge a native citófono push into the
 * CallProvider ring/join flow. MUST be mounted under <CallProvider> (it calls
 * useCall). Re-registers the device token on every `ready` profile load, per
 * BACKEND_CONTRACT.md.
 */
export function usePushRegistration(ready: boolean): void {
  const { answerFromPush } = useCall();
  const rol = useAuth((s) => s.user?.rol);

  useEffect(() => {
    if (!ready) return;

    registerForPushNotifications();

    /**
     * A tapped notification: a call rings, anything else deep-links to the
     * screen that owns it. Without the second branch every non-call push was a
     * dead tap — the app opened on whatever screen it was last on.
     */
    const openFromPush = (
      content: Notifications.NotificationRequest["content"],
    ) => {
      const call = extractCall(content.data);
      if (call) {
        answerFromPush(call.room, call.callerName);
        return;
      }
      const notif = extractNotif(content.data);
      if (notif) router.push(getNotifTarget(notif, rol) as never);
    };

    // Foreground: a push arrives while the app is open. The WebSocket
    // `citofonia/incoming_call` event already rings the open app, so we DEFER
    // to that path here and intentionally do nothing — handling it again would
    // double-ring. Listener installed so the OS still shows the banner/sound.
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      /* no-op: the WS foreground path owns the in-app ring (see CallProvider). */
    });

    // Background/quit: the user taps the notification → ring the call, or open
    // the screen the notification is about (mirrors the web "ANSWER_CALL"
    // service-worker path plus the in-app panel's routing).
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => openFromPush(response.notification.request.content),
    );

    // Cold start: the app was launched BY the notification tap. The navigator is
    // still mounting at this point, so a push route has to wait a tick or it is
    // swallowed by the initial route render.
    const last = Notifications.getLastNotificationResponse();
    const coldContent = last?.notification.request.content;
    const coldTimer = coldContent
      ? setTimeout(() => openFromPush(coldContent), 400)
      : undefined;

    return () => {
      receivedSub.remove();
      responseSub.remove();
      if (coldTimer) clearTimeout(coldTimer);
    };
  }, [ready, answerFromPush, rol]);
}
