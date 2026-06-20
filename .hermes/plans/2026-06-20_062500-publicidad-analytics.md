# Sistema de Publicidad + Analytics — Plan de Implementación

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Vender espacios publicitarios en el feed de ConjuntOS con banners gestionables por admin, tracking de impresiones/clics, y un dashboard de estadísticas demográficas para mostrar a anunciantes.

**Architecture:** 
- Backend: API REST para `ad_spaces` (CRUD) + endpoints de stats demográficas + tracking de impresiones/clics
- Frontend: Admin panel para gestionar banners + inyección de ads en el feed del inicio + dashboard de analytics
- Infraestructura existente: tabla `ad_spaces` ya creada (migración `2026-06-10-000009`), sistema de `anuncios` funcional que sirve de patrón

**Tech Stack:** Rust/Axum/Diesel (backend), Next.js 15 + Tailwind v4 (frontend), Postgres 16

---

## Fase 1: Analytics Demográfico (datos para vender)

Esto es lo que más urge — sin datos no hay venta.

### Task 1: Endpoint `GET /api/v1/admin/analytics/demografia`

**Objective:** Un solo endpoint que devuelva todos los datos demográficos agregados del conjunto.

**Files:**
- Create: `backend/api/src/domains/analytics/mod.rs`
- Create: `backend/api/src/domains/analytics/handlers.rs`
- Create: `backend/api/src/domains/analytics/repo.rs`
- Create: `backend/api/src/domains/analytics/dto.rs`
- Modify: `backend/api/src/domains/mod.rs` (agregar `pub mod analytics;`)
- Modify: `backend/api/src/lib.rs` (agregar `.merge(domains::analytics::router())`)
- Modify: `backend/api/src/openapi.rs` (agregar paths)

**DTO:**
```rust
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DemografiaDto {
    /// Total de unidades (aptos + casas) en el conjunto
    pub total_unidades: i64,
    /// Total de usuarios activos
    pub total_usuarios: i64,
    /// Desglose por rol
    pub por_rol: Vec<ConteoRolDto>,
    /// Desglose por torre
    pub por_torre: Vec<ConteoTorreDto>,
    /// Usuarios registrados este mes
    pub nuevos_este_mes: i64,
    /// Usuarios activos (con login) últimos 30 días
    pub activos_30d: i64,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConteoRolDto {
    pub rol: String,
    pub cantidad: i64,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConteoTorreDto {
    pub torre: String,
    pub cantidad: i64,
}
```

**Handler:**
```rust
// GET /api/v1/admin/analytics/demografia
pub async fn demografia(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<DemografiaDto>> {
    guard::require_admin(&user)?;
    let mut conn = state.pool.get().await?;
    let stats = repo::demografia(&mut conn, user.conjunto_id).await?;
    Ok(Json(stats))
}
```

**Repo — queries SQL directas (más simples que Diesel para agregaciones):**
```rust
pub async fn demografia(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<DemografiaDto> {
    // Total unidades
    let total_unidades: i64 = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM unidades WHERE conjunto_id = $1"
    ).bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn).await?.cnt;

    // Total usuarios activos
    let total_usuarios: i64 = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND activo = true"
    ).bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn).await?.cnt;

    // Por rol
    let por_rol: Vec<ConteoRolDto> = diesel::sql_query(
        "SELECT rol, COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND activo = true GROUP BY rol ORDER BY cnt DESC"
    ).bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .load::<RolCountRow>(conn).await?
    .into_iter().map(|r| ConteoRolDto { rol: r.rol, cantidad: r.cnt }).collect();

    // Por torre
    let por_torre: Vec<ConteoTorreDto> = diesel::sql_query(
        "SELECT COALESCE(torre, 'Sin torre') as torre, COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND activo = true GROUP BY torre ORDER BY cnt DESC"
    ).bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .load::<TorreCountRow>(conn).await?
    .into_iter().map(|r| ConteoTorreDto { torre: r.torre, cantidad: r.cnt }).collect();

    // Nuevos este mes
    let nuevos_este_mes: i64 = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND created_at >= date_trunc('month', now())"
    ).bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn).await?.cnt;

    // Activos 30d (último login)
    let activos_30d: i64 = diesel::sql_query(
        "SELECT COUNT(*) as cnt FROM usuarios WHERE conjunto_id = $1 AND last_login_at >= now() - interval '30 days'"
    ).bind::<diesel::sql_types::Uuid, _>(conjunto_id)
    .get_result::<CountRow>(conn).await?.cnt;

    Ok(DemografiaDto { total_unidades, total_usuarios, por_rol, por_torre, nuevos_este_mes, activos_30d })
}
```

**Verification:**
```bash
curl -s -b /tmp/cookies_chat.txt https://api.conjuntos.app/api/v1/admin/analytics/demografia | jq
# Debe devolver JSON con totalUnidades, totalUsuarios, porRol, porTorre, etc.
```

---

### Task 2: Frontend — Página de Analytics para Admin

**Objective:** Página `/admin-analytics` que muestre los datos demográficos en tarjetas visuales.

**Files:**
- Create: `src/app/(app)/admin-analytics/page.tsx`
- Modify: `src/components/shell/BottomNav.tsx` (agregar tab si aplica, o solo ruta admin)
- Modify: `src/lib/api/types.ts` (agregar `DemografiaDto` interface)

**TypeScript interfaces:**
```typescript
export interface DemografiaDto {
  totalUnidades: number;
  totalUsuarios: number;
  porRol: { rol: string; cantidad: number }[];
  porTorre: { torre: string; cantidad: number }[];
  nuevosEsteMes: number;
  activos30d: number;
}
```

**Página — estructura visual:**
- Header: "Analytics & Demografía"
- Tarjeta grande: Total unidades + Total usuarios
- Grilla 2-col: Nuevos este mes / Activos 30d
- Sección: Distribución por Rol (barras horizontales con %)
- Sección: Distribución por Torre (lista ordenada)
- Botón "Exportar PDF" (opcional, fase 2)

**Verification:**
Navegar a `https://app.conjuntos.app/admin-analytics` como admin → ver datos reales.

---

## Fase 2: Sistema de Banners Publicitarios

### Task 3: Backend API — CRUD de ad_spaces

**Objective:** Endpoints REST para que el admin gestione banners publicitarios.

**Files:**
- Create: `backend/api/src/domains/anuncios/anuncios_handlers.rs` (extender con ad_spaces)
- Create: `backend/api/src/domains/anuncios/ad_models.rs`
- Create: `backend/api/src/domains/anuncios/ad_repo.rs`
- Create: `backend/api/src/domains/anuncios/ad_dto.rs`
- Modify: `backend/api/src/domains/anuncios/mod.rs`

**Endpoints:**
```
GET    /api/v1/admin/ad-spaces        → listar ads del conjunto
POST   /api/v1/admin/ad-spaces        → crear nuevo banner
PUT    /api/v1/admin/ad-spaces/:id    → actualizar banner
DELETE /api/v1/admin/ad-spaces/:id    → eliminar banner
GET    /api/v1/ad-spaces/active       → ads activos (público, para el feed)
POST   /api/v1/ad-spaces/:id/click    → registrar clic (+1 al contador)
POST   /api/v1/ad-spaces/:id/impress  → registrar impresión (+1)
```

**Model:**
```rust
#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = ad_spaces)]
pub struct AdSpace {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub posicion: String,        // "FEED_TOP", "FEED_MID", "FEED_BOTTOM", "SIDEBAR"
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub activo: bool,
    pub empresa: Option<String>,
    pub inicio_en: DateTime<Utc>,
    pub fin_en: DateTime<Utc>,
    pub impresiones: i32,
    pub clics: i32,
}
```

**DTO para el feed:**
```rust
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdSpaceFeedDto {
    pub id: Uuid,
    pub nombre: String,
    pub posicion: String,
    pub imagen_url: Option<String>,
    pub link_url: Option<String>,
    pub empresa: Option<String>,
}
```

**Listar activos para feed (filtra por fecha y activo):**
```rust
pub async fn list_active_ads(conn: &mut DbConn, conjunto_id: Uuid) -> ApiResult<Vec<AdSpaceFeedDto>> {
    let now = Utc::now();
    let rows = ad_spaces::table
        .filter(ad_spaces::conjunto_id.eq(conjunto_id))
        .filter(ad_spaces::activo.eq(true))
        .filter(ad_spaces::inicio_en.le(now))
        .filter(ad_spaces::fin_en.ge(now))
        .select(AdSpace::as_select())
        .load(conn)
        .await?;
    Ok(rows.into_iter().map(AdSpaceFeedDto::from).collect())
}
```

**Registrar impresión (incrementa contador):**
```rust
pub async fn register_impression(conn: &mut DbConn, ad_id: Uuid) -> ApiResult<()> {
    diesel::update(ad_spaces::table.filter(ad_spaces::id.eq(ad_id)))
        .set(ad_spaces::impresiones.eq(ad_spaces::impresiones + 1))
        .execute(conn).await?;
    Ok(())
}
```

---

### Task 4: Frontend — Admin Panel de Banners

**Objective:** Página `/admin-banners` con tabla CRUD para gestionar espacios publicitarios.

**Files:**
- Create: `src/app/(app)/admin-banners/page.tsx`
- Modify: `src/lib/api/types.ts` (agregar `AdSpaceDto`, `CreateAdSpaceRequest`)
- Modify: `src/components/shell/BottomNav.tsx` (o menú admin)

**TypeScript interfaces:**
```typescript
export interface AdSpaceDto {
  id: string;
  nombre: string;
  posicion: "FEED_TOP" | "FEED_MID" | "FEED_BOTTOM";
  imagenUrl: string | null;
  linkUrl: string | null;
  activo: boolean;
  empresa: string | null;
  inicioEn: string;
  finEn: string;
  impresiones: number;
  clics: number;
}
```

**Página — UI:**
- Lista de banners con: nombre, empresa, posición, impresiones, clics, CTR%, activo (toggle)
- Botón "Nuevo Banner" → modal/form con: nombre, empresa, posición (select), imagen (upload), link URL, fechas inicio/fin
- Cada row tiene botones: editar, toggle activo, eliminar
- Stats visibles: impresiones, clics, CTR = clics/impresiones * 100

---

### Task 5: Inyectar Ads en el Feed del Inicio

**Objective:** Modificar el feed de inicio para intercalar banners entre los anuncios.

**Files:**
- Modify: `src/app/(app)/inicio/page.tsx`

**Strategy:** 
Después de cada N anuncios (ej. cada 3), insertar un banner ad. Usar el endpoint `GET /ad-spaces/active` para obtener los banners activos.

```tsx
// En el inicio, fetch ads:
const [ads, setAds] = useState<AdSpaceFeedDto[]>([]);
useEffect(() => {
  api.get<AdSpaceFeedDto[]>('/ad-spaces/active').then(setAds).catch(()=>{});
}, []);

// En el render del feed, intercalar:
{anuncios.map((anuncio, idx) => (
  <Fragment key={anuncio.id}>
    <AnuncioCard anuncio={anuncio} />
    {/* Insertar ad cada 3 anuncios */}
    {idx > 0 && idx % 3 === 0 && ads.length > 0 && (
      <BannerAdCard ad={ads[idx / 3 % ads.length]} />
    )}
  </Fragment>
))}
```

**BannerAdCard component:**
```tsx
function BannerAdCard({ ad }: { ad: AdSpaceFeedDto }) {
  const handleClick = () => {
    api.post(`/ad-spaces/${ad.id}/click`, {}).catch(()=>{});
    if (ad.linkUrl) window.open(ad.linkUrl, '_blank');
  };
  
  // Registrar impresión al montar
  useEffect(() => {
    api.post(`/ad-spaces/${ad.id}/impress`, {}).catch(()=>{});
  }, [ad.id]);

  return (
    <div onClick={handleClick} 
      className="cursor-pointer rounded-[28px] overflow-hidden border border-accent/20 relative">
      {ad.imagenUrl && <Image src={ad.imagenUrl} alt={ad.nombre} ... />}
      <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full">
        Publicidad
      </div>
      {ad.empresa && (
        <div className="p-3 text-center text-[10px] text-text/60">{ad.empresa}</div>
      )}
    </div>
  );
}
```

---

### Task 6: Endpoint `GET /api/v1/admin/analytics/ads-stats`

**Objective:** Estadísticas agregadas de todos los banners para el dashboard.

**Files:**
- Modify: `backend/api/src/domains/analytics/handlers.rs`
- Modify: `backend/api/src/domains/analytics/repo.rs`
- Modify: `backend/api/src/domains/analytics/dto.rs`

**DTO:**
```rust
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdsStatsDto {
    pub total_impresiones: i64,
    pub total_clics: i64,
    pub ctr_global: f64,  // porcentaje
    pub por_banner: Vec<AdBannerStatDto>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdBannerStatDto {
    pub id: Uuid,
    pub nombre: String,
    pub empresa: Option<String>,
    pub impresiones: i32,
    pub clics: i32,
    pub ctr: f64,
    pub activo: bool,
}
```

---

## Fase 3: Pulido y Entrega

### Task 7: Revisión + commit + push + rebuild

- `cd backend && cargo check` — verificar compilación
- `git add -A && git commit -m "feat: publicidad + analytics dashboard" && git push`
- `docker compose up -d --build backend`
- Verificar con curl todos los endpoints nuevos
- Navegar a las páginas nuevas en el browser

---

## Resumen de Archivos

| Archivo | Acción |
|---|---|
| `backend/api/src/domains/analytics/mod.rs` | Crear |
| `backend/api/src/domains/analytics/handlers.rs` | Crear |
| `backend/api/src/domains/analytics/repo.rs` | Crear |
| `backend/api/src/domains/analytics/dto.rs` | Crear |
| `backend/api/src/domains/ad_spaces/mod.rs` | Crear |
| `backend/api/src/domains/ad_spaces/handlers.rs` | Crear |
| `backend/api/src/domains/ad_spaces/repo.rs` | Crear |
| `backend/api/src/domains/ad_spaces/models.rs` | Crear |
| `backend/api/src/domains/ad_spaces/dto.rs` | Crear |
| `backend/api/src/domains/mod.rs` | Modificar (agregar módulos) |
| `backend/api/src/lib.rs` | Modificar (agregar routers) |
| `backend/api/src/openapi.rs` | Modificar (agregar paths) |
| `src/app/(app)/admin-analytics/page.tsx` | Crear |
| `src/app/(app)/admin-banners/page.tsx` | Crear |
| `src/app/(app)/inicio/page.tsx` | Modificar (inyectar ads) |
| `src/lib/api/types.ts` | Modificar (agregar tipos) |

## Riesgos & Consideraciones

1. **La tabla `ad_spaces` ya existe** — verificar que la migración esté aplicada en prod
2. **`last_login_at` en usuarios** — verificar si existe este campo; si no, agregar migración o usar `created_at`
3. **Imágenes de banners** — usar el sistema de uploads existente (MinIO) o URLs externas
4. **Tracking de impresiones** — el frontend hace POST en cada render; considerar debounce para no saturar
5. **Rendimiento del feed** — intercalar ads no debería afectar; el fetch de ads es un solo GET
