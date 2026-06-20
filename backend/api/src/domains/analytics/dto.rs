use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DemografiaDto {
    pub total_unidades: i64,
    pub total_usuarios: i64,
    pub por_rol: Vec<ConteoRolDto>,
    pub por_torre: Vec<ConteoTorreDto>,
    pub nuevos_este_mes: i64,
    pub activos_30d: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConteoRolDto {
    pub rol: String,
    pub cantidad: i64,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConteoTorreDto {
    pub torre: String,
    pub cantidad: i64,
}
