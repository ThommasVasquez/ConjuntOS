# Perfil de Residente Temporal (Airbnb) — Plan de Implementación

> **For Hermes:** Implement task-by-task. Commit after each task.

**Goal:** El propietario crea un pase temporal que genera/activa un usuario `HUESPED_TEMPORAL`. El huésped ingresa con email + código de 8 caracteres como contraseña. Al expirar, se deshabilita. Un nuevo pase con nuevo código reactiva el mismo perfil.

**Architecture:**
- DB: nueva migración que añade `usuario_id` a `pases_temporales` y `HUESPED_TEMPORAL` al CHECK constraint de `usuarios.rol`
- Backend: el handler `crear_pase` crea/activa el usuario huésped y lo vincula. Scheduler desactiva usuarios de pases expirados.
- Frontend: dashboard mínimo para el huésped (datos, fechas, contacto del anfitrión). El propietario ve y gestiona sus huéspedes.

**Tech Stack:** Rust/Axum/Diesel (backend) + Next.js 15 (frontend) + Postgres 16

---

## Task 1: Migración DB — `HUESPED_TEMPORAL` en CHECK + `usuario_id` en pases

**Objective:** Permitir el rol `HUESPED_TEMPORAL` en la tabla `usuarios` y vincular pases a usuarios.

**Files:**
- Create: `backend/migrations/2026-06-19-NNNNNN_huesped_temporal/up.sql`
- Create: `backend/migrations/2026-06-19-NNNNNN_huesped_temporal/down.sql`

**Step 1: Escribir up.sql**

```sql
-- Permitir HUESPED_TEMPORAL en el CHECK de usuarios.rol
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (
        'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
        'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO',
        'SUPER_ADMIN', 'HUESPED_TEMPORAL'
    ));

-- Vincular pase temporal a un usuario (el huésped)
ALTER TABLE pases_temporales ADD COLUMN usuario_id UUID REFERENCES usuarios(id);
CREATE INDEX idx_pases_temporales_usuario ON pases_temporales(usuario_id);
```

**Step 2: Escribir down.sql**

```sql
ALTER TABLE pases_temporales DROP COLUMN IF EXISTS usuario_id;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN (
        'ARRENDATARIO', 'PROPIETARIO', 'ADMINISTRADOR', 'CONCEJO',
        'VIGILANTE', 'SUPERVISOR_VIGILANCIA', 'ENCARGADO_PARQUEADERO',
        'SUPER_ADMIN'
    ));
```

**Step 3: Actualizar el test del enum** — añadir `HUESPED_TEMPORAL` a `rol_round_trips_legacy_strings`

File: `backend/api/src/db/enums.rs:393-407`

```rust
for raw in [
    "ARRENDATARIO", "PROPIETARIO", "ADMINISTRADOR", "CONCEJO",
    "VIGILANTE", "SUPERVISOR_VIGILANCIA", "ENCARGADO_PARQUEADERO",
    "SUPER_ADMIN", "HUESPED_TEMPORAL",
] {
```

**Verification:** `cd backend && cargo test db::enums::tests::rol_round_trips_legacy_strings`

---

## Task 2: Actualizar modelo `PaseTemporal` y repo

**Objective:** Añadir `usuario_id` a los structs de Rust para que Diesel pueda leer/escribir la nueva columna.

**Files:**
- Modify: `backend/api/src/domains/pases_temporales/models.rs`
- Modify: `backend/api/src/domains/pases_temporales/dto.rs`
- Modify: `backend/api/src/domains/pases_temporales/repo.rs`

**Step 1: models.rs** — añadir `usuario_id` a `PaseTemporal` y `NuevoPaseTemporal`

```rust
// PaseTemporal — añadir después de propietario_id:
    pub usuario_id: Option<Uuid>,

// NuevoPaseTemporal — añadir al final:
    pub usuario_id: Option<Uuid>,
```

**Step 2: dto.rs** — añadir a `PaseTemporalDto`

```rust
    pub usuario_id: Option<Uuid>,
    // + en el impl From<PaseTemporal>:
    usuario_id: p.usuario_id,
```

**Step 3: Verificación:** `cd backend && cargo check`

---

## Task 3: Modificar `crear_pase` — crear/activar usuario huésped

**Objective:** Al crear un pase, si tiene `email_huesped`, crear o activar un usuario `HUESPED_TEMPORAL` con password = `codigo_acceso`.

**Files:**
- Modify: `backend/api/src/domains/pases_temporales/handlers.rs`
- Modify: `backend/api/src/domains/pases_temporales/repo.rs`

**Step 1: Añadir función en repo para crear usuario huésped**

En `repo.rs`:

```rust
use crate::db::schema::usuarios;
use crate::domains::usuarios::models::Usuario;

pub async fn upsert_usuario_huesped(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    nombre: &str,
    email: &str,
    password_hash: &str,
    unidad_id: Uuid,
) -> ApiResult<Usuario> {
    // Buscar existente por email
    let existente = usuarios::table
        .filter(usuarios::email.eq(email))
        .select(Usuario::as_select())
        .first(conn)
        .await
        .optional()?;

    if let Some(mut user) = existente {
        // Reactivar: nueva contraseña + activo = true
        diesel::update(usuarios::table.filter(usuarios::id.eq(user.id)))
            .set((
                usuarios::password_hash.eq(password_hash),
                usuarios::activo.eq(true),
            ))
            .execute(conn)
            .await?;
        user.activo = true;
        Ok(user)
    } else {
        // Crear nuevo usuario HUESPED_TEMPORAL
        diesel::insert_into(usuarios::table)
            .values((
                usuarios::conjunto_id.eq(conjunto_id),
                usuarios::nombre.eq(nombre),
                usuarios::email.eq(email),
                usuarios::password_hash.eq(password_hash),
                usuarios::rol.eq("HUESPED_TEMPORAL"),
                usuarios::unidad_id.eq(unidad_id),
                usuarios::activo.eq(true),
            ))
            .returning(Usuario::as_returning())
            .get_result(conn)
            .await
            .map_err(|e| {
                if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                    ApiError::BadRequest("Ya existe un usuario con ese email".into())
                } else {
                    ApiError::from(e)
                }
            })
    }
}
```

**Step 2: Modificar `crear_pase` handler** — después de crear el pase, si hay `email_huesped`, crear/activar el usuario

```rust
// Dentro de crear_pase, después de repo::crear_pase(...):
let usuario_id = if let Some(ref email) = body.email_huesped {
    let password_hash = password::hash_password_blocking(codigo.clone()).await?;
    let usuario = repo::upsert_usuario_huesped(
        &mut conn,
        user.conjunto_id,
        &body.nombre_huesped,
        email,
        &password_hash,
        body.unidad_id,
    ).await?;
    // Actualizar el pase con el usuario_id
    repo::vincular_usuario(&mut conn, pase.id, usuario.id).await?;
    Some(usuario.id)
} else {
    None
};
```

**Step 3: Añadir `vincular_usuario` al repo**

```rust
pub async fn vincular_usuario(conn: &mut DbConn, pase_id: Uuid, usuario_id: Uuid) -> ApiResult<()> {
    use crate::db::schema::pases_temporales::dsl::*;
    diesel::update(pases_temporales.filter(id.eq(pase_id)))
        .set(usuario_id.eq(Some(usuario_id)))
        .execute(conn)
        .await?;
    Ok(())
}
```

**Step 4: Importar `password` en handlers.rs**

```rust
use crate::auth::password;
```

**Verificación:** `cd backend && cargo check`

---

## Task 4: Revocar pase desactiva usuario huésped

**Objective:** Cuando un pase se revoca, desactivar el usuario vinculado.

**Files:**
- Modify: `backend/api/src/domains/pases_temporales/handlers.rs`
- Modify: `backend/api/src/domains/pases_temporales/repo.rs`

**Step 1: repo — `revocar_pase` también desactiva el usuario**

```rust
pub async fn revocar_pase(conn: &mut DbConn, pase_id: Uuid) -> ApiResult<()> {
    use crate::db::schema::pases_temporales::dsl::*;
    use crate::db::schema::usuarios;
    
    // Buscar el usuario vinculado antes de revocar
    let usuario_id: Option<Uuid> = pases_temporales
        .filter(id.eq(pase_id))
        .select(usuario_id)
        .first(conn)
        .await
        .optional()?
        .flatten();
    
    diesel::update(pases_temporales.filter(id.eq(pase_id)))
        .set(estado.eq(EstadoPaseTemporal::Revocado))
        .execute(conn)
        .await?;
    
    // Desactivar el usuario huésped vinculado
    if let Some(uid) = usuario_id {
        diesel::update(usuarios::table.filter(usuarios::id.eq(uid)))
            .set(usuarios::activo.eq(false))
            .execute(conn)
            .await?;
    }
    
    Ok(())
}
```

**Verificación:** `cd backend && cargo check`

---

## Task 5: Scheduler — desactivar usuarios de pases expirados

**Objective:** Un proceso periódico marca `activo = false` los usuarios cuyos pases ya expiraron.

**Files:**
- Modify: `backend/api/src/main.rs` (o donde esté el scheduler existente)

**Step 1: Añadir función de limpieza en `pases_temporales/repo.rs`**

```rust
pub async fn desactivar_usuarios_expirados(conn: &mut DbConn) -> ApiResult<u64> {
    use crate::db::schema::pases_temporales::dsl::*;
    use crate::db::schema::usuarios;
    
    let hoy = Utc::now().date_naive();
    
    // Buscar pases expirados que tienen usuario vinculado y aún activos
    let usuarios_a_desactivar: Vec<Uuid> = pases_temporales
        .filter(fecha_fin.lt(hoy))
        .filter(estado.eq(EstadoPaseTemporal::Activo))
        .filter(usuario_id.is_not_null())
        .select(usuario_id)
        .load::<Option<Uuid>>(conn)
        .await?
        .into_iter()
        .flatten()
        .collect();
    
    let count = usuarios_a_desactivar.len() as u64;
    
    // Marcar pases como expirados
    diesel::update(
        pases_temporales
            .filter(fecha_fin.lt(hoy))
            .filter(estado.eq(EstadoPaseTemporal::Activo))
    )
    .set(estado.eq(EstadoPaseTemporal::Expirado))
    .execute(conn)
    .await?;
    
    // Desactivar usuarios
    for uid in usuarios_a_desactivar {
        diesel::update(usuarios::table.filter(usuarios::id.eq(uid)))
            .set(usuarios::activo.eq(false))
            .execute(conn)
            .await?;
    }
    
    Ok(count)
}
```

**Step 2: Registrar el scheduler en main.rs** — ejecutar cada 30 minutos

```rust
// En el spawn del scheduler, añadir:
let state_clone = state.clone();
tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(1800));
    loop {
        interval.tick().await;
        if let Ok(mut conn) = state_clone.pool.get().await {
            let _ = crate::domains::pases_temporales::repo::desactivar_usuarios_expirados(&mut conn).await;
        }
    }
});
```

**Verificación:** `cd backend && cargo check`

---

## Task 6: Guard — permitir acceso a HUESPED_TEMPORAL

**Objective:** El rol `HUESPED_TEMPORAL` debe poder ver su propio perfil, su pase activo, y usar el chat.

**Files:**
- Modify: `backend/api/src/auth/guard.rs` (si existe)
- O: cada handler relevante

**Step 1: Buscar dónde se define `require` o los guards**

Revisar si existe `auth/guard.rs`. Si no, verificar cómo se manejan los permisos.

El endpoint `/auth/me` no usa guard (solo `AuthUser`), así que ya funciona.
El endpoint `/pases-temporales/mis-pases` requiere `ROLES_PASE = [Propietario]`.

**Step 2: Crear endpoint para que el huésped vea SU pase activo**

Añadir en `handlers.rs`:

```rust
/// GET /api/v1/pases-temporales/mi-pase — El huésped autenticado ve su pase activo.
async fn mi_pase(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<PaseTemporalDto>> {
    let mut conn = state.pool.get().await?;
    // Buscar pase activo vinculado a este usuario
    let pase = repo::pase_activo_por_usuario(&mut conn, user.id).await?
        .ok_or_else(|| ApiError::NotFound("No tienes un pase temporal activo".into()))?;
    
    let vehiculos = repo::vehiculos_por_pase(&mut conn, pase.id).await?;
    let mut dto = PaseTemporalDto::from(pase);
    dto.vehiculos = vehiculos.into_iter().map(VehiculoTemporalDto::from).collect();
    
    Ok(Json(dto))
}
```

Router:
```rust
.route("/pases-temporales/mi-pase", get(mi_pase))
```

**Step 3: Añadir función de repo**

```rust
pub async fn pase_activo_por_usuario(
    conn: &mut DbConn,
    usuario: Uuid,
) -> ApiResult<Option<PaseTemporal>> {
    use crate::db::schema::pases_temporales::dsl::*;
    let hoy = Utc::now().date_naive();
    Ok(pases_temporales
        .filter(usuario_id.eq(Some(usuario)))
        .filter(estado.eq(EstadoPaseTemporal::Activo))
        .filter(fecha_fin.ge(hoy))
        .select(PaseTemporal::as_select())
        .first(conn)
        .await
        .optional()?)
}
```

**Verificación:** `cd backend && cargo check`

---

## Task 7: Frontend — página de gestión para el Propietario

**Objective:** El propietario ve sus huéspedes temporales, puede crear/revocar pases, y ve el estado de cada huésped (activo/inactivo).

**Files:**
- Modify: `src/app/(app)/pases-temporales/page.tsx`
- Create: `src/lib/api/types.ts` (si no existe el tipo `PaseTemporalDto`)

**Step 1: Añadir columna de estado del usuario en la lista de pases**

En la tabla de pases existente, añadir una columna "Usuario" que muestre si el huésped tiene perfil activo, y el email.

**Step 2: Mostrar datos del huésped**

```tsx
{pase.usuario_id && (
  <span className="text-green-400 flex items-center gap-1">
    <CheckCircle2 size={12} />
    Perfil activo
  </span>
)}
{!pase.usuario_id && pase.email_huesped && (
  <span className="text-amber-400 flex items-center gap-1">
    <AlertCircle size={12} />
    Sin perfil
  </span>
)}
```

**Verificación:** Navegar a `/pases-temporales` como PROPIETARIO, crear un pase con email, verificar que aparece con "Perfil activo".

---

## Task 8: Frontend — vista del huésped temporal

**Objective:** El huésped hace login con email + código, ve su pase, fechas, permisos, y datos del anfitrión.

**Files:**
- Modify: `src/app/(app)/layout.tsx` (añadir ruta para `HuespedTemporal`)
- Create: `src/app/(app)/mi-estancia/page.tsx`

**Step 1: Crear página `mi-estancia`**

```tsx
"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import ProfileHeader from "@/components/shell/ProfileHeader";
import { Calendar, Clock, Car, User, DoorOpen, Dumbbell, Waves } from "lucide-react";

interface MiPaseDto {
  id: string;
  nombre_anfitrion: string;
  nombre_huesped: string;
  codigo_acceso: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  permiso_gimnasio: boolean;
  permiso_piscina: boolean;
  permiso_entrada_salida: boolean;
  permiso_vehiculo: boolean;
  vehiculos: { placa: string; marca?: string; color?: string }[];
  dias_restantes: number;
}

export default function MiEstanciaPage() {
  const { user } = useAuth();
  const [pase, setPase] = useState<MiPaseDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<MiPaseDto>("/pases-temporales/mi-pase")
      .then(setPase)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Cargando...</div>;
  if (!pase) return <div>No tienes una estancia activa</div>;

  const inicio = new Date(pase.fecha_inicio);
  const fin = new Date(pase.fecha_fin);
  const hoy = new Date();
  const diasRestantes = Math.ceil((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-bg">
      <ProfileHeader title="Mi Estancia" />
      <div className="p-4 space-y-4">
        {/* Info del anfitrión */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border">
          <h2 className="text-text-secondary text-sm mb-2">Anfitrión</h2>
          <div className="flex items-center gap-2">
            <User size={20} className="text-accent" />
            <span className="text-text font-medium">{pase.nombre_anfitrion}</span>
          </div>
        </div>
        
        {/* Fechas */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border">
          <div className="flex justify-between">
            <div>
              <p className="text-text-secondary text-xs">Check-in</p>
              <p className="text-text">{inicio.toLocaleDateString("es-CO")}</p>
            </div>
            <div className="text-right">
              <p className="text-text-secondary text-xs">Check-out</p>
              <p className="text-text">{fin.toLocaleDateString("es-CO")}</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
            <Clock size={16} className={diasRestantes <= 1 ? "text-red-400" : "text-accent"} />
            <span className="text-text">{diasRestantes} días restantes</span>
          </div>
        </div>

        {/* Permisos */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border">
          <h2 className="text-text-secondary text-sm mb-2">Permisos</h2>
          <div className="grid grid-cols-2 gap-2">
            {pase.permiso_entrada_salida && <PermisoBadge icon={DoorOpen} label="Entrada/Salida" />}
            {pase.permiso_gimnasio && <PermisoBadge icon={Dumbbell} label="Gimnasio" />}
            {pase.permiso_piscina && <PermisoBadge icon={Waves} label="Piscina" />}
            {pase.permiso_vehiculo && <PermisoBadge icon={Car} label="Vehículo" />}
          </div>
        </div>

        {/* Vehículos */}
        {pase.vehiculos.length > 0 && (
          <div className="bg-surface-2 rounded-xl p-4 border border-border">
            <h2 className="text-text-secondary text-sm mb-2">Vehículos</h2>
            {pase.vehiculos.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-text">
                <Car size={16} />
                <span className="font-mono">{v.placa}</span>
                {v.marca && <span className="text-text-secondary">{v.marca}</span>}
                {v.color && <span className="text-text-secondary">{v.color}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Código de acceso */}
        <div className="bg-surface-2 rounded-xl p-4 border border-border text-center">
          <p className="text-text-secondary text-xs mb-1">Tu código de acceso</p>
          <p className="text-2xl font-mono font-bold text-accent tracking-widest">{pase.codigo_acceso}</p>
          <p className="text-text-secondary text-xs mt-1">Muéstralo en portería</p>
        </div>
      </div>
    </div>
  );
}

function PermisoBadge({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-bg rounded-lg p-2">
      <Icon size={16} className="text-accent" />
      <span className="text-sm text-text">{label}</span>
    </div>
  );
}
```

**Step 2: Añadir al layout** — redirigir `HUESPED_TEMPORAL` a `/mi-estancia`

En `layout.tsx`, modificar la lógica de redirección post-login para `HUESPED_TEMPORAL`:

```tsx
if (user?.rol === "HUESPED_TEMPORAL") {
  router.push("/mi-estancia");
}
```

**Verificación:** Login como huésped → redirige a `/mi-estancia` → muestra datos del pase.

---

## Task 9: Comunicación huésped ↔ propietario

**Objective:** El huésped puede enviar mensajes al propietario desde su dashboard.

**Files:**
- Modify: `src/app/(app)/mi-estancia/page.tsx`

**Step 1: Añadir botón de contacto en mi-estancia**

```tsx
<div className="bg-surface-2 rounded-xl p-4 border border-border">
  <h2 className="text-text-secondary text-sm mb-2">Contactar anfitrión</h2>
  <p className="text-text mb-3">{pase.nombre_anfitrion}</p>
  <button 
    onClick={() => router.push(`/chat`)}
    className="w-full bg-accent text-white rounded-lg py-2.5 font-medium"
  >
    Enviar mensaje
  </button>
</div>
```

El chat existente ya funciona para cualquier usuario autenticado. Los mensajes del huésped aparecerán en el panel de administración/comunicaciones.

**Verificación:** Login como huésped → ir a chat → enviar mensaje → visible en admin chat.

---

## Task 10: Verificación end-to-end

**Objective:** Probar el flujo completo en vivo.

**Paso 1:** Login como `admin@demo.conjuntos.app` → ir a `/pases-temporales` → crear pase con email del huésped

**Paso 2:** Cerrar sesión → login con email del huésped + código de 8 caracteres

**Paso 3:** Verificar que redirige a `/mi-estancia`, muestra datos correctos, permisos, vehículos, días restantes

**Paso 4:** Verificar que el propietario puede ver el pase con "Perfil activo"

**Paso 5:** Revocar pase → verificar que el usuario huésped ya no puede hacer login (403 Forbidden)

**Paso 6:** Crear nuevo pase para el mismo email → verificar que el usuario se reactiva con nueva contraseña

---

## Resumen de archivos tocados

| Archivo | Acción |
|---|---|
| `backend/migrations/NNNNNN_huesped_temporal/up.sql` | CREATE |
| `backend/migrations/NNNNNN_huesped_temporal/down.sql` | CREATE |
| `backend/api/src/db/enums.rs:393-407` | MODIFY (test) |
| `backend/api/src/domains/pases_temporales/models.rs` | MODIFY |
| `backend/api/src/domains/pases_temporales/dto.rs` | MODIFY |
| `backend/api/src/domains/pases_temporales/repo.rs` | MODIFY |
| `backend/api/src/domains/pases_temporales/handlers.rs` | MODIFY |
| `backend/api/src/main.rs` | MODIFY (scheduler) |
| `src/app/(app)/mi-estancia/page.tsx` | CREATE |
| `src/app/(app)/layout.tsx` | MODIFY (redirección) |
| `src/app/(app)/pases-temporales/page.tsx` | MODIFY (columna usuario) |

---

## Riesgos

- **Email único**: si dos propietarios crean pases para el mismo huésped (mismo email), se reusará el usuario existente. Esto es el comportamiento deseado (reactivación), pero podría sorprender si son conjuntos diferentes. Para mitigar: el filtro de `find_by_email` debería incluir `conjunto_id`.
- **Seguridad de contraseña**: 8 caracteres alfanuméricos sin símbolos = ~2.8 billones de combinaciones. Suficiente para uso temporal, pero no para cuentas permanentes.
- **Scheduler timing**: corre cada 30 min. Un pase puede expirar a mediodía y el usuario seguir activo hasta las 12:30. Aceptable para MVP.
