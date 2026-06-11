use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::db::enums::Rol;
use crate::domains::usuarios::models::Usuario;

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserDto {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub email: String,
    pub telefono: Option<String>,
    pub rol: Rol,
    pub unidad_id: Option<Uuid>,
    pub avatar: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub genero: Option<String>,
    pub must_change_password: bool,
    pub activo: bool,
}

impl From<Usuario> for UserDto {
    fn from(u: Usuario) -> Self {
        Self {
            id: u.id,
            conjunto_id: u.conjunto_id,
            nombre: u.nombre,
            email: u.email,
            telefono: u.telefono,
            rol: u.rol,
            unidad_id: u.unidad_id,
            avatar: u.avatar,
            torre: u.torre,
            apto: u.apto,
            genero: u.genero,
            must_change_password: u.must_change_password,
            activo: u.activo,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub nombre: Option<String>,
    pub telefono: Option<String>,
    pub genero: Option<String>,
    pub avatar: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResponse {
    #[serde(flatten)]
    pub user: UserDto,
    pub unidad: Option<UnidadDto>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UnidadDto {
    pub id: Uuid,
    pub numero: String,
    pub torre: Option<String>,
    pub piso: Option<i32>,
    pub tipo: crate::db::enums::TipoUnidad,
    /// Decimal serialized as string (Constitution Law 6).
    #[schema(value_type = String)]
    pub coeficiente: bigdecimal::BigDecimal,
}

impl From<crate::domains::conjuntos::models::Unidad> for UnidadDto {
    fn from(u: crate::domains::conjuntos::models::Unidad) -> Self {
        Self {
            id: u.id,
            numero: u.numero,
            torre: u.torre,
            piso: u.piso,
            tipo: u.tipo,
            coeficiente: u.coeficiente,
        }
    }
}
