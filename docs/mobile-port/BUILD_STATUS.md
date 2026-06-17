# Mobile port — build status

Status of the EN-CONJUNTO React Native / Expo port (the `mobile/` package) and
the additive backend changes that support it. Written to be accurate, not
aspirational: most screens are still stubs.

Last verified: 2026-06-17.

---

## Foundation (implemented)

The app shell and shared infrastructure are in place:

- **Routing & layout** — `expo-router` file-based routing. Root layout
  (`app/_layout.tsx`) mounts the provider stack
  `GestureHandlerRootView → SafeAreaProvider → ThemeProvider →
  BottomSheetModalProvider → AuthGate → WebSocketProvider → CallProvider`,
  with the `<Toast />` host as a sibling, and holds the native splash until
  fonts + the auth session resolve. The root `Stack` registers `index`,
  `login`, and the `(app)` group. Typed routes are intentionally disabled.
- **Auth** — `useAuth` (zustand) persists the token via expo-secure-store,
  bootstraps the session (`GET /auth/me`), and drives the redirects in
  `index.tsx` and `(app)/_layout.tsx`.
- **Role-based tab bar** — `app/(app)/_layout.tsx` renders a custom floating
  liquid-glass `FloatingTabBar` whose tab set is chosen by user role
  (RESIDENTE / VIGILANTE / ENCARGADO_PARQUEADERO / ADMIN family), mirroring the
  web `BottomNav`.
- **UI kit** — `src/components/ui/` (Button, Input, GlassCard, LiquidGlass,
  Screen, Sheet, toast) + `ProfileHeader`, NativeWind 4, theme tokens.
- **API client** — `src/lib/api/{client,types}.ts`, runtime config in
  `src/lib/config.ts` (`API_BASE`, derived `WS_BASE`), feature flags in
  `src/lib/flags.ts`.
- **Realtime** — `WebSocketProvider` + `useWebSocket` for the live socket
  (foreground citófono ring path), `CallProvider` for LiveKit call ring/join.
- **Push** — `src/services/push.ts`: registers the Expo push token with the
  backend and deep-links incoming-call notifications into `/citofonia`
  (foreground, background-tap, and cold-start paths).
- **Notification routing** — `src/lib/notif-routing.ts`.

### Core screens implemented (9)

`login`, `inicio` (home dashboard), `citofonia` (LiveKit intercom),
`pagos` (admin charges/payments), `reservas` (amenity reservations),
`visitantes` (visitor log), `pqrs` (requests/complaints),
`paqueteria` (parcel log), `perfil` (profile).

---

## Stubbed (roadmap screens)

13 `(app)` routes are registered and navigable but render only a placeholder
("Próximamente" glass card). They are **not** implemented:

`cartelera`, `clasificados`, `inmobiliaria`, `asamblea`, `control-visitas`,
`parqueadero`, `mapa-parqueadero`, `bitacora-parqueadero`, `admin-mensajes`,
`admin-novedades`, `admin-finanzas`, `admin-parqueadero`, `superadmin`.

> 7 non-canonical phantom stubs the build agent had invented (`asambleas`,
> `votaciones`, `documentos`, `correspondencia`, `mascotas`, `vehiculos`,
> `amenidades`) were **deleted** — they don't map to any real app domain. The
> route table now contains exactly the 21 canonical `(app)` screens (8 live + 13
> stubs) plus the top-level `login`.

Some of these are live tab destinations for non-RESIDENTE roles (e.g.
`control-visitas` for VIGILANTE, `mapa-parqueadero` for ENCARGADO_PARQUEADERO,
the `admin-*` screens for the ADMIN family, `cartelera` for RESIDENTE) — the
tab works, the screen is a placeholder. Build plan in `ROADMAP.md`, specs in
`SCREEN_SPECS.md`.

---

## Backend changes (additive native push)

The native-push support added to the Rust backend is **purely additive**; the
existing web-push (VAPID) path is untouched at runtime. `cargo check` is green.

- **New migration** `backend/migrations/2026-06-17-000001_native_push_tokens/`
  — creates `native_push_tokens (id, conjunto_id, usuario_id, platform,
  token UNIQUE, device_id NULL, created_at)` + a `usuario_id` index. Additive
  only; `down.sql` drops the table.
- **Schema/model/DTO** — `schema.rs` gains the `native_push_tokens` diesel
  table (hand-added so code compiles before the migration runs); new
  `NativePushToken` model; new discriminated subscribe/unsubscribe bodies
  (`PushSubscribeBody {Web|Native}`, `PushUnsubscribeBody`) with a
  `NativePlatform` enum (`expo`/`fcm`/`apns`). The original web
  `PushSubscribeRequest {endpoint, keys{...}}` is preserved and matched first.
- **Repo/handlers** — `upsert_native_push_token` / `delete_native_push_token`;
  `subscribe_push` / `unsubscribe_push` route web → `push_subscriptions`,
  native → `native_push_tokens`.
- **Push service** — transport-agnostic `PushMessage`, `NativePushSender`
  trait, a real `ExpoPushSender` (POSTs to `https://exp.host/--/api/v2/push/send`,
  parses the Expo ticket and treats non-`ok` as failure),
  `UnconfiguredNativePushSender` (errors rather than faking), and a factory.
  `AppState` gains `native_push_sender` (constructor signature unchanged).
- **Citófono dispatch** — `citofonia/handlers.rs` builds one `PushMessage` and
  fans out per target to **both** `push_subscriptions` (VAPID) and
  `native_push_tokens` (Expo); the payload contract (`{title:'Llamada
  Entrante', body, data:{url:'/citofonia', room, callerName}}`) is identical
  on both transports. `POST /citofonia/call` and `GET /citofonia/token`
  signatures/behavior are unchanged; the WS foreground path is untouched
  (native push is the closed/background fallback).

### Operator step — apply the migration

The migration `2026-06-17-000001_native_push_tokens` was **written but not
applied** (per the project rule: never auto-run migrations against the DB).
`schema.rs` was hand-updated to match so the code already compiles. The
operator must apply it manually against the database before native push tokens
can be stored:

```bash
diesel migration run   # or the project's standard migration apply step
```

Expo needs no server credentials (the device token is the auth), so
`ExpoPushSender` is always enabled; if no native tokens are registered, the
citófono `sent` count is simply unaffected.

---

## Verification status (all gates green)

- `cd mobile && pnpm exec tsc --noEmit` → **exit 0, clean** (strict, full-tree).
- `cd mobile && pnpm dlx expo export --platform ios` → **exit 0** — produces an
  8.4 MB Hermes bundle. This is the strongest static gate short of a device run:
  every route, provider, NativeWind class, Reanimated worklet and LiveKit import
  resolves and compiles to Hermes bytecode (no resolution/transform errors).
- `cd backend/api && cargo check` → **exit 0** (one pre-existing, unrelated
  `notas` warning in `parqueadero/reservas.rs`).
- `expo config --type public` exits 0. `expo-doctor` passes 20/21 (the 1 failure
  is an advisory only: `expo-av@16.0.8` "unmaintained", `expo-modules-jsi` has no
  RN-Directory metadata — no type or build impact).

## Production hardening (post-build pass)

Applied after the initial build, all verified by the gates above:

- **Routes reconciled** — 7 invented phantom stubs deleted; `ALL_APP_ROUTES`
  trimmed to the 21 canonical `(app)` screens. Every role tab resolves to a real
  file (no dead links).
- **Global 401 auto-logout** — `apiFetch` invokes a handler (registered by
  `useAuth.bootstrap`) on any authenticated 401, clearing the token + session so
  the auth gate routes back to `/login`. (Bad-credentials 401 on `/auth/login`
  is exempt and surfaced to the form.) Fixes a known web gap.
- **Root `ErrorBoundary`** — branded Spanish crash screen with retry (expo-router
  convention) instead of a white screen.
- **EAS build profiles** — `mobile/eas.json` (development dev-client / preview
  APK / production with auto-increment).
- **Adversarial review→fix pass** corrected real defects: citofonía post-call
  navigation-ownership conflict (double-nav); paquetería DTO contract drift
  (nested `usuario.unidad` → the real **flat** `residente {nombre,torre,apto}`
  serializer shape) + a non-scrolling destinatario picker (now
  `BottomSheetScrollView`); the WhatsApp share URL; login redirect-timer cleanup
  on unmount; perfil SecureStore PII wipe on logout; `LiquidGlass` corner-radius
  clipping on the tab bar + pqrs cards; and a **native-push bug** — the backend
  Expo sender targeted `channelId:"citofonia"` (which the device never
  registers) → switched to `"default"` so Android delivers the heads-up call
  ring. The backend also now rejects non-`expo` push platforms with a 400.
- **Push actually bridged** — `PushBridge` (mounted under `CallProvider`) wires
  `expo-notifications` to `useCall().answerFromPush`, so background-tap and
  cold-start incoming calls ring and join (foreground stays on the WS path to
  avoid double-ringing).

---

## Known follow-ups

1. **Call-tone assets are silent placeholders.** The four files in
   `mobile/assets/sounds/` (`ringback`, `ringtone`, `beep`, `disconnect`.mp3)
   are 144-byte silent stubs so `CallProvider` resolves its static `require()`s
   without crashing. Replace each with a real tone per
   `mobile/assets/sounds/README.md`, keeping the exact filenames.
2. **Native build / dev client.** No native SDK was present during this work, so
   `expo prebuild` + a dev-client build were not run here. The app uses native
   modules (LiveKit/WebRTC, expo-av, gesture-handler, bottom-sheet, push), so
   Expo Go won't fully exercise it — build a custom dev client to test.
3. **Real QR.** QR rendering (`react-native-qrcode-svg` is installed) is not yet
   wired into the relevant flows.
4. **Payments still OFF / simulated.** `PAYMENTS_ENABLED` is off by default;
   there is no real payment gateway. Do not flip it on until a gateway is
   integrated (otherwise charges would be marked paid with no settlement).
5. **Hermes Intl check.** Verify date/number/currency formatting
   (`Intl.*`) behaves on the Hermes engine in a real build — Hermes ships a
   limited Intl implementation and behavior can differ from the JS dev runtime.
6. **expo-av migration (tech debt).** Migrate `expo-av` → `expo-audio` /
   `expo-video` to clear the expo-doctor advisory, or add it to
   `expo.doctor.reactNativeDirectoryCheck.exclude` in `package.json` to silence
   the warning.
7. **Graph refresh.** Run `graphify update .` in `mobile/` — the AST graph is
   stale for `app/(app)/_layout.tsx`.
