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

import { api } from "@/lib/api/client";
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
        lightColor: "#FFFFFF",
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
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

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

  useEffect(() => {
    if (!ready) return;

    registerForPushNotifications();

    // Foreground: a push arrives while the app is open. The WebSocket
    // `citofonia/incoming_call` event already rings the open app, so we DEFER
    // to that path here and intentionally do nothing — handling it again would
    // double-ring. Listener installed so the OS still shows the banner/sound.
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      /* no-op: the WS foreground path owns the in-app ring (see CallProvider). */
    });

    // Background/quit: the user taps the notification → ring + deep-link so they
    // can answer the call (mirrors the web "ANSWER_CALL" service-worker path).
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const call = extractCall(response.notification.request.content.data);
        if (call) answerFromPush(call.room, call.callerName);
      },
    );

    // Cold start: the app was launched by tapping the call notification.
    const last = Notifications.getLastNotificationResponse();
    const coldCall = extractCall(last?.notification.request.content.data);
    if (coldCall) answerFromPush(coldCall.room, coldCall.callerName);

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [ready, answerFromPush]);
}
