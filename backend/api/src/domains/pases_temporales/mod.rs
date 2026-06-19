pub mod dto;
pub mod handlers;
pub mod models;
pub mod repo;

pub use handlers::router;

/// Scheduler que cada 30 minutos desactiva los usuarios huésped cuyos
/// pases temporales ya expiraron.
pub fn spawn_scheduler(state: crate::state::AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800));
        loop {
            interval.tick().await;
            let mut conn = match state.pool.get().await {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("scheduler pases-temporales: no DB conn: {e}");
                    continue;
                }
            };
            if let Err(e) = repo::desactivar_usuarios_expirados(&mut conn).await {
                tracing::warn!("scheduler pases-temporales: error: {e}");
            }
        }
    });
}
