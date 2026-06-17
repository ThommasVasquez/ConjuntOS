# EN-CONJUNTO — Web → React Native (Expo) Porting Review

> Executive summary and architectural decision record for porting the ConjuntOS resident app from Next.js (web) to a native iOS/Android app built with Expo.

## 1. What the app is

**ConjuntOS / EN-CONJUNTO** is a multi-tenant SaaS for residential complexes (copropiedades / condominiums) in Colombia. A single app serves many roles through one login: residents (PROPIETARIO, ARRENDATARIO), building staff (VIGILANTE, SUPERVISOR_VIGILANCIA, ENCARGADO_PARQUEADERO), governance (CONCEJO), and management (ADMINISTRADOR, SUPER_ADMIN). Role differentiation happens **after** login, server-side, off the user's `rol`.

It bundles the full life of a building into one product: financial statements and (simulated) online payments, common-area reservations, a LiveKit-powered virtual intercom (citofonía), digital visitor invitations, package reception at the gate, a PQRS service-ticket inbox, parking management with visitor-billing sessions, an announcements board, an internal marketplace and real-estate listings, an admin chat inbox, and a live HOA assembly (asamblea) module with voting, quorum and AI minutes. Realtime updates flow over a single authenticated WebSocket.

The frontend is already shaped like a phone: the web layout is hard-locked to a `max-w-[430px]` mobile column, which materially eases the native port.

## 2. The web stack (source)

- **Framework**: Next.js (App Router, `app/` directory) — note this repo runs a build of Next with breaking changes vs. stock; web-specific directives like `export const runtime='edge'` / `dynamic='force-dynamic'` appear in pages.
- **Language/UI**: React + TypeScript, Tailwind v4 with a custom "Liquid Glass" design system (`liquid-glass`, `liquid-glass-card`, ambient orbs, `text-glow`, `backdrop-blur`) defined via `@theme` tokens in `src/app/globals.css`.
- **Animation**: GSAP + `@gsap/react` (`useGSAP`, ScrollTrigger, Observer) across ~37 files.
- **State**: Zustand stores (`useAuth`, `useWsStore`) plus a couple of React Contexts (`CallContext`, `ThemeContext`, `ViewTransitionContext`). No TanStack Query — plain `fetch` + `useState` per screen.
- **Realtime**: browser `WebSocket` opened by `WebSocketProvider` after fetching a short-lived `/auth/ws-ticket`.
- **Voice/Video**: `livekit-client` + `@livekit/components-react` for citofonía calls and the asamblea video room.
- **Push**: Web Push (Service Worker `public/sw.js`, `PushManager.subscribe`, VAPID).
- **Icons/Toast/Image**: `lucide-react`, `sonner`, `next/image`, `next/font/google`.
- **Auth**: HttpOnly `ec_session` cookie (primary on web) **plus** a Bearer token returned in the login body; `src/middleware.ts` gates routes on the cookie.
- **Backend**: Rust API at `/api/v1/*`, RFC-7807 problem+json errors, multi-tenant by `conjunto_id`.

## 3. The target Expo stack

| Concern | Web | Target (Expo / RN) |
|---|---|---|
| Framework | Next.js App Router | **Expo** + **expo-router** (same file-based `app/` model) |
| Navigation | `next/navigation` | `expo-router` (`useRouter`, `usePathname`, `useLocalSearchParams`) |
| Styling | Tailwind v4 + custom CSS | **NativeWind v4** + **expo-blur** (see WEB_API_AUDIT.md) |
| Animation | GSAP | **react-native-reanimated** v3 (+ `react-native-gesture-handler`, optionally Moti) |
| Images | `next/image` | **expo-image** |
| Fonts | `next/font/google` | **expo-font** + `@expo-google-fonts/*` |
| Voice/Video | `livekit-client` | **@livekit/react-native** + **@livekit/react-native-webrtc** (dev client, not Expo Go) |
| Push | Web Push + Service Worker | **expo-notifications** (Expo Push / FCM + APNs) |
| Tones / TTS | Web Audio API / SpeechSynthesis | **expo-av/expo-audio** (bundled tone assets) / **expo-speech** |
| Toast | sonner | RN toast (e.g. **burnt** / **react-native-toast-message**) |
| Storage | localStorage / sessionStorage | **AsyncStorage** + **expo-secure-store** (token/PII) |
| Bottom sheets | fixed-position DOM overlays | **@gorhom/bottom-sheet** / RN `Modal` |
| Clipboard / Share | `navigator.clipboard` / `navigator.share` | **expo-clipboard** / **expo-sharing** (or RN `Share`) |
| Image compression / pickers | canvas + `<input type=file>` | **expo-image-manipulator** + **expo-image-picker** / **expo-document-picker** |
| Env / config | `process.env.NEXT_PUBLIC_*` | `EXPO_PUBLIC_*` / `expo-constants` `extra` |

## 4. Agreed scope

**Foundation (port first):** the low-coupling provider stack (Auth, WebSocket, Theme) and their underlying hooks (`useAuth`, `useWsStore`/`useWsSubscription`) and the API client; the AppShell skeleton; the role-driven BottomNav mapping; the shared `ProfileHeader` (notifications); RootLayout/AppLayout equivalents; and `notif-routing` + feature `flags` ported verbatim.

**Core resident flows (full implementation):**

| Flow | Route | Complexity |
|---|---|---|
| Login | `/login` | low |
| Inicio (role-aware home) | `/inicio` | high |
| Pagos (wallet) | `/pagos` | medium |
| Reservas (common areas) | `/reservas` | high |
| Citofonía (intercom) | `/citofonia` | high |
| Visitantes (digital invitations) | `/visitantes` | medium |
| PQRS (service tickets) | `/pqrs` | low |
| Paquetería (gate reception) | `/paqueteria` | medium |
| Perfil (super profile) | `/perfil` | high |

> Note: `/inicio` and `/citofonia` are scoped here because they are shared across roles and are the realtime backbone; the staff-facing branches of `/inicio` (Vigilante/Encargado/Concejo/Admin sub-views) port as part of that screen's `rol` switch.

**Admin / SuperAdmin / Vigilancia and remaining resident screens = stubs + roadmap.** These are inventoried and prioritized in ROADMAP.md (admin-mensajes, admin-novedades, admin-finanzas, superadmin, cartelera, clasificados, inmobiliaria, parqueadero, mapa-parqueadero, control-visitas, bitacora-parqueadero, admin-parqueadero, asamblea). The post-MVP work reuses the same foundation, stores, API client and `notif-routing`.

## 5. Key architectural decisions

1. **Auth: Bearer token + SecureStore, not the cookie.** Web relies on the HttpOnly `ec_session` cookie with `credentials:'include'`. React Native has no shared cookie jar and cross-site cookies are unreliable on native — this is also a known prod blocker (cross-origin auth cookie). Decision: the **Bearer token** returned in the login body becomes the **primary** credential. Persist it in **expo-secure-store**, rehydrate `setAuthToken()` on launch, and always send `Authorization: Bearer <token>`. The backend already returns the token and accepts it (cookie OR Bearer), so no breaking backend change is required for auth.

2. **Routing/navigation: expo-router.** Keep the file-based `app/` model. The `src/middleware.ts` cookie gate has no native equivalent — replicate it with an auth-state gate that routes unauthenticated users to a Login stack and authenticated users to the `(app)` tab group, with `/inicio` as post-login home. Preserve `safeCallback()` validation for deep-link redirects. Drop `router.refresh()` / `window.location.reload()` (re-fetch + navigation reset instead).

3. **Realtime: keep the single WebSocket.** Port `WebSocketProvider` nearly verbatim — only change is building the WS base URL from env/Constants (no `window.location.origin`) and keeping the `/auth/ws-ticket` → `wss://host/api/v1/ws?token=` flow with exponential backoff (3s→30s). The Zustand `useWsStore` + `useWsSubscription` hooks port unchanged.

4. **Voice/video: @livekit/react-native.** Replace `livekit-client` with `@livekit/react-native` + `@livekit/react-native-webrtc` and `registerGlobals()`/`AudioSession`. Requires a custom dev client (not Expo Go). The call flow (`POST /citofonia/call` → `{room,token,url}`; `GET /citofonia/token?room=` → `{token,url}`) and the IDLE/RINGING/OUTGOING/CONNECTED/FALLBACK state machine are portable; the hidden-`<div>` track attach, Web Audio tones, and Web Speech TTS are replaced (bundled tone assets via expo-av, expo-speech for the FALLBACK replies).

5. **Push: expo-notifications for native push.** Service Workers / Web Push / VAPID do not exist on native. Use **expo-notifications** + Expo Push (or FCM/APNs). This is **additive** to the backend: alongside the existing web-push VAPID sender, the backend must accept an Expo/native device token and send native pushes (see BACKEND_CONTRACT.md, native-push section). Citofonía background/killed-app delivery rides this native push carrying `{room, callerName}` and deep-links to `/citofonia` → `joinRoom(room)`; foreground delivery still uses the WS `citofonia/incoming_call` event.

6. **Styling: NativeWind v4 + expo-blur.** Keep `className` authoring across the ~51 styled files (mostly mechanical 1:1 utility translation). The Liquid Glass look (no `backdrop-filter`, no `inset` shadow on native) is encapsulated in one reusable `<LiquidGlass>` component built on `expo-blur` `<BlurView>` + an overlaid translucent-border View + platform shadow/elevation. Animated CSS utilities (halos, glows, `story-bg`) become Reanimated loops. `useColorScheme` (NativeWind) drives the theme toggle, persisted to AsyncStorage.

## 6. Cross-cutting porting notes

- **Money is a string/Decimal** (`monto`, `montoFinal`, `recaudoMes`) — `parseFloat` before arithmetic; client-side `totalDebt` is computed locally and not refetched after pay (preserve the optimistic update).
- **Payments are flagged OFF** (`NEXT_PUBLIC_PAYMENTS_ENABLED` → `EXPO_PUBLIC_PAYMENTS_ENABLED`, default off; `PAYMENTS_DISABLED_MSG`). Keep the gate; the PSE/Wompi flows are simulated.
- **Intl/Hermes**: `toLocaleString`/`toLocaleDateString('es-CO'/'es-ES')` need Intl enabled (recent Expo SDKs) or a date lib polyfill.
- **Spanish UI strings** are preserved verbatim (including un-accented copy like "Invitacion", "con exito").
- **DTO mismatches to reconcile during the port**: PQRS page reads `creadoEn` but `SolicitudDto` returns `createdAt`; paquetería/directorio pages consume a nested `unidad` shape that differs from the flat DTO in `types.ts`. Follow the runtime shape the screen renders, then align.
- **Known dead/stub behaviors to decide on**: citofonía "PROGRAMAR AHORA" add-visita is a stub today (wire to `POST /visitas`); several "Ver Todo"/"Filtrar" buttons are no-ops; `ContentActionModal` commerce flow and `CelebrationModal` confetti are mock/decorative.
