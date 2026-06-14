use chrono::{DateTime, Utc};
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::enums::Rol;
use crate::db::schema::{mascotas, usuarios};

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = usuarios, check_for_backend(diesel::pg::Pg))]
pub struct Usuario {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub email: String,
    pub password_hash: String,
    pub must_change_password: bool,
    pub telefono: Option<String>,
    pub rol: Rol,
    pub unidad_id: Option<Uuid>,
    pub avatar: Option<String>,
    pub torre: Option<String>,
    pub apto: Option<String>,
    pub genero: Option<String>,
    pub activo: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Insertable, Debug)]
#[diesel(table_name = usuarios)]
pub struct NuevoUsuario {
    pub conjunto_id: Uuid,
    pub nombre: String,
    pub email: String,
    pub password_hash: String,
    pub rol: Rol,
    pub unidad_id: Option<Uuid>,
    pub torre: Option<String>,
    pub apto: Option<String>,
}

#[derive(Queryable, Selectable, Identifiable, Debug, Clone)]
#[diesel(table_name = mascotas, check_for_backend(diesel::pg::Pg))]
pub struct Mascota {
    pub id: Uuid,
    pub conjunto_id: Uuid,
    pub usuario_id: Uuid,
    pub nombre: String,
    pub tipo: String,
    pub raza: Option<String>,
    pub foto_url: Option<String>,
    pub created_at: DateTime<Utc>,
}
