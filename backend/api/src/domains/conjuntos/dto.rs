use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::Plan;
use crate::domains::conjuntos::models::Conjunto;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConjuntoDto {
    pub id: Uuid,
    pub nombre: String,
    pub nit: Option<String>,
    pub subdominio: String,
    pub direccion: String,
    pub ciudad: String,
    pub logo_url: Option<String>,
    pub color_primario: String,
    pub plan: Plan,
    pub activo: bool,
    pub representante_legal: Option<String>,
    pub notaria_escritura: Option<String>,
    pub numero_escritura: Option<String>,
    pub fecha_escritura: Option<DateTime<Utc>>,
    pub matricula_inmobiliaria: Option<String>,
    pub total_unidades: Option<i32>,
    pub creado_en: DateTime<Utc>,
}

impl From<Conjunto> for ConjuntoDto {
    fn from(c: Conjunto) -> Self {
        Self {
            id: c.id,
            nombre: c.nombre,
            nit: c.nit,
            subdominio: c.subdominio,
            direccion: c.direccion,
            ciudad: c.ciudad,
            logo_url: c.logo_url,
            color_primario: c.color_primario,
            plan: c.plan,
            activo: c.activo,
            representante_legal: c.representante_legal,
            notaria_escritura: c.notaria_escritura,
            numero_escritura: c.numero_escritura,
            fecha_escritura: c.fecha_escritura,
            matricula_inmobiliaria: c.matricula_inmobiliaria,
            total_unidades: c.total_unidades,
            creado_en: c.created_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateConjuntoRequest {
    pub nombre: String,
    pub subdominio: String,
    pub direccion: String,
    pub ciudad: String,
    pub nit: Option<String>,
    pub logo_url: Option<String>,
    pub color_primario: Option<String>,
    pub plan: Option<Plan>,
    pub representante_legal: Option<String>,
    pub notaria_escritura: Option<String>,
    pub numero_escritura: Option<String>,
    pub fecha_escritura: Option<DateTime<Utc>>,
    pub matricula_inmobiliaria: Option<String>,
    pub total_unidades: Option<i32>,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConjuntoRequest {
    pub nombre: Option<String>,
    pub direccion: Option<String>,
    pub ciudad: Option<String>,
    pub nit: Option<String>,
    pub logo_url: Option<String>,
    pub color_primario: Option<String>,
    pub plan: Option<Plan>,
    pub activo: Option<bool>,
    pub representante_legal: Option<String>,
    pub notaria_escritura: Option<String>,
    pub numero_escritura: Option<String>,
    pub fecha_escritura: Option<DateTime<Utc>>,
    pub matricula_inmobiliaria: Option<String>,
    pub total_unidades: Option<i32>,
}

/// Subdomain rule carried over from the legacy superadmin route:
/// lowercase, `[a-z0-9-]` only, non-empty.
pub fn sanitize_subdominio(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    (!cleaned.is_empty()).then_some(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_subdomains() {
        assert_eq!(
            sanitize_subdominio(" Torres del Parque! "),
            Some("torresdelparque".into())
        );
        assert_eq!(
            sanitize_subdominio("mi-conjunto"),
            Some("mi-conjunto".into())
        );
        assert_eq!(sanitize_subdominio("!!!"), None);
    }
}
