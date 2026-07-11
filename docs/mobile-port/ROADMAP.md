# Post-MVP Roadmap & Shared-Component Foundation

This file covers (A) the shared-component foundation that must be ported first to unblock everything, and (B) the prioritized post-MVP inventory of the non-core screens (admin / superadmin / vigilancia / remaining resident screens) that ship as stubs + roadmap after the core resident flows.

---

## A. Shared-component foundation (port FIRST)

The MVP and every roadmap screen sit on the same foundation. Port this set before (or alongside) the core resident flows.

### Provider stack (exact nesting, `src/components/Providers.tsx`)

```
AuthProvider > WebSocketProvider > ThemeProvider > CallProvider > ViewTransitionProvider > children
```

| Provider | Role | RN port priority |
|---|---|---|
| **AuthProvider** (`providers/AuthProvider.tsx`) | On-mount `useAuth().checkAuth()` → `GET /auth/me`. Thin wrapper over the `useAuth` Zustand store. Logic portable; only the cookie/Bearer transport changes (SecureStore token + `Authorization` header). | **foundation** |
| **WebSocketProvider** (`providers/WebSocketProvider.tsx`) | Fetches `/auth/ws-ticket`, connects `/api/v1/ws?token=`, exponential backoff 3s→30s, dispatches into `useWsStore`. Uses browser WebSocket + `window.location.origin` → replace origin with env API base. Core of all realtime. | **foundation** |
| **ThemeProvider** (`providers/ThemeContext.tsx`) | light/dark, persists to localStorage (`conjuntos_theme`), toggles `documentElement` classes + `startViewTransition`. RN: keep state, localStorage→AsyncStorage, drop DOM/View-Transitions (theme object / NativeWind `useColorScheme`). | **foundation** |
| **CallProvider** (`providers/CallContext.tsx`) | Citofonía call state machine + global incoming/active HUD overlays. State machine + `/citofonia/call` + `/citofonia/token` are portable, but nearly every browser API needs an RN equivalent (LiveKit RN SDK, expo-av ringtone, expo-notifications/FCM+APNs, expo-speech, native call UI). Big effort. | **later** (after foundation works; in scope for the citofonía core flow) |
| **ViewTransitionProvider** (`providers/ViewTransitionContext.tsx`) | Wraps `router.push` in `startViewTransition` + `useTransition`. Web-only — replace with the navigator's screen animations, do not port verbatim. | **later** (replace, not port) |

> The providers depend on hooks NOT in the usual component set — `useAuth` (Zustand), `useWebSocket`/`useWsStore`/`useWsSubscription`, and the API client `src/lib/api/client`. These are the **true shared foundation dependencies**; inventory and port them alongside the providers.

### App shell, navigation & layouts

| Component | Role | RN port priority |
|---|---|---|
| **`app/layout.tsx` (RootLayout)** | Mounts `Providers` + `SplashScreen` + sonner `Toaster`; loads next/font Google fonts. RN = `App.tsx` root: expo-font load, ported Providers, native splash, RN toast lib. | **foundation** |
| **`app/(app)/layout.tsx` (AppLayout)** | Thin wrapper rendering `AppShell` around authenticated routes. RN = the authenticated tab/stack navigator group. | **foundation** |
| **AppShell** (`shell/AppShell.tsx`) | Ambient-orb background + TopBar + scrollable `<main>` + BottomNav. RN = screen container with SafeAreaView + nav components; structure ports, markup rewritten. Layout is hard-locked to `max-w-[430px]` (already phone-shaped). | **foundation** |
| **BottomNav** (`shell/BottomNav.tsx`) | Role-based bottom tabs: VIGILANTE/SUPERVISOR, ENCARGADO_PARQUEADERO, ADMIN/SUPER_ADMIN/CONCEJO, default RESIDENTE — each a different tab set keyed on `user.rol`. The **role→tabs mapping is the load-bearing logic** → becomes the tab navigator config. | **foundation** |
| **ProfileHeader** (`shell/ProfileHeader.tsx`) | The **real** in-app header (TopBar is force-hidden). Avatar (next/image + localStorage cache), welcome name, notifications bell + dropdown. Fetches `/usuarios/me/profile`, `/notificaciones`, `/reservas`; realtime `useWsSubscription('notification')`; marks read via `PUT /notificaciones/leidas`; routes via `getNotifTarget`. Strong port candidate — swap next/image→expo-image, localStorage→AsyncStorage, DOM click-outside→RN modal dismiss. **Port once as a shared RN header.** | **foundation** |
| **TopBar** (`shell/TopBar.tsx`) | Back button + page title + search/overflow. **Currently disabled** (`isHideTopBar=true`, renders opacity-0). Low value — reproduce only the page-title/back logic if needed. | later |
| **RoleSwitcher** (`shell/RoleSwitcher.tsx`) | Tester-only runtime role change (`useAuth().switchRole`, then `window.location.reload()`). Gated by `user.isTester`. Useful for on-device QA — port logic, replace reload with state/router reset. | later |
| **SplashScreen** (`shell/SplashScreen.tsx`) | GSAP/inline-SVG/sessionStorage splash. Rebuild as native splash via **expo-splash-screen**; do not port GSAP/SVG/CSS. | **skip** (rebuild native) |
| **BrandedFooter** (`shell/BrandedFooter.tsx`) | Static "Powered by ENERGYSOFTmedia" SVG + version. Trivial to recreate with an SVG asset; not foundational. | skip |

### Modals / search (deferred shared UI)

| Component | Role | RN port priority |
|---|---|---|
| **SearchModal** (`search/SearchModal.tsx`) | Global search + AI assistant sheet; filters static MODULES, debounced `POST /search`, typing animation, suggestions. Module catalog + `/search` portable; rebuild sheet/animation. (Used by `/inicio` core flow.) | later |
| **CelebrationModal** (`modals/CelebrationModal.tsx`) | Success/approval modal with GSAP confetti (`document.createElement` particles). Concept ports; confetti rebuilt with Reanimated/Lottie. Tied to APROBACION/SISTEMA notifs. | later |
| **ContentActionModal** (`modals/ContentActionModal.tsx`) | Multi-step ad/marketplace flow with **simulated** payment (toast.promise + setTimeout, fake Visa). Demo/mock; payments flagged off. | **skip** (non-production) |

### Cross-cutting modules to port verbatim

- **Notification routing** (`src/lib/notif-routing.ts`): `getNotifTarget(notif, rol)` → destination path, shared by ProfileHeader and the dashboard banner. Pure string logic, **zero web dependencies** — port verbatim; only map the returned route strings to navigator screen names. Ordering matters (PAQUETE → /paqueteria; tramite/APROBACION → admin-novedades|/perfil; pqrs → admin-novedades|/pqrs; anuncio/circular/cartelera → /cartelera; pago/cuota/recibo → admin-finanzas|/pagos; reserva → /reservas; celda/parqueadero **evaluated BEFORE visita** because visitor-parking notifs contain "visitante" → admin-parqueadero|/parqueadero; visita/visitante → control-visitas|/visitantes; mensaje/chat → admin-mensajes|/cartelera; default → /perfil). Realtime via `useWsSubscription('notification')`.
- **Feature flags** (`src/lib/flags.ts`): `PAYMENTS_ENABLED = NEXT_PUBLIC_PAYMENTS_ENABLED==='true'` (default **OFF** — no real gateway; matches the simulated-payments prod blocker) + `PAYMENTS_DISABLED_MSG`. RN: read from app config / Expo env (`EXPO_PUBLIC_PAYMENTS_ENABLED`); keep payments gated off.
- **Routing/middleware auth gating** (`src/middleware.ts`): server-side gate on the httpOnly `ec_session` cookie. PUBLIC_PATHS = /about, /pricing, /contact, '/', '/login'. Authenticated user hitting '/' or '/login' → /inicio; /asamblea uses device-pairing (passthrough); all else requires the cookie or → `/login?callbackUrl=`. **RN has no middleware/cookie** — replicate as an auth-state gate (SecureStore token + Authorization header) routing unauth → Login stack, auth → `(app)` tab group, `/inicio` as home. (Known blocker: cross-origin auth cookie.)

### Port-first set (summary)

Port first: the three low-coupling providers (Auth, WebSocket, Theme) + their hooks/api client; AppShell skeleton; BottomNav role mapping; ProfileHeader; RootLayout/AppLayout equivalents; `notif-routing` + `flags` verbatim. Defer: CallProvider, ViewTransition, SearchModal, RoleSwitcher, CelebrationModal, TopBar. Skip/rebuild-native: SplashScreen, ContentActionModal, BrandedFooter.

---

## B. Post-MVP screen roadmap (stubs now, build later)

These screens ship as **stubs + roadmap** in the MVP. They reuse the same foundation, Zustand stores, API client, and `notif-routing`. Prioritized below by audience value and dependency on already-built foundation pieces.

### Priority 1 — Vigilancia / gate operations (closest to the core flows, low/medium complexity)

| Screen | Route | Roles | Complexity | Key endpoints | Heaviest web-only deps |
|---|---|---|---|---|---|
| **Control de Visitas** (visitor check-in) | `/control-visitas` | VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR, SUPER_ADMIN | low | `GET/POST /vigilancia/visitas`, `GET /directorio` | role-guard redirects, WS `visita`/`paquete`, `<select>`+form, `toLocaleTimeString` |

> Rationale: shares the directory `<select>` + role-guard + WS pattern already built for `/paqueteria`; smallest delta to ship next.

### Priority 2 — Resident community screens (reuse resident shell, medium/high complexity)

| Screen | Route | Roles | Complexity | Key endpoints | Heaviest web-only deps |
|---|---|---|---|---|---|
| **Cartelera** (announcements board) | `/cartelera` | RESIDENTE, all auth | medium | `GET /anuncios`, `GET/POST /chat` | `navigator.share`/`clipboard`, WS `anuncio`, `<style>` hide-scrollbar |
| **Clasificados** (neighborhood marketplace) | `/clasificados` | RESIDENTE, all auth | medium | `GET/POST /clasificados` | `window.open` wa.me, BottomSheet, `<select>/<textarea>`, WS `clasificado` |
| **Parqueadero** (resident parking hub) | `/parqueadero` | RESIDENTE, all auth | high | `GET /parqueadero/mio`, `/solicitudes/mias`, `/sesiones/mias`, `/cargos/mios`, `/reservas/mias`, `DELETE /reservas/{id}`, `POST /cargos/{id}/{aprobar\|rechazar}`, `POST /solicitudes/{id}/inquilino/{aprobar\|rechazar}`, `POST /vehiculos`, `GET /reservas/disponibilidad`, `POST /reservas` | `setInterval` countdowns, `<input type=datetime-local>` + tz math, WS `vehiculo`/`parqueadero`, fixed bottom-sheets |
| **Inmobiliaria** (internal real estate) | `/inmobiliaria` | RESIDENTE, all auth | high | `GET /inmuebles` (`?tipo=&tipoUnidad=`), `POST /inmuebles` | GSAP card stagger + SVG signature animation, SVG progress ring, `body.style.overflow` lock, PAYMENTS flag, WS `inmueble` |

> Note: the resident `/inicio` already approves parking solicitudes/cargos via the same endpoints — `/parqueadero` is the fuller resident view (countdowns, reservations, vehicle registration) and benefits from those handlers being built.

### Priority 3 — Admin / governance console (admin tab group, mostly high complexity)

| Screen | Route | Roles | Complexity | Key endpoints | Heaviest web-only deps |
|---|---|---|---|---|---|
| **Finanzas** (read-only financial summary) | `/admin-finanzas` | ADMINISTRADOR, SUPER_ADMIN, CONCEJO | low | `GET /admin/stats` | `Intl.NumberFormat` es-CO, WS `pago` |
| **Trámites y Anuncios** (admin novedades) | `/admin-novedades` | ADMINISTRADOR, SUPER_ADMIN | high | `GET /tramites?estado=`, `PUT /tramites/{id}/resolver`, `GET /parqueadero/mapa`, `POST /parqueadero/celdas`, `GET/POST/PUT/DELETE /anuncios`, `POST /uploads/imagen` | `FileReader` image→base64, `<a>` download, WS `tramite`+`anuncio`, JSON.parse legacy contract |
| **Mensajes** (admin chat inbox) | `/admin-mensajes` | ADMINISTRADOR, SUPER_ADMIN | high | `GET /admin/chat`, `GET/POST /admin/chat/{userId}` | MediaRecorder + getUserMedia (voice notes), Web Speech live transcription, Blob/`createObjectURL` audio, `tel:` link, polling intervals |
| **Bitácora de Parqueadero** (approval log) | `/bitacora-parqueadero` | ADMINISTRADOR, SUPER_ADMIN | low | `GET /parqueadero/solicitudes`, `POST /solicitudes/{id}/{aprobar\|rechazar}` | role-guard, WS `parqueadero`, `toLocaleDate/TimeString` es-CO |
| **Auditoría de Parqueadero** (parking master) | `/admin-parqueadero` | VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR, SUPER_ADMIN | medium | `GET /parqueadero/registros`, `/rondas`, `/mapa`, `POST /celdas` | role-guard redirects, custom SVG AlertCircle, `<style>` keyframes, date-diff "hace X min" |
| **Mapa de Parqueadero** (interactive map) | `/mapa-parqueadero` | ENCARGADO_PARQUEADERO, VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR, SUPER_ADMIN | high | `GET /parqueadero/mapa`, `/registros`, `/rondas`, `POST /rondas`, `GET /directorio`, `/reservas/proximas`, `POST /reservas/{id}/llegada`, `GET /sesiones/celda/{id}`, `POST /sesiones/{id}/cerrar`, `POST /celdas/{id}/asignar`, `/liberar`, `PUT /celdas/{id}` | `setInterval` billing clock, complex CSS bay layout (asphalt/lane gradients), dynamic Tailwind interpolation, WS `parqueadero`, regex level parsing |

### Priority 4 — SuperAdmin & live assembly (specialized, build last)

| Screen | Route | Roles | Complexity | Key endpoints | Heaviest web-only deps |
|---|---|---|---|---|---|
| **Registrar Copropiedad** (SuperAdmin dashboard) | `/superadmin` | SUPER_ADMIN | medium | `GET/POST /superadmin/conjuntos`, `PUT /superadmin/conjuntos/{id}` | `FileReader` logo→base64 (upload endpoint TODO), `<input type=color>`, `<input type=date>`, WS `conjunto` |
| **Asamblea** (live HOA assembly) | `/asamblea` | RESIDENTE, ADMINISTRADOR, SUPER_ADMIN (admin-only controls) | high | `GET/PUT /asambleas/activa/session`, `GET/POST /opiniones`, `GET/PUT /votaciones[/{vid}]`, `GET/POST /asistencias`, `GET/POST/PUT /turnos[/{tid}]`, `GET /poderes`, `GET/POST /votaciones/{id}/votos`, `GET /livekit-token` | `next/dynamic` ssr:false LiveKit, `@livekit/components-react` video, SVG quorum ring, WS `asamblea`, `env(safe-area-inset-bottom)`, bottom tabs + chat |

> `/asamblea` and `/admin-mensajes` are the two heaviest non-core builds: the former needs the **full LiveKit RN video** path (rebuild `VideoConference` from primitives), the latter needs **audio recording + live transcription** (expo-av recording; on-device transcription has no direct Web Speech equivalent — evaluate a native STT or send audio for server transcription). Schedule them after the CallProvider/LiveKit foundation from the citofonía core flow is proven.

### Suggested build order

1. Foundation set (providers, shell, BottomNav, ProfileHeader, notif-routing, flags, auth gate). 
2. Core resident flows (login, inicio, pagos, reservas, citofonia, visitantes, pqrs, paqueteria, perfil) — this also proves CallProvider + LiveKit RN + native push + the role-aware home branches.
3. Priority 1: control-visitas (smallest delta off paqueteria).
4. Priority 2: cartelera, clasificados, then parqueadero / inmobiliaria.
5. Priority 3: admin-finanzas, bitacora/admin-parqueadero, admin-novedades, mapa-parqueadero, admin-mensajes.
6. Priority 4: superadmin, then asamblea.

All non-core screens remain navigable stubs (a placeholder screen + the correct route + role gate) until built, so `notif-routing` targets and BottomNav role tabs resolve cleanly from day one.
