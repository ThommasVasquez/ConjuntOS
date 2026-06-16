---
description: Review before merge — five-axis review (correctness, readability, architecture, security, performance)
argument-hint: "[optional: scope, e.g. staged | HEAD~3 | path]"
---

# /review — Review before merge

**Principle: improve code health.**

First, invoke the `agent-skills:code-review-and-quality` skill (use the Skill tool). Then run the review below.

Scope from the user: $ARGUMENTS

## Project context
- This is a customized Next.js — judge framework usage against `node_modules/next/dist/docs/`, not training-data assumptions.
- Use `graphify query`/`graphify path` to check how changed code connects to the rest of the system before judging architecture.

## Workflow
Review the current changes (staged or recent commits) across all five axes:

1. **Correctness** — Does it match the spec? Edge cases handled? Tests adequate?
2. **Readability** — Clear names? Straightforward logic? Well-organized?
3. **Architecture** — Follows existing patterns? Clean boundaries? Right abstraction level?
4. **Security** — Input validated? Secrets safe? Auth/authz checked? (invoke `agent-skills:security-and-hardening`)
5. **Performance** — No N+1 queries? No unbounded ops? (invoke `agent-skills:performance-optimization`)

Categorize findings as **Critical**, **Important**, or **Suggestion**. Output a structured review with specific `file:line` references and concrete fix recommendations.

Next: `/code-simplify` to clean up, then `/ship`.
