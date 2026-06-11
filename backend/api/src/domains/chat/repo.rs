use std::cmp::Reverse;
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{chat_admin, mascotas, usuarios, vehiculos};
use crate::db::DbConn;
use crate::domains::chat::dto::{
    ChatConversacionDto, MascotaResumenDto, ResidentInfoDto, ResidenteProfileDto,
    ResidenteResumenDto, VehiculoResumenDto,
};
use crate::domains::chat::models::{ChatMessage, NuevoChatMessage};
use crate::error::ApiResult;

/// (id, nombre, avatar, torre, apto)
type UserInfoRow = (Uuid, String, Option<String>, Option<String>, Option<String>);

/// Last 50 messages for a resident's own chat thread.
pub async fn list_user_messages(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<ChatMessage>> {
    let rows = chat_admin::table
        .filter(chat_admin::conjunto_id.eq(conjunto_id))
        .filter(chat_admin::usuario_id.eq(usuario_id))
        .order(chat_admin::created_at.asc())
        .limit(50)
        .select(ChatMessage::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

pub async fn insert_message(conn: &mut DbConn, nuevo: NuevoChatMessage) -> ApiResult<ChatMessage> {
    let row = diesel::insert_into(chat_admin::table)
        .values(&nuevo)
        .returning(ChatMessage::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

/// Admin conversation list: one row per usuario_id who has sent or received
/// messages in this conjunto, with the latest message, unread count, and user
/// summary. Fetches all recent messages and aggregates in Rust (per-conjunto
/// chat volume is bounded).
pub async fn list_conversations(
    conn: &mut DbConn,
    conjunto_id: Uuid,
) -> ApiResult<Vec<ChatConversacionDto>> {
    // 1. All messages in this conjunto, newest first.
    let messages: Vec<ChatMessage> = chat_admin::table
        .filter(chat_admin::conjunto_id.eq(conjunto_id))
        .order(chat_admin::created_at.desc())
        .select(ChatMessage::as_select())
        .load(conn)
        .await?;

    if messages.is_empty() {
        return Ok(Vec::new());
    }

    // 2. Group by usuario_id: latest message + unread count.
    struct ConvAgg {
        ultimo_mensaje: String,
        ultimo_timestamp: DateTime<Utc>,
        no_leidos: i64,
    }
    let mut map: HashMap<Uuid, ConvAgg> = HashMap::new();
    for msg in &messages {
        map.entry(msg.usuario_id)
            .and_modify(|agg| {
                if !msg.es_de_admin && !msg.leido {
                    agg.no_leidos += 1;
                }
            })
            .or_insert_with(|| ConvAgg {
                ultimo_mensaje: msg.mensaje.clone(),
                ultimo_timestamp: msg.created_at,
                no_leidos: if !msg.es_de_admin && !msg.leido { 1 } else { 0 },
            });
    }

    // 3. Fetch user info for all usuario_ids in the map.
    let user_ids: Vec<Uuid> = map.keys().copied().collect();
    let users: Vec<UserInfoRow> = usuarios::table
        .filter(usuarios::id.eq_any(&user_ids))
        .select((
            usuarios::id,
            usuarios::nombre,
            usuarios::avatar,
            usuarios::torre,
            usuarios::apto,
        ))
        .load(conn)
        .await?;

    let user_map: HashMap<Uuid, _> = users
        .into_iter()
        .map(|(id, nombre, avatar, torre, apto)| (id, (nombre, avatar, torre, apto)))
        .collect();

    // 4. Build the result, sorted by most recent first.
    let mut result: Vec<ChatConversacionDto> = map
        .into_iter()
        .map(|(usuario_id, agg)| {
            let (nombre, avatar, torre, apto) = user_map
                .get(&usuario_id)
                .cloned()
                .unwrap_or_else(|| ("(desconocido)".to_string(), None, None, None));
            ChatConversacionDto {
                usuario_id,
                ultimo_mensaje: agg.ultimo_mensaje,
                ultimo_timestamp: agg.ultimo_timestamp,
                no_leidos: agg.no_leidos,
                residente: ResidenteResumenDto {
                    nombre,
                    avatar,
                    torre,
                    apto,
                },
            }
        })
        .collect();
    result.sort_by_key(|r| Reverse(r.ultimo_timestamp));
    Ok(result)
}

/// Last 100 messages for the admin thread view.
pub async fn list_admin_thread(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<Vec<ChatMessage>> {
    let rows = chat_admin::table
        .filter(chat_admin::conjunto_id.eq(conjunto_id))
        .filter(chat_admin::usuario_id.eq(usuario_id))
        .order(chat_admin::created_at.asc())
        .limit(100)
        .select(ChatMessage::as_select())
        .load(conn)
        .await?;
    Ok(rows)
}

/// Mark all resident (non-admin) unread messages as read for a specific
/// conversation.
pub async fn mark_read(conn: &mut DbConn, conjunto_id: Uuid, usuario_id: Uuid) -> ApiResult<usize> {
    let updated = diesel::update(
        chat_admin::table
            .filter(chat_admin::conjunto_id.eq(conjunto_id))
            .filter(chat_admin::usuario_id.eq(usuario_id))
            .filter(chat_admin::es_de_admin.eq(false))
            .filter(chat_admin::leido.eq(false)),
    )
    .set(chat_admin::leido.eq(true))
    .execute(conn)
    .await?;
    Ok(updated)
}

/// Fetch profile, vehicles, and pets for a resident (admin context panel).
pub async fn get_resident_info(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    usuario_id: Uuid,
) -> ApiResult<ResidentInfoDto> {
    let profile: Option<ResidenteProfileDto> = usuarios::table
        .filter(usuarios::id.eq(usuario_id))
        .filter(usuarios::conjunto_id.eq(conjunto_id))
        .select((
            usuarios::id,
            usuarios::nombre,
            usuarios::email,
            usuarios::avatar,
            usuarios::torre,
            usuarios::apto,
            usuarios::telefono,
        ))
        .first::<(
            Uuid,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        )>(conn)
        .await
        .optional()?
        .map(
            |(id, nombre, email, avatar_url, torre, apto, telefono)| ResidenteProfileDto {
                id,
                nombre,
                email,
                avatar_url,
                torre,
                apto,
                telefono,
            },
        );

    let vehicles: Vec<VehiculoResumenDto> = vehiculos::table
        .filter(vehiculos::conjunto_id.eq(conjunto_id))
        .filter(vehiculos::usuario_id.eq(usuario_id))
        .select((vehiculos::placa, vehiculos::tipo, vehiculos::marca))
        .load::<(String, String, Option<String>)>(conn)
        .await?
        .into_iter()
        .map(|(placa, tipo, marca)| VehiculoResumenDto { placa, tipo, marca })
        .collect();

    let pets: Vec<MascotaResumenDto> = mascotas::table
        .filter(mascotas::conjunto_id.eq(conjunto_id))
        .filter(mascotas::usuario_id.eq(usuario_id))
        .select((mascotas::nombre, mascotas::tipo, mascotas::raza))
        .load::<(String, String, Option<String>)>(conn)
        .await?
        .into_iter()
        .map(|(nombre, tipo, raza)| MascotaResumenDto { nombre, tipo, raza })
        .collect();

    Ok(ResidentInfoDto {
        profile,
        vehicles,
        pets,
    })
}
