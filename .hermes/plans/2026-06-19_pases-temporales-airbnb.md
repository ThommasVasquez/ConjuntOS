# Módulo de Pases Temporales (AirBnB / Huéspedes Temporales)

> **Para Hermes:** Usar `subagent-driven-development` para implementar este plan paso a paso.

**Goal:** Permitir que un propietario/arrendatario genere un pase temporal para huéspedes AirBnB que necesitan acceso a áreas comunes (gimnasio, piscina), entrada/salida del conjunto, y parqueadero para su vehículo si aplica.

**Architecture:** Nueva tabla `pases_temporales` con permisos granulares + `vehiculos_temporales`. Backend en Rust (Axum/Diesel), frontend en Next.js. El pase se representa como QR escaneable por el vigilante desde su panel. El huésped usa el pase como identificador; el vigilante lo valida escaneando el QR o buscando por código.

**Tech Stack:** Rust (Axum + Diesel), Next.js 15 + Tailwind v4, PostgreSQL 16, diseño blanco/negro puro con acentos azul `#009df2` y verde `#57bf00`.

---

## Paso 1: Migración de base de datos — tabla `pases_temporales`

**Objective:** Crear la tabla principal de pases temporales.

**Files:**
- Create: `backend/api/migrations/2026-06-19-000001_pases_temporales/up.sql`
- Create: `backend/api/migrations/2026-06-19-000001_pases_temporales/down.sql`

```sql
-- up.sql
CREATE TABLE pases_temporales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conjunto_id UUID NOT NULL REFERENCES conjuntos(id),
    creador_id UUID NOT NULL REFERENCES usuarios(id),
    unidad_id UUID NOT NULL REFERENCES unidades(id),
    -- Datos del huésped
    nombre_huesped TEXT NOT NULL,
    email_huesped TEXT,
    telefono_huesped TEXT,
    documento_huesped TEXT,
    -- Vigencia
    fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_fin TIMESTAMPTZ NOT NULL,
    -- Permisos granulares
    acceso_entrada BOOLEAN NOT NULL DEFAULT true,      -- entrar/salir
    acceso_gimnasio BOOLEAN NOT NULL DEFAULT false,
    acceso_piscina BOOLEAN NOT NULL DEFAULT false,
    acceso_parqueadero BOOLEAN NOT NULL DEFAULT false,  -- puede usar parqueadero
    acceso_zonas_comunes BOOLEAN NOT NULL DEFAULT true,  -- áreas comunes generales
    -- Estado
    estado TEXT NOT NULL DEFAULT 'ACTIVO',  -- ACTIVO, EXPIRADO, REVOCADO
    codigo_qr TEXT NOT NULL UNIQUE,          -- código único para validación
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revocado_en TIMESTAMPTZ
);
```

```sql
-- down.sql
DROP TABLE IF EXISTS pases_temporales;
```

---

## Paso 2: Migración de base de datos — tabla `vehiculos_temporales`

**Objective:** Tabla para vehículos asociados a un pase temporal.

**Files:**
- Create: `backend/api/migrations/2026-06-19-000002_vehiculos_temporales/up.sql`
- Create: `backend/api/migrations/2026-06-19-000002_vehiculos_temporales/down.sql`

```sql
-- up.sql
CREATE TABLE vehiculos_temporales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pase_id UUID NOT NULL REFERENCES pases_temporales(id) ON DELETE CASCADE,
    placa TEXT NOT NULL,
    marca TEXT,
    modelo TEXT,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
-- down.sql
DROP TABLE IF EXISTS vehiculos_temporales;
```

---

## Paso 3: Actualizar `schema.rs`

**Objective:** Regenerar el archivo de esquema Diesel con las nuevas tablas.

**Files:**
- Modify: `backend/api/src/db/schema.rs`

**Step 1:** Ejecutar `diesel migration run` en backend
**Step 2:** Ejecutar `diesel print-schema > src/db/schema.rs` (o copiar las definiciones manualmente)

Añadir al schema:
```rust
diesel::table! {
    pases_temporales (id) {
        id -> Uuid,
        conjunto_id -> Uuid,
        creador_id -> Uuid,
        unidad_id -> Uuid,
        nombre_huesped -> Text,
        email_huesped -> Nullable<Text>,
        telefono_huesped -> Nullable<Text>,
        documento_huesped -> Nullable<Text>,
        fecha_inicio -> Timestamptz,
        fecha_fin -> Timestamptz,
        acceso_entrada -> Bool,
        acceso_gimnasio -> Bool,
        acceso_piscina -> Bool,
        acceso_parqueadero -> Bool,
        acceso_zonas_comunes -> Bool,
        estado -> Text,
        codigo_qr -> Text,
        notas -> Nullable<Text>,
        created_at -> Timestamptz,
        revocado_en -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    vehiculos_temporales (id) {
        id -> Uuid,
        pase_id -> Uuid,
        placa -> Text,
        marca -> Nullable<Text>,
        modelo -> Nullable<Text>,
        color -> Nullable<Text>,
        created_at -> Timestamptz,
    }
}
```

Añadir joinables y allow_tables_to_appear_in_same_query.

---

## Paso 4: Modelos Rust — `pases_temporales`

**Objective:** Crear los modelos y DTOs.

**Files:**
- Create: `backend/api/src/domains/pases/models.rs`
- Create: `backend/api/src/domains/pases/dto.rs`
- Create: `backend/api/src/domains/pases/mod.rs`

**models.rs:**
```rust
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

#[derive(Queryable, Identifiable, Selectable, Debug, Clone)]
#[diesel(table_name = crate::db::schema::pases_temporales)]
pub struct PaseTemporal {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub creador_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub documento_huesped: Option<String>,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub acceso_entrada: bool,
    pub acceso_gimnasio: bool,
    pub acceso_piscina: bool,
    pub acceso_parqueadero: bool,
    pub acceso_zonas_comunes: bool,
    pub estado: String,
    pub codigo_qr: String,
    pub notas: Option<String>,
    pub created_at: DateTime<Utc>,
    pub revocado_en: Option<DateTime<Utc>>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::db::schema::pases_temporales)]
pub struct NuevoPaseTemporal {
    pub conjunto_id: Uuid,
    pub creador_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub documento_huesped: Option<String>,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub acceso_entrada: bool,
    pub acceso_gimnasio: bool,
    pub acceso_piscina: bool,
    pub acceso_parqueadero: bool,
    pub acceso_zonas_comunes: bool,
    pub codigo_qr: String,
    pub notas: Option<String>,
}

// Vehículo temporal
#[derive(Queryable, Identifiable, Selectable, Associations, Debug, Clone)]
#[diesel(belongs_to(PaseTemporal, foreign_key = pase_id))]
#[diesel(table_name = crate::db::schema::vehiculos_temporales)]
pub struct VehiculoTemporal {
    pub id: Uuid,
    pub pase_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable)]
#[diesel(table_name = crate::db::schema::vehiculos_temporales)]
pub struct NuevoVehiculoTemporal {
    pub pase_id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}
```

**dto.rs:**
```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaseTemporalDto {
    pub id: Uuid,
    pub creador_id: Uuid,
    pub unidad_id: Uuid,
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub documento_huesped: Option<String>,
    pub fecha_inicio: DateTime<Utc>,
    pub fecha_fin: DateTime<Utc>,
    pub acceso_entrada: bool,
    pub acceso_gimnasio: bool,
    pub acceso_piscina: bool,
    pub acceso_parqueadero: bool,
    pub acceso_zonas_comunes: bool,
    pub estado: String,
    pub codigo_qr: String,
    pub notas: Option<String>,
    pub created_at: DateTime<Utc>,
    pub vehiculos: Vec<VehiculoTemporalDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehiculoTemporalDto {
    pub id: Uuid,
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrearPaseRequest {
    pub nombre_huesped: String,
    pub email_huesped: Option<String>,
    pub telefono_huesped: Option<String>,
    pub documento_huesped: Option<String>,
    pub fecha_inicio: Option<DateTime<Utc>>,  // defaults to now
    pub fecha_fin: DateTime<Utc>,
    pub acceso_entrada: Option<bool>,
    pub acceso_gimnasio: Option<bool>,
    pub acceso_piscina: Option<bool>,
    pub acceso_parqueadero: Option<bool>,
    pub acceso_zonas_comunes: Option<bool>,
    pub vehiculos: Option<Vec<VehiculoTemporalInput>>,
    pub notas: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VehiculoTemporalInput {
    pub placa: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidarPaseRequest {
    pub codigo_qr: String,
}
```

---

## Paso 5: Repositorio Rust — `pases/repo.rs`

**Objective:** Funciones de acceso a datos para pases temporales.

**Files:**
- Create: `backend/api/src/domains/pases/repo.rs`

Funciones a implementar:
- `crear_pase(conn, data) -> PaseTemporal`
- `pases_por_unidad(conn, conjunto_id, unidad_id) -> Vec<PaseTemporalDto>`
- `pase_por_codigo(conn, conjunto_id, codigo) -> Option<PaseTemporalDto>`
- `pases_activos_por_conjunto(conn, conjunto_id) -> Vec<PaseTemporalDto>` (admin/vigilante)
- `revocar_pase(conn, pase_id) -> PaseTemporal`
- `vehiculos_de_pase(conn, pase_id) -> Vec<VehiculoTemporal>`
- `crear_vehiculo_temporal(conn, data) -> VehiculoTemporal`

---

## Paso 6: Handlers Rust — `pases/handlers.rs`

**Objective:** Endpoints REST para el módulo de pases.

**Files:**
- Create: `backend/api/src/domains/pases/handlers.rs`

**Endpointos:**

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/v1/pases` | PROPIETARIO, ARRENDATARIO, ADMINISTRADOR | Crear pase temporal |
| GET | `/api/v1/pases/mis-pases` | PROPIETARIO, ARRENDATARIO | Listar mis pases (por unidad) |
| GET | `/api/v1/pases/conjunto` | VIGILANTE, ADMINISTRADOR | Listar pases activos del conjunto |
| GET | `/api/v1/pases/validar/:codigo` | VIGILANTE, ADMINISTRADOR | Validar pase por código QR |
| PUT | `/api/v1/pases/:id/revocar` | PROPIETARIO, ARRENDATARIO, ADMINISTRADOR | Revocar pase |
| DELETE | `/api/v1/pases/:id` | PROPIETARIO, ADMINISTRADOR | Eliminar pase expirado |

---

## Paso 7: Registrar rutas y módulo

**Objective:** Registrar el nuevo módulo en la aplicación.

**Files:**
- Modify: `backend/api/src/domains/mod.rs` — añadir `pub mod pases;`
- Modify: `backend/api/src/openapi.rs` — registrar rutas
- Modify: `backend/api/src/main.rs` o `router.rs` — montar rutas con guards de rol

---

## Paso 8: Frontend — Página de Pases Temporales (Propietario/Arrendatario)

**Objective:** Página para que el dueño cree y gestione pases temporales.

**Files:**
- Create: `frontend/src/app/(app)/pases/page.tsx`

**UI esperada:**
1. **Header** con título "Pases Temporales" y subtítulo "Huéspedes y acceso temporal"
2. **Lista de pases activos** — cards con nombre del huésped, fechas, permisos, vehículos, QR
3. **Botón "Nuevo Pase"** → abre formulario modal o sección:
   - Nombre del huésped*
   - Email (opcional)
   - Teléfono (opcional)
   - Documento (opcional)
   - Fecha de inicio (default: hoy)
   - Fecha de fin*
   - Checkboxes: Entrada/Salida, Gimnasio, Piscina, Parqueadero, Zonas Comunes
   - Vehículos: botón "+ Agregar vehículo" → campos placa, marca, modelo, color
   - Notas (opcional)
4. **Cada card de pase activo muestra:**
   - Código QR para escanear
   - Estado (ACTIVO/EXPIRADO/REVOCADO)
   - Vehículos asociados
   - Botón "Revocar"

**Componentes de diseño:** `liquid-glass-card`, colores blanco/negro puro, acentos `#009df2` y `#57bf00`, sin grises.

---

## Paso 9: Frontend — Validación QR en panel de vigilante

**Objective:** El vigilante puede escanear/ingresar un código QR para validar un pase.

**Files:**
- Modify: `frontend/src/app/(app)/seguridad/page.tsx` (añadir tab "Pases")
- O crear: `frontend/src/app/(app)/control-visitas/page.tsx` (integrar)

**UI:**
1. Input para ingresar código QR manualmente
2. Botón "Escanear QR" (usa cámara del dispositivo)
3. Resultado: muestra datos del huésped, permisos, vehículos, vigencia
4. Indicador visual: ✅ válido / ❌ expirado o revocado

---

## Paso 10: Frontend — Navegación

**Objective:** Añadir "Pases" al menú de navegación para propietarios/arrendatarios.

**Files:**
- Modify: BottomNav component (en `frontend/src/components/shell/` o donde esté)
- Modify: `frontend/src/app/(app)/layout.tsx`

Añadir entrada: "Pases" con ícono de ticket/pase.

---

## Paso 11: Tipos TypeScript

**Objective:** Definir tipos para el frontend.

**Files:**
- Modify: `frontend/src/lib/api/types.ts`

```typescript
export interface PaseTemporalDto {
  id: string;
  creadorId: string;
  unidadId: string;
  nombreHuesped: string;
  emailHuesped?: string;
  telefonoHuesped?: string;
  documentoHuesped?: string;
  fechaInicio: string;
  fechaFin: string;
  accesoEntrada: boolean;
  accesoGimnasio: boolean;
  accesoPiscina: boolean;
  accesoParqueadero: boolean;
  accesoZonasComunes: boolean;
  estado: 'ACTIVO' | 'EXPIRADO' | 'REVOCADO';
  codigoQr: string;
  notas?: string;
  createdAt: string;
  vehiculos: VehiculoTemporalDto[];
}

export interface VehiculoTemporalDto {
  id: string;
  placa: string;
  marca?: string;
  modelo?: string;
  color?: string;
}

export interface CrearPaseRequest {
  nombreHuesped: string;
  emailHuesped?: string;
  telefonoHuesped?: string;
  documentoHuesped?: string;
  fechaInicio?: string;
  fechaFin: string;
  accesoEntrada?: boolean;
  accesoGimnasio?: boolean;
  accesoPiscina?: boolean;
  accesoParqueadero?: boolean;
  accesoZonasComunes?: boolean;
  vehiculos?: { placa: string; marca?: string; modelo?: string; color?: string }[];
  notas?: string;
}
```

---

## Paso 12: Prueba end-to-end

**Objective:** Verificar el flujo completo.

1. Login como arrendatario (`arrendatario@demo.conjuntos.app` / `123456789`)
2. Navegar a `/pases`
3. Crear un pase con gimnasio + parqueadero + 1 vehículo
4. Verificar que aparece en la lista
5. Login como vigilante (`vigilante@demo.conjuntos.app` / `123456789`)
6. Ir a panel de seguridad → tab Pases
7. Ingresar el código QR del pase creado
8. Verificar que muestra los datos correctos

---

## Riesgos y consideraciones

- **QR generation:** El backend debe generar un código único por pase. Usar `uuid::Uuid::new_v4().to_string()` truncado a 8 caracteres + prefijo para legibilidad.
- **Revocación:** El vigilante no debe poder revocar — solo el creador o admin.
- **Expiración automática:** El backend debe marcar pases como EXPIRADO cuando `fecha_fin < now()`. Hacerlo en la consulta (no requiere cron).
- **Vehículos temporales:** No deben mezclarse con `vehiculos` (residentes permanentes). Van en tabla separada.
- **Middleware:** Los pases temporales NO crean usuarios en el sistema — son entidades separadas. Si se necesita login, tocaría otro módulo.
- **Compatibilidad con `solicitudes_parqueadero`:** Si el huésped trae carro, el sistema actual de visitante-parqueadero (`reservas_visitante_parqueadero`) puede integrarse, pero es opcional para esta fase.
