-- Session revocation (specs/001-auth-tenancy). JWTs are stateless with a long
-- expiry and no denylist, so logout/password-change could not invalidate an
-- outstanding token. We record when the password last changed; any token whose
-- `iat` predates this instant is rejected at extraction time, so changing the
-- password immediately invalidates every previously issued session token.
ALTER TABLE usuarios
    ADD COLUMN password_changed_at timestamptz NOT NULL DEFAULT now();
