# Pases Temporales (AirBnB / Alquiler Corto) — Plan de Implementación

> **Para Hermes:** Implementar según las tareas secuenciales descritas abajo.

**Objetivo:** Permitir que un PROPIETARIO emita pases temporales para huéspedes de alquiler corto (AirBnB), otorgándoles acceso a gimnasio, piscina, entrada/salida, parqueadero y asambleas durante un período definido, con credenciales temporales.

**Arquitectura:** Backend Rust (Axum + Diesel) — nueva migración, modelos, repo y handlers bajo `domains/pases_temporales/`. Frontend Next.js — nueva página en `(app)/pases-temporales/` con panel de administración para el propietario y vista limitada para el huésped. El huésped recibe un código de acceso temporal para iniciar sesión sin registro completo.

**Stack:** Rust (Axum 0.7, Diesel 2.2), PostgreSQL 16, Next.js 15 + Tailwind v4, TypeScript

---

## FASE 0 — Base de Datos

### Tarea 0.1: Crear migración de tablas

**Archivos:**
- Crear: `backend/migrations/2026-06-19-000001_pases_temporales/up.sql`
- Crear: `backend/migrations/2026-06-19-000001_pases_temporales/down.sql`

```sql
-- up.sql
CREATE TABLE pases_temporales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id),
    propietario_id UUID NOT NULL REFERENCES usuarios(id),
    unidad_id UUID NOT NULL REFERENCES unidades(id),
    nombre_anfitrion TEXT NOT NULL,
    nombre_huesped TEXT NOT NULL,
    email_huesped TEXT,
    telefono_huesped TEXT,
    codigo_acceso TEXT NOT NULL UNIQUE,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    -- permisos como booleanos individuales (simple, YAGNI)
    permiso_gimnasio BOOLEAN NOT NULL DEFAULT false,
    permiso_piscina BOOLEAN NOT NULL DEFAULT false,
    permiso_entrada_salida BOOLEAN NOT NULL DEFAULT true,
    permiso_vehiculo BOOLEAN NOT NULL DEFAULT false,
    permiso_asamblea BOOLEAN NOT NULL DEFAULT false,
    estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'EXPIRADO', 'REVOCADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehiculos_temporales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pase_id UUID NOT NULL REFERENCES pases_temporales(id) ON DELETE CASCADE,
    placa TEXT NOT NULL,
    marca TEXT,
    modelo TEXT,
    color TEXT
);

CREATE INDEX idx_pases_temporales_conjunto ON pases_temporales(conjunto_id);
CREATE INDEX idx_pases_temporales_propietario ON pases_temporales(propietario_id);
CREATE INDEX idx_pases_temporales_codigo ON pases_temporales(codigo_acceso);
```

```sql
-- down.sql
DROP TABLE IF EXISTS vehiculos_temporales;
DROP TABLE IF EXISTS pases_temporales;
```

### Tarea 0.2: Ejecutar migración localmente

```bash
cd backend && diesel migration run
```

---

## FASE 1 — Backend: Schema + Modelos + DTOs

### Tarea 1.1: Registrar tablas en `schema.rs`

Ejecutar:
```bash
cd backend && diesel print-schema > api/src/db/schema.rs
```

Verificar que `pases_temporales` y `vehiculos_temporales` aparecen como `diesel::table!`.

### Tarea 1.2: Crear modelos (`models.rs`)

- Crear: `backend/api/src/domains/pases_temporales/models.rs`

```rust
use chrono::{DateTime, NaiveDate, Utc};
use diesel::prelude::*;
use uuid::Uuid;
use crate::db::schema::{pases_temporales, vehiculos_temporales};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = pases_temporales, check_for_backend(diesel::pg::Pg))]
pub struct PaseTemporal {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub propietario_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub codigo_acceso: String,
    pub fecha_inicio: NaiveDate,
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
    pub estado: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = pases_temporales)]
pub struct NuevoPaseTemporal {
    pub conjunto_id: Uuid,
    pub propietario_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub codigo_acceso: String,
    pub fecha_inicio: NaiveDate,
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
}

#[derive(Queryable, Selectable, Identifiable, Associations, Debug, Clone)]
#[diesel(belongs_to(PaseTemporal, foreign_key = pase_id))]
#[diesel(table_name = vehiculos_temporales, check_for_backend(diesel::pg::Pg))]
pub struct VehiculoTemporal {
    pub id: Uuid,
    pub pase_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = vehiculos_temporales)]
pub struct NuevoVehiculoTemporal {
    pub pase_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}
```

### Tarea 1.3: Crear DTOs (`dto.rs`)

- Crear: `backend/api/src/domains/pases_temporales/dto.rs`

```rust
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct PaseTemporalDto {
    pub id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub codigo_acceso: String,
    pub fecha_inicio: NaiveDate,
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
    pub estado: String,
    pub created_at: String,
    pub vehiculos: Vec<VehiculoTemporalDto>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct VehiculoTemporalDto {
    pub id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CrearPaseTemporalRequest {
    pub unidad_id: Uuid,
    pub nombre_anfitrion: String,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub fecha_inicio: NaiveDate,
    pub fecha_fin: NaiveDate,
    pub permiso_gimnasio: bool,
    pub permiso_piscina: bool,
    pub permiso_entrada_salida: bool,
    pub permiso_vehiculo: bool,
    pub permiso_asamblea: bool,
    pub vehiculos: Option<Vec<VehiculoTemporalInput>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct VehiculoTemporalInput {
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RevocarPaseRequest {
    pub motivo: Option<String>,
}
```

### Tarea 1.4: Crear `mod.rs`

- Crear: `backend/api/src/domains/pases_temporales/mod.rs`

```rust
pub mod dto;
pub mod handlers;
pub mod models;
pub mod repo;

pub use handlers::router;
```

---

## FASE 2 — Backend: Repositorio + Handlers

### Tarea 2.1: Crear repositorio (`repo.rs`)

- Crear: `backend/api/src/domains/pases_temporales/repo.rs`

Funciones:
1. `crear_pase_temporal(conn, NuevoPaseTemporal) -> PaseTemporal`
2. `pases_activos_por_propietario(conn, propietario_id) -> Vec<PaseTemporal>`
3. `pase_por_codigo(conn, codigo_acceso) -> Option<PaseTemporal>`
4. `revocar_pase(conn, pase_id) -> Result`
5. `vehiculos_por_pase(conn, pase_id) -> Vec<VehiculoTemporal>`
6. `crear_vehiculo_temporal(conn, NuevoVehiculoTemporal) -> VehiculoTemporal`

### Tarea 2.2: Crear handlers (`handlers.rs`)

- Crear: `backend/api/src/domains/pases_temporales/handlers.rs`

Endpoints:
1. `POST /api/v1/pases-temporales` — solo PROPIETARIO (usando `guard::require`)
2. `GET /api/v1/pases-temporales/mis-pases` — PROPIETARIO ve sus pases emitidos
3. `GET /api/v1/pases-temporales/codigo/{codigo}` — público (validación de QR/código por el vigilante en portería)
4. `PUT /api/v1/pases-temporales/{id}/revocar` — PROPIETARIO revoca su pase
5. `DELETE /api/v1/pases-temporales/{id}` — PROPIETARIO elimina pase expirado

### Tarea 2.3: Registrar rutas en `openapi.rs`

- Modificar: `backend/api/src/openapi.rs`
- Añadir `pases_temporales::router()` al merge de rutas

### Tarea 2.4: Registrar módulo en `domains/mod.rs`

- Modificar: `backend/api/src/domains/mod.rs`
- Añadir: `pub mod pases_temporales;`

---

## FASE 3 — Frontend: Tipos + API

### Tarea 3.1: Añadir tipos TypeScript

- Modificar: `src/lib/api/types.ts`

```typescript
export interface PaseTemporalDto {
  id: string;
  nombre_anfitrion: string;
  nombre_huesped: string;
  email_huesped?: string;
  telefono_huesped?: string;
  codigo_acceso: string;
  fecha_inicio: string;
  fecha_fin: string;
  permiso_gimnasio: boolean;
  permiso_piscina: boolean;
  permiso_entrada_salida: boolean;
  permiso_vehiculo: boolean;
  permiso_asamblea: boolean;
  estado: "ACTIVO" | "EXPIRADO" | "REVOCADO";
  created_at: string;
  vehiculos: VehiculoTemporalDto[];
}

export interface VehiculoTemporalDto {
  id: string;
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
}

export interface CrearPaseTemporalRequest {
  unidad_id: string;
  nombre_anfitrion: string;
  nombre_huesped: string;
  email_huesped?: string;
  telefono_huesped?: string;
  fecha_inicio: string;
  fecha_fin: string;
  permiso_gimnasio: boolean;
  permiso_piscina: boolean;
  permiso_entrada_salida: boolean;
  permiso_vehiculo: boolean;
  permiso_asamblea: boolean;
  vehiculos?: VehiculoTemporalInput[];
}

export interface VehiculoTemporalInput {
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
}
```

---

## FASE 4 — Frontend: Página de Pases Temporales

### Tarea 4.1: Crear página para PROPIETARIO

- Crear: `src/app/(app)/pases-temporales/page.tsx`

Vista principal (rol PROPIETARIO):
- **Header**: "Pases Temporales" con descripción
- **Botón**: "+ Nuevo Pase" → abre formulario
- **Lista**: cards con pases emitidos (activos, expirados, revocados)
- **Cada card muestra**: nombre huésped, fechas, estado (badge color), permisos activos (íconos)

### Tarea 4.2: Formulario de creación de pase

- Modal o sección expandible con:
  - Selector de unidad (dropdown de unidades del propietario)
  - Campos: nombre anfitrión, nombre huésped, email, teléfono
  - Date pickers: fecha inicio, fecha fin
  - Toggle switches: gimnasio, piscina, entrada/salida, vehículo, asamblea
  - Si `permiso_vehiculo = true` → campos extra para placa, marca, modelo, color
  - Botón "Emitir Pase"

### Tarea 4.3: Vista de validación para vigilante

- Sección en la página de vigilante (`/seguridad` o `/visitantes`):
  - Input para ingresar `codigo_acceso`
  - Al validar, muestra los permisos del pase
  - Si `permiso_vehiculo = true` → muestra placa y datos del vehículo
  - Botón "Registrar entrada/salida"

### Tarea 4.4: Acceso del huésped (login temporal)

- Nueva ruta: `/login?codigo=XXXXXX`
- Si el código es válido y el pase está ACTIVO:
  - Crear una sesión temporal limitada (JWT con claims específicos: `rol: HUESPED_TEMPORAL`, `permisos: [...]`)
  - Redirigir a `/huesped` — vista simplificada que solo muestra:
    - Estado del pase (días restantes)
    - Permisos activos (íconos grandes)
    - Código QR con el código de acceso para mostrar en portería
    - Si tiene vehículo: datos del vehículo autorizado

---

## FASE 5 — Despliegue

### Tarea 5.1: Ejecutar migración en producción

```bash
ssh servidor "cd /ruta/conjunto/backend && diesel migration run"
```

### Tarea 5.2: Verificar endpoints en producción

```bash
TOKEN=$(curl -s -X POST https://api.conjuntos.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"propietario@demo.conjuntos.app","password":"123456789"}' | jq -r '.token')

curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.conjuntos.app/api/v1/pases-temporales/mis-pases | jq
```

---

## Verificación

- [ ] PROPIETARIO puede crear pase temporal con todos los permisos
- [ ] Pase aparece en `GET /mis-pases`
- [ ] PROPIETARIO puede revocar pase
- [ ] Código de acceso único generado automáticamente
- [ ] Huésped puede iniciar sesión con código
- [ ] Huésped ve solo sus permisos activos
- [ ] Vigilante puede validar código desde portería
- [ ] Vehículo temporal registrado correctamente
- [ ] Pase expirado se marca automáticamente como EXPIRADO
