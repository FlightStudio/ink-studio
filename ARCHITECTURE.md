# Architecture

## What this is

Ink Studio v2 is the editor for physical letters and postcards. This file names files and constants. Values live in code.

## Packages and the dependency rule

| Package           | Path                                                               | Role                                                                 |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| typescript-config | `packages/typescript-config`                                       | Shared TypeScript presets                                            |
| logger            | `packages/logger`                                                  | Structured log helper                                                |
| types             | `packages/types/src/index.ts`                                      | Identity shapes, including `Member`                                  |
| types             | `packages/types/src/asset.ts`                                      | `Asset`, its origin and processing, `assetMessageType`               |
| types             | `packages/types/src/page.ts`                                       | `PAGE_SPECS`, one entry per provider and product                     |
| types             | `packages/types/src/ink.ts`                                        | `INK_COLORS` and `TEXT_SIZES`                                        |
| types             | `packages/types/src/font.ts`                                       | `STOCK_FONTS`, and a personal `Font`                                 |
| types             | `packages/types/src/handwriting.ts`                                | `HANDWRITING_GLYPHS`, `CELL`, `GLYPH_LIMITS` and `missingChars`      |
| types             | `packages/types/src/letter.ts`                                     | `LetterContent`, the element union, `LetterResources`, `humanSeal`   |
| types             | `packages/types/src/merge-field.ts`                                | `MERGE_FIELDS` and the sample and longest values                     |
| types             | `packages/types/src/stroke.ts`                                     | `Stroke`, its input and its timed points                             |
| types             | `packages/types/src/drawing.ts`                                    | `Drawing` and `LibraryDrawing`                                       |
| render            | `packages/render/src/html/index.ts`                                | `@repo/render/html`, client-safe page layout                         |
| render            | `packages/render/src/html/geometry.ts`                             | Column, bands, keep-clear exclusions, spacer floats                  |
| render            | `packages/render/src/html/letter-page.tsx`                         | `LetterPage`, the one page, and `useLetterPage`                      |
| render            | `packages/render/src/html/letter-css.ts`                           | `LETTER_CSS`, the letter's whole look                                |
| render            | `packages/render/src/html/letter-print.tsx`                        | `LetterPrint`, the page in print with a static flow                  |
| render            | `packages/render/src/html/merge-chip.tsx`                          | `MergeChip`, the label while editing and the value in print          |
| render            | `packages/render/src/html/signature-mark.tsx`                      | `SignatureMark`, the signature mask tinted in the chosen ink         |
| render            | `packages/render/src/html/measure.ts`                              | `measureLetter`, the scale-aware line measure                        |
| render            | `packages/render/src/html/ink.ts`                                  | `STROKE_OPTIONS`, `strokeOutline` and `outlinePath`                  |
| render            | `packages/render/src/html/fixtures/index.ts`                       | `LETTER_FIXTURES`, letters written against `maxPages`                |
| render            | `packages/render/src/html/letter-page.browser.test.tsx`            | The page laid out in Chromium and WebKit                             |
| render            | `packages/render/src/schema/index.ts`                              | `@repo/render/schema`, `letterExtensions` and parser                 |
| render            | `packages/render/src/index.ts`                                     | `@repo/render`, `renderLetterHtml` for the worker                    |
| render            | `packages/render/src/render-letter-html.tsx`                       | The print document around `LetterPrint`                              |
| render            | `packages/render/fonts`                                            | Stock font files by `STOCK_FONTS` file name, with licences           |
| errors            | `packages/errors/src/index.ts`                                     | `errorMessages` and `ServiceError`                                   |
| api               | `packages/api/openapi.yaml`                                        | HTTP contract. Client is `packages/api/src/gen/api.ts`               |
| api               | `packages/api/src/zod.ts`                                          | Request and response schemas typed against the generated types       |
| db                | `packages/db/src/index.ts`                                         | Identity, letter, font and drawing repositories and migrations       |
| db                | `packages/db/src/drizzle/fonts.ts`                                 | `Fonts`, one cell replaced under a row lock                          |
| db                | `packages/db/src/drizzle/schema/drawings.ts`                       | The drawings table                                                   |
| db                | `packages/db/src/drizzle/drawings.ts`                              | `Drawings`, the live list and the soft delete                        |
| db                | `packages/db/src/drizzle/letters.ts`                               | `Letters`, the revision-checked save and soft delete                 |
| db                | `packages/db/src/drizzle/assets.ts`                                | `Assets`, the claim, the job's moves and the stale read              |
| services          | `packages/services/src/letters/index.ts`                           | `LetterService`, `letterResources`, `letterOwnerIds`                 |
| services          | `packages/services/src/fonts/index.ts`                             | `FontService` and `isOwnFont`                                        |
| services          | `packages/services/src/assets/index.ts`                            | `AssetService`, `isServable`, `assetReadUrl`                         |
| services          | `packages/services/src/assets/assets.service.ts`                   | `UPLOADS`, the sniff and `READ_URL_EXPIRES_IN_SECONDS`               |
| services          | `packages/services/src/assets/assets.service.ts`                   | `runJob`, `sweep`, `MAX_ATTEMPTS`, `LEASE_MS`, `STALE_PENDING_MS`    |
| services          | `packages/services/src/assets/assets.types.ts`                     | `AssetStorage`, the provider integrations implements                 |
| services          | `packages/services/src/assets/assets.types.ts`                     | `RunJobParams`, `ProducedFile`, `AssetJobMessage`                    |
| services          | `packages/services/src/assets/assets.schemas.ts`                   | `assetJobMessageSchema`, the one job message                         |
| services          | `packages/services/src/queue/index.ts`                             | `QueueManager`, `Publisher`, `MessageProcessor`, `Subscriber`        |
| services          | `packages/services/src/drawings/index.ts`                          | `DrawingService` and `isUsableBy`                                    |
| services          | `packages/services/src/drawings/drawings.service.ts`               | Create, list, rename and delete, and the mask rule                   |
| services          | `packages/services/src/drawings/drawings.schemas.ts`               | `DRAWING_LIMITS` and `drawnSourceSchema`                             |
| services          | `packages/services/src/drawings/drawings.types.ts`                 | `ImageProcessor`, the lift provider integrations implements          |
| services          | `packages/services/src/letters/letters.types.ts`                   | `PrintRenderer`, the provider integrations implements                |
| integrations      | `packages/integrations/src/shared/gcp/index.ts`                    | `@repo/integrations/shared/gcp`, storage and Pub/Sub classes         |
| integrations      | `packages/integrations/src/shared/gcp/pubsub/publisher.ts`         | `PubSubPublisher`, a message per call with its type attribute        |
| integrations      | `packages/integrations/src/shared/gcp/pubsub/subscriber.ts`        | `PubSubSubscriber`, streaming pull into a `MessageHandler`           |
| integrations      | `packages/integrations/src/worker/font/index.ts`                   | `@repo/integrations/worker/font`, `buildFont` and `vectorize`        |
| integrations      | `packages/integrations/src/worker/font/vectorize.ts`               | `vectorize`, ink masks to closed glyph contours                      |
| integrations      | `packages/integrations/src/worker/image/index.ts`                  | `@repo/integrations/worker/image`, `SharpImageProcessor`             |
| integrations      | `packages/integrations/src/worker/image/lift.ts`                   | `liftInk`, `liftMask` and `LIFT_LIMITS`                              |
| integrations      | `packages/integrations/src/worker/image/synthetic.ts`              | Test-only SVG pages with their ground-truth ink and ruling masks     |
| integrations      | `packages/integrations/src/worker/chromium/index.ts`               | `@repo/integrations/worker/chromium`, `PlaywrightPrintRenderer`      |
| integrations      | `packages/integrations/src/worker/chromium/fixtures`               | The test font, whose `a` is a solid square                           |
| ui                | `packages/ui/src/styles/globals.css`                               | Stationery tokens inside the studio class                            |
| ui                | `packages/ui/components.json`                                      | shadcn CLI config for the primitives                                 |
| ui                | `packages/ui/src/components/ui`                                    | Generated shadcn primitives                                          |
| ui                | `packages/ui/src/components/desk.tsx`                              | Full-viewport desk surface                                           |
| ui                | `packages/ui/src/components/floating-toolbar.tsx`                  | Paper toolbar                                                        |
| ui                | `packages/ui/src/components/swatch.tsx`                            | Ink colour radio                                                     |
| ui                | `packages/ui/src/components/status-pill.tsx`                       | Pending, running, done, failed                                       |
| testing           | `packages/testing/src/browser.ts`                                  | Dev-only Chromium and WebKit harness                                 |
| web               | `apps/web/src/app/(studio)/layout.tsx`                             | Studio class, fonts, paper texture                                   |
| web               | `apps/web/public/images/paper.png`                                 | Paper scan from project-post, tiled on the sheet                     |
| web               | `apps/web/src/app/page.tsx`                                        | Sends `/` to the letters list                                        |
| web               | `apps/web/src/app/(studio)/letters/page.tsx`                       | Letters list with its empty state                                    |
| web               | `apps/web/src/app/(studio)/letters/[letterId]/page.tsx`            | The editor page and its missing-letter view                          |
| web               | `apps/web/src/app/(studio)/styleguide/page.tsx`                    | Style guide as a letter on the desk                                  |
| web               | `apps/web/src/server/auth.ts`                                      | `getSession`, the function the move replaces                         |
| web               | `apps/web/src/server/handle-json.ts`                               | `handleJson`, the one wrapper around every API route                 |
| web               | `apps/web/src/server/origin.ts`                                    | `isPlatformOrigin`, loopback names count as one origin               |
| web               | `apps/web/src/server/letters.ts`                                   | `getLetter` and `listLetters` for pages                              |
| web               | `apps/web/src/server/fonts.ts`                                     | `getFont` and `listFonts` for pages                                  |
| web               | `apps/web/src/server/drawings.ts`                                  | `listDoodles` for the editor page                                    |
| web               | `apps/web/src/app/api/letters/route.ts`                            | Create a letter                                                      |
| web               | `apps/web/src/app/api/letters/[letterId]/route.ts`                 | Read, save and delete one letter                                     |
| web               | `apps/web/src/app/api/fonts/route.ts`                              | Create a handwriting font                                            |
| web               | `apps/web/src/app/api/fonts/[fontId]/route.ts`                     | Delete one font                                                      |
| web               | `apps/web/src/app/api/fonts/[fontId]/glyphs/route.ts`              | Save one glyph cell                                                  |
| web               | `apps/web/src/app/api/drawings/route.ts`                           | Create a drawing                                                     |
| web               | `apps/web/src/app/api/drawings/[drawingId]/route.ts`               | Rename and delete a drawing                                          |
| web               | `apps/web/src/server/services.ts`                                  | Builds the db, the storage, the publisher and each service lazily    |
| web               | `apps/web/src/app/api/uploads/route.ts`                            | Upload one file                                                      |
| web               | `apps/web/src/app/api/assets/[assetId]/route.ts`                   | Redirect to a fresh signed URL                                       |
| web               | `apps/web/src/app/api/assets/[assetId]/status/route.ts`            | An asset's processing status                                         |
| web               | `apps/web/src/app/fonts/stock/[fontId]/route.ts`                   | Stock font bytes, cached as immutable                                |
| web               | `apps/web/src/features/editor/components/letter-editor.tsx`        | `LetterEditor`, Tiptap writing on `LetterPage`                       |
| web               | `apps/web/src/features/editor/components/save-line.tsx`            | `SaveLine`, the save state and the conflict choices                  |
| web               | `apps/web/src/features/editor/components/letter-card.tsx`          | A letter in the list, with Delete in its menu                        |
| web               | `apps/web/src/lib/autosave.ts`                                     | `autosave`, the pure save reducer, and `SAVE_DELAY_MS`               |
| web               | `apps/web/src/lib/use-autosave.ts`                                 | `useAutosave`, timers, unload and visibility                         |
| web               | `apps/web/src/features/ink/pointer-session.ts`                     | `pointerSession`, the pure pointer reducer                           |
| web               | `apps/web/src/features/ink/ink-canvas.tsx`                         | `InkCanvas`, the one drawing surface                                 |
| web               | `apps/web/e2e/harness.ts`                                          | `startHarness` for the web journeys                                  |
| web               | `apps/web/src/features/editor/components/editor-toolbar.tsx`       | `EditorToolbar`, font, size, ink, align, undo, redo, fields, Library |
| web               | `apps/web/src/features/editor/merge-field-menu.tsx`                | `MergeFieldMenu`, the field list                                     |
| web               | `apps/web/src/features/editor/merge-field-suggestion.ts`           | `mergeFieldSuggestion`, the @ menu                                   |
| web               | `apps/web/src/features/editor/elements.ts`                         | `placeElement`, `updateElement`, `removeElement` and `signLetter`    |
| web               | `apps/web/src/features/editor/transform.ts`                        | Move, ratio-preserving resize and snapped rotation                   |
| web               | `apps/web/src/features/editor/components/element-handles.tsx`      | Drag, corner and rotate handles, one commit per gesture              |
| web               | `apps/web/src/features/editor/components/element-menu.tsx`         | Ink swatches and Remove for the selected doodle                      |
| web               | `apps/web/src/features/library/rasterize.ts`                       | Strokes drawn to a transparent PNG mask                              |
| web               | `apps/web/src/features/library/compose-mask.ts`                    | Crop and erase applied to a lifted mask                              |
| web               | `apps/web/src/features/library/components/library-sheet.tsx`       | Doodles for the studio, and the caller's own signatures              |
| web               | `apps/web/src/features/library/components/draw-doodle-dialog.tsx`  | Draw a doodle or a signature and save it                             |
| web               | `apps/web/src/features/library/components/photo-doodle-dialog.tsx` | Photograph a doodle or a signature, then wait for the lift           |
| web               | `apps/web/src/features/library/components/mask-editor.tsx`         | Crop frame and eraser over the lifted ink                            |
| web               | `apps/web/src/features/editor/components/sides-indicator.tsx`      | `SidesIndicator`, how many allowed sides the letter uses             |
| web               | `apps/web/src/features/editor/components/overflow-notice.tsx`      | `OverflowNotice`, words that will not fit                            |
| web               | `apps/web/src/features/editor/components/add-side.tsx`             | `AddSide`, one step that raises `minSides`                           |
| web               | `apps/web/src/features/editor/components/sign-button.tsx`          | `SignButton`, opens the caller's signatures                          |
| web               | `apps/web/src/features/editor/components/human-seal.tsx`           | `HumanSeal`, the seal from `humanSeal` and the letter's own fonts    |
| web               | `apps/web/src/features/fonts/cell-units.ts`                        | `toCellUnits`, screen strokes saved in cell units                    |
| web               | `apps/web/src/features/fonts/components/glyph-grid.tsx`            | The draw page's cells, missing letters and Build                     |
| web               | `apps/web/src/features/fonts/components/glyph-cell.tsx`            | One character's ink canvas and guides                                |
| web               | `apps/web/src/features/fonts/components/font-preview.tsx`          | The last build, set in the font's own family                         |
| web               | `apps/web/src/features/fonts/components/font-list.tsx`             | The creator's fonts, each with Delete                                |
| web               | `apps/web/src/features/fonts/components/new-font-form.tsx`         | The seal name, then Draw it here                                     |
| web               | `apps/web/src/app/(studio)/fonts/page.tsx`                         | The handwriting list                                                 |
| web               | `apps/web/src/app/(studio)/fonts/new/page.tsx`                     | Start a handwriting font                                             |
| web               | `apps/web/src/app/(studio)/fonts/[fontId]/draw/page.tsx`           | Draw the cells of one font                                           |
| web               | `apps/web/src/app/(studio)/fonts/template/page.tsx`                | The printable handwriting template                                   |
| web               | `apps/web/src/features/fonts/components/template-sheet.tsx`        | The template page, markers and cyan cells                            |
| web               | `apps/web/src/features/fonts/components/template-photo-dialog.tsx` | Photograph the written template and wait for the build               |
| web               | `apps/web/src/features/fonts/components/template-actions.tsx`      | Print and photograph controls                                        |
| web               | `apps/web/src/features/fonts/components/font-upload-dialog.tsx`    | Upload a TTF or OTF and wait for the rebuild                         |
| integrations      | `packages/integrations/src/worker/font/template.ts`                | `readTemplate`, corner marks to cell masks                           |
| integrations      | `packages/integrations/src/worker/font/parse-thread.ts`            | Rebuild an uploaded font inside a limited thread                     |
| web               | `apps/web/src/features/editor/components/print-preview.tsx`        | `PrintPreview`, the print page in a same-origin frame                |
| worker            | `apps/worker/src/index.ts`                                         | `main`, one pool per process, picked by `WORKER_POOL`                |
| worker            | `apps/worker/src/env.ts`                                           | The worker's validated environment                                   |
| worker            | `apps/worker/src/processors/sweep.ts`                              | `sweepProcessor`, the `sweep` message                                |
| worker            | `apps/worker/src/processors/asset-lift-ink.ts`                     | `AssetLiftInkProcessor` for the lift-ink message                     |
| worker            | `apps/worker/src/processors/asset-build-font.ts`                   | `AssetBuildFontProcessor` for a drawn, photographed or uploaded font |
| worker            | `apps/worker/src/processors/asset-render-letter.ts`                | `AssetRenderLetterProcessor` for a proof                             |
| web               | `apps/web/src/features/editor/components/export-button.tsx`        | Export proof, then a status pill and a download                      |
| web               | `apps/web/src/app/(studio)/letters/new/page.tsx`                   | The product picker, one card per `PAGE_SPECS` entry                  |
| web               | `apps/web/src/features/editor/components/product-picker.tsx`       | `ProductPicker`, starts a letter in the chosen format                |
| web               | `apps/web/src/features/editor/components/front-image-picker.tsx`   | `FrontImagePicker`, uploads a cover and sets the front image         |
| root              | `Dockerfile.worker`                                                | The worker image, with Chromium and the stock fonts                  |
| worker            | `apps/worker/package.json`                                         | `dev` runs the standard pool, `dev:render` the render pool           |
| tools             | `tools/check-comments.ts`                                          | No-comment check                                                     |
| tools             | `tools/check-architecture.ts`                                      | This map stays honest                                                |
| tools             | `tools/migrate.ts`                                                 | Applies `packages/db/drizzle`                                        |
| tools             | `tools/dev/screens.ts`                                             | `pnpm screens` writes both viewports of `WEB_BASE_URL`               |
| tools             | `tools/dev/sweep.ts`                                               | `pnpm jobs:sweep` publishes one `sweep`                              |
| tools             | `tools/docker/gcs/ink-studio-assets`                               | The local bucket, loaded by the `gcs` compose service                |
| tools             | `tools/docker/pubsub-entrypoint.sh`                                | The emulator's jobs topic and one filtered subscription per pool     |
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
11. Services take a `Member` and throw `ServiceError` with a kind and an `ApiErrorCode`. `handleJson` checks the origin with `isPlatformOrigin`, the content type and the body, finds the member, and turns each kind into one status; nothing else in a route touches errors. `handleRequest` does the same for routes without a JSON body, such as the upload, which reads the raw body stream. Services that touch only assets take the `UserOrganization`.
12. A provider is an interface a service declares, such as `AssetStorage`. `packages/integrations` implements it and imports only types from services; services never import integrations. Apps build the implementation and pass it in, in `apps/web/src/server/services.ts`. Integration classes read no environment; apps pass every setting, including the emulator hosts.
13. `sharp` is imported only under `packages/integrations/src/worker` and its tests, which only the worker imports; the web and its bundle never load it. `biome.json` refuses the import anywhere else.

## Pages

A product is a `PAGE_SPECS` entry. The editor and the renderer read it and never name one. Nothing in code names a product or a page count; `packages/render/src/html/geometry.ts` reads everything from the `PageSpec`.

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

Text that does not fit is shown, never cut. `LetterEditor` keeps the whole flow and, when `overflowIn` is above zero, draws one sheet past the last allowed side behind that text. `OverflowNotice` says how many words will not fit. The extra sheet is paper only; nothing slices the text to the page limit.

`PrintPreview` in `apps/web/src/features/editor/components/print-preview.tsx` is the preview frame. It renders `LetterPrint` with `SAMPLE_MERGE_VALUES` through a React portal into a same-origin iframe, so the studio's desk, paper texture and keep-clear guides cannot reach the print page, and no server route renders the letter. The preview is this browser's print layout. Chromium in the worker remains the authority on whether a proof fits.

Parity. `packages/render/src/html/letter-page.browser.test.tsx` runs every case in Chromium and WebKit at device scale factor 1 and at the print factor, in edit and print mode. WebKit agrees with Chromium on sides used for every fixture. Sides used per fixture in `packages/render/src/html/fixtures/index.ts`:

| Fixture        | Chromium | iPad      |
| -------------- | -------- | --------- |
| note           | 1        | unchecked |
| one-side       | 1        | unchecked |
| blank-lines    | 1        | unchecked |
| one-and-a-half | 2        | unchecked |
| nearly-full    | 3        | unchecked |
| overflow       | 3        | unchecked |
| postcard-back  | 2        | unchecked |

iPad side counts are still unchecked. Step 12 compared the editor with the print preview in desktop Chromium only. This environment has no iPad, so the table does not record an iPad side count.

WebKit's own ArrowDown does not follow a paragraph past a band: it lands below the band but at the paragraph's end or in the next paragraph, where Chromium lands on the next line. The editor has to move the caret across bands itself.

## How handwriting varies

`buildFont` in `packages/integrations/src/worker/font/opentype-font.ts` writes an OpenType font from glyph outlines at `UNITS_PER_EM`, with a notdef glyph and a space. A character with variants keeps its default glyph under the character's name and gets alternates suffixed alt1, alt2 and so on; only the default is in the cmap. Variants of one character run from 0 without gaps, and `buildFont` throws otherwise.

Variation lives in GSUB, written through opentype.js's own table writer, which handles every lookup this layout needs. Each stylistic set, ss01, ss02 and ss03, owns one chained-context lookup (type 6, format 3). One single-substitution lookup per variant number maps each default to that alternate; these belong to no feature and run only from the chained lookups. Per letter, a set's subtables are ordered: the last variant behind and no substitution, so the cycle wraps to the default; then each alternate behind, stepping to the next; then the default behind, stepping to the first alternate. ss02 and ss03 end with a subtable with an empty backtrack that starts the letter one or two steps in, wrapped by that letter's own variant count. Within one lookup the backtrack sees the glyphs this lookup has already substituted, which is what makes a run cycle. The backtrack is the previous glyph only, so the cycle runs through repeated letters; after any other glyph a letter starts again where its set starts.

`variantFeatureSettings` in `packages/render/src/html/letter-page.tsx` hashes the letter id with FNV-1a and picks one of the three sets. `LetterPage` puts it in the `--letter-variant-set` custom property, and the shared `letter-text` rule in `LETTER_CSS` applies it as `font-feature-settings`, so the editor root and the static root carry the same set. A letter always prints the same, and two letters differ.

Parity. `packages/integrations/src/worker/font/opentype-font.browser.test.ts` measures advances at the print device scale factor in Chromium and WebKit, as differences of widths from the start of the run, because WebKit pads a lone character's range in the middle of a run. Both engines cycle every case. Playwright's WebKit on Linux shapes with HarfBuzz as Chromium does; Safari on the iPad shapes with Core Text, which this test does not reach.

## Handwriting fonts

A handwriting font belongs to the creator who drew it. The `fonts` table stores `owner_user_id` beside `organization_id`. `FontService` in `packages/services/src/fonts/fonts.service.ts` creates a font, replaces one drawn cell, lists the caller's own fonts, reads one font and deletes it. `isOwnFont` is the one ownership rule for every write: another organization is not found, and a teammate in the same organization is refused. `listFonts` returns the caller's own fonts only. `getFont` returns the owner's cells, and nothing for anyone else.

`missingChars` in `packages/types/src/handwriting.ts` is the one rule for which required characters are still missing. It reads `HANDWRITING_GLYPHS` and treats a glyph with no strokes as missing. Strokes are stored in cell units (`CELL`), never screen pixels. `saveGlyph` replaces one cell inside a transaction that locks the row, so two cells saved at once both remain. Nothing here publishes a job. Pages read through `getFont` and `listFonts` in `apps/web/src/server/fonts.ts`.

## Tracing glyphs

`vectorize` in `packages/integrations/src/worker/font/vectorize.ts` turns a `Mask` from the lift into closed contours with no tracing dependency; potrace is GPL. Contours are in mask pixels with the origin at the mask's top-left corner and y pointing down, so pixel x, y covers the unit square from x, y and is sampled at its centre. Each contour is a list of points with an implied closing edge.

1. Marching squares over the mask padded with one clear pixel on every side, so every contour closes. A pixel is ink when its alpha is at least `INK_ALPHA`. The contour runs where interpolated alpha crosses `ISO_ALPHA`, halfway between the last clear value and the first ink value, so a hard mask's edges fall on pixel boundaries. A saddle cell joins its two ink corners when the average of its four corners reaches `ISO_ALPHA`; in a hard mask that is exactly the tie, so pixels touching only at a corner are one shape.
2. Each crossing sits on one grid edge shared by two cells, so it has exactly two neighbours, and the segments chain into loops by walking from neighbour to neighbour.
3. Ramer-Douglas-Peucker on each closed loop at `tolerancePx`, `VECTORIZE_DEFAULTS` when the caller passes nothing. The loop is split at the point farthest from its first point and the point farthest from that one, and both halves are simplified with those two points kept. A loop that simplifies to fewer than three points is narrower than the tolerance and is dropped.
4. Orientation by containment depth, counted on the unsimplified loops, which never cross: a loop inside an even number of others is clockwise and inside an odd number is counter-clockwise. Clockwise means clockwise as the mask is seen on screen with y down, which is a positive shoelace sum in these coordinates. Flipping y into font units turns outer contours counter-clockwise, the winding CFF expects, and holes the other way, so nonzero and even-odd fills agree.

`packages/integrations/src/worker/font/vectorize.test.ts` fills the contours back with the nonzero rule at pixel centres and compares them with the mask at `INK_ALPHA`, on the handwritten g from `handwrittenG` in `packages/integrations/src/worker/image/synthetic.ts`.

## Print

`PrintRenderer` in `packages/services/src/letters/letters.types.ts` is the provider the export calls, and `PlaywrightPrintRenderer` in `packages/integrations/src/worker/chromium/playwright-print-renderer.ts` implements it with Chromium. `connect` attaches to a browser server by its WebSocket endpoint and `launch` starts Chromium in the worker image. The renderer knows nothing about letters: it takes the page's HTML, the resource map, a measure function with its input, the `sheet` size, the output and a `sides` function. Services may not import `@repo/render/html`, so the letters types declare `MeasureInput` and `LetterMeasure` structurally; the compiler links them to `measureLetter` where the worker passes it in.

- The measured root is the one `letter-column` element. `measure` runs on it in the page and `sides` runs in Node on the result; HTML without exactly one fails.
- The outside network is blocked. Requests under `LETTER_ORIGIN` are fulfilled from the resource map, keyed by full URL, with their content type and an allow-any-origin header; every other request is aborted.
- One scale factor. Each call gets its own context with JavaScript off and `DEVICE_SCALE_FACTOR`, so the measure and the pictures share one layout. The page waits for load and for its fonts before it measures or takes a picture.
- The proof is raster. `render` measures in its own page load, then screenshots each side at its `sheet` clip in whole device pixels. Sides are stacked from the top of the document with no gap.
- A PNG is one side, the one the output names.
- A PDF is a second document of one full-page image per side `sides` returns, printed at the sheet's CSS page size. With `duplex` it is padded to an even page count with a blank page.

`packages/integrations/src/worker/chromium/playwright-print-renderer.test.ts` proves these rules with hand-written HTML and the test font in `packages/integrations/src/worker/chromium/fixtures/square-a.ttf`, so integrations never imports `packages/render`.

## One letter, end to end

A letter belongs to an organization and is one `letters` row. `LetterService` in `packages/services/src/letters/letters.service.ts` creates it with the default content for its format and the untitled title for its product kind.

A save is parsed and refused when stale. `saveLetter` runs `parseLetterContent`, refuses an own font that does not exist, trims and checks the title, then saves with one conditional update that matches the expected revision and bumps it. No match is stale when the letter is still there and not found when it is not, so a stale tab never overwrites a newer save. Delete only sets `deleted_at`; a deleted letter is gone from every read.

`getLetter` returns the letter with its `LetterResources` from `letterResources` and `editable` from `letterOwnerIds`; the export reads resources through the same function. `letterResources` includes every drawing the letter references, deleted or not. A save refuses a drawing that is not in the organization.

A doodle or a signature is one row in the drawings table, through `DrawingService` in `packages/services/src/drawings/drawings.service.ts`. Doodles are shared with the organization. A signature is listed, renamed and deleted only by its owner. `isUsableBy` is the one rule. The mask must be an uploaded PNG of purpose mask in the same organization, its first chunk must be IHDR, and each side must stay within `DRAWING_LIMITS` in `packages/services/src/drawings/drawings.schemas.ts`. Delete is a soft delete: it sets `deleted_at`, and the library stops listing the drawing.

Placement is a doc-attribute step. `placeElement` in `apps/web/src/features/editor/elements.ts` writes the document's elements attribute, and the history plugin undoes that step along with the text. Placing a drawing also adds it to the editor's resources, so `LetterPage` can draw the mask before the next load. The library opens from the toolbar. `rasterize` in `apps/web/src/features/library/rasterize.ts` turns the strokes into the PNG mask that is uploaded before the drawing is saved.

A photographed doodle starts as an uploaded photo. Photograph in the library uploads it, asks for a lift, and polls the asset status once a second while a status pill reads that the ink is lifting. After two minutes still pending it says this is taking longer than usual and offers another try. The mask editor fetches that mask through the asset route and decodes it with createImageBitmap, so the canvas is not tainted. It tints the ink on the paper, offers a crop frame, and erases with the ink canvas drawing destination-out at the eraser size. Saving runs `composeMask` in `apps/web/src/features/library/compose-mask.ts` at the mask's own resolution, uploads that PNG as a mask, and stores the drawing with a photo source pointing at the original photo. A photo source has to be an uploaded photo in the same organization.

A placed doodle is moved, resized and rotated as one gesture. The handles follow the pointer in local state, and pointer up writes one `updateElement`, so undo takes the whole gesture back. Resize keeps the ratio and the opposite corner, and it will not go below a quarter inch. Rotation snaps within four degrees of a right angle. A drag can cross onto the next side, and it stays on the last side past the end of the stack. Recolour and Remove are their own steps. A doodle in a keep-clear corner is outlined in `--danger` and says to keep that corner clear for the postal barcode.

The list in `apps/web/src/app/(studio)/letters/page.tsx` reads `listLetters` and shows each product's label. New opens `apps/web/src/app/(studio)/letters/new/page.tsx`, which lists every `PAGE_SPECS` entry, the letter first, and creates the chosen format through the API. The editor page reads `getLetter` and renders `LetterEditor` keyed by the letter's id and revision, so a refresh that brings a newer revision starts the editor afresh. `LetterEditor` runs Tiptap over `letterExtensions` and hands it to `LetterPage` as the flow, in edit mode. The page scales to the desk width up to `MAX_SCALE` with one transform, and that one scale converts pointer pixels to inches. Until the letter's fonts have loaded, for at most `INK_READY_TIMEOUT_MS`, the paper shows without text and then the ink settles in, so a fallback font never flashes. A letter whose `editable` is false opens read-only.

`LetterEditor` measures after each edit and again when the document's fonts are ready. `PageState` holds that `LetterMeasure`, the `sidesUsed` count given `minSides`, `overflowIn`, and `placementIssues`. The inches passed in are the measure's gap-free inches. `sheets` is the sides in use, plus one ghost sheet when text overflows. `AddSide` is one document-attribute transaction on `minSides`, offered while that is below the spec's `maxPages`. When the spec's front is an image, `FrontImagePicker` uploads a cover and sets the front image in one document-attribute transaction, so undo covers it. `HumanSeal` renders `humanSeal` under the page. `humanSeal` in `packages/types/src/letter.ts` joins a handwriting clause, then doodles hand-drawn when a doodle is placed, then signed by hand when the letter has a signature. `SidesIndicator` reads both counts from the spec's `maxPages`.

A signature is the last block. The schema stores `paragraph+ signature?`, so one that is not last is refused. `signLetter` replaces the signature already there or appends one, and `SignatureMark` tints that drawing's mask at the chosen width. A signature is usable only by its owner, through `isUsableBy`. `letterOwnerIds` counts that owner, so a teammate opens the letter read-only. Sign opens the library on the caller's signatures, with the three widths and the ink swatches, or offers to draw or photograph one.

Export proof freezes the letter as it is saved and asks the render pool for the file. `requestExport` checks the revision and that the caller may edit the letter, then inserts one proof when the product's output is a PDF and one PNG per side when it is PNG. A postcard's two outputs are those PNGs, one per side, each named with its side. Each job carries that snapshot and the sample merge values. The render takes one recipient's values; the v2 proof uses the samples; project-post's fulfilment calls it once per recipient. The fit check uses the longest. The worker measures with the longest sample, refuses the proof when the words do not fit or a doodle sits in a keep-clear zone, and names the download from the title. A merge field is an inline chip from `MERGE_FIELDS` in `packages/types/src/merge-field.ts`. Typing @, or Insert field, opens `apps/web/src/features/editor/merge-field-menu.tsx` through `apps/web/src/features/editor/merge-field-suggestion.ts`. The chip takes the surrounding ink. While editing, `MergeChip` in `packages/render/src/html/merge-chip.tsx` shows the field's label; a render prints that recipient's value. A finished proof is servable. The uploaded photo and the raw font file still are not.

Formatting sets one ink attribute. `EditorToolbar` in `apps/web/src/features/editor/components/editor-toolbar.tsx` offers `STOCK_FONTS`, `TEXT_SIZES`, `INK_COLORS` and the paragraph aligns, and each choice is one `setMark("ink", …)` or one paragraph attribute with only the changed value, so a colour change keeps the font and an unset attribute still falls back to the letter's defaults. Every formatting command closes the history first, so it is its own undo step even right after typing. Undo and redo are the history commands, on the toolbar and on Meta+Z and Shift+Meta+Z as well as Mod, in `packages/render/src/schema/letter-schema.ts`. The toolbar shows the selection's resolved style, mark over default, and shows nothing for an attribute the selection mixes. With a fine pointer it sticks to the top of the desk; with a coarse pointer it follows the browser's `visualViewport` to sit above the on-screen keyboard, and the title and save line move up to clear it. The formatted letter saves through the same parser as everything else.

Autosave is one pure reducer, `autosave` in `apps/web/src/lib/autosave.ts`. An edit schedules a save `SAVE_DELAY_MS` later; an edit during a save saves again at once with the new revision; a failed save waits `RETRY_FIRST_MS`, doubling up to `RETRY_MAX_MS`, and an edit does not shorten the wait; a stale save holds every edit in `conflict` until the creator chooses. `useAutosave` in `apps/web/src/lib/use-autosave.ts` drives it with timers and the generated client, warns before unload while anything is unsaved, and when the tab comes back into view reloads a newer version if it has nothing unsaved. Load the latest refreshes the page; Keep mine reads the latest revision and saves over it. `SaveLine` shows which state the letter is in.

Stock fonts come from `apps/web/src/app/fonts/stock/[fontId]/route.ts`, which reads `packages/render/fonts` by `STOCK_FONTS` file name and answers as immutable; `apps/web/next.config.ts` traces that folder into the build.

Web journeys live in `apps/web/e2e` and run with `pnpm test:e2e`, never inside `pnpm test`, against a running dev server at `WEB_BASE_URL`. `startHarness` in `apps/web/e2e/harness.ts` starts the browser container, seeds a fresh identity with `seedDevIdentity`, signs in through the `dev_user` cookie and creates a fresh letter per test. The browser reaches the host as `localhost`; the origin check treats loopback names on one port as one origin, so `NEXT_PUBLIC_PLATFORM_URL` may name either loopback address.

## Ink

Every drawing is `Stroke[]` from `packages/types/src/stroke.ts`: an input, pen, mouse or touch, and points of x, y, pressure and milliseconds since the stroke began, in the drawing surface's own units. `strokeOutline` in `packages/render/src/html/ink.ts` is the one place a stroke becomes a polygon, so the browser, the rasteriser and the worker draw the same ink. It calls perfect-freehand with `STROKE_OPTIONS`, whose size it multiplies by the caller's scale, and it is the one place the pressure rule lives: a pen's recorded pressure shapes its width, and any other input ignores its pressure and has it simulated from speed. `outlinePath` turns an outline into one closed SVG path.

`InkCanvas` in `apps/web/src/features/ink/ink-canvas.tsx` is the one drawing surface, for doodles, signatures, font cells and the mask eraser. It is a canvas with `touch-action: none` that reads every coalesced pointer event, feeds `pointerSession`, and fills one `Path2D` per stroke on the next animation frame in its text colour. It calls `onStrokeEnd` with every stroke whenever the finished strokes change, and its ref offers undo and clear.

`pointerSession` in `apps/web/src/features/ink/pointer-session.ts` holds the palm rules as a pure reducer. One stroke draws at a time. A pen keeps its pressure; a mouse or a finger stores `FLAT_PRESSURE`. A touch while a pen draws is ignored; once a pen has drawn in a session every touch is a palm, while a mouse still draws. A pen landing during a touch stroke drops that touch and draws. A second finger cancels the first finger's stroke, and a cancelled stroke is dropped. Undo removes the last stroke and clear removes all.

## Files

Every file is one `assets` row with its bytes in GCS. `Asset` in `packages/types/src/asset.ts` carries an origin, uploaded with a purpose or generated by a job, and a processing status.

An upload is checked before it is stored. `upload` in `AssetService` refuses a declared size over its purpose's limit without reading the body, reads through a counter that cancels the stream past the limit, sniffs the first bytes, and stores the sniffed type, never the name's. HEIC has its own code, `heic_not_supported`; any other type the purpose does not take is `unsupported_file`. Limits and types per purpose are `UPLOADS` in `packages/services/src/assets/assets.service.ts`. The bytes go under `organizations/<organizationId>/assets/<assetId>` with their SHA-256 checksum, and only then is the `done` row inserted, so a crash leaves an orphan object and never a row without bytes.

The browser never holds a signed URL. Pages and the letter use `/api/assets/{assetId}`, which finds the member's organization, asks `getAssetReadUrl`, and answers a redirect to a fresh signed URL with `private, no-store` caching, or 404 for another organization's asset. Nothing expires in an open editor because every read signs again. `isServable` decides which assets are ever read back. A raw photo never is. An uploaded cover is, so the front image can be shown. A front image has to be one of the organization's covers; `letterResources` lists that cover. `assetReadUrl` is the one place that rule meets `READ_URL_EXPIRES_IN_SECONDS`. `AssetStatus` carries no URL.

`GcsAssetStorage` in `packages/integrations/src/shared/gcp/storage/gcs-asset-storage.ts` signs V4 read URLs. Given `emulatorBaseUrl`, which the web and the worker pass from `STORAGE_EMULATOR_HOST`, it returns the emulator's download URL instead of signing, and reads bytes from that same URL. The storage client drops `/storage/v1` from its base when `STORAGE_EMULATOR_HOST` is set, so a client download would miss objects the upload just stored. Locally the `gcs` service in `docker-compose.yml` runs fake-gcs-server, loads the bucket from `tools/docker/gcs/ink-studio-assets`, and allows the browser's cross-origin reads. `GCS_ASSETS_BUCKET` names the bucket.

## Ink lift

A photo of ink on paper becomes a soft alpha mask in `packages/integrations/src/worker/image/lift.ts`. `SharpImageProcessor` implements `ImageProcessor` from `packages/services/src/drawings/drawings.types.ts` with `liftInk`, which writes the mask as a PNG with black colour channels so the ink is tinted at render. `liftMask` returns the raw mask and can keep the full frame. Both go through the same decode, so every path into the lift has the same pixel cap, `maxInputPixels` in `LIFT_LIMITS`, read from the header before anything is decoded. Failures are `ServiceError("invalid_input", code)` with `photo_unreadable`, `photo_too_large` or `no_ink_found`.

The stages, in order:

1. Decode. `sharp` reads the header and refuses a photo over the cap, then applies EXIF orientation, flattens transparency onto white, shrinks to `workingLongSidePx` in `LIFT_LIMITS` without enlarging, and hands over raw RGB. Only this stage and the final PNG encode use `sharp`; every other stage is plain TypeScript over the raw buffer.
2. Lighting. A background estimate per channel (block mean, max filter, blur, bilinear upscale) divides each channel, so shadows and paper tint go to white.
3. Colour separation. Brightness is the brightest channel, so light coloured rulings and margins read as paper and dark ink of any hue stays dark.
4. Sauvola on brightness, from integral images of the value and its square, with a window that scales with the image's short side. A pixel darker than its threshold is hard ink.
5. Line removal. Run-length filtering on the hard mask, an opening with a line element in linear time: horizontal runs at least the width over `LINE_LENGTH_DIVISOR` long, then vertical runs at least the height over it, lose the pixels where the mask's thickness across the run is at most `LINE_THICKNESS_BASE_PX` plus the short side over `LINE_THICKNESS_DIVISOR`. A stroke crossing a line is thick across it, so the crossing stays. The rows go first, so a grid's intersections are thin by the time the columns are filtered.
6. Components. 8-connected components, from union-find over runs, drop when smaller than `SPECK_MIN_PX` or `SPECK_SHARE` of the image, whichever is larger, or when they touch the border and cover more than `BORDER_SHARE` of the image, which is a dark table edge around the paper. A page left with no hard ink is `no_ink_found`.
7. Soft matte. Alpha ramps with the distance below the threshold, inside a one-pixel dilation of the cleaned hard mask. A pixel that line removal or the component filter took out stays clear even inside that dilation.
8. Crop. `liftInk` crops to the ink plus a margin that scales with the image.

`liftMask` with `removeLines` off skips stages 5 and 6, so it returns Sauvola's mask with the matte; `liftInk` always removes them. The constants for each stage live at the top of the lift file. A stroke wider than the Sauvola window lifts hollow. Sauvola's threshold drops beside dark ink, so a mid-grey line breaks a few pixels either side of each stroke; a piece shorter than the run length then survives line removal. The border rule only sees a table edge whose dark band reaches the frame, because the lighting stage normalises a wide strip of table to paper. `packages/integrations/src/worker/image/lift.test.ts` scores each stage against the ground truth from `packages/integrations/src/worker/image/synthetic.ts`, which draws grids, rulings, a wavy underline, dotted i's, specks and a table around the paper, each with its own truth mask.

## Jobs

Work leaves the web as a Pub/Sub message on the one topic `PUBSUB_JOBS_TOPIC` names. A message's data is JSON and its `type` attribute names the work. `Publisher` in `packages/services/src/queue/queue.types.ts` is the one call services make, `publish(type, data)`; `PubSubPublisher` implements it.

The worker runs as two pools from one codebase, `apps/worker`. Each process reads `WORKER_POOL` and pulls from the subscription `PUBSUB_JOBS_SUBSCRIPTION` names. The render pool's subscription filters on the letter render job's type and the standard pool's takes every other type, so headless Chromium work never queues behind image or font work. The filters live in `tools/docker/pubsub-entrypoint.sh` locally and in Terraform after the move.

`QueueManager` in `packages/services/src/queue/queue.manager.ts` dispatches each message to the one `MessageProcessor` whose `type` matches the attribute. A processor that resolves acks the message; one that throws nacks it, so Pub/Sub redelivers it. A message with no type, a type no processor in that pool takes, or data that is not JSON is logged and acked, because redelivering it can never succeed. Two processors for one type refuse to start.

`main` in `apps/worker/src/index.ts` builds the db, `GcsAssetStorage`, `PubSubPublisher`, `AssetService` and the pool's processors, starts `PubSubSubscriber`, which checks its subscription exists first, logs `worker listening` with its pool, and runs until `SIGINT` or `SIGTERM`, then stops its timer and closes the subscription, the publisher and the db.

Locally the `pubsub` service in `docker-compose.yml` runs the emulator from `tools/docker/Dockerfile.pubsub`, and its healthcheck passes once the subscriptions exist. `pnpm dev` runs `turbo run dev dev:render`, so the web, the standard pool (`dev`) and the render pool (`dev:render`, which sets `WORKER_POOL` and `PUBSUB_JOBS_SUBSCRIPTION` for the render pool) start together. Both pools read the worker's env file, copied from `apps/worker/.env.example`.

| Message type  | Pool     | Processor                                           | Data          |
| ------------- | -------- | --------------------------------------------------- | ------------- |
| `sweep`       | standard | `apps/worker/src/processors/sweep.ts`               | `{}`          |
| lift-ink      | standard | `apps/worker/src/processors/asset-lift-ink.ts`      | `{ assetId }` |
| build-font    | standard | `apps/worker/src/processors/asset-build-font.ts`    | `{ assetId }` |
| render-letter | render   | `apps/worker/src/processors/asset-render-letter.ts` | `{ assetId }` |

### One lifecycle for every generated file

A generated asset carries the job that produces it in its origin. A feature service inserts `generatedAsset` inside its own transaction, which makes the row `pending` with no bytes, and calls `publishAssetJob` only after the commit, so a message never names a row that is not there. The message's type is `assetMessageType` of the job's kind, from `packages/types/src/asset.ts`, and its data is `AssetJobMessage`, the asset's id and nothing else; `assetJobMessageSchema` in `packages/services/src/assets/assets.schemas.ts` parses it.

`runJob` in `AssetService` runs one delivery. `claim` in `packages/db/src/drizzle/assets.ts` is one conditional update that takes a pending asset, or a running one whose lease of `LEASE_MS` ran out, marks it running and counts the attempt; a redelivery of a finished asset and the loser of a race get nothing and the message is acked. The producer returns bytes, their type and a result. The bytes go to storage first, under the key the row already holds; then one transaction runs `complete`, which records the type, size and SHA-256 checksum and marks the asset done, together with the optional `onComplete`, so a feature's own rows commit beside `done` or not at all.

The error rule. A `ServiceError` of kind `invalid_input` is an input failure: the asset fails at once with that code, such as `photo_unreadable`, and the message is acked, because the same input fails again. Every other error is transient: `release` puts the asset back to pending with the error's text and the error is rethrown, so the message is nacked and redelivered. The transient failure on attempt `MAX_ATTEMPTS` fails the asset with `processing_failed` and acks instead, and a claim that finds the attempts already spent fails it the same way. `complete`, `release` and `fail` move only a running asset, so a late worker cannot undo a finished one.

One processor per kind, typed by `assetMessageType`. Each job kind gets one processor in `apps/worker/src/processors`, whose `type` is `assetMessageType` of that kind; it parses the message and calls `runJob` with a producer built on the worker-only provider. Services never hold a worker-only provider. `AssetLiftInkProcessor` reads the photo and calls `liftInk` on `SharpImageProcessor`. `sharp` stays external to the worker bundle. A finished lift-ink asset is servable, the same way a mask is; a raw photo is not. `requestLift` inserts that pending asset and publishes the lift-ink message only after the insert commits.

A drawn font builds the same way. `requestBuild` inserts a pending build-font asset, records it as `pendingFontAssetId`, and publishes only after that commits. The last finished build stays in `fontAssetId` until the new one is done. When the job finishes, that pending asset becomes `fontAssetId` and the file's characters are stored beside it. An older build that finishes after a newer one was requested leaves the current build in place. Only the owner writes with a font. People in the same organization receive its file through `@font-face` so a letter in that hand can be read. No other organization ever does. A finished build-font file is servable the same way a mask is.

Drawing that font happens on `apps/web/src/app/(studio)/fonts/[fontId]/draw/page.tsx`. Each cell is an `InkCanvas` with the cell's guides. `toCellUnits` in `apps/web/src/features/fonts/cell-units.ts` stores the stroke in the cell's own units, so the same mark on a large cell and a small cell is the same glyph. The toolbar's My handwriting group lists fonts that have finished a build. Choosing one adds that file to the letter's resources, and the page shows it at once. An empty group links to `apps/web/src/app/(studio)/fonts/new/page.tsx`.

A photographed template builds at once. The printable page is `apps/web/src/app/(studio)/fonts/template/page.tsx`. Its corner marks are black. Its cell borders, guide lines and labels are light cyan, so the lift keeps the handwriting and drops the printed template. `readTemplate` in `packages/integrations/src/worker/font/template.ts` finds the four marks, takes the notched one as the top left, and reads each cell. A photo without those marks is refused. `createFont` with that photo requires the photo to belong to the same organization, and it asks the worker to build before it returns.

An uploaded TTF or OTF builds the same way. `createFont` accepts only a font file from the same organization. The worker parses that file in a thread limited to 5 seconds and 256 MB, rebuilds a new font from its outlines inside the thread, and only the rebuilt bytes leave it. The uploaded file is never served. A file that cannot be read, that takes too long, or that is missing lowercase letters fails the build.

The sweep. The `sweep` processor calls `sweep` on `AssetService`, which reads `stale` work and republishes every pending asset untouched for `STALE_PENDING_MS` and every running asset past its lease, so a publish lost after a commit or a worker that died mid-job is picked up again. Only the standard pool takes `sweep` and only it publishes the timer: when `SWEEP_EVERY_MS` is set, `main` publishes `sweep` on that interval, and the render pool, whose subscription never receives `sweep`, publishes nothing. `pnpm jobs:sweep` runs `tools/dev/sweep.ts`, which publishes one `sweep` by hand.

## Tables

| Table              | Package       | Role                                                                                    |
| ------------------ | ------------- | --------------------------------------------------------------------------------------- |
| users              | `packages/db` | A person, keyed by external id and email                                                |
| organizations      | `packages/db` | A studio                                                                                |
| organization_users | `packages/db` | Membership and role                                                                     |
| letters            | `packages/db` | A letter's title, content and revision; stands in for project-post's `product_editions` |
| assets             | `packages/db` | One file: storage key, sniffed type, size, checksum, origin and processing              |
| fonts              | `packages/db` | A personal handwriting font and the cells its owner has drawn                           |
| drawings           | `packages/db` | A doodle or signature: owner, mask, aspect and source, with a soft delete               |

## Where to change things

Repo checks live in `tools/check.ts`.

## Moving into project-post

Shared packages are shaped so the move is a folder merge. The plan is `PLAN.md`.

`packages/services/src/queue` and the Pub/Sub classes in `packages/integrations/src/shared/gcp/pubsub` are v2's copies of project-post's and are dropped on the move. The render pool's filter moves from `tools/docker/pubsub-entrypoint.sh` into project-post's entrypoint and its Terraform subscriptions.

In production Cloud Scheduler publishes `sweep` to the jobs topic every minute with the `type` attribute set, and `SWEEP_EVERY_MS` stays unset, so one schedule sweeps however many workers run.

The `assets` table extends the assets outline in project-post's schema file: it adds `purpose`, `filename`, `uploaded_by_user_id` and a `job` jsonb column, makes `source` the `asset_source` enum where the outline has a varchar, and adds `assets_origin_check`, which ties an uploaded source to a purpose and no job. The schema file gains these on the move.

The real bucket needs a CORS rule allowing GET from the platform origin with the `Content-Type` header, because the browser follows the redirect to GCS from the editor. The web and worker service accounts need `roles/iam.serviceAccountTokenCreator` on themselves to sign URLs.
