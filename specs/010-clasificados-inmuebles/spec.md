# 010 — Clasificados & Inmuebles

Status: **implemented+tested** (M5a).

## Purpose

Replaces `/api/user/clasificados` (GET, POST) and `/api/user/inmuebles` (GET with filters, POST).

## Endpoints — Clasificados

### `GET /api/v1/clasificados`
- **Auth**: any authenticated user.
- **Logic**: latest 50 active classifieds (`activo=true`) of the caller's conjunto. Joins the `usuarios` table to include seller contact info (nombre, telefono).
- **Response**: `ClasificadoDto[]` (id, nombre, categoria, descripcion, precio, imagenUrl, telefono, whatsapp, activo, creadoEn, propietario: { nombre, telefono }).

### `POST /api/v1/clasificados`
- **Auth**: any authenticated user (caller becomes propietario).
- **Body**: `{ nombre, categoria: CategoriaLocal, descripcion?, precio?: Decimal, imagenUrl?, telefono?, whatsapp? }`.
- **Logic**: inserts a row into `locales` with `propietario_id = caller`, `activo = true`.
- **Validation**: nombre must be non-empty after trim.
- **Response**: the created `ClasificadoDto`.
- **Note**: precio is stored as NUMERIC and serialized as a string in JSON (Law 6).

## Endpoints — Inmuebles

### `GET /api/v1/inmuebles`
- **Auth**: any authenticated user.
- **Query params** (all optional): `tipoNegocio`, `tipoUnidad`, `habitaciones`.
- **Logic**: latest 50 DISPONIBLE listings of the caller's conjunto. The owner also sees their own non-DISPONIBLE listings (VENDIDO, ARRENDADO). Filters narrow the result set additively.
- **Response**: `InmuebleDto[]` (id, titulo, descripcion, precio, tipoNegocio, tipoUnidad, habitaciones, banos, area, imagenes, caracteristicas, estado, creadoEn).

### `POST /api/v1/inmuebles`
- **Auth**: any authenticated user.
- **Body**: `{ titulo, descripcion, precio: Decimal, tipoNegocio: TipoNegocio, tipoUnidad: TipoUnidad, habitaciones?, banos?, area?: Decimal, imagenes?: string[], caracteristicas?: string[] }`.
- **Logic**: inserts listing with estado DISPONIBLE, `usuario_id = caller`.
- **Validation**: titulo and descripcion must be non-empty after trim.
- **Response**: the created `InmuebleDto`.

## Enums

- `CategoriaLocal`: RESTAURANTE, TIENDA, SERVICIO, OTRO (already defined).
- `TipoNegocio`: VENTA, ALQUILER.
- `TipoUnidad`: APARTAMENTO, CASA, LOCAL, OFICINA, BODEGA, PARQUEADERO, OTRO.
- `EstadoInmueble`: DISPONIBLE, VENDIDO, ARRENDADO, RETIRADO.

## Invariants

- Money (precio, area) travels as strings in JSON, stored as NUMERIC in Postgres (Law 6).
- Tenant isolation on all queries (Law 2).
- No auto-seeded demo data (Law 4).
