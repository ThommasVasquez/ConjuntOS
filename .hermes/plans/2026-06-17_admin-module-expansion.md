# Expansión del Módulo de Administración — ConjuntOS

> **Goal:** Agregar 4 módulos nuevos al panel de administración: Gestión de Residentes, Dashboard Financiero Completo, PQRS/Solicitudes de Servicio, y Gestión de Áreas Comunes.

**Architecture:** Backend Rust (Axum + Diesel) con nuevos endpoints admin bajo `/admin/...`, frontend Next.js 15 + Tailwind v4 con nuevas páginas siguiendo el patrón existente (liquid-glass, fade-up, acento #009df2/#57bf00).

**Tech Stack:** Rust (Axum, Diesel ORM, serde camelCase), Next.js 15, Tailwind v4, Lucide icons

---

## Workstreams (ejecutar en paralelo)

### Stream A: Backend — Gestión de Residentes (nuevo módulo `admin_usuarios`)
- Ruta: `GET/POST /admin/usuarios`, `GET/PUT /admin/usuarios/{id}`
- Archivos: `backend/api/src/domains/admin_usuarios.rs` (nuevo), modificar `lib.rs` y `mod.rs`

### Stream B: Backend — Dashboard Financiero Completo
- Expandir `admin_stats.rs`: `GET /admin/finanzas/resumen`, `GET /admin/pagos`, `CRUD /admin/gastos`
- Archivos: `backend/api/src/domains/admin_finanzas.rs` (nuevo)

### Stream C: Backend — PQRS / Solicitudes de Servicio
- CRUD admin: `GET /admin/solicitudes`, `PUT /admin/solicitudes/{id}`
- CRUD residente: `GET/POST /solicitudes-servicio`, `GET /solicitudes-servicio/{id}`
- Archivos: `backend/api/src/domains/servicios.rs` (nuevo)

### Stream D: Backend — Áreas Comunes Admin
- CRUD admin: `GET/POST /admin/areas-comunes`, `GET/PUT/DELETE /admin/areas-comunes/{id}`
- `GET /admin/reservas` (todas las reservas)
- Archivos: `backend/api/src/domains/admin_areas.rs` (nuevo)

### Stream E: Frontend — Todas las páginas nuevas
- `/admin-residentes` — Listado + ficha de residente + edición + invitación
- `/admin-finanzas` (expandir) — Pagos, gastos, gráficos, exportación
- `/admin-pqrs` — Bandeja de solicitudes, asignación, seguimiento
- `/admin-areas` — CRUD de áreas comunes, ver calendario de reservas

---

## Detalles de implementación

### Convenciones backend (seguir patrones existentes):
- camelCase en DTOs con `#[serde(rename_all = "camelCase")]`
- `guard::require_admin(&user)?` al inicio de cada handler
- BigDecimal serializado como String (Law 6)
- WebSocket events tras mutaciones: `WsEvent { domain, action, payload }`
- Router plano: `Router::new().route(...)`
- Módulo en `domains/mod.rs` + `lib.rs build_router()`
- No mezclar esquemas — usar `#[derive(Serialize, ToSchema)]` en DTOs

### Convenciones frontend:
- `"use client"` al inicio
- `ProfileHeader`, `useAuth()`, `useRouter()`, `gsap`, `toast`, `useWsSubscription`
- Diseño: `liquid-glass rounded-3xl border border-border shadow-2xl`
- Acento: `#009df2` (reposo), `#57bf00` (hover/acción)
- Notificación: `#EF4444` con glow
- Animaciones: `gsap.fromTo(".fade-up", { opacity: 0, y: 20 }, ...)`
- Fondo: `bg-primary` / `bg-surface-2`
- Texto: `text-text` para todo (sin grises)
- BottomNav existente tiene espacio — agregar tabs según corresponda
