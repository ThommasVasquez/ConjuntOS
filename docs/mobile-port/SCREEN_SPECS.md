# Screen Specs — Core Resident Flows

Per-screen porting specs for the nine in-scope resident flows. Each spec lists roles, purpose, data sources (endpoints + when called), state, key components, interactions, the web-only APIs to replace, and concrete RN notes.

> Conventions used across every screen:
> - **Auth**: no httpOnly cookie on native — persist the Bearer token in expo-secure-store, rehydrate `setAuthToken()` on launch, send `Authorization: Bearer`.
> - **Realtime**: the shared `useWsStore` + `useWsSubscription(domain, handler)` hooks port unchanged; the single app `WebSocketProvider` drives them.
> - **Header**: most screens embed the shared `ProfileHeader` (avatar + greeting + notifications bell). Port it **once** as a shared RN component (see ROADMAP.md), not per screen.
> - **Animation**: GSAP `.fade-up` stagger → Reanimated `FadeInDown`/Moti (or skip for v1).
> - **Toast**: sonner → burnt / react-native-toast-message. **Icons**: lucide-react → lucide-react-native. **Images**: next/image → expo-image.
> - **Money**: `monto` etc. are strings → `parseFloat`. Keep all Spanish copy verbatim.

---

## 1. `/login` — Login (ConjuntOS) · complexity: low

**Roles:** anonymous (unauthenticated). Single entry point for all roles; role differentiation is server-side post-login.

**Purpose:** email/password sign-in. Authenticates against the Rust backend, stores the session, redirects to `/inicio` (or a validated `callbackUrl`). Already-authenticated users are auto-redirected away.

**Data sources:**
- `POST /api/v1/auth/login` — `LoginRequest {email,password}` → `LoginResponse {user, token}`. On `handleSubmit` via `useAuth().login()`. Backend also sets the httpOnly cookie (ignored on native); keep the returned Bearer token via `setAuthToken()`. 401 → friendly `"Correo o contraseña incorrectos."`; other `ApiError` → `error.detail`; generic → `"Error al conectar con la comunidad."`
- `GET /api/v1/auth/me` — `UserDto`. Not called by this screen directly; `useAuth().checkAuth()` hydrates the `user` the redirect-if-logged-in effect reads. Listed for session-lifecycle completeness.

**State:** local `useState` — `isLoading`, `showPassword`, `formData {email,password}`. Global Zustand `useAuth` — reads `user` (redirect guard), calls `login()` which sets `{user,loading,error}` and writes the in-memory Bearer token. No `useWebSocket` here.

**Key components:** `BrandedFooter`; lucide icons (Shield, Mail, Lock, ArrowRight, Loader2, Star, Eye, EyeOff); sonner; native `<form>` with email + password inputs, submit button, password show/hide toggle, a non-functional "¿Olvidaste tu contraseña?" button (no handler).

**Interactions:** controlled email/password inputs; password type toggles via Eye/EyeOff (`showPassword`, aria-label swaps Mostrar/Ocultar); submit disabled while `isLoading`, double-submit guarded by `if (isLoading) return`; on success → success toast then **1000ms `setTimeout` before navigate** (keep the delay so the toast shows), then `router.push(dest)` + `router.refresh()` (drop refresh on RN); on failure → mapped error toast; "Olvidaste tu contraseña" is a no-op placeholder; auto-redirect effect on `user` → `router.replace(safeCallback(callbackUrl))`.

**Web-only APIs → RN:** `next/navigation` → expo-router (`router.replace/push`; drop `router.refresh`); `window.location.search` + URLSearchParams → `useLocalSearchParams`; GSAP card/glow animations → Reanimated entering + looping glow (or skip); sonner → RN toast; lucide-react → lucide-react-native; Tailwind glass/blur/gradients → NativeWind + expo-blur + expo-linear-gradient; `<style dangerouslySetInnerHTML>` `.text-glow` → RN `textShadow*`; edge runtime exports → drop; `credentials:'include'` cookie → Bearer + SecureStore; `autoComplete` attrs → RN `textContentType`/`autoComplete` + `keyboardType='email-address'`.

**RN notes:** route `app/login.tsx`. Keep `safeCallback()` validation (only single-`/`-prefixed relative paths; reject `//`, `://`, `\\`; default `/inicio`) to harden deep-link redirects. Port `useAuth` Zustand store nearly verbatim (platform-agnostic except `setAuthToken`/storage). API client RN rewrite: real `API_BASE` host (no Next rewrite proxy), Bearer-first. Wrap in `KeyboardAvoidingView` + `ScrollView` + `SafeAreaView` (keyboard covers the centered password field on small devices). Replace decorative blur glows with expo-linear-gradient/expo-blur or skip for perf. Preserve the 1000ms success delay; password toggle, `isLoading` guard, and 401→friendly mapping port directly. "Forgot password" has no backend route — leave disabled/hidden.

---

## 2. `/inicio` — Inicio (role-aware Home Dashboard) · complexity: high

**Roles:** all (PROPIETARIO, ARRENDATARIO, VIGILANTE, SUPERVISOR_VIGILANCIA, ENCARGADO_PARQUEADERO, CONCEJO, ADMINISTRADOR, SUPER_ADMIN).

**Purpose:** one route that branches on `user.rol` into **five** sub-screens: `HomeResidente` (rich feed: finance summary, urgent parking approvals, notifications, announcements, AI search, live-assembly banner), `HomeVigilante` (visits/packages quick actions), `HomeEstacionamiento` (parking occupancy), `HomeConsejo` (read-only finance/announcement KPIs), `HomeAdmin` (management shortcuts + optional SuperAdmin card + assembly moderation).

**Data sources (when):**
- `GET /api/v1/notificaciones` → `NotificacionDto[]` — HomeResidente on mount + WS `notification`; also `ProfileHeader` (all roles).
- `GET /api/v1/pagos` → `PagosResponse {pagos, recibos}` — HomeResidente on mount + WS `pago`; `totalDebt` = sum of `parseFloat(p.monto)` where estado PENDIENTE/VENCIDO (client-side).
- `GET /api/v1/usuarios/me/profile` → `ProfileResponse` — HomeResidente + ProfileHeader on mount; greeting/gender/avatar + search context.
- `GET /api/v1/anuncios` → `AnuncioDto[]` — HomeResidente on mount + WS `anuncio` (Novedades feed).
- `GET /api/v1/asambleas/activa/session` → `{id,activa,titulo,descripcion?}` — HomeResidente on mount + WS `asamblea`; HomeAdmin on mount. Banner only when `id && activa`.
- `GET /api/v1/parqueadero/solicitudes/mias` → visitor-parking approval requests — HomeResidente on mount + WS `parqueadero`.
- `GET /api/v1/parqueadero/cargos/mios` → retained-vehicle charges pending approval (most urgent) — HomeResidente on mount + WS `parqueadero`.
- `POST /api/v1/parqueadero/cargos/{id}/{aprobar|rechazar}` (empty body) — tap in "Cobro por aprobar" card; toast + refetch cargos.
- `POST /api/v1/parqueadero/solicitudes/{id}/inquilino/{aprobar|rechazar}` (empty body) — tap in "Aprobación de Estacionamiento" card; toast + refetch solicitudes.
- `PUT /api/v1/notificaciones/leidas` `{ids:[...]}` — notification tap (then navigate) + CelebrationModal close; ProfileHeader per-notif + "Limpiar".
- `POST /api/v1/search` `{query, context}` → `{answer}` — SearchModal debounced 600ms when `query>=3` AND isQuestion (ends `?` or `>=4` words); also suggestion tap / submit / "Preguntar al asistente IA".
- `GET /api/v1/parqueadero/stats` → `{ocupacion,libres,ocupados}` — HomeEstacionamiento on mount.
- `GET /api/v1/admin/stats` → `{recaudoMes,reservasPendientes}` — HomeConsejo on mount.
- `GET /api/v1/reservas` — ProfileHeader (all roles): avatar "story" halo when an active reserva overlaps now.
- `GET /api/v1/auth/ws-ticket` → `{ticket}` — WebSocketProvider before opening the WS.
- `POST /api/v1/auth/switch-role` `{rol}` → `LoginResponse` — RoleSwitcher (only when `user.isTester`); then reload after 300ms.

**State:** Zustand `useAuth` (user, rol, isTester) + `useWsStore` (connected, subscribe/dispatch via `useWsSubscription`). HomeResidente local state: `notificaciones`, `showCelebration` (**dead branch — never set true here, safe to omit**), `selectedFeedItem`, `isSearchOpen`, `financialData {totalDebt,pagos,recibos}`, `anuncios`, `isLoadingAnuncios`, `userData`, `activeAsamblea`, `solicitudesParqueadero`, `cargosRetenidos`, `busyAprob` (id lock). Sub-screens each hold local `stats`/`activeAsamblea`. ProfileHeader holds its own state + localStorage cache. SearchModal: `query`, `isLoadingAI`, `aiAnswer`, `filteredModules`, `debounceRef`. ContentActionModal: simulated commerce step machine (no backend).

**Key components:** `InicioDashboard` (role router), the five Home sub-screens, `AnuncioCard`, `ProfileHeader`, `RoleSwitcher`, `SearchModal` (AI bottom sheet), `CelebrationModal` (confetti), `ContentActionModal` (simulated pizza/checkout flow — port as-is or stub), lucide icons, `getNotifTarget`.

**Interactions:** category chip strip (8 horizontal items: Citofonía/Pagos/Parqueo/Reservas/Cartelera/PQRS/Inmuebles/Clasificados) → `router.push`; search bar / sliders → open SearchModal; live-assembly banner → `/asamblea` (resident) or moderate (admin); cobro retenido / solicitud cards Aprobar/Rechazar (POST, `busyAprob` lock, toast, refetch); notification tap → markAsRead + `router.push(getNotifTarget(n,rol))` (optimistic removal); wallet hero "Pagar Ahora"/"Ver Estado" → `/pagos`; announcement tap → ContentActionModal; RoleSwitcher (tester) → switchRole then full reload.

**Web-only APIs → RN:** `next/navigation` → expo-router; `next/image` (unoptimized fill, remote Unsplash/Wikipedia/`imagenUrl`) → expo-image (cached); GSAP fade/confetti/modal → Reanimated/Moti/LayoutAnimation; `window keydown` Escape (SearchModal) → hardware back/sheet gesture; `document mousedown` click-outside (ProfileHeader) → Modal/Pressable backdrop; `document.createElement` confetti (CelebrationModal) → RN views/Reanimated; `window.location.reload` (RoleSwitcher) → auth re-fetch / nav reset; `window.location.origin` + WebSocket → RN WebSocket with explicit `ws://` URL; localStorage → AsyncStorage/SecureStore; cookie auth → Bearer; `process.env.NEXT_PUBLIC_*` → `EXPO_PUBLIC_*`; Tailwind glass/gradients/`animate-ping` → StyleSheet + expo-blur + expo-linear-gradient + Reanimated; `toLocaleString('es-CO')` → verify Intl on Hermes.

**RN notes:** single Inicio screen switching sub-views on `user.rol` (VIGILANTE|SUPERVISOR_VIGILANCIA→Vigilante; ENCARGADO_PARQUEADERO→Estacionamiento; CONCEJO→Consejo; ADMINISTRADOR|SUPER_ADMIN→Admin; else Residente). ScrollView with vertical sections; category + notifications strips as horizontal FlatList. SearchModal → @gorhom/bottom-sheet (keep the 600ms debounce + isQuestion heuristic + local MODULES/SUGGESTIONS filtering). Reuse the same Zustand stores unchanged; port WebSocketProvider (build wsBase from config, fetch `/auth/ws-ticket`, append `?token=`). Keep the 4 resident subscriptions (notification/pago/anuncio/parqueadero) + asamblea refetching on WS; also consider `useFocusEffect` refetch since RN screens stay mounted. ContentActionModal is fully simulated — port as-is or stub. `showCelebration` is a dead branch — omit. Parse money strings before arithmetic. RoleSwitcher: do `switchRole` then nav reset + refetch (no hard reload).

---

## 3. `/pagos` — Pagos / Wallet · complexity: medium

**Roles:** any authenticated user (no explicit role gate; scoped to the user's units server-side; lives under the authenticated `(app)` layout).

**Purpose:** resident finance/wallet. Hero "estado de cuenta" card with total outstanding debt, tabbed pending/overdue vs paid history, and a payment confirmation modal. Triggers a (flagged-OFF, simulated) PSE/Wompi payment; offers a "contact administration" help card.

**Data sources:**
- `GET /api/v1/pagos` → `{pagos, recibos}` (only `pagos` consumed). `PagoDto` mapped client-side to `Transaction {id, concepto, monto:parseFloat, estado, fechaVencimiento, fechaPago?, metodo?}`. On mount once (guarded by `user && userId && !initialFetchDone`, plus a `fetchLock` dedupe); re-fetched on every WS `pago` event (errors swallowed).
- `PUT /api/v1/pagos/{id}/pagar` `{metodo:'PSE'}` (hardcoded; response ignored). On modal submit, **only if `PAYMENTS_ENABLED`**; then an artificial **3500ms** fake-gateway delay before success + optimistic local update.
- `GET /api/v1/usuarios/me/profile`, `GET /api/v1/notificaciones`, `GET /api/v1/reservas`, `PUT /api/v1/notificaciones/leidas` — all via embedded `ProfileHeader`. `GET /api/v1/auth/ws-ticket` — via WebSocketProvider (the screen depends on it for the `pago` subscription).

**State:** local — `activeTab` ('PENDIENTES'|'HISTORIAL'), `isLoading`, `data {pagos, totalDebt}`, `selectedPayment` (drives modal), `isProcessing`. Refs: `containerRef`, `fetchLock`, `initialFetchDone`. Zustand `useAuth` (gates fetch, supplies id/torre/apto) + `useWsSubscription('pago')`. `totalDebt` computed **client-side** (sum of PENDIENTE+VENCIDO). No server cache lib.

**Key components:** `ProfileHeader`; inline wallet hero (gradient, torre/apto, "Al día" badge, debt, "Pagar Ahora"); PENDIENTES/HISTORIAL tabs; transaction rows; payment modal (order summary, PSE/Wompi method card, info note, confirm + processing spinner); empty state (SearchX); loading (Loader2); help footer card (toast only).

**Interactions:** tab switch (client-side filter; PENDIENTES = PENDIENTE|VENCIDO, HISTORIAL = PAGADO); hero "Pagar Ahora" selects first pending into `selectedPayment` (else `toast.info('No tienes pagos pendientes')`); tap a PENDIENTES row opens modal (HISTORIAL rows non-actionable); confirm → if disabled `toast.error(PAYMENTS_DISABLED_MSG)` and stop; else `isProcessing` → PUT → **3500ms** fake wait → close, success toast, **optimistically** mark PAGADO + decrement `totalDebt` (**no server refetch after pay**); modal dismiss disabled while processing; help footer fires a stub WhatsApp toast (no real link); WS `pago` → silent re-fetch.

**Web-only APIs → RN:** `next/navigation` (ProfileHeader) → expo-router; `next/image` → expo-image; GSAP `.fade-up` → Reanimated; `document mousedown` outside-click → backdrop Pressable/Modal; localStorage → AsyncStorage/SecureStore; `<style dangerouslySetInnerHTML>` → RN style props; Tailwind glass/gradients/`animate-in` → StyleSheet + expo-blur + LinearGradient; `window.location.origin` + cookie auth → env base + Bearer; browser WebSocket → RN WebSocket (ticket query already RN-friendly); `fixed inset-0 z-200` modal → RN Modal / @gorhom/bottom-sheet; `toLocaleString`/`toLocaleDateString('es-ES')` → verify Intl/Hermes.

**RN notes:** route `app/(app)/pagos.tsx`. Vertical ScrollView with bottom padding for the tab bar; top inset via `useSafeAreaInsets`. Hero gradient → expo-linear-gradient; glass cards → expo-blur. Payment modal → RN Modal or @gorhom/bottom-sheet (disable dismiss while processing). **Preserve:** (1) `totalDebt` computed locally, not from server; (2) **no refetch after pay** — optimistic mark + decrement; (3) the 3500ms is a fake animation (keep/shorten, not a network wait); (4) `PAYMENTS_ENABLED` → `EXPO_PUBLIC_PAYMENTS_ENABLED` (off) with `PAYMENTS_DISABLED_MSG`; (5) help footer → `Linking.openURL('whatsapp://...')` if a real number exists, else keep toast. Currency "$ {n.toLocaleString()}" (COP, no decimals) — match with Intl or manual thousands. Redirect to login if `useAuth.user` is null.

---

## 4. `/reservas` — Reserva de Zonas Comunes · complexity: high

**Roles:** ARRENDATARIO, PROPIETARIO (no server/layout role guard — gating is purely via nav visibility; `BottomNav` only shows Reservas for the resident branch).

**Purpose:** browse bookable common areas (pool, BBQ, salón), pick an available day + time slot, optionally pay a deposit, confirm. Success shows a confirmation card with a (decorative) QR. Bookings update in realtime when others reserve overlapping slots.

**Data sources:**
- `GET /api/v1/areas-comunes` → `AreaComun[]` (`{id,nombre,descripcion,imagenUrl,requiereDeposito,depositoMonto,horaApertura,horaCierre,diasDisponibles(CSV weekday nums),duracionSlot(min),capacidadMax}`). On mount (keyed on `userId`) + every WS `reserva` event.
- `GET /api/v1/areas-comunes/{id}/slots?fecha=YYYY-MM-DD` → `{fechaInicio,fechaFin}[]` (blocked intervals). Whenever `selectedDay`/`selectedArea` changes.
- `POST /api/v1/reservas` `{areaId, fechaInicio(ISO), fechaFin(ISO)}` (response ignored). On confirm (`executeBooking`) — direct when no deposit, or after PAYMENT step when deposit required. Success → `step='SUCCESS'`; failure → toast "Error de conexión".

**State:** local — `areas`, `loading`, `selectedArea`, `step` ('GRID'|'BOOKING'|'PAYMENT'|'SUCCESS'), `availableDays (Date[])`, `selectedDay`, `timeSlots ({start,end,available}[])`, `selectedSlotIndex`, `isProcessing`. `containerRef`. Zustand `useAuth` (reads `user.id` as effect dep) + `useWsSubscription('reserva')`. **Time-slot availability is computed client-side** from open/close hours + `duracionSlot` + the server's blocked intervals; slots are NOT returned ready-made.

**Key components:** `ProfileHeader`; next/image area covers + sheet thumbnail; lucide (ArrowRight, X, CheckCircle2, Clock, Users, QrCode, Search, SlidersHorizontal, MapPin); sonner; inline area grid card, BOOKING bottom-sheet, PAYMENT fake-gateway, SUCCESS card with decorative QR.

**Interactions:** search input + filter button are **visual-only** (not wired); tap area card → `handleSelectArea` (computes next ≤5 allowed days within a 15-day window filtered by `diasDisponibles`, selects first day, opens BOOKING); BOOKING full-screen bottom sheet (backdrop/X closes to GRID); day chips horizontal snap-scroll → reload slots; time-slot 2-col grid, disabled for unavailable/past; primary button label "Pagar Depósito" if `requiereDeposito` else "Confirmar Reserva" ("Procesando..." while busy) → `proceedToBook` (deposit>0 & PAYMENTS_ENABLED → PAYMENT step, else toast disabled; otherwise `executeBooking`); PAYMENT step fake spinner + manual "Confirmar Pago"; SUCCESS shows summary + decorative QR, "Volver a Reservas" → `window.location.reload()`; WS `reserva` re-fetches areas (does NOT live-refresh an open sheet's slots).

**Web-only APIs → RN:** next/image → expo-image; GSAP fade-up → Reanimated/Moti; `window.location.reload` → `resetState()` (step='GRID', clear, refetch); next/navigation (ProfileHeader) → expo-router; `document mousedown` → Pressable/Modal backdrop; localStorage → AsyncStorage/SecureStore/MMKV; WebSocket + cookie auth → RN WebSocket + Bearer + ticket query; cookie fetch → Bearer; Tailwind/`liquid-glass`/`.hide-scrollbar` + `<style>` → StyleSheet/NativeWind + BlurView; backdrop-blur → expo-blur; `toLocale*('es-ES')` → verify Intl.

**RN notes:** register as a tab in the resident bottom-tab navigator (hide for staff roles). Keep the **4-step `step` state machine in one screen** (GRID = FlatList; BOOKING = @gorhom/bottom-sheet or Modal slide-up; PAYMENT/SUCCESS = full-screen overlays). Reuse api client + `useWsSubscription('reserva')` unchanged. **Critical:** replicate `loadSlotsForDay` exactly — parse `horaApertura`/`horaCierre` 'HH:MM', step by `duracionSlot` from open to close, mark slot unavailable if it overlaps a blocked interval (`curr < bEnd && slotEnd > bStart`) OR is in the past; `availableDays` = next ≤5 days within 15 whose `getDay()` ∈ `diasDisponibles`. `depositoMonto`/`requiereDeposito` drive Gratis vs $amount and whether PAYMENT shows; payments gated OFF — keep the disabled toast. expo-image covers (bundle a local placeholder for `/placeholder.svg`). SUCCESS QR decorative; if real later, render `react-native-qrcode-svg` from the reservation id. Build search/filter as visual-only to match, or wire client-side filtering as an enhancement.

---

## 5. `/citofonia` — Citofonía (Intercom / Control Center) · complexity: high

**Roles:** RESIDENTE, PROPIETARIO, VIGILANTE, ADMINISTRADOR (no page-level role gate; under `(app)`).

**Purpose:** virtual intercom hub. Place LiveKit voice calls to the front gate (Portería), administration, a dialed internal number, or a searched resident; receive incoming calls with a full-screen ringing UI; manage scheduled visits with live parking-spot counts; view pending packages. It is the consumer side of the global `CallContext`, which rings on every screen.

**Data sources:**
- `GET /api/v1/comunicaciones` → `{visitas, paquetes, parqueadero?:{carrosDisponibles,motosDisponibles}}` — on mount + after the "Programar Visita" modal confirms.
- `GET /api/v1/usuarios/directorio?q=` → `DirectorioUser[] {id,nombre,numeroInterno,rol,torre?,apto?}` — resident search, debounced 300ms, query length ≥1.
- `POST /api/v1/citofonia/call` `{targetPeerId, callerName}` → `{room, token, url, sent}` — on `startCall` (dialer LLAMAR / quick-contact / search result), fired from CallContext. `token`+`url` feed LiveKit; `sent>0` means push delivered.
- `GET /api/v1/citofonia/token?room=` → `{token, url}` — on `answerCall`/`joinRoom` (callee accepting), from CallContext.
- `GET /api/v1/usuarios/me/profile` — in CallProvider (needs `conjuntoId` + `rol` + `unidad.numero` to build `targetPeerId` + caller name) and in ProfileHeader.
- `POST /api/v1/usuarios/me/push-subscriptions` — after profile loads, once permission granted (idempotent upsert by endpoint). **Body shape changes for RN** (Expo token, not browser PushSubscription) — see BACKEND_CONTRACT.md native-push.
- `GET /api/v1/auth/ws-ticket`, `GET /api/v1/notificaciones`, `PUT /api/v1/notificaciones/leidas`, `GET /api/v1/reservas` — WS connect + ProfileHeader.

**State:** page-local — `activeTab` ('CITOFONIA'|'VISITAS'|'RECEPCION'), `isLoading`, `visitas[]`, `paquetes[]`, `parking {carros,motos}`, `isAddingVisita`, `searchQuery`, `searchResults[]`, `searchLoading`. Refs: `prevCallStateRef` (detect CONNECTED→IDLE to navigate back), `containerRef`. Global call state via `useCall()` (**React Context, not Zustand**): `callState`, `callerName`, `callTime`, `lastSpeechResponse`, `dialNum/setDialNum`, `startCall/endCall/answerCall/rejectCall/handleOptionClick/getCallOptions`. Auth via `useAuth` (Zustand); realtime via `useWsSubscription('citofonia')` (in CallContext) + `('notification')` (ProfileHeader). CallContext holds heavy internal refs: LiveKit Room, attached audio, `pendingRoom`, timers (`callTimer`, `noAnswerTimer` 25s), AudioContext, `hadConnected`, `pushSent`, `previousPath`.

**Key components:** `ProfileHeader`; `useCall()`/`CallProvider` (global call engine + incoming/active HUD overlays when NOT on `/citofonia`); `WebSocketProvider`; lucide (Phone, PhoneOff, Users, Package, MapPin, Clock, Plus, Info, ShieldCheck, X, Loader2, Car, Bike, Search); sonner; inline call overlay, tab selector, search list, quick-contacts grid, numeric dialer, visitas + parking cards, paquetes list, add-visita bottom sheet.

**Interactions:** 3-way tabs CITOFONIA/VISITAS/RECEPCION (no fetch on switch); resident search (300ms debounce, X clears, spinner, "Sin resultados", tap → `callDirectorioUser` → `setDialNum(numeroInterno)` + `startCall('user-{id}', nombre)`; disabled unless IDLE); quick contacts Portería ('P') / Administración ('A'); numeric dialer 12 keys (cap 8 chars, "Limpiar", "LLAMAR"/"COLGAR"); full-screen CALL OVERLAY (RINGING/OUTGOING/CONNECTED/FALLBACK, pulse, equalizer when connected, mm:ss timer, speech box; FALLBACK = canned dialogue list → `handleOptionClick` speaks via TTS + toast); incoming RINGING → reject/answer(→joinRoom); **Add Visita sheet "PROGRAMAR AHORA" is a STUB** today (only toast + close + refetch; does NOT POST — port should wire `POST /api/v1/visitas`); auto-nav: CONNECTED/FALLBACK→IDLE triggers `router.back()` (or push `/inicio`), a failed OUTGOING→IDLE stays on the dialer.

**Web-only APIs → RN:** `next/navigation` → expo-router; `window.history.state.idx` → `navigation.canGoBack()`; `window.location.pathname/.search` + URLSearchParams + `history.replaceState` → expo Linking + route params; GSAP → Reanimated/Moti; **`livekit-client`** (Room, RoomEvent, Track, hidden-`<div>` attach) → **@livekit/react-native + @livekit/react-native-webrtc** (audio auto-routed; drop DOM attach); **Web Audio** ringback/ringtone/beep/disconnect oscillators → bundled audio assets via expo-av / react-native-incall-manager; **Web Speech** TTS (es-ES) → expo-speech; **Service Worker** (`/sw.js`, INCOMING_CALL/ANSWER_CALL) → expo-notifications + native push/CallKit/ConnectionService; **Web Push** (PushManager/VAPID) → Expo device push token; `Notification.permission` → expo-notifications perms; localStorage → AsyncStorage/SecureStore; next/image → expo-image; cookie auth → Bearer; Tailwind glass/animate → RN styles + expo-blur + Reanimated.

**RN notes:** **plan the call engine first.** Keep the split: a global ported `CallProvider` (RN context) owns call logic + renders incoming/active HUDs above the navigator; `/citofonia` is the in-call full-screen UI + dialer/visitas/recepción tabs. Voice: LiveKit RN `Room`, `localParticipant.setMicrophoneEnabled(true)`, set CONNECTED on first remote audio track, request mic permission before connect, keep 25s no-answer timeout + `ParticipantDisconnected`→endCall. Tones: pre-bundle 4 short assets (ringback/ringtone/beep/disconnect) via expo-av, or react-native-incall-manager (ringtone + speaker routing + proximity). Incoming (foreground): WS `citofonia/incoming_call` `{room, callerName}`; (background/killed): native data push carrying `{room, callerName}` → tap deep-links to `/citofonia` → `joinRoom(room)`; consider react-native-callkeep for native ring UX. Re-register push token to `/usuarios/me/push-subscriptions` on every profile load (idempotent; body shape changes to Expo token). **Gotchas:** (1) wire the real `POST /visitas` for Add-Visita; (2) Bearer token must be reliable (SecureStore rehydrate) or every call/WS 401s; (3) keep `sanitizePeerId` (`{conjuntoId}-VIGILANTE`/`-ADMINISTRADOR`/`numero-XXXX`/`user-{id}`); (4) clean up `callTime` timer + AudioContext lifecycle on unmount/endCall.

---

## 6. `/visitantes` — Visitantes (digital invitations) · complexity: medium

**Roles:** RESIDENTE, PROPIETARIO, ADMIN — any authenticated resident-side user (gated by the `(app)` layout, not the page).

**Purpose:** view visits grouped by status (active-today / scheduled / history), create a new visit invitation (pedestrian or vehicular, optional plate), share a digital access pass via WhatsApp or clipboard. Realtime updates on `visita` events.

**Data sources:**
- `GET /api/v1/comunicaciones` → `{visitas, paquetes}` (**only `visitas` consumed**) — on mount + every WS `visita` event (silent refetch).
- `POST /api/v1/visitas` `{nombre, tipo:'PEATONAL'|'VEHICULAR', vehiculoTipo? (omit when 'NINGUNO'), placa?, observacion?}` → `VisitaDto` — on form submit; success prepends the returned DTO to local state + opens the QR modal.
- `GET /api/v1/usuarios/me/profile`, `GET /api/v1/notificaciones` (+ WS `notification`), `GET /api/v1/reservas`, `PUT /api/v1/notificaciones/leidas` — via ProfileHeader. `GET /api/v1/auth/ws-ticket` + `GET /api/v1/ws?token=` — app-level WebSocketProvider; screen reacts to `domain==='visita'`.

**State:** local — `isQRModalOpen`, `newVisitForm {name,tipo,vehiculoTipo,placa,observacion}`, `visitors`, `lastVisit` (QR modal subject), `loading`, `submitting`, `error`. Derived (no memo): `activeVisitors/scheduledVisitors/pastVisitors` via `getVisitStatus()`, `nonActiveVisitors`. `containerRef`. Zustand `useAuth` (read-only `user` for invitation text) + `useWsSubscription('visita')`.

**Key components:** `ProfileHeader`; lucide (note `QrCode` is a **static decorative icon**, not a real QR); sonner; **inline QR modal** (no separate component — page.tsx is a single self-contained ~455-line file).

**Interactions:** summary cards (read-only, zero-padded counts); new-visit form (nombre input; PEATONAL/VEHICULAR toggle; conditional placa input shown only for VEHICULAR, auto-uppercased; "Programar Visita" submit, spinner/disabled while submitting); empty-name → `toast.error('Por favor ingresa el nombre del invitado')` (no API call); on success → prepend returned DTO, set `lastVisit`, open QR modal, toast, reset; QR modal opened from create success / active "MoreHorizontal" / scheduled "REENVIAR QR" / history "ArrowRight"; close via backdrop/X; "Copiar" → `navigator.clipboard.writeText(buildInvitationText)`; "WhatsApp" → `window.open('https://wa.me/?text=...')`; "Ver Todo" header buttons are **dead** (no handler); "Tiempo Real" pill decorative; WS `visita` → silent refetch + re-group.

**Web-only APIs → RN:** `window.open` (wa.me) → `Linking.openURL('whatsapp://send?text=...')` with `wa.me` fallback + `canOpenURL`; `navigator.clipboard` → expo-clipboard; GSAP fade-up → Reanimated/Animated; next/image (ProfileHeader) → expo-image; next/navigation → expo-router; localStorage → AsyncStorage/SecureStore; `document mousedown` → Modal/Pressable backdrop; `<style>` hide-scrollbar → `showsVerticalScrollIndicator={false}`; browser WebSocket + cookie → RN WebSocket + `?token=` ticket + Bearer; cookie fetch → Bearer; Tailwind glass → NativeWind/StyleSheet + expo-blur; sonner → RN toast.

**RN notes:** single scrollable screen (ScrollView, bottom padding for tab bar); route `app/(app)/visitantes.tsx` under the auth-gated layout. **Data:** list = `GET /comunicaciones` → read `data.visitas ?? []`. **Create:** POST `/visitas`, omit `vehiculoTipo` when 'NINGUNO', send `placa`/`observacion` only when non-empty (mirror trim/undefined exactly). QR modal: keep decorative OR (recommended) render a real QR from `visit.id` via `react-native-qrcode-svg`. Port `buildInvitationText` verbatim (uses `user.nombre/torre/apto` + es-CO date — swap `toLocaleString` for a date lib if Hermes Intl is missing). Keep `getVisitStatus` client-side date bucketing identical. Port ProfileHeader once as a shared header. Decide whether to wire the dead "Ver Todo" to a full-list screen. Preserve Spanish copy as-is.

---

## 7. `/pqrs` — PQRS (Peticiones, Quejas, Reclamos y Soporte) · complexity: low

**Roles:** RESIDENTE, any authenticated user.

**Purpose:** view all the resident's PQRS requests (peticiones, quejas, reclamos, sugerencias, mantenimiento) with status + date, aggregate counts (total/open/resolved), and file a new request via a modal. Realtime over WebSocket.

**Data sources:**
- `GET /api/v1/solicitudes` → `Solicitud[]` — on mount (guarded `if (user)`) + every WS `solicitud` event. **DTO mismatch:** the page declares a local `Solicitud` reading `s.creadoEn`, but backend `SolicitudDto` uses `createdAt` (and includes `usuarioId/imagenes/proveedorId`). Reconcile in the port.
- `POST /api/v1/solicitudes` — body `formData {tipo, categoria, descripcion, urgente}` → `CreateSolicitudRequest {categoria, tipo?, descripcion, urgente?, imagenes?}` → `Solicitud` prepended to list.
- `GET /api/v1/auth/me` (indirect via `useAuth.checkAuth`), `GET /api/v1/usuarios/me/profile`, `GET /api/v1/notificaciones` (+ WS), `GET /api/v1/reservas`, `PUT /api/v1/notificaciones/leidas` — via ProfileHeader. `GET /api/v1/auth/ws-ticket` — WebSocketProvider.

**State:** local — `solicitudes`, `isLoading`, `isFormOpen`, `isSubmitting`, `formData {tipo:'PETICION', categoria:'OTRO', descripcion:'', urgente:false}`. `containerRef`. Zustand `useAuth` + `useWsSubscription('solicitud')`. No React Query / no shared PQRS store.

**Key components:** `ProfileHeader`; 3 inline stats cards (Total/Abiertas/Resueltas); CTA "Radicar nueva PQRS"; non-functional "Filtrar" button (decorative); list (loading spinner / empty card / mapped cards with icon by `TIPO_CONFIG`, status pill, date, last-6 ID, urgent badge); create modal/bottom-sheet (5-button type grid, description textarea, "Vincular Foto" affordance — UI only, not wired, urgente checkbox, submit); lucide; sonner.

**Interactions:** open modal (bottom sheet on mobile: `items-end` + `rounded-t-[48px]` + slide-in); close via X/backdrop (only when `!isSubmitting`); type picker sets `formData.tipo` + side-effects `categoria` (MANTENIMIENTO→'ELECTRICIDAD', else 'OTRO'); description controlled (empty/whitespace blocked with `toast.warning('Debes describir el motivo')`); urgente toggle; "Vincular Foto" has **no handler** (decide whether to implement — backend supports `imagenes: string[]`); submit → POST, prepend, close, reset, `toast.success` with "Radicado #" = last-6 id uppercased; **list cards styled clickable but have NO onClick** (no detail nav); WS `solicitud` → full refetch (no granular patch).

**Web-only APIs → RN:** GSAP `.fade-up-pqrs` → Reanimated/Animated; next/image → expo-image; next/navigation → expo-router; `document mousedown` → Pressable/Modal backdrop; localStorage → AsyncStorage/SecureStore; browser WebSocket + `window.location.origin` → RN WebSocket + env base; cookie fetch → Bearer; Tailwind glass/`animate-in` → RN StyleSheet + expo-blur + Reanimated; sonner → RN toast; `process.env.NEXT_PUBLIC_API_URL` → expo-constants/`EXPO_PUBLIC_*`.

**RN notes:** route `/pqrs` as a stack/tab screen, auth-gated (mirror the `if (user) fetch` guard). SafeAreaView + ScrollView with bottom padding. Build a ScreenHeader from ProfileHeader (story-halo avatar, gendered welcome: masculino→Bienvenido, neutro→Bienvenide, else Bienvenida). Stats = 3 flex cards. Create form → @gorhom/bottom-sheet or Modal slide-up. Type picker = 2-col grid over `TipoPqr` ['PETICION','QUEJA','RECLAMO','SUGERENCIA','MANTENIMIENTO'] (keep the categoria side-effect; `CatServicio` = PLOMERIA/ELECTRICIDAD/CARPINTERIA/PINTURA/CERRAJERIA/OTRO if exposing a category picker). Subscribe `solicitud` + refetch. **Gotchas:** (1) use `createdAt` (not `creadoEn`) for the date + `id.slice(-6)`; (2) "Filtrar"/card-taps are dead — decide on a detail screen + filter sheet; (3) if implementing photo, use expo-image-picker → upload → send `imagenes` URLs; (4) ensure Bearer populated on login. Complexity low: one list + one create form + realtime refetch, no pagination, no detail view.

---

## 8. `/paqueteria` — Paquetería / Recepción de Envíos · complexity: medium

**Roles:** VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR, SUPER_ADMIN. (In scope as a core flow because residents receive its notifications; gated by role.)

**Purpose:** guard/admin package reception desk. Register an incoming package against a resident (from the directory) which notifies them; show live lobby inventory (pending only); mark each package delivered. Realtime keeps multiple guards in sync.

**Data sources:**
- `GET /api/v1/vigilancia/paquetes` → `PaqueteItem[]` (local shape `{id, descripcion, remitente, fechaLlegada, usuario?:{nombre, unidad?:{torre,numero}}}`; backend `PaqueteVigilanciaDto[]`, only EN_PORTERIA returned). On mount (Promise.all with directorio), after every POST register, and every WS `paquete` event.
- `GET /api/v1/directorio` → `ResidenteDirectorio[]` (**runtime nested-unidad shape** `{id, nombre, unidad:{torre, numero}}` — differs from the flat `DirectorioEntradaDto` in types.ts; follow the runtime shape the select renders). On mount only; populates the destinatario select.
- `POST /api/v1/vigilancia/paquetes` `{usuarioId, remitente, descripcion}` (response ignored; a GET follows) — on form submit; notifies the resident.
- `PUT /api/v1/vigilancia/paquetes/{id}/entregar` (no body) — on "Marcar como Entregado".
- `GET /api/v1/auth/ws-ticket` (WebSocketProvider), `GET /api/v1/auth/me` (via useAuth bootstrap).

**State:** local — `paquetes`, `residentes`, `loading`, `formData {usuarioId, remitente, descripcion}`, `isSubmitting`. Zustand `useAuth` ({user, loading}, `user.rol` for the role gate) + `useWsSubscription('paquete')`. No React Context.

**Key components:** `ProfileHeader`; lucide (Package, CheckCircle2, ScanLine, Clock, MapPin); sonner; inline registration form (destinatario `<select>`, remitente/descripción inputs, submit); inventory list of package cards (relative-time badge + deliver button); full-screen spinner while loading.

**Interactions:** role gate on mount (unauth → `router.push('/login')`; role not in [VIGILANTE, SUPERVISOR_VIGILANCIA, ADMINISTRADOR, SUPER_ADMIN] → toast + `/inicio`); submit guards double-submit, requires `usuarioId` (else `toast.error('Selecciona un residente destino')`), remitente/descripción HTML-required; success → `toast.success('Paquete registrado y Residente notificado')`, refetch, reset; destinatario select lists every resident as `'torre - Apto numero (nombre)'`; deliver → PUT then **optimistic** `paquetes.filter(p=>p.id!==id)` (on error `toast.error('Error de red')` but **no rollback** — existing bug); WS `paquete` → full refetch; relative-time "Hace N min" computed once on render (not on interval); notifications bell in ProfileHeader (PAQUETE notif routes to `/paqueteria`).

**Web-only APIs → RN:** `next/navigation` → expo-router `router.replace`; GSAP `.fade-up` → Reanimated; browser WebSocket + `window.location.origin` → RN WebSocket + real API_BASE from env; cookie fetch → Bearer; Tailwind glass/`animate-spin` → RN StyleSheet + expo-blur; sonner → RN toast; ProfileHeader deps (next/image → expo-image, `document mousedown` → Pressable backdrop, localStorage → AsyncStorage/SecureStore); native `<form>`/`<select>`/HTML required → @react-native-picker/picker or @gorhom/bottom-sheet selector + manual validation.

**RN notes:** single scrollable screen (ScrollView, paddingTop ~64 / paddingBottom ~128, SafeAreaView). Role+auth check in a useEffect / route guard reading `useAuth`, redirect via expo-router. Zustand stores port unchanged. Keep `useWsSubscription('paquete', refetchPaquetes)` verbatim; port WebSocketProvider (replace `window.location.origin` with real host from env; ensure `setAuthToken` populated since no cookie jar). Destinatario select → Picker or @gorhom/bottom-sheet list, label `'torre - Apto numero (nombre)'`. Two TextInputs + manual required validation; submit shows "Registrando...". Keep optimistic-delete on deliver but **consider re-fetching on error** to fix the existing bug. Relative-time computed once — optionally add a `setInterval(60000)` tick to keep it fresh. Port ProfileHeader once as shared. Map Tailwind tokens (text, surface-2, border, accent) to the theme.

---

## 9. `/perfil` — Perfil de Usuario (super profile) · complexity: high

**Roles:** RESIDENTE, ADMIN, PORTERO — any authenticated role (no page role gate; `userRole` defaults to RESIDENTE if `user.rol` missing).

**Purpose:** single-screen super-profile hub. Shows identity (name, role, tower/apt, citofonía internal number, avatar) + a 6-button status grid switching an in-page view between: personal info, active reservations, vehicles, pets, trámites, financial account (deuda), packages. The user can edit profile, change avatar, request to register vehicles/pets/other paperwork (with document uploads), pay pending charges, toggle light/dark theme, and log out.

**Data sources:**
- `GET /api/v1/usuarios/me/profile` → `ProfileResponse` (nombre, apto, torre, telefono, genero, email, bio, numeroInterno, avatar, unidad, vehiculos[], mascotas[], tramitesSolicitados[]). On mount via `Promise.all` (with `.catch(()=>null)`).
- `GET /api/v1/pagos` → `{pagos, recibos}`. On mount + background refetch after a successful pay.
- `GET /api/v1/reservas?filter=future` → active reservations (area name/image). On mount.
- `GET /api/v1/paquetes/mios` → active packages. On mount **AND** again in a separate earlier effect → **fetched twice; collapse in the port**.
- `PUT /api/v1/usuarios/me/profile` `{avatar}` — on photo change after client compression (max-width 400px JPEG q0.8). Fallback to localStorage-only on failure.
- `PUT /api/v1/usuarios/me/profile` `{nombre, telefono, genero, torre, apto}` — on Edit Profile submit (local name/phone/gender keys remapped to Spanish API keys).
- `POST /api/v1/tramites` `{tipo:'VEHICULO'|'MASCOTA'|'OTRO', payload, documentos:{nombre,base64,mimeType}[]}` — on Registration/Tramite submit. VEHICULO payload `{placa(upper/trim), marca?, modelo?, color?, tipo:'CARRO'|'MOTO'}`; MASCOTA `{nombre, tipo:'PERRO'|'GATO'|'OTRO', raza?}`; OTRO = raw regForm. Backend `deny_unknown_fields`; requires `DocumentoAdjuntoDto.mimeType`. Requires ≥1 attached doc.
- `GET /api/v1/usuarios/me/profile` (re-read `tramitesSolicitados` after a successful POST).
- `PUT /api/v1/pagos/{id}/pagar` `{metodo:'PSE'}` — on Pagar in Deuda view, **only if `PAYMENTS_ENABLED`** (else disabled toast + early return).
- `POST /api/v1/auth/logout` — on logout; clears in-memory token + all `conjuntos_profile_*` keys; then `router.push('/login')`.
- `GET /api/v1/auth/me` (indirect via `useAuth.checkAuth`).

**State:** Zustand `useAuth` ({user, loading, logout}; `userId`, `userRole=user.rol||'RESIDENTE'`); `ThemeContext` ({theme, toggleTheme}); `useWsStore` exists app-wide but **this page subscribes to no WS events**. Heavy local state: `userData`, `editForm`, `vehiculos`, `mascotas`, `tramites`, `activeReservas`, `activePaquetes`, `financialData {pagos,recibos,totalDebt}`, `viewMode` ('profile'|'vehicles'|'pets'|'deuda'|'requests'|'reservas'|'paquetes'), `financialTab`, `profilePic`, `hasMounted`, `isPaying`, `isSubmitting`, `isRegSubmitting`, `showEditModal`, `showMenu`, `showRegModal`, `regType`, `regForm`, `regDocs[]`. Refs: `containerRef`, `fileInputRef`. Persistence: localStorage `conjuntos_profile_pic_{userId}` / `conjuntos_profile_data_{userId}` / `conjuntos_theme`. URL: `?modal=edit` auto-opens the edit modal via `useSearchParams`.

**Key components:** `PerfilPage` wrapping `ProfileContent` in React Suspense (`useSearchParams` boundary — **unneeded in RN**); `BrandedFooter`; lucide (LogOut, ChevronLeft, Search, MoreHorizontal, Edit, Camera, Car, PawPrint, ShieldCheck, Mail, Phone, CheckCircle2, X, Plus, FileText, Info, ClipboardList, Lock, HelpCircle, CreditCard, Calendar, Package, User, Sun, Moon, ArrowRight); ~7 next/image uses (2 hero blur layers, edit-modal avatar, reservation image, pet photo, tramite doc thumbnails); all panels/modals inline.

**Interactions:** top bar (back `router.back()`; non-functional Search; MoreHorizontal menu → Editar Perfil / Privacidad [no-op] / Cerrar Sesión); 6-button status grid switches `viewMode` (counts shown); Deuda view pendientes/historial tab; Edit Profile bottom-sheet (Nombre, Torre[disabled], Apto[disabled], Telefono, Genero[select]; submit → PUT + state + localStorage; avatar camera → hidden file input → compress → preview → PUT); Registration/Tramite bottom-sheet (VEHICULO CARRO/MOTO + marca/modelo/año/color/placa; MASCOTA nombre/tipo/raza; OTRO single field by `regForm.tipo` CELULAR/EMAIL/PASSWORD/OTRO; multi-file dropzone image/* + pdf with thumbnails + per-file remove + image compression; requires ≥1 doc; submit → POST then refresh tramites); Tramites quick-action grid (Cambiar Celular/Correo/Clave/Otro → reg modal preset OTRO); Pay buttons gated by `PAYMENTS_ENABLED` → PSE overlay (`isPaying`) → optimistic mark + recompute `totalDebt` + background GET `/pagos`; theme toggle (Sun/Moon); two logout entry points; toasts; `?modal=edit` deep-link auto-opens edit modal.

**Web-only APIs → RN:** next/navigation (useRouter, useSearchParams) → expo-router/`useLocalSearchParams`; React Suspense boundary → unneeded; next/image fill+object-cover → expo-image with explicit sizing; localStorage (pic/data PII + theme) → AsyncStorage / **expo-secure-store** (pic+data PII); GSAP `.fade-up` → Reanimated/Moti; `document.startViewTransition` (ThemeContext) → drop / custom cross-fade; `documentElement.classList`/`data-theme` → RN theme context + StyleSheet/NativeWind; **canvas compression** (`new window.Image` + `canvas.toDataURL`) → **expo-image-manipulator**; `FileReader.readAsDataURL` → expo-image-picker/expo-document-picker base64 or expo-file-system; `<input type=file>` (hidden avatar + multi-file image/*+pdf) → expo-image-picker (camera/library) + expo-document-picker (PDFs); `<select>` (genero, mascota tipo) → RN picker/action sheet; Tailwind glass/CSS mask-image hero/fixed `max-w-[430px]`/CSS-class themes → NativeWind/StyleSheet + expo-blur + expo-linear-gradient + **@react-native-masked-view/masked-view**; cookie auth → Bearer + SecureStore; `process.env.NEXT_PUBLIC_*` → `EXPO_PUBLIC_*`/`extra`; sonner → RN toast.

**RN notes:** route `app/(app)/perfil`; replace `router.back()`/`router.push('/login')`; **drop the Suspense+useSearchParams wrapper**, read `?modal=edit` via `useLocalSearchParams`. Layout already a 430px mobile frame → SafeAreaView + ScrollView (paddingBottom ~128). Hero (the fiddliest visual): expo-image background + expo-blur layers + expo-linear-gradient + masked-view top-to-bottom fade — consider simplifying to one blurred image + gradient. Glass cards → expo-blur + translucent border. Edit + Registration modals → @gorhom/bottom-sheet or Modal + Reanimated with backdrop-tap dismiss. Compression → expo-image-manipulator (resize 400, q0.8, jpeg); pickers return base64 + **preserve real mimeType** (backend `deny_unknown_fields` needs `DocumentoAdjuntoDto.mimeType`). Move pic/data to expo-secure-store (PII), theme to AsyncStorage; replicate logout wiping all `conjuntos_profile_*` keys. **Collapse the double `GET /paquetes/mios`.** Payments gated OFF (Pagar = "coming soon" toast; PSE overlay/optimistic-pay path currently dead — port the gate, stub the overlay). Theme: drop `startViewTransition`; theme context with NativeWind/StyleSheet, optional Reanimated cross-fade. Verify Intl/Hermes for `toLocaleString`/`toLocaleDateString('es-ES')` or use a date lib/polyfill.
