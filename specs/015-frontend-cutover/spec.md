# 015 — Frontend cutover

> SKELETON — flesh out during M9. See parity.md for the route checklist.

## Purpose
Switch Next.js to the Rust API: src/lib/api/client.ts (apiFetch, credentials include,
problem+json → ApiError, 401 redirect), generated types (openapi-typescript), useAuth() zustand
hook from /auth/me replacing SessionProvider, server components fetch Rust API with forwarded
cookies or become client components.

## Deletions at cutover
src/app/api/**, src/auth.ts, src/auth.config.ts, src/lib/db.ts, prisma/, prisma.config.ts;
deps: next-auth, @auth/prisma-adapter, @prisma/client, prisma, @prisma/adapter-neon,
@neondatabase/serverless, pg, @supabase/supabase-js, web-push, @mmmike/web-push,
@google/generative-ai. ROTATE the Supabase service-role key (hardcoded in src/lib/db.ts history).

## CORS/cookies
Shared parent domain target; interim pages.dev: SameSite=None; Secure + exact-origin CORS with
credentials + Bearer fallback. Error/loading/empty-state sweep of every consumer (mock fallbacks gone).
