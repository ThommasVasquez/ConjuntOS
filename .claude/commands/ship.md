---
description: Ship to production — parallel specialist fan-out, then a synthesized go/no-go with rollback plan
argument-hint: "[optional: change scope]"
---

# /ship — Ship to production

**Principle: faster is safer (small, verified, reversible changes).**

First, invoke the `agent-skills:shipping-and-launch` skill (use the Skill tool). `/ship` is a **fan-out orchestrator**: it runs three specialist personas in parallel against the current change, then merges their reports into one go/no-go decision with a rollback plan.

Change scope from the user: $ARGUMENTS

## Project context
- **pnpm** only. Confirm `pnpm build` and the full test suite pass as part of the gate.
- Per repo memory: after shipping, commit + push to `main` and update the VPS backend — **never** touch the DB directly.

## Phase A — Parallel fan-out
Spawn three subagents **concurrently in a single turn** (sequential calls defeat the purpose). Each custom subagent in `agents/` is exposed as a tool of the same name:

1. **`code-reviewer`** — five-axis review (correctness, readability, architecture, security, performance) on staged changes / recent commits.
2. **`security-auditor`** — vulnerability + threat-model pass: OWASP Top 10, secrets, auth/authz, dependency CVEs.
3. **`test-engineer`** — coverage analysis: gaps in happy path, edge cases, error paths, concurrency.

If subagents are unavailable, run each persona's prompt sequentially in the main context and treat outputs as parallel. Keep the fan-out flat — personas do not call each other. User-defined personas in `agents/` take precedence over the plugin's.

## Phase B — Merge (main context)
Synthesize all three reports:
1. **Code Quality** — aggregate Critical/Important findings + failing tests/lint/build; dedupe.
2. **Security** — promote Critical/High to launch blockers.
3. **Performance** — from the review's performance axis; check Core Web Vitals if applicable.
4. **Accessibility** — keyboard nav, screen reader, contrast (handle here).
5. **Infrastructure** — env vars, migrations, monitoring, feature flags.
6. **Documentation** — README, ADRs, changelog.

## Phase C — Decision + rollback
```markdown
## Ship Decision: GO | NO-GO

### Blockers (must fix before ship)
- [persona: Critical finding + file:line]

### Recommended fixes (should fix before ship)
- [persona: Important finding + file:line]

### Acknowledged risks (shipping anyway)
- [risk + mitigation]

### Rollback plan
- Trigger conditions: [...]
- Rollback procedure: [exact steps]
- Recovery time objective: [...]

### Specialist reports (full)
- [code-reviewer] / [security-auditor] / [test-engineer]
```

## Rules
1. Phase A personas run in parallel — never sequentially.
2. Personas do not call each other; the main agent merges in Phase B.
3. The rollback plan is mandatory before any GO.
4. Any Critical finding → default NO-GO unless the user explicitly accepts the risk.
5. Skip the fan-out **only if all** are true: ≤2 files, <50 lines, and it does not touch auth, payments, data access, or config/env. Otherwise fan out.
