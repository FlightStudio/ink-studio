# Architecture

## What this is

Ink Studio v2 is the editor for physical letters and postcards. This file names files and constants. Values live in code.

## Packages and the dependency rule

| Package           | Path                                                    | Role                                                               |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| typescript-config | `packages/typescript-config`                            | Shared TypeScript presets                                          |
| logger            | `packages/logger`                                       | Structured log helper                                              |
| types             | `packages/types/src/index.ts`                           | Identity shapes, including `Member`                                |
| types             | `packages/types/src/asset.ts`                           | `Asset`, its origin and its processing                             |
| types             | `packages/types/src/page.ts`                            | `PAGE_SPECS`, one entry per provider and product                   |
| types             | `packages/types/src/ink.ts`                             | `INK_COLORS` and `TEXT_SIZES`                                      |
| types             | `packages/types/src/font.ts`                            | `STOCK_FONTS`                                                      |
| types             | `packages/types/src/letter.ts`                          | `LetterContent`, the element union, `LetterResources`, `humanSeal` |
| types             | `packages/types/src/merge-field.ts`                     | `MERGE_FIELDS` and the sample and longest values                   |
| render            | `packages/render/src/html/index.ts`                     | `@repo/render/html`, client-safe page layout                       |
| render            | `packages/render/src/html/geometry.ts`                  | Column, bands, keep-clear exclusions, spacer floats                |
| render            | `packages/render/src/html/letter-page.tsx`              | `LetterPage`, the one page, and `useLetterPage`                    |
| render            | `packages/render/src/html/letter-css.ts`                | `LETTER_CSS`, the letter's whole look                              |
| render            | `packages/render/src/html/letter-print.tsx`             | `LetterPrint`, the page in print with a static flow                |
| render            | `packages/render/src/html/measure.ts`                   | `measureLetter`, the scale-aware line measure                      |
| render            | `packages/render/src/html/fixtures/index.ts`            | `LETTER_FIXTURES`, letters written against `maxPages`              |
| render            | `packages/render/src/html/letter-page.browser.test.tsx` | The page laid out in Chromium and WebKit                           |
| render            | `packages/render/src/schema/index.ts`                   | `@repo/render/schema`, `letterExtensions` and parser               |
| render            | `packages/render/src/index.ts`                          | `@repo/render`, `renderLetterHtml` for the worker                  |
| render            | `packages/render/src/render-letter-html.tsx`            | The print document around `LetterPrint`                            |
| render            | `packages/render/fonts`                                 | Stock font files by `STOCK_FONTS` file name, with licences         |
| errors            | `packages/errors/src/index.ts`                          | `errorMessages` and `ServiceError`                                 |
| api               | `packages/api/openapi.yaml`                             | HTTP contract. Client is `packages/api/src/gen/api.ts`             |
| api               | `packages/api/src/zod.ts`                               | Request and response schemas typed against the generated types     |
| db                | `packages/db/src/index.ts`                              | Identity and letter repositories and migrations                    |
| db                | `packages/db/src/drizzle/letters.ts`                    | `Letters`, the revision-checked save and soft delete               |
| db                | `packages/db/src/drizzle/assets.ts`                     | `Assets`, rows mapped to and from `Asset`                          |
| services          | `packages/services/src/letters/index.ts`                | `LetterService`, `letterResources`, `letterOwnerIds`               |
| services          | `packages/services/src/assets/index.ts`                 | `AssetService`, `isServable`, `assetReadUrl`                       |
| services          | `packages/services/src/assets/assets.service.ts`        | `UPLOADS`, the sniff and `READ_URL_EXPIRES_IN_SECONDS`             |
| services          | `packages/services/src/assets/assets.types.ts`          | `AssetStorage`, the provider integrations implements               |
| integrations      | `packages/integrations/src/shared/gcp/index.ts`         | `@repo/integrations/shared/gcp`, `GcsAssetStorage`                 |
| ui                | `packages/ui/src/styles/globals.css`                    | Stationery tokens inside the studio class                          |
| ui                | `packages/ui/components.json`                           | shadcn CLI config for the primitives                               |
| ui                | `packages/ui/src/components/ui`                         | Generated shadcn primitives                                        |
| ui                | `packages/ui/src/components/desk.tsx`                   | Full-viewport desk surface                                         |
| ui                | `packages/ui/src/components/floating-toolbar.tsx`       | Paper toolbar                                                      |
| ui                | `packages/ui/src/components/swatch.tsx`                 | Ink colour radio                                                   |
| ui                | `packages/ui/src/components/status-pill.tsx`            | Pending, running, done, failed                                     |
| testing           | `packages/testing/src/browser.ts`                       | Dev-only Chromium and WebKit harness                               |
| web               | `apps/web/src/app/(studio)/layout.tsx`                  | Studio class, fonts, paper texture                                 |
| web               | `apps/web/public/images/paper.png`                      | Paper scan from project-post, tiled on the sheet                   |
| web               | `apps/web/src/app/(studio)/page.tsx`                    | Signed-in home on the desk                                         |
| web               | `apps/web/src/app/(studio)/styleguide/page.tsx`         | Style guide as a letter on the desk                                |
| web               | `apps/web/src/server/auth.ts`                           | `getSession`, the function the move replaces                       |
| web               | `apps/web/src/server/handle-json.ts`                    | `handleJson`, the one wrapper around every API route               |
| web               | `apps/web/src/server/letters.ts`                        | `getLetter` and `listLetters` for pages                            |
| web               | `apps/web/src/app/api/letters/route.ts`                 | Create a letter                                                    |
| web               | `apps/web/src/app/api/letters/[letterId]/route.ts`      | Read, save and delete one letter                                   |
| web               | `apps/web/src/server/services.ts`                       | Builds the db, the storage and each service lazily                 |
| web               | `apps/web/src/app/api/uploads/route.ts`                 | Upload one file                                                    |
| web               | `apps/web/src/app/api/assets/[assetId]/route.ts`        | Redirect to a fresh signed URL                                     |
| web               | `apps/web/src/app/api/assets/[assetId]/status/route.ts` | An asset's processing status                                       |
| tools             | `tools/check-comments.ts`                               | No-comment check                                                   |
| tools             | `tools/check-architecture.ts`                           | This map stays honest                                              |
| tools             | `tools/migrate.ts`                                      | Applies `packages/db/drizzle`                                      |
| tools             | `tools/dev/screens.ts`                                  | `pnpm screens` writes both viewports                               |
| tools             | `tools/docker/gcs/ink-studio-assets`                    | The local bucket, loaded by the `gcs` compose service              |
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
11. Services take a `Member` and throw `ServiceError` with a kind and an `ApiErrorCode`. `handleJson` checks the origin, the content type and the body, finds the member, and turns each kind into one status; nothing else in a route touches errors. `handleRequest` does the same for routes without a JSON body, such as the upload, which reads the raw body stream. Services that touch only assets take the `UserOrganization`.
12. A provider is an interface a service declares, such as `AssetStorage`. `packages/integrations` implements it and imports only types from services; services never import integrations. Apps build the implementation and pass it in, in `apps/web/src/server/services.ts`. Integration classes read no environment; apps pass every setting.

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

## One page

`LetterPage` in `packages/render/src/html/letter-page.tsx` is the one page component, and `LetterPageProps` is its contract: callers pass the letter, its `LetterResources`, the mode, the merge values, how many sheets to draw, the text flow and an optional handles layer. The page computes the spec, the gap between sides (`pageGapIn`), the bands, keep-clear zones, placed elements and font faces itself. It always lays out every writing side up to `maxPages`; `sheets` only decides how many paper sheets are drawn behind the flow. An image front is a full-bleed first sheet and the column starts on the next side. Node components read the resources, merge values and mode through `useLetterPage`, so they render the same in the editor and the static renderer.

`LETTER_CSS` in `packages/render/src/html/letter-css.ts` is the letter's whole look, and `LetterPage` renders it itself, so the editor, the preview, the print document and the browser tests carry the same rules with nothing to import. The paper texture is the `--letter-paper-texture` custom property, which only the studio layout sets; print is plain white. One `letter-text` rule is shared by the editor root and the static root.

The spacer floats from `exclusionFloats` are the first children of the `letter-column` element and ignore the pointer, so empty space beside them is still text. Keep-clear zones are hatched only while editing. Font families are `stock-<id>` and `own-<fontId>`, and every URL in the page is `assetBaseUrl` or `stockFontBaseUrl` plus an id. A placed drawing missing from the resources throws. Apps read stock font bytes from `packages/render/fonts` by `STOCK_FONTS` file name.

`LetterPrint` in `packages/render/src/html/letter-print.tsx` is the print version: `LetterPage` in print mode with every allowed sheet and a flow built by `@tiptap/static-renderer` over `letterExtensions`. An empty paragraph, or one ending in a hard break, gets a trailing break as ProseMirror's does, so it keeps its line. `renderLetterHtml` in `packages/render/src/render-letter-html.tsx` wraps it in a full document whose page size comes from the spec.

The measure is scale-aware. `measureLetter` in `packages/render/src/html/measure.ts` is self-contained so Playwright can send it into a page, and it runs on the `letter-column` element. It divides line rectangles by the column's own scale, so `transform: scale()` and the device scale factor change nothing, and it returns gap-free column inches, so the editor and the print give the same numbers to `sidesUsed` and `overflowIn`. `measureInputFor` builds its input from a spec and a mode.

Parity. `packages/render/src/html/letter-page.browser.test.tsx` runs every case in Chromium and WebKit at device scale factor 1 and at the print factor, in edit and print mode. WebKit agrees with Chromium on sides used for every fixture. Sides used per fixture in `packages/render/src/html/fixtures/index.ts`:

| Fixture        | Chromium | iPad (step 12) |
| -------------- | -------- | -------------- |
| note           | 1        | pending        |
| one-side       | 1        | pending        |
| blank-lines    | 1        | pending        |
| one-and-a-half | 2        | pending        |
| nearly-full    | 3        | pending        |
| overflow       | 3        | pending        |
| postcard-back  | 2        | not checked    |

WebKit's own ArrowDown does not follow a paragraph past a band: it lands below the band but at the paragraph's end or in the next paragraph, where Chromium lands on the next line. The editor has to move the caret across bands itself.

## One letter, end to end

A letter belongs to an organization and is one `letters` row. `LetterService` in `packages/services/src/letters/letters.service.ts` creates it with the default content for its format and the untitled title for its product kind.

A save is parsed and refused when stale. `saveLetter` runs `parseLetterContent`, refuses an own font that does not exist, trims and checks the title, then saves with one conditional update that matches the expected revision and bumps it. No match is stale when the letter is still there and not found when it is not, so a stale tab never overwrites a newer save. Delete only sets `deleted_at`; a deleted letter is gone from every read.

`getLetter` returns the letter with its `LetterResources` from `letterResources` and `editable` from `letterOwnerIds`; the export reads resources through the same function. The editor fills the rest of this section.

## Files

Every file is one `assets` row with its bytes in GCS. `Asset` in `packages/types/src/asset.ts` carries an origin, uploaded with a purpose or generated by a job, and a processing status.

An upload is checked before it is stored. `upload` in `AssetService` refuses a declared size over its purpose's limit without reading the body, reads through a counter that cancels the stream past the limit, sniffs the first bytes, and stores the sniffed type, never the name's. HEIC has its own code, `heic_not_supported`; any other type the purpose does not take is `unsupported_file`. Limits and types per purpose are `UPLOADS` in `packages/services/src/assets/assets.service.ts`. The bytes go under `organizations/<organizationId>/assets/<assetId>` with their SHA-256 checksum, and only then is the `done` row inserted, so a crash leaves an orphan object and never a row without bytes.

The browser never holds a signed URL. Pages and the letter use `/api/assets/{assetId}`, which finds the member's organization, asks `getAssetReadUrl`, and answers a redirect to a fresh signed URL with `private, no-store` caching, or 404 for another organization's asset. Nothing expires in an open editor because every read signs again. `isServable` decides which assets are ever read back, and a raw photo never is; `assetReadUrl` is the one place that rule meets `READ_URL_EXPIRES_IN_SECONDS`. `AssetStatus` carries no URL.

`GcsAssetStorage` in `packages/integrations/src/shared/gcp/storage/gcs-asset-storage.ts` signs V4 read URLs. Given `emulatorBaseUrl`, which the web passes from `STORAGE_EMULATOR_HOST`, it returns the emulator's download URL instead of signing. Locally the `gcs` service in `docker-compose.yml` runs fake-gcs-server, loads the bucket from `tools/docker/gcs/ink-studio-assets`, and allows the browser's cross-origin reads. `GCS_ASSETS_BUCKET` names the bucket.

## Jobs

Filled as jobs land.

## Tables

| Table              | Package       | Role                                                                                    |
| ------------------ | ------------- | --------------------------------------------------------------------------------------- |
| users              | `packages/db` | A person, keyed by external id and email                                                |
| organizations      | `packages/db` | A studio                                                                                |
| organization_users | `packages/db` | Membership and role                                                                     |
| letters            | `packages/db` | A letter's title, content and revision; stands in for project-post's `product_editions` |
| assets             | `packages/db` | One file: storage key, sniffed type, size, checksum, origin and processing              |

## Where to change things

Repo checks live in `tools/check.ts`.

## Moving into project-post

Shared packages are shaped so the move is a folder merge. The plan is `PLAN.md`.

The `assets` table extends the assets outline in project-post's schema file: it adds `purpose`, `filename`, `uploaded_by_user_id` and a `job` jsonb column, makes `source` the `asset_source` enum where the outline has a varchar, and adds `assets_origin_check`, which ties an uploaded source to a purpose and no job. The schema file gains these on the move.

The real bucket needs a CORS rule allowing GET from the platform origin with the `Content-Type` header, because the browser follows the redirect to GCS from the editor. The web and worker service accounts need `roles/iam.serviceAccountTokenCreator` on themselves to sign URLs.
