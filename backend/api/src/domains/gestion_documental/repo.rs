use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use crate::db::schema::{documentos, usuarios};
use crate::db::DbConn;
use crate::domains::gestion_documental::models::{Documento, DocumentoCambios, NuevoDocumento};
use crate::error::{ApiError, ApiResult};

pub async fn listar_documentos(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    solo_visibles: bool,
) -> ApiResult<Vec<(Documento, Option<String>)>> {
    let query = documentos::table
        .filter(documentos::conjunto_id.eq(conjunto_id))
        .left_join(usuarios::table.on(documentos::subido_por.eq(usuarios::id.nullable())))
        .order(documentos::fecha_publicacion.desc())
        .select((Documento::as_select(), usuarios::nombre.nullable()))
        .into_boxed();

    let query = if solo_visibles {
        query.filter(documentos::visible_residentes.eq(true))
    } else {
        query
    };

    let rows = query.load::<(Documento, Option<String>)>(conn).await?;
    Ok(rows)
}

pub async fn documento_por_id(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    doc_id: Uuid,
) -> ApiResult<Option<(Documento, Option<String>)>> {
    let row = documentos::table
        .find(doc_id)
        .filter(documentos::conjunto_id.eq(conjunto_id))
        .left_join(usuarios::table.on(documentos::subido_por.eq(usuarios::id.nullable())))
        .select((Documento::as_select(), usuarios::nombre.nullable()))
        .first::<(Documento, Option<String>)>(conn)
        .await
        .optional()?;
    Ok(row)
}

pub async fn crear_documento(
    conn: &mut DbConn,
    nuevo: NuevoDocumento,
) -> ApiResult<Documento> {
    let row: Documento = diesel::insert_into(documentos::table)
        .values(&nuevo)
        .returning(Documento::as_returning())
        .get_result(conn)
        .await?;
    Ok(row)
}

pub async fn actualizar_documento(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    doc_id: Uuid,
    cambios: DocumentoCambios,
) -> ApiResult<Option<Documento>> {
    let row = diesel::update(
        documentos::table
            .filter(documentos::id.eq(doc_id))
            .filter(documentos::conjunto_id.eq(conjunto_id)),
    )
    .set(cambios)
    .returning(Documento::as_returning())
    .get_result(conn)
    .await
    .optional()?;
    Ok(row)
}

pub async fn eliminar_documento(
    conn: &mut DbConn,
    conjunto_id: Uuid,
    doc_id: Uuid,
) -> ApiResult<usize> {
    let deleted = diesel::delete(
        documentos::table
            .filter(documentos::id.eq(doc_id))
            .filter(documentos::conjunto_id.eq(conjunto_id)),
    )
    .execute(conn)
    .await?;
    Ok(deleted)
}
