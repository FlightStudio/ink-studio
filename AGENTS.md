# AGENTS.md

## Structure

`apps` are processes. `packages` are libraries named `@repo/*`. `tools` holds repo checks and dev scripts. `guide.html` is the step-by-step guide for a person setting the project up on their own machine.

## Tech stack

pnpm and Turborepo. TypeScript 7. Biome. Vitest per package. Postgres 17 on port 5434. Next.js for `apps/web` from step 4.

## Commands

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm dev` once the web app exists
- `docker compose up -d` once `docker-compose.yml` exists
- `pnpm db:migrate` and `pnpm seed` once those scripts exist

## How to work

- Tests come before code.
- No comments in code, CSS, or tests. `pnpm lint` fails on one.
- `ARCHITECTURE.md` changes with every change. It names files and constants, never their values.
- Stored geometry is inches with an `In` suffix.
- `sharp`, `opentype.js`, and `playwright-core` are imported only in worker integrations and tests.
- One step of `PLAN.md` at a time. Leave the repo green.
