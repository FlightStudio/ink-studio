# Architecture

## What this is

Ink Studio v2 is the editor for physical letters and postcards. This file names files and constants. Values live in code.

## Packages and the dependency rule

| Package           | Path                                              | Role                                                   |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------ |
| typescript-config | `packages/typescript-config`                      | Shared TypeScript presets                              |
| logger            | `packages/logger`                                 | Structured log helper                                  |
| types             | `packages/types/src/index.ts`                     | Identity shapes, including `Member`                    |
| types             | `packages/types/src/page.ts`                      | `PAGE_SPECS`, one entry per provider and product       |
| types             | `packages/types/src/ink.ts`                       | `INK_COLORS` and `TEXT_SIZES`                          |
| types             | `packages/types/src/font.ts`                      | `STOCK_FONTS`                                          |
| types             | `packages/types/src/letter.ts`                    | `LetterContent`, the element union, `humanSeal`        |
| types             | `packages/types/src/merge-field.ts`               | `MERGE_FIELDS` and the sample and longest values       |
| render            | `packages/render/src/html/index.ts`               | `@repo/render/html`, client-safe page layout           |
| render            | `packages/render/src/html/geometry.ts`            | Column, bands, keep-clear exclusions, spacer floats    |
| render            | `packages/render/src/schema/index.ts`             | `@repo/render/schema`, `letterExtensions` and parser   |
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
| web               | `apps/web/public/images/paper.png`                | Paper scan from project-post, tiled on the sheet       |
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
7. `packages/render` has three subpaths. `@repo/render/schema` is the letter's schema and parser, with no JSX and no React. `@repo/render/html` is client-safe layout. `@repo/render` renders the print document. All three read catalogues such as `PAGE_SPECS` from `packages/types`.
8. Client components import `@repo/render/html` and `@repo/render/schema`. Services import `@repo/render/schema` to validate a letter against the real schema. `@repo/render/html` imports `perfect-freehand`.
9. Only the worker imports `@repo/render`. The web never does, and integrations never import `packages/render`: the worker passes outlines and the measure function in.
10. `packages/testing` is dev-only. Render, integrations and worker tests, the web's e2e files and `tools/dev` import it.

## Pages

A new provider or product is one `PAGE_SPECS` entry. Nothing in code names a product or a page count; `packages/render/src/html/geometry.ts` reads everything from the `PageSpec`.

The page limit is `maxPages`, which a deployment sets up to `providerMaxPages`. Sides are numbered from 0. A spec whose `front` is `image` writes from side 1, and `writingSides` runs to `maxPages`.

Paper coordinates are inches from the top-left of one side's canvas, bleed included. Placed boxes, the safe zone and keep-clear zones use them. Column coordinates are inches from the top-left of the first writing side's text area and run down through every writing side, with `sideTopIn` giving each side's top. `columnBox`, `pageExclusions` and `clipToText` return column coordinates. `sidesUsed` and `overflowIn` take gap-free column inches, as print lays them out.

Exclusions are spacer floats. `pageExclusions` gives a full-width band between consecutive writing sides and every keep-clear zone clipped to its side's text area, floating on the side its corner names; a zone inside the margin adds nothing. `exclusionFloats` turns exclusions into a zero-width spacer and a clearing float each, so exclusions on both edges keep their own tops.

## The letter document

`LetterContent` is defined once, in `packages/types/src/letter.ts`. A letter is Tiptap JSON over `letterExtensions` in `packages/render/src/schema/letter-schema.ts`, never HTML or Markdown. `@repo/render/schema` imports only `@tiptap/core`, `@tiptap/pm`, `zod` and `@repo/types`, so services and Server Components can import it.

`parseLetterContent` in `packages/render/src/schema/parse-letter.ts` is the one parser. Its zod schema is typed against `LetterContent`, builds every enum from the catalogues, refuses unknown keys, requires a UUID for every id, holds the counts to `LETTER_LIMITS`, and checks `minSides` and the front image against the letter's `PAGE_SPECS` entry. It then checks the tree against the Tiptap schema. A refusal throws.

Ids reach CSS only through catalogue lookups. Each extension's `renderHTML` reads `INK_COLORS`, `STOCK_FONTS` and `TEXT_SIZES`; a font family is `stock-<id>` or `own-<fontId>` with the stock fallback behind it. Creator-typed text never reaches CSS.

Placed elements live in the document's root attributes beside `minSides` and the front image, so one undo stack covers text and placement. `humanSeal` derives the seal from the document and the creator's own fonts; nothing stores it.

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
