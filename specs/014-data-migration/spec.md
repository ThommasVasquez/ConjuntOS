# 014 — Data migration (legacy PascalCase → new snake_case)

> SKELETON — complete the table-by-table mapping before implementing M8.

## Purpose
One-time `enconjunto-migrate` run: cuid→UUIDv5 (fixed namespace in idmap.rs), Argon2-hash
passwords (empty/garbage → unusable hash + must_change_password), notifPush → push_subscriptions,
JSON-string parse/repair into jsonb, FK-order inserts with ON CONFLICT DO NOTHING.

## Deliverables
- Mapping table: each of the 28 legacy models → new table, column renames, type conversions,
  JSON repair policy per column (default: null + report row).
- Flags: --dry-run, --phase <table>, --verify (row counts + spot checks), --report CSV, --seed-demo.
- Runs over MIGRATIONS_DATABASE_URL (direct connection) only.
