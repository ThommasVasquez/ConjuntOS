# 013 — AI: copilot, translate, consensuar, acta, search (Gemini)

Status: **implemented** (M7) — semantic search, asamblea copilot, acta generation, translate, subtitulos (Gemini). No dedicated integration tests yet.

> SKELETON — flesh out before implementing M7.

## Purpose
Replaces `/api/asamblea/copilot`, `/copilot/translate`, `/copilot/consensuar`, `/api/asamblea/acta`,
`/api/search`. All via services/gemini.rs (reqwest → generateContent; models: 2.5-flash assembly,
1.5-flash search — confirm/bump model ids at implementation).

## Notes
- GEMINI_API_KEY backend-only. Timeouts + token caps; wiremock tests.
- Legacy hardcoded-fallback responses: keep deterministic fallback ONLY for translate dictionary;
  others return 502 problem+json on Gemini failure (Law 4) — confirm with product owner.
