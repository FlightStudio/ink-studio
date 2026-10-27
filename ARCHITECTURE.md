# Architecture

## What this is

Ink Studio v2 is the editor for physical letters and postcards. This file names files and constants. Values live in code.

## Packages and the dependency rule

| Package           | Path                                              | Role                                                   |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------ |
| typescript-config | `packages/typescript-config`                      | Shared TypeScript presets                              |
| logger            | `packages/logger`                                 | Structured log helper                                  |
| types             | `packages/types/src/index.ts`                     | Identity shapes, including `Member`                    |
| errors            | `packages/errors/src/index.ts`                    | `errorMessages`                                        |
| api               | `packages/api/openapi.yaml`                       | HTTP contract. Client is `packages/api/src/gen/api.ts` |
| db                | `packages/db/src/index.ts`                        | Identity repositories and migrations                   |
| ui                | `packages/ui/src/styles/globals.css`              | Stationery tokens inside the studio class              |
| ui                | `packages/ui/components.json`                     | shadcn CLI config for the primitives                   |
| ui                | `packages/ui/src/components/ui`                   | Generated shadcn primitives                            |
| ui                | `packages/ui/src/components/desk.tsx`             | Full-viewport desk surface                             |
| ui                | `packages/ui/src/components/floating-toolbar.tsx` | Paper toolbar                                          |
| ui                | `packages/ui/src/components/swatch.tsx`           | Ink colour radio                                       |
| ui                | `packages/ui/src/components/status-pill.tsx`      | Pending, running, done, failed                         |
| testing           | `packages/testing/src/browser.ts`                 | Dev-only Chromium and WebKit harness                   |
| web               | `apps/web/src/app/(studio)/layout.tsx`            | Studio class, fonts, paper texture                     |
| web               | `apps/web/src/app/(studio)/page.tsx`              | Signed-in home on the desk                             |
| web               | `apps/web/src/app/(studio)/styleguide/page.tsx`   | Style guide as a letter on the desk                    |
| web               | `apps/web/src/server/auth.ts`                     | `getSession`, the function the move replaces           |
| tools             | `tools/check-comments.ts`                         | No-comment check                                       |
| tools             | `tools/check-architecture.ts`                     | This map stays honest                                  |
| tools             | `tools/migrate.ts`                                | Applies `packages/db/drizzle`                          |
| tools             | `tools/dev/screens.ts`                            | `pnpm screens` writes both viewports                   |
1. An app may import packages. A package never imports an app.
2. Dependencies point toward `packages/types`. `packages/errors` stands alone. `packages/api` may import `packages/errors`.
3. Drizzle and `pg` live only in `packages/db`.
4. Pages read through `apps/web/src/server`. Mutations go through `apps/web/src/app/api`.
5. `getSession` in `apps/web/src/server/auth.ts` is the one function the move replaces.
6. Stationery tokens in `packages/ui/src/styles/globals.css` apply on the studio class set by `apps/web/src/app/(studio)/layout.tsx`, so every page in that group sits on the desk. Primitives in `packages/ui/src/components/ui` are regenerated with the shadcn CLI, never edited by hand. The browser harness in `packages/testing/src/browser.ts` is dev-only.

## One letter, end to end

Filled as the editor lands.

## Jobs

Filled as jobs land.

## Tables

| Table              | Package       | Role                                     |
| ------------------ | ------------- | ---------------------------------------- |
| users              | `packages/db` | A person, keyed by external id and email |
| organizations      | `packages/db` | A studio                                 |
| organization_users | `packages/db` | Membership and role                      |

## Where to change things

Repo checks live in `tools/check.ts`.

## Moving into project-post

Shared packages are shaped so the move is a folder merge. The plan is `PLAN.md`.
