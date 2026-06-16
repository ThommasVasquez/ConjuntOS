---
description: Define what to build — write a structured spec before any code (spec-driven development)
argument-hint: "[feature or idea, e.g. \"reservas de zonas comunes\"]"
---

# /spec — Define what to build

**Principle: spec before code.**

First, invoke the `agent-skills:spec-driven-development` skill (use the Skill tool). Then run the spec workflow below.

Topic / idea from the user: $ARGUMENTS

## Project context (read first)
- Package manager is **pnpm** — never `npm`/`yarn`.
- This is a customized Next.js — read the relevant guide in `node_modules/next/dist/docs/` before assuming any API.
- If `graphify-out/graph.json` exists, run `graphify query "<question>"` to understand affected areas instead of grepping raw files.

## Workflow
Begin by understanding what the user wants to build. Ask clarifying questions about:
1. The objective and target users
2. Core features and acceptance criteria
3. Tech-stack preferences and constraints (assume the existing stack unless told otherwise)
4. Known boundaries — what to always do, ask first about, and never do

Then generate a structured spec covering all six core areas: **objective, commands, project structure, code style, testing strategy, and boundaries**.

Save the spec as `SPEC.md` in the project root (or `docs/SPEC.md`) and confirm it with the user before moving on. The next step in the lifecycle is `/plan`.
