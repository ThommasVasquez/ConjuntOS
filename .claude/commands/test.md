---
description: Prove it works — TDD for features, Prove-It pattern for bugs, plus e2e/browser verification
argument-hint: "[optional: feature, bug, or file scope]"
---

# /test — Prove it works

**Principle: tests are proof.**

First, invoke the `agent-skills:test-driven-development` skill (use the Skill tool). Then run the workflow below.

Scope from the user: $ARGUMENTS

## Project context
- **pnpm** only. Discover the test commands from package.json (unit, and any e2e runner like Playwright/Cypress) before running.
- For anything that runs in the browser, also invoke `agent-skills:browser-testing-with-devtools` to verify with the Chrome DevTools MCP.

## New features
1. Write tests that describe the expected behavior (they should **FAIL**).
2. Implement the code to make them pass.
3. Refactor while keeping tests green.

## Bug fixes (Prove-It pattern)
1. Write a test that reproduces the bug (must **FAIL**).
2. Confirm the test fails.
3. Implement the fix.
4. Confirm the test passes.
5. Run the full test suite for regressions.

## End-to-end / full check
- Map the critical user paths (for this app: auth/login, citofonía, parqueadero/seed flows, conjunto-scoped data) and cover each with an e2e test.
- Run the complete suite (unit + e2e + build) and report pass/fail honestly — if anything fails or is skipped, say so with the output. Do not claim green unless it is green.

The next step is `/review`.
