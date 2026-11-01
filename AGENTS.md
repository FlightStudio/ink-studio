# AGENTS.md

## Structure

`apps` are processes. `packages` are libraries named `@repo/*`. `tools` holds repo checks and dev scripts. 

## Tech stack

pnpm and Turborepo. TypeScript 7. Biome. Vitest per package. Postgres 17 on port 5434. Next.js for `apps/web` from step 4.

## Commands

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm dev` 
- `docker compose up -d` 
- `pnpm db:migrate` and `pnpm seed`

## How to work

- Tests come before code.
- No comments in code, CSS, or tests. `pnpm lint` fails on one.
- `ARCHITECTURE.md` changes with every change. It names files and constants, never their values.
- Stored geometry is inches with an `In` suffix.
- `sharp`, `opentype.js`, and `playwright-core` are imported only in worker integrations and tests.
- Leave the repo green.
