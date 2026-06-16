---
description: Plan how to build it — break work into small, atomic, verifiable tasks
argument-hint: "[optional: scope or spec path]"
---

# /plan — Plan how to build it

**Principle: small, atomic tasks.**

First, invoke the `agent-skills:planning-and-task-breakdown` skill (use the Skill tool). Then run the planning workflow below.

Scope hint from the user: $ARGUMENTS

## Project context
- Use **pnpm** for any commands referenced in tasks.
- If `graphify-out/graph.json` exists, run `graphify query "<area>"` to map dependencies instead of reading source files one by one.

## Workflow
Read the existing spec (`SPEC.md` / `docs/SPEC.md` or equivalent) and the relevant codebase sections. Then:

1. Enter plan mode — read only, **no code changes**.
2. Identify the dependency graph between components.
3. Slice work **vertically** (one complete path per task, not horizontal layers).
4. Write tasks with explicit acceptance criteria and verification steps.
5. Add checkpoints between phases.
6. Present the plan for human review.

Save the plan to `tasks/plan.md` and the task list to `tasks/todo.md`. The next step is `/build`.
