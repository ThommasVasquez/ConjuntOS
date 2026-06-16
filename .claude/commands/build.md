---
description: Build incrementally — one slice at a time (test, verify, commit). Add "auto" to run the whole plan in one approved pass.
argument-hint: "[empty = next task | auto = whole plan]"
---

# /build — Build incrementally

**Principle: one slice at a time.**

First, invoke the `agent-skills:incremental-implementation` skill alongside `agent-skills:test-driven-development` (use the Skill tool). Then run the workflow below.

Mode argument: $ARGUMENTS

## Project context
- **pnpm** only. Tests: `pnpm test`. Build: `pnpm build` (confirm the exact scripts in package.json).
- This is a customized Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing framework code.
- After editing code, refresh the graph: run `graphify update .` (AST-only, no API cost).

## Modes
- `/build` — implement the **next pending task**, then stop (careful, one slice at a time).
- `/build auto` — generate the plan if needed, get a **single** approval, then implement **every** task without stopping between them. (Same test-driven loop per task — it only removes the human stepping between tasks.)

Treat `auto` or `all` as autonomous mode; anything else (or empty) is default single-task mode.

## Default: one task
1. Read the task's acceptance criteria.
2. Load relevant context (existing code, patterns, types).
3. Write a failing test for the expected behavior (**RED**).
4. Implement the minimum code to pass it (**GREEN**).
5. Run the full test suite to check for regressions.
6. Run the build to verify compilation.
7. Commit with a descriptive message.
8. Mark the task complete and stop.

## Autonomous: the whole plan (`/build auto`)
1. **Require a spec** at a known path: `SPEC.md`, `docs/SPEC.md`, or a file under `spec/`. A README does NOT count. If none, stop and tell the user to run `/spec` first — do not invent requirements.
2. **Clean baseline.** Run `git status --porcelain`. If there are uncommitted changes outside planning artifacts (`SPEC.md`, `docs/SPEC.md`, `spec/*`, `tasks/plan.md`, `tasks/todo.md`), stop and ask how to handle them.
3. **Plan if needed.** If no `tasks/plan.md`, invoke `agent-skills:planning-and-task-breakdown` to generate one.
4. **Single checkpoint.** Present the full plan and wait for an unambiguous "approve/go/yes". Hedged answers are NOT approval. This is the only human gate. Commit a generated plan as one preparatory commit.
5. **Execute every task in dependency order.** Run the full default loop per task (RED → GREEN → regression → build → commit → mark complete). Stage only that task's files plus its status update — never `git add -A` blindly — one commit per task.
6. **Stop and ask** when: a test/build can't be fixed obviously (→ `agent-skills:debugging-and-error-recovery`); the spec is ambiguous; or a task is high-risk/irreversible — auth, destructive migrations, payments, deletions, deploys, secrets (→ `agent-skills:doubt-driven-development`, get explicit sign-off).
7. **Summarize** at the end: tasks completed, tests added, commits made, anything skipped or flagged.

If any step fails, follow `agent-skills:debugging-and-error-recovery`. The next step is `/test`, then `/review`.
