# ConjuntOS — EN-CONJUNTO mobile app

Native iOS/Android client for **EN-CONJUNTO**, the residential-community
("conjunto residencial") management platform. This is the React Native /
Expo port of the existing Next.js web app, talking to the same Rust backend.

It covers the day-to-day flows for residents and building staff: the home
dashboard, citófono (intercom) video calls, administration charges/payments,
amenity reservations, visitor and parcel logging, PQRS (requests/complaints),
and the user profile — all behind a role-based bottom tab bar.

> **Read the versioned Expo docs first.** This project targets Expo SDK 56 /
> React Native 0.85, which has breaking changes vs. older SDKs (e.g. `Tabs`
> now imports from `expo-router/js-tabs`, `expo-av` is deprecated). See
> `AGENTS.md` and https://docs.expo.dev/versions/v56.0.0/ before editing code.

---

## Stack

- **Expo SDK ~56** with the **New Architecture** enabled (`newArchEnabled: true`)
  and the React Compiler experiment on.
- **React 19.2 / React Native 0.85**.
- **expo-router ~56** — file-based routing (`app/` directory). Typed routes are
  intentionally **disabled** (routes land incrementally; typed routes would fail
  to compile against not-yet-created paths).
- **NativeWind 4** (Tailwind for RN) + a custom liquid-glass UI kit
  (`src/components/ui/`). Tokens in `src/theme/tokens.ts`.
- **Zustand** for auth/session state (`src/hooks/useAuth.ts`).
- **LiveKit** (`@livekit/react-native` + `@livekit/react-native-webrtc`) for
  citófono video calls.
- **expo-notifications** for native push (incoming-call ringing + deep links).
- **expo-av** for call tones, **@gorhom/bottom-sheet**, **react-native-gesture-handler**,
  **react-native-reanimated**, **lucide-react-native** icons, **react-native-toast-message**.

## Project layout

```
app/
  _layout.tsx          Root layout: provider stack + splash gating + Stack(index, login, (app))
  index.tsx            Entry redirect → /(app)/inicio or /login based on session
  login.tsx            Login screen (live)
  (app)/
    _layout.tsx        Role-based Tabs + custom FloatingTabBar; redirects to /login if no session
    inicio.tsx, citofonia.tsx, pagos.tsx, reservas.tsx, visitantes.tsx,
    pqrs.tsx, paqueteria.tsx, perfil.tsx   ← live screens
    ...20 more route files                  ← stubbed (see "Screen status")
src/
  components/ui/        Button, Input, GlassCard, LiquidGlass, Screen, Sheet, toast
  components/shell/     ProfileHeader
  hooks/                useAuth (zustand session), useWebSocket
  providers/            ThemeProvider, WebSocketProvider, CallProvider
  services/             push.ts (Expo push registration + call deep-linking)
  lib/                  config.ts, flags.ts, notif-routing.ts, api/{client,types}
  theme/                tokens.ts
assets/
  images/               icons + splash
  sounds/               call tones (placeholder silent stubs — see Follow-ups)
```

The root layout mounts this provider stack:

```
GestureHandlerRootView
 └ SafeAreaProvider
    └ ThemeProvider
       └ BottomSheetModalProvider
          └ AuthGate            (runs useAuth.bootstrap(): persisted token → GET /auth/me)
             └ WebSocketProvider
                └ CallProvider  (citófono ring/join; requires the call-tone assets)
   (+ <Toast /> host mounted as a sibling)
```

The native splash is held until both fonts and the auth session resolve, so
the app never flashes an unauthenticated frame.

---

## Prerequisites

- Node 20+ and **pnpm** (this repo uses pnpm; do not use npm/yarn).
- Xcode (iOS) and/or Android Studio + SDK for building a dev client.
- A reachable EN-CONJUNTO backend (local or the VPS).

## Setup

1. **Install dependencies** (run from `mobile/`):

   ```bash
   pnpm install
   ```

2. **`.npmrc` / hoisting.** This package ships an `.npmrc` with:

   ```
   node-linker=hoisted
   ```

   Keep it. Expo/React Native tooling (Metro, autolinking, config plugins)
   expects a flat, hoisted `node_modules` layout; pnpm's default symlinked store
   breaks native module resolution. Do not remove this line.

3. **Environment.** Copy `.env.example` to `.env` and fill in the values. Expo
   inlines any `EXPO_PUBLIC_*` var at build time.

   | Var | Required | Purpose |
   |-----|----------|---------|
   | `EXPO_PUBLIC_API_URL` | yes | Base URL of the backend API, **no** trailing slash and **no** `/api/v1` (e.g. `https://api.conjuntos.app`). The WebSocket base is derived from it by swapping `http`→`ws`. Defaults to `https://api.conjuntos.app` if unset. |
   | `EXPO_PUBLIC_PAYMENTS_ENABLED` | no | `"true"` / `"false"`. Gates online-payment flows. **Off by default** — there is no real gateway wired yet. |
   | `EXPO_PUBLIC_VAPID_PUBLIC_KEY` | no | Web-only VAPID key for web push; unused on native. |

---

## Running the app

### You need a custom dev client — NOT Expo Go

Citófono calls (**LiveKit / WebRTC**), **push notifications**, audio
(`expo-av`), gesture-handler, bottom-sheet, and `lucide-react-native` all rely
on native modules that **Expo Go does not bundle**. In Expo Go those features
crash or no-op. Build and run a **custom development client**:

```bash
# 1. Generate the native iOS/Android projects from app.config.js
pnpm dlx expo prebuild

# 2a. Build + install + launch the dev client on a simulator/emulator or device
pnpm dlx expo run:ios
# or
pnpm dlx expo run:android
```

Or build the dev client in the cloud with **EAS** (`pnpm dlx eas build --profile development --platform ios|android`), install it, then start the JS bundler:

```bash
pnpm start          # expo start — connects to the installed dev client
```

> **Push and calls require a physical device.** Simulators/emulators cannot
> receive Expo push tokens, so incoming-call notifications won't ring there
> (`registerForPushNotifications` no-ops off a real device).

The `pnpm ios` / `pnpm android` / `pnpm web` scripts run `expo start` with a
platform flag — convenient once a dev client is installed, but they do **not**
build the native client for you; use `expo run:*` or EAS for that.

### Typecheck

```bash
pnpm typecheck      # tsc --noEmit (strict mode)
```

This is the project's verification gate and currently passes clean. Run it
before pushing. (`pnpm lint` runs `expo lint`.)

---

## Role-based tabs

The bottom tab bar (`app/(app)/_layout.tsx`) is a custom floating liquid-glass
pill whose contents depend on the signed-in user's role, mirroring the web
`BottomNav`. Every `(app)` route is registered with `<Tabs.Screen>`; routes not
in the active role's tab set are hidden from the bar (`href: null`) but stay
navigable.

| Role | Tabs |
|------|------|
| RESIDENTE (default) | Inicio, Citofonía, Reservas, Cartelera, Perfil |
| VIGILANTE / SUPERVISOR_VIGILANCIA | Caseta (inicio), Visitas (control-visitas), Paquetes (paquetería), Perfil |
| ENCARGADO_PARQUEADERO | Control (inicio), Mapa (mapa-parqueadero), Perfil |
| ADMINISTRADOR / SUPER_ADMIN / CONCEJO | Panel (inicio), Mensajes (admin-mensajes), Novedades (admin-novedades), Finanzas (admin-finanzas), Perfil |

> Note: some destinations a role's tab bar links to are still **stubs** (see
> below) — e.g. `control-visitas`, `mapa-parqueadero`, `admin-*`, `cartelera`.
> The tab is present and navigable; the screen shows a "Próximamente" placeholder.

## Screen status

**Live (9 core screens):**

- `login`
- `inicio` (home dashboard)
- `citofonia` (LiveKit intercom calls)
- `pagos` (administration charges/payments — gated by `PAYMENTS_ENABLED`)
- `reservas` (amenity reservations)
- `visitantes` (visitor registration/log)
- `pqrs` (requests/complaints)
- `paqueteria` (parcel log)
- `perfil` (user profile)

**Stubbed (20 routes, placeholders only):** `cartelera`, `clasificados`,
`inmobiliaria`, `asamblea`, `asambleas`, `votaciones`, `documentos`,
`correspondencia`, `mascotas`, `vehiculos`, `amenidades`, `control-visitas`,
`parqueadero`, `mapa-parqueadero`, `bitacora-parqueadero`, `admin-mensajes`,
`admin-novedades`, `admin-finanzas`, `admin-parqueadero`, `superadmin`. Most
render a "Próximamente" glass card; a few are empty placeholders. See
`docs/mobile-port/ROADMAP.md` for the build plan and
`docs/mobile-port/SCREEN_SPECS.md` for specs.

---

## Notes

- After changing code, refresh the AST graph: `graphify update .` (from `mobile/`).
- See `docs/mobile-port/BACKEND_CONTRACT.md` and `WEB_API_AUDIT.md` for the API surface.
