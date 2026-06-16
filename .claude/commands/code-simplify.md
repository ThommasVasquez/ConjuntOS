---
description: Simplify the code — reduce complexity without changing behavior (clarity over cleverness)
argument-hint: "[optional: scope; defaults to recent changes]"
---

# /code-simplify — Simplify the code

**Principle: clarity over cleverness.**

First, invoke the `agent-skills:code-simplification` skill (use the Skill tool). Then run the workflow below.

Scope from the user: $ARGUMENTS

## Project context
- **pnpm** only. Run tests after each change to prove behavior is unchanged.
- Honor `CLAUDE.md` and `AGENTS.md` conventions (this repo's customized Next.js rules included).

## Workflow
Simplify recently changed code (or the specified scope) while preserving **exact** behavior:

1. Read `CLAUDE.md` / `AGENTS.md` and study project conventions.
2. Identify the target code — recent changes unless a broader scope is specified.
3. Understand purpose, callers, edge cases, and test coverage **before** touching it.
4. Scan for simplification opportunities:
   - Deep nesting → guard clauses or extracted helpers
   - Long functions → split by responsibility
   - Nested ternaries → if/else or switch
   - Generic names → descriptive names
   - Duplicated logic → shared functions
   - Dead code → remove after confirming
5. Apply each simplification **incrementally** — run tests after each change.
6. Verify all tests pass, the build succeeds, and the diff is clean.

If tests fail after a simplification, revert that change and reconsider. Use `agent-skills:code-review-and-quality` to review the result. Next: `/ship`.
