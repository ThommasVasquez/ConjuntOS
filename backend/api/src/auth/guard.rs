use crate::auth::extract::AuthUser;
use crate::db::enums::Rol;
use crate::error::{ApiError, ApiResult};

/// Role gate at the handler boundary (specs/constitution.md Law 3) —
/// explicit and greppable: `guard::require(&user, &[Rol::Administrador])?`.
///
/// `SUPER_ADMIN` bypasses every gate: it is the highest privilege level and
/// must be able to reach any tenant surface without being enumerated in each
/// per-endpoint role list.
pub fn require(user: &AuthUser, allowed: &[Rol]) -> ApiResult<()> {
    if user.rol == Rol::SuperAdmin || allowed.contains(&user.rol) {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

/// Admin-level roles within a tenant (matches legacy admin route checks).
pub fn require_admin(user: &AuthUser) -> ApiResult<()> {
    require(user, &[Rol::Administrador, Rol::Concejo, Rol::SuperAdmin])
}

/// Cross-tenant superadmin surface (/api/v1/superadmin/*) only.
pub fn require_superadmin(user: &AuthUser) -> ApiResult<()> {
    require(user, &[Rol::SuperAdmin])
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn user_with(rol: Rol) -> AuthUser {
        AuthUser {
            id: Uuid::new_v4(),
            conjunto_id: Uuid::new_v4(),
            rol,
            nombre: "t".into(),
        }
    }

    #[test]
    fn allows_listed_roles_only() {
        let vigilante = user_with(Rol::Vigilante);
        assert!(require(&vigilante, &[Rol::Vigilante, Rol::SupervisorVigilancia]).is_ok());
        assert!(matches!(
            require(&vigilante, &[Rol::Administrador]),
            Err(ApiError::Forbidden)
        ));
    }

    #[test]
    fn superadmin_gate_excludes_admins() {
        assert!(require_superadmin(&user_with(Rol::SuperAdmin)).is_ok());
        assert!(require_superadmin(&user_with(Rol::Administrador)).is_err());
        assert!(require_admin(&user_with(Rol::Administrador)).is_ok());
    }
}
