use uuid::Uuid;

/// Deterministic namespace for CUID → UUIDv5 migration mapping.
const MIGRATION_NS: Uuid = Uuid::from_bytes([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

/// Convert a legacy CUID string to a deterministic UUIDv5.
pub fn cuid_to_uuid(cuid: &str) -> Uuid {
    Uuid::new_v5(&MIGRATION_NS, cuid.as_bytes())
}

/// Convert an optional CUID; returns `None` for `None` or empty strings.
pub fn cuid_opt(val: Option<&str>) -> Option<Uuid> {
    val.filter(|s| !s.is_empty()).map(cuid_to_uuid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic() {
        let a = cuid_to_uuid("clxyz123");
        let b = cuid_to_uuid("clxyz123");
        assert_eq!(a, b);
        assert_ne!(a, cuid_to_uuid("clxyz999"));
    }

    #[test]
    fn nulls() {
        assert!(cuid_opt(None).is_none());
        assert!(cuid_opt(Some("")).is_none());
        assert!(cuid_opt(Some("cl123")).is_some());
    }
}
