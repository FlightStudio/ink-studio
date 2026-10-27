# Ink Studio v2 plan

Ink Studio v2 is an editor for creators who send physical letters and postcards through Project Post. The creator picks a letter or a postcard and writes straight onto the page, like Google Docs. They write in a stock handwriting font or in a font made from their own handwriting, and they place doodles and a signature from a personal library. The worker lifts ink from photos, builds fonts and renders a proof (PDF for a letter, one PNG per side for a postcard) with headless Chromium from the same page component the editor shows.

v2 is a standalone pnpm and Turborepo monorepo at `PP/ink-studio-v2` that copies project-post's shape and toolchain, so it moves into project-post as folder merges plus the rewrites Appendix A lists. This file is the whole plan. Agents run one step per session, in order. Every step stands alone and leaves the repo green and demoable.

## Settled decisions

The user settled these before building started. They are facts for every step, not questions.

1. **Package names are `@repo/*`, same names and folders as project-post.** v2's copies of shared packages (`typescript-config`, `logger`, `errors`, `api`, the `db` harness, `services/queue`, the Pub/Sub classes) are file copies of project-post's and are deleted on the move. Imports never change.
2. **Chromium lives in `packages/integrations/src/worker/chromium`; `packages/render` is pure HTML, in three subpaths.** A provider is an interface the service declares and `integrations` implements. `@repo/render/schema` is the letter's Tiptap schema and parser, with no JSX and no React, safe for services and Server Components. `@repo/render/html` is client-safe (geometry, `LetterPage`, `LetterPrint`, `measureLetter`, `strokeOutline`). `@repo/render` is `renderLetterHtml`, which only the worker calls. All three read catalogues such as `PAGE_SPECS` from `@repo/types`.
3. **Dependency edges beyond project-post's rules.** (a) Client components import `@repo/render/html` and `@repo/render/schema`. (b) `services` imports `@repo/render/schema`, to validate a letter against the real Tiptap schema. (c) `@repo/render/html` imports `perfect-freehand`. (d) `@repo/testing` is a dev-only package that `render`, `integrations`, `apps/worker` tests, the web's e2e files and `tools/dev` import. The web never imports `@repo/render`, and `integrations` never imports `render`: the worker's processors pass outlines and the measure function in. The ADR to file in project-post on the move is one paragraph: "render/schema and render/html hold the letter's schema and layout; services may import render/schema to validate documents; only the worker imports @repo/render; @repo/testing holds test harnesses only."
4. **Libraries.** All passed an npm and OSV check.
   - `sharp` pinned `^0.35.5` (0.35.5 fixed the latest libvips advisory). Decoding, EXIF orientation and `limitInputPixels`; kept out of the worker bundle and installed in the image.
   - `@google-cloud/storage` `^8.0.0`, and the `fsouza/fake-gcs-server` image locally.
   - `@tiptap/static-renderer` `3.32.0`. Used: it renders the editor's own extensions without a DOM, which no hand-written renderer can match without becoming a second renderer.
   - `@babel/parser` `^8.0.0`, a `tools` devDependency. Used: it returns every comment from TS and TSX, where a hand lexer must model JSX text, closing tags and regex literals and still gets `<p>Don't</p>` wrong.
   - `testcontainers` `^12.2.0`. Used: it already backs `@testcontainers/postgresql`, and it starts the Playwright and fake-gcs containers with waits and cleanup that a hand-written `docker run` wrapper would have to rebuild.
   - `@tiptap/suggestion` `3.32.0` and its peer `@floating-ui/dom` `^1.7.0` (a direct dependency of `apps/web`, which also positions the dropdown with it), for the `@` merge-field menu. `@tiptap/extension-mention` `3.32.0` is approved and not used: all it adds over `@tiptap/suggestion` is a node, and the `mergeField` node must live in `@repo/render/schema`, which services import, without the suggestion plugin.
   - Approved before: Tiptap 3 (`@tiptap/core`, `@tiptap/react`, `@tiptap/pm`) pinned `>=3.32`, `perfect-freehand` 1.2.x, `opentype.js` 2.x, `playwright-core` `>=1.55.1`. `vitest` in `apps/web` is the catalog version.
5. **No code comments, enforced** by `tools/check-comments.ts` in `pnpm lint`, the pre-commit hook and v2's CI. On the move, project-post's CI lint job gains `pnpm --filter tools check`.
6. **The export is a raster proof** at 300 dpi, rendered with one recipient's merge values (the samples in v2). A letter is a PDF of one 2550×3300 image per side; a postcard is one PNG per side (2738×1838), because Thanks.io takes postcards only as images. A real mailing is project-post's fulfilment worker calling the same render once per recipient; v2 builds no recipient list.
7. **Page specs are provider-agnostic data, keyed by provider and product.** `PAGE_SPECS` holds `thanksio:letter-windowless` (the default) and `thanksio:postcard-6x9`; Thanks.io's 4×6 and 6×11 postcards, or another provider, are one entry each. Thanks.io rules are read safely until Thanks.io confirms: a letter with an odd number of sides gets a blank back; both letter barcode zones stay clear on side 1; the postcard's address and postage block stays clear on the back. **The page limit is data too.** Each spec has `maxPages` (the letter's default is 3, settable up to the provider's limit, 12 for Thanks.io letters; a postcard is 2 sides) and `providerMaxPages`. No code, copy or fixture names a page count.
8. **Chromium in the worker is the only authority on fit.** The editor shows its own side count; the export measures in Chromium and refuses what does not fit, with the reason. Step 12 checks the six letter fixtures on a real iPad by hand and records the result.
9. **Fonts and signatures are personal.** Each belongs to the creator who made it (`owner_user_id`, beside `organization_id`). Only the owner can draw, build, delete, write with or sign with it. Services that touch letters, fonts or drawings take a `Member` (the user and their `UserOrganization`). Teammates can open and preview a letter written in someone else's hand, read-only. Doodles stay shared with the organization.
10. **The seal treats an uploaded font like a drawn one.** "Written in Karla's own handwriting", with the owner's name validated.
11. **Uploaded fonts keep outlines and advance widths only.** Kerning and alternates from an upload are dropped.
12. **A template photo builds at once**, with no cell-by-cell review in v2.
13. **v2 tables stand in for project-post's planned editions, preflight and signature processing.** `letters` stands in for `product_editions`; the proof becomes the `edition.preflight` proof asset and the job snapshot becomes `approved_render_spec`; the drawing-based signature and `lift-ink` replace `catalog.uploadSignature` and `asset.process-signature`. Appendix A lists the rewrite.
14. **One worker image for both pools in v2**, built on the Playwright image; the move decides per pool.
15. **The browser rasterises drawn doodles and erased photo doodles** and uploads the PNG as a `mask` asset.
16. **Web journeys run as vitest files driving `playwright-core`** against the running dev stack.
17. **Product defaults.** Ink colours Midnight, Ink blue (default), Sepia, Forest, Oxblood. Text sizes 16, 20 (default), 24, 30 pt. Stock fonts Caveat (default), Patrick Hand, Homemade Apple. Merge fields `first_name`, `last_name`. Text margin 0.75 in on a letter, 0.375 in on a postcard back. Signature widths 1.5, 2.25, 3 in. New letters are "Untitled letter" and new postcards "Untitled postcard".
18. **The handwriting template is one page of 8 × 13 cells holding 94 glyphs**: a to z, A to Z, 0 to 9, 16 punctuation marks, three variants of e, t, a, o, n and two of i, s, r, h, l, d. The last 10 cells are blank. Lowercase letters and `. , ! ? '` are required; the rest fall back to Caveat.

## Rules every step follows

- Read `AGENTS.md` (created in step 1 from project-post's) before starting. Its rules apply in full.
- Write the step's behaviour tests first, run them, and see them fail for the right reason. Then write the code. If a listed case turns out to pin a mapping or a constant, drop it and say why in the commit.
- No comments in code, CSS or tests. `pnpm lint` fails on one.
- `ARCHITECTURE.md` names files and constants and states rules; it never copies values that live in code. Every step updates it in the same commit. `pnpm lint` fails when it names a path that does not exist.
- A step is done when `pnpm lint`, `pnpm typecheck` and `pnpm test` pass from a clean `docker compose up -d`, plus the step's live check.
- Never edit `PP/ink-studio` or `PP/project-post`. Copying a file out of them is fine.
- Commit at the end of each step with a conventional message.

## Conventions this plan fixes

- **Physical units are inches.** Stored positions and sizes are numbers of inches with an `In` suffix. Degrees end in `Deg`, points in `Pt`, pixels in `Px`; pixels appear only in image code and pointer handling.
- **Documents are Tiptap JSON**, validated on every save by one parser built from the catalogues. Never HTML, never Markdown. A "letter" in code is the document a creator writes; its `format` names the product, a letter or a postcard.
- **`LetterContent` is defined once**, in `packages/types/src/letter.ts`. The parser's zod schema is typed `z.ZodType<LetterContent>`, so the compiler links the two. OpenAPI describes `content` as an object with `schemaVersion` and `format` only.
- **One asset type for every file**, with a processing status. A generated asset carries the job that produces it.
- **One job message shape**, `{ assetId }`, under the message type `assetMessageType(kind)`.
- **One element union** for anything placed on a page, stored in the document's root attributes so one undo stack covers text and placement.
- **One page component**, `LetterPage`, with one props contract. It computes bands, exclusions, elements and font faces itself; callers pass data.
- **Catalogues are data in `packages/types`** (`PAGE_SPECS`, `INK_COLORS`, `TEXT_SIZES`, `STOCK_FONTS`, `MERGE_FIELDS`, `HANDWRITING_GLYPHS`, `HANDWRITING_TEMPLATE`, `SIGNATURE_WIDTHS`), declared `as const satisfies`, and their id unions derive from them.
- **CSS font families are ids, never names.** They are `stock-<id>` and `own-<fontId>`. Creator-typed text never reaches CSS.
- **The browser never holds a signed URL.** Pages use `/api/assets/{assetId}`, which checks the organization and redirects to a fresh short signed URL.
- **The caller.** Services that touch letters, fonts or drawings take a `Member`, `{ user, userOrganization }`, which is what `requireUserOrganization` already returns. Services that touch only assets take the `UserOrganization`, as project-post's do.
- **Ids in documents are UUIDs.** The parser refuses any other id, so a bad id is `invalid_letter`, never a database error.
- **Identifiers are UUIDv7** from the application. Timestamps are `timestamptz`.
- **Ports.** Postgres 5434, Pub/Sub 8086, GCS 4443, browser server 3001, so v1, v2 and project-post run side by side.

## Where v2 diverges from v1, and why

| v1 (`PP/ink-studio`)                                                             | v2                                                                                                                           | Why                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Letter on the left, controls on the right                                        | The creator types on the page; one floating toolbar                                                                          | Writing on the page is the product                                    |
| Full-letter photo upload with Tesseract OCR                                      | No full-letter photos, no OCR                                                                                                | It was messy; photos are for doodles, signatures and font templates   |
| One adaptive-mean threshold (`apps/worker/src/lift.ts`, 41 px window, offset 16) | Staged lift with lighting, colour separation, Sauvola on brightness, run-length line removal, speck removal and a soft matte | A mean threshold keeps rulings, grids and specks                      |
| Ink baked as black pixels (`INK = [22, 18, 16]`)                                 | Alpha mask tinted at render                                                                                                  | Doodles take any ink colour                                           |
| Worker code run inside the web request (`POST /api/captures`)                    | Separate worker over Pub/Sub; the web stores and enqueues                                                                    | Image work never runs in a web request                                |
| Files under `.data`, served by `/api/ink/[id]`                                   | `assets` rows, bytes in GCS, an org-checked route redirecting to short signed URLs                                           | Tenant isolation and project-post's storage                           |
| Draft in React state, lost on reload                                             | `letters` table, Tiptap JSON, autosave with revisions and conflict recovery                                                  | Letters persist across devices                                        |
| `@ink-studio/core` pure Draft functions                                          | project-post's layers of types, db, services, integrations and apps                                                          | It drops into project-post                                            |
| TLA+ model and `pnpm verify` for the Human Seal                                  | One pure `humanSeal` function                                                                                                | The seal is a label, not a stored proof                               |
| HEIC in the file picker, rejected after upload                                   | HEIC never offered; Safari converts to JPEG                                                                                  | No dead-end upload                                                    |
| Eight mail sizes, margin `max(0.375 in, short side / 10)`                        | Provider and product specs as data: the Thanks.io windowless letter and 6×9 postcard                                         | Print rules come from the printer, and a second provider is one entry |
| Page turn, zoom and photo crop controls                                          | Fixed page, positions in inches                                                                                              | Nothing to rotate when you write on the page                          |
| Three typed styles with no seal                                                  | Stock fonts and the creator's own handwriting font                                                                           | Own handwriting is the human part                                     |
| Fonts through `next/font/local`, which renames families                          | Self-served files with fixed family ids, the same bytes in editor and print                                                  | Identical metrics in both                                             |
| ESLint and a root vitest config                                                  | Biome and per-package vitest                                                                                                 | Same toolchain as the destination                                     |

## Milestones

| Milestone                            | Steps    | Demo at the end                                                                                       |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------- |
| M1. Scaffold, database, dev identity | 1 to 4   | `pnpm dev` serves the app for the seeded dev user                                                     |
| M2. Design system and page model     | 5 to 8   | Text flows across every allowed side around left and right exclusions at once, in Chromium and WebKit |
| M3. Editor                           | 9 to 12  | Write, title, format, undo, autosave, sides, overflow, print preview, seal                            |
| M4. Files and jobs                   | 13 to 15 | Files upload into GCS; both worker pools run asset jobs with retries                                  |
| M5. Doodles by drawing               | 16 to 18 | Draw a doodle, tap it onto the letter, move, resize, rotate, recolour, undo                           |
| M6. Photo ink lift                   | 19 to 22 | Photograph a doodle on ruled paper, lift, erase leftovers, place it                                   |
| M7. Fonts (separable)                | 23 to 29 | "My handwriting" by drawing, by template photo, or by uploading a TTF or OTF                          |
| M8. Proofs and postcards             | 30 to 32 | Export a letter's PDF proof and a postcard's two PNGs from the render pool                            |
| M9. Merge fields and signature       | 33 to 34 | `@` merge fields; sign the letter; the seal reads it all                                              |
| M10. Text wrap                       | 35       | Text wraps around a doodle that asks for it                                                           |
| M11. Move rehearsal                  | 36       | v2 merged by hand into a throwaway clone of project-post                                              |

Files and jobs come after the editor because nothing before the doodle library needs them, so the creator writes on the page three steps sooner.

M7 is separable. No step outside M7 needs a font built from handwriting: M8, M9 and M10 are specified and tested with stock fonts only, and what M7 adds to shared code (`resources.fonts`, the font half of the owner rule, `sealFonts`) arrives through `letterResources` and `letterOwnerIds` in `services/letters`, which work with or without it. If M7 is skipped or deferred, step 30 follows step 22.

---

## M1. Scaffold, database, dev identity

### 1. Create the monorepo with project-post's toolchain and the two repo checks

**Goal.** An empty, green monorepo with project-post's toolchain, `AGENTS.md`, `ARCHITECTURE.md`, a CI workflow, and two checks that keep the no-comments rule and the architecture map honest.

**Files.**

- Run `git init`.
- Copy unchanged: `.gitignore`, `.nvmrc`, `.prettierrc.json`, `.prettierignore`, `.betterleaks.toml`, `packages/typescript-config/*`, `packages/logger/*`.
- Copy and adapt: `package.json` (name `ink-studio-v2`; no Stripe scripts; `lint` is `biome check . && pnpm --filter tools check`; add `seed`, `test:e2e`, `screens`), `pnpm-workspace.yaml`, `turbo.json` (adds a persistent `dev:render` task), `biome.json`, `lefthook.yml`, `.github/workflows/ci.yml` (jobs `lint` running `pnpm lint`, `typecheck`, `test`, `build`, `secrets`).
- Create `tools/{package.json,tsconfig.json,vitest.config.ts,check-comments.ts,check-comments.test.ts,check-architecture.ts,check-architecture.test.ts}`, `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`, and a root `.env.example` with `DEV_LAN_HOST=` (docker compose reads the root `.env`).

**Shapes.**

```yaml
catalog:
  "@base-ui/react": ^1.9.0
  "@floating-ui/dom": ^1.7.0
  "@google-cloud/pubsub": ^6.2.0
  "@google-cloud/storage": ^8.0.0
  "@t3-oss/env-core": ^0.13.11
  "@t3-oss/env-nextjs": ^0.13.11
  "@testcontainers/postgresql": ^12.2.0
  "@tiptap/core": ^3.32.0
  "@tiptap/pm": ^3.32.0
  "@tiptap/react": ^3.32.0
  "@tiptap/static-renderer": 3.32.0
  "@tiptap/suggestion": 3.32.0
  "@types/node": ^26.6.4
  "@types/react": ^19.3.0
  "@types/react-dom": ^19.3.0
  class-variance-authority: ^0.7.1
  lucide-react: ^1.57.0
  opentype.js: ^2.0.0
  perfect-freehand: ~1.2.2
  playwright-core: <exact current release, at least 1.55.1>
  react: ^19.3.0
  react-dom: ^19.3.0
  sharp: ^0.35.5
  tailwindcss: ^4.3.3
  testcontainers: ^12.2.0
  tsx: ^4.23.15
  typescript: ^7.0.2
  vitest: ^5.0.3
  zod: ^4.6.5
```

```ts
export type CommentFinding = { file: string; line: number; text: string };
export type FindCommentsParams = { file: string; source: string };
export function findComments(params: FindCommentsParams): CommentFinding[];

export type MissingPath = { line: number; path: string };
export type FindMissingPathsParams = {
	markdown: string;
	exists: (path: string) => boolean;
};
export function findMissingPaths(params: FindMissingPathsParams): MissingPath[];
```

`biome.json` keeps project-post's structure, where each override restates `noRestrictedImports` in full. It adds one group, "`sharp`, `opentype.js` and `playwright-core` only in worker integrations and tests", to the base and to every existing override. Allow-overrides that restate every other group but drop this one cover `packages/integrations/src/worker/**`, `packages/testing/**`, `packages/render/src/**/*.browser.test.{ts,tsx}`, `apps/worker/src/**/*.test.ts`, `apps/web/e2e/**` and `tools/dev/**`. `@babel/parser` `^8.0.0` is a `tools` devDependency, outside the catalog because only `tools` uses it. `lefthook.yml` adds a `comments` pre-commit command over staged `*.{ts,tsx,js,mjs,css}` files. `tools/vitest.config.ts` sets `testTimeout: 60_000` and `hookTimeout: 120_000`, as project-post's db and services configs do, because later tools tests start containers.

**Tests first.** `tools/check-comments.test.ts`:

- "a line comment after code is found". `const a = 1; // note` gives one finding on line 1.
- "block and JSX comments are found". `/* x */` and `<div>{/* y */}</div>` give two findings.
- "JSX text with an apostrophe is not a string". `<p>Don't</p>; const b = 2;` gives none.
- "a closing tag followed by code is not a regex". `<b>x</b>; const c = 3; // tail` gives one finding, the tail.
- "JSX text with slashes is not a comment". `<p>see https://example.com</p>` gives none.
- "slashes in strings, templates and regex literals are not comments". `"https://a/b"`, `` `a // b ${"/*"}` `` and `/\/\//g` give none.
- "CSS comments are found and CSS strings are not". `a { content: "/*"; } /* x */` gives one finding.

`tools/check-architecture.test.ts`:

- "a repo path that does not exist is reported with its line".
- "code spans that are not repo paths are ignored". `` `pnpm test` `` and `` `xParams` `` give none.

**Implementation.** `findComments` parses with `@babel/parser` (`sourceType: "module"`, plugins `typescript` and `jsx` for `.tsx`, `typescript` for `.ts`) and maps `ast.comments` to findings; `.css` files go through a scanner that skips quoted strings and reports `/* */`. `main` takes staged paths when given and `git ls-files` otherwise, keeps only the checked extensions, and skips `migrations/` and `packages/api/src/gen/`. `findMissingPaths` reads backtick spans that start with `apps/`, `packages/`, `tools/`, `.github/` or name a root file.

`AGENTS.md` is project-post's with the Structure, Tech stack and Commands sections rewritten for v2, Stripe and Firebase removed, and these rules added under "How to work": tests come before code; no comments, enforced; `ARCHITECTURE.md` changes with every change and names files and constants, never their values; stored geometry is inches with an `In` suffix; `sharp`, `opentype.js` and `playwright-core` are imported only in worker integrations and tests. `CLAUDE.md` is `@AGENTS.md`.

`ARCHITECTURE.md` starts with these sections, each filled only as code lands: "What this is", "Packages and the dependency rule", "One letter, end to end", "Jobs", "Tables", "Where to change things", "Moving into project-post".

**Done.** `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass, and a commit runs the hooks.

**ARCHITECTURE.md.** Create it. Fill "What this is" and the `typescript-config`, `logger` and `tools` rows.

### 2. Add the shared contract packages for types, api and errors

**Goal.** The packages every layer imports, with the identity shapes services take as the caller.

**Files.**

- Copy and trim from project-post: `packages/types/src/{user,organization,organization-user,user-organization,session,other-string}.ts`, and `packages/types/src/index.ts` re-exporting only those. `Organization` is `{ id: string; name: string }`. `session.ts` gains `export type Member = { user: User; userOrganization: UserOrganization };`, the caller for services that touch personal fonts and signatures.
- Copy and trim: `packages/api/{package.json,tsconfig.json,orval.config.ts,src/index.ts,src/zod.ts}` and `packages/api/openapi.yaml` with `/api/health`, the `ApiError` schema, the shared responses and `ApiErrorCode`.
- Copy: `packages/errors/*`, with `errorMessages` trimmed to the spec's codes.
- Run `pnpm api:generate` and commit `src/gen/`.

**Shapes.**

```yaml
ApiErrorCode:
  type: string
  enum:
    [
      invalid_request,
      unauthenticated,
      forbidden,
      not_found,
      invalid_origin,
      unsupported_media_type,
      internal_error,
      no_organization,
    ]
```

**Tests first.** None. This step is shapes, a copied class and generated code.

**Implementation.** Copy, trim, generate. Every later step that adds an error code adds it to `ApiErrorCode` and its sentence to `errorMessages`, then regenerates.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `types`, `api`, `errors` and project-post's dependency rules 1 and 2.

### 3. Add the database package, identity tables and the Postgres test harness

**Goal.** project-post's `Db` contract and Drizzle implementation with three identity tables, migrations, `pnpm db:migrate`, and `startTestDb()` on real Postgres 17.

**Files.**

- Copy: `packages/db/{package.json,tsconfig.json,drizzle.config.ts}`, `packages/db/vitest.config.ts` without its comment, `src/errors.ts`, `src/drizzle/{connection,query-error,migrate}.ts`, `src/drizzle/schema/columns.ts`, `tools/migrate.ts`.
- Extend `tools/package.json` with `@repo/db` and the `migrate` script.
- Create from project-post's shape: `src/database.ts`, `src/index.ts`, `src/drizzle/db.ts`, `src/drizzle/schema/{identity,index}.ts`, `src/drizzle/{users,organizations,organization-users}.ts` and their tests, `src/testing/{start-test-db,index}.ts`, `docker-compose.yml` (Postgres on 5434), `tools/.env.example`.
- Generate the first migration.

**Shapes.**

```ts
export interface Users {
	byExternalId(externalId: string): Promise<User | null>;
	getOrCreate(input: NewUser): Promise<{ user: User; created: boolean }>;
}
export interface Organizations {
	byId(id: string): Promise<Organization | null>;
	create(input: NewOrganization): Promise<Organization>;
}
export interface OrganizationUsers {
	userOrganizationByUserId(userId: string): Promise<UserOrganization | null>;
	create(input: NewOrganizationUser): Promise<OrganizationUser>;
}
export interface Tx {
	users: Users;
	organizations: Organizations;
	organizationUsers: OrganizationUsers;
}
export interface Db extends Tx {
	transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
	close(): Promise<void>;
}
export type TestDb = { db: Db; stop(): Promise<void> };
```

**Tests first.**

- `users.test.ts` "getOrCreate returns the existing user the second time". Two calls give one id, `created` true then false.
- `users.test.ts` "a second account with a taken email is a unique violation". It rejects with `UniqueViolationError`, constraint `users_email_unique`.
- `organization-users.test.ts` "a user in two organizations gets the one they joined first".
- `organization-users.test.ts` "a user with no membership gets null".

**Implementation.** Mirror project-post's `DrizzleTx` and `DrizzleDb` with three repositories. `startTestDb` is project-post's without the events reader.

**Done.** `docker compose up -d`, `pnpm db:migrate`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `db`, the three tables, and the rule that Drizzle and `pg` live only in `packages/db`.

### 4. Seed a dev identity and serve the web shell

**Goal.** `pnpm dev` serves Next.js 16 for one seeded user and organization, on this machine and on an iPad on the LAN. The session comes from one function, `getSession` in `apps/web/src/server/auth.ts`, which the move replaces with project-post's.

**Files.**

- Create `apps/web/{package.json,tsconfig.json,next.config.ts,.env.example}`, `src/env.ts`, `src/lib/logger.ts`, `src/app/{layout.tsx,globals.css,page.tsx,error.tsx,global-error.tsx}`, `src/app/api/health/route.ts`, `src/server/{services.ts,auth.ts}`.
- Copy from project-post: `src/lib/server-api-client.ts`, `src/components/shared/{error-view,error-card,title}.tsx`, `packages/ui/*` unchanged.
- Create `packages/db/src/testing/{seed-dev-identity,seed-dev-identity.test}.ts` (exported from `@repo/db/testing`) and `tools/dev/seed.ts`; extend `tools/package.json` with `@repo/db` and the `seed` script; add `DEV_USER_EMAIL` and `DEV_ORGANIZATION_NAME` to `tools/.env.example`, and `DEV_USER_EMAIL` and an empty `DEV_LAN_HOST` to `apps/web/.env.example`.
- Add "Run an iPad session" to `README.md`.

**Shapes.**

```ts
export type SeedParams = { email: string; organizationName: string };
export async function seedDevIdentity(
	db: Db,
	params: SeedParams,
): Promise<Member>;

export const getSession = cache(async (): Promise<Session | null> => {
	const cookieStore = await cookies();
	const devUserCookie = cookieStore.get("dev_user")?.value;
	const devUserAllowed = env.NODE_ENV !== "production";
	const email =
		devUserAllowed && devUserCookie ? devUserCookie : env.DEV_USER_EMAIL;
	const user = await db.users.byExternalId(`dev:${email}`);
	if (!user) {
		return null;
	}
	return {
		user,
		userOrganization: await db.organizationUsers.userOrganizationByUserId(
			user.id,
		),
	};
});
```

`getSessionOrRedirect`, `requireSession` and `requireUserOrganization` are project-post's.

**Tests first.** `seed-dev-identity.test.ts`:

- "seeding twice leaves one user, one organization and one owner membership".
- "seeding a user who has no organization gives them one as owner".

**Implementation.** The `dev_user` cookie lets the e2e harness act as a fresh identity it seeded with `seedDevIdentity`, so each journey starts with an empty organization and a teammate case has a second user; outside development it is ignored. `seedDevIdentity` lives in `@repo/db/testing` because both `tools/dev/seed.ts` and the web's e2e harness call it. It runs one transaction. It calls `getOrCreate` with `externalId` `dev:<email>`, then the existing membership or a new organization and owner membership. `next.config.ts` is project-post's without the PostHog rewrites, with `allowedDevOrigins` from `host.docker.internal` and `DEV_LAN_HOST`. The README's "Run an iPad session" lists the settings an iPad needs: `DEV_LAN_HOST` in the root `.env` (for compose) and in `apps/web/.env.local` (for `next.config.ts`), and in `apps/web/.env.local` `NEXT_PUBLIC_PLATFORM_URL=http://<DEV_LAN_HOST>:3000` (so the Origin check passes) and, from step 13, `STORAGE_EMULATOR_HOST=http://<DEV_LAN_HOST>:4443` (so asset redirects reach the iPad). `src/app/page.tsx` redirects to `/letters` once step 10 adds it; until then it renders "Ink Studio" for the session.

**Done.** `pnpm seed`, `pnpm dev`; `/` renders and `/api/health` answers 200. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `apps/web`, `ui`, the seam rule (pages read through `src/server/<feature>.ts`, mutations go through `src/app/api/`), and `getSession` as the one function the move replaces.

---

## M2. Design system and page model

### 5. Build the quiet stationery design system and the browser test harness

**Goal.** v2's tokens, type scale and components inside a `.studio` scope, so project-post's own tokens stay untouched; a style guide; a dev-only browser harness every browser test uses; a screenshot script every UI step uses as its live check.

**Files.**

- Extend `packages/ui/src/styles/globals.css` with v2's tokens under their own names and a `.studio` scope; leave every project-post token as it is.
- Add with the shadcn CLI: `toggle`, `toggle-group`, `popover`, `tooltip`, `dialog`, `sheet`, `tabs`, `slider`, `select`. Remove any comment the generator writes.
- Create by hand: `packages/ui/src/components/{desk,floating-toolbar,swatch,status-pill}.tsx`.
- Copy `project-post/apps/web/public/images/paper.png` to `apps/web/public/images/paper.png`.
- Create `apps/web/src/app/(studio)/layout.tsx` (sets `className="studio"`, sets `--letter-paper-texture: url(/images/paper.png)`, loads `Libre_Baskerville` as `--font-display` and `Outfit` as `--font-sans`) and `apps/web/src/app/(studio)/styleguide/page.tsx`.
- Create `packages/testing/{package.json,tsconfig.json}` (`@repo/testing`, subpath `./browser`, no `test` script) and `packages/testing/src/browser.ts`.
- Create `tools/dev/screens.ts`; extend `tools/package.json` with `@repo/testing`, `playwright-core` and the `screens` script.

**Shapes.**

```css
:root {
	--desk: oklch(0.93 0.012 75);
	--desk-grain: oklch(0.88 0.014 70);
	--ink: oklch(0.25 0.02 262);
	--ink-muted: oklch(0.52 0.015 262);
	--ink-accent: oklch(0.42 0.13 262);
	--ink-accent-foreground: oklch(0.985 0.01 85);
	--rule: oklch(0.88 0.01 80);
	--danger: oklch(0.55 0.17 28);
	--shadow-float: 0 1px 2px oklch(0.3 0.03 60 / 0.1), 0 8px 20px -6px oklch(0.3 0.03 60 / 0.25);
	--ease-settle: cubic-bezier(0.2, 0.7, 0.2, 1);
	--duration-settle: 420ms;
	--duration-quick: 160ms;
}
.studio {
	--background: var(--desk);
	--foreground: var(--ink);
	--primary: var(--ink-accent);
	--primary-foreground: var(--ink-accent-foreground);
	--border: var(--rule);
	--input: var(--rule);
	--ring: oklch(0.42 0.13 262 / 0.4);
	--destructive: var(--danger);
}
@theme inline {
	--font-display: var(--font-display);
	--text-display: 1.75rem;
	--text-display--line-height: 2.125rem;
	--text-title: 1.25rem;
	--text-title--line-height: 1.625rem;
	--text-ui: 0.875rem;
	--text-ui--line-height: 1.25rem;
	--text-label: 0.75rem;
	--text-label--line-height: 1rem;
	--animate-settle: ink-settle var(--duration-settle) var(--ease-settle) both;
}
@keyframes ink-settle {
	from { opacity: 0; filter: blur(1.2px); transform: scale(1.015); }
	to { opacity: 1; filter: blur(0); transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) { :root { --duration-settle: 0ms; --duration-quick: 0ms; } }
```

The paper, its shadow and the keep-clear hatching are not here; they belong to the letter and live in `LETTER_CSS` (step 8), which `LetterPage` renders in the editor and the print alike.

```ts
export type FloatingToolbarProps = ComponentProps<typeof Toolbar.Root> & {
	placement: "top" | "bottom";
};
export type SwatchProps = {
	color: string;
	label: string;
	selected: boolean;
	onSelect: () => void;
};
export type StatusPillProps = {
	status: "pending" | "running" | "done" | "failed";
	label: string;
};

export type StartTestBrowserParams = { chromiumArgs?: string[] };
export type TestBrowsers = {
	wsEndpoint: string;
	chromium: Browser;
	webkit: Browser;
	stop(): Promise<void>;
};
export async function startTestBrowser(
	params?: StartTestBrowserParams,
): Promise<TestBrowsers>;
```

**Tests first.** None in vitest. Tokens and components are visual; the live check is screenshots.

**Implementation.** `Desk` is the full-viewport surface in `--desk` with a faint noise from `--desk-grain`. `FloatingToolbar` wraps base-ui's `Toolbar` with a paper-coloured background, `--shadow-float`, 44 px targets under `@media (pointer: coarse)` and 32 px otherwise, and `animate-settle` on mount. `Swatch` is a round radio ringed in `--ink-accent` when selected. `StatusPill` pulses slowly for pending and running. Display type is for page titles and empty states only. `startTestBrowser` starts `mcr.microsoft.com/playwright:v<version>-noble` through `testcontainers` with `npx -y playwright@<version> run-server --port 3000 --host 0.0.0.0`, `<version>` read from `playwright-core/package.json`, and connects `chromium` (with `chromiumArgs` sent as launch options in the `x-playwright-launch-options` header) and `webkit`; `wsEndpoint` lets a test build its own client, such as `PlaywrightPrintRenderer.connect`. `tools/dev/screens.ts` calls it with `chromiumArgs: ["--host-resolver-rules=MAP localhost host.docker.internal"]` and opens `http://localhost:3000<path>`, at 1440×900 and at an iPad viewport (1024×1366, touch, scale 2), and saves PNGs under `.local/screens/`.

**Done.** `pnpm screens /styleguide` writes both screenshots; look at them. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add "Design system" naming `packages/ui/src/styles/globals.css`, the `.studio` scope rule, the component files, `@repo/testing/browser` (dev-only) and `pnpm screens`.

### 6. Model page specs and the exclusion floats as data and pure functions

**Goal.** Products as provider-agnostic data (the Thanks.io windowless letter, the default, and the Thanks.io 6×9 postcard), and the geometry every later step needs, as pure functions in `@repo/render/html`. Text skips an area through plain CSS 2.1 floats. For each exclusion there is a zero-width spacer float, then a float of the exclusion's size that clears it. Unlike two full-height `shape-outside` floats, this holds exclusions on both sides at once. Keep-clear zones are exclusions too, clipped to the text area, so the postcard's address block shapes the text and the letter's barcode corners, which sit in its margins, do not.

**Files.**

- Create `packages/types/src/{page,page.test,ink,font}.ts`; export them.
- Create `packages/render/{package.json,tsconfig.json,vitest.config.ts}` with the `./html` subpath (`tsconfig.json` extends `react-library.json`; `vitest.config.ts` sets `testTimeout: 60_000` and `hookTimeout: 120_000` for the browser container), and `packages/render/src/html/{index,geometry,geometry.test}.ts`.

**Shapes.**

```ts
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type KeepClearZone = {
	side: number;
	corner: Corner;
	widthIn: number;
	heightIn: number;
};
export type ProductKind = "letter" | "postcard";
export type PageSpec = {
	provider: string;
	product: ProductKind;
	label: string;
	widthIn: number;
	heightIn: number;
	dpi: number;
	safeIn: number;
	marginIn: number;
	maxPages: number;
	providerMaxPages: number;
	front: "writing" | "image";
	duplex: boolean;
	output: "pdf" | "png";
	keepClear: readonly KeepClearZone[];
};
export const PAGE_SPECS = {
	"thanksio:letter-windowless": {
		provider: "thanksio",
		product: "letter",
		label: "Letter",
		widthIn: 2550 / 300,
		heightIn: 3300 / 300,
		dpi: 300,
		safeIn: 50 / 300,
		marginIn: 0.75,
		maxPages: 3,
		providerMaxPages: 12,
		front: "writing",
		duplex: true,
		output: "pdf",
		keepClear: [
			{ side: 0, corner: "top-right", widthIn: 135 / 300, heightIn: 140 / 300 },
			{
				side: 0,
				corner: "bottom-left",
				widthIn: 200 / 300,
				heightIn: 260 / 300,
			},
		],
	},
	"thanksio:postcard-6x9": {
		provider: "thanksio",
		product: "postcard",
		label: "Postcard 6 × 9",
		widthIn: 2738 / 300,
		heightIn: 1838 / 300,
		dpi: 300,
		safeIn: (19 + 42) / 300,
		marginIn: 0.375,
		maxPages: 2,
		providerMaxPages: 2,
		front: "image",
		duplex: true,
		output: "png",
		keepClear: [
			{
				side: 1,
				corner: "bottom-right",
				widthIn: 1193 / 300,
				heightIn: 923 / 300,
			},
		],
	},
} as const satisfies Record<string, PageSpec>;
export type PageFormatId = keyof typeof PAGE_SPECS;
export const DEFAULT_FORMAT: PageFormatId = "thanksio:letter-windowless";
```

`widthIn` and `heightIn` are the provider's whole canvas, bleed included; `safeIn` is measured from the canvas edge, so the postcard's is its 19 px bleed plus its 42 px safe zone. `maxPages` counts sides and is the setting a deployment changes, up to `providerMaxPages`; a postcard's two sides are its image front and its writing back.

```ts
export const INK_COLORS = {
	midnight: { label: "Midnight", css: "#1c2541" },
	"ink-blue": { label: "Ink blue", css: "#23408e" },
	sepia: { label: "Sepia", css: "#5b3a29" },
	forest: { label: "Forest", css: "#2f4a3a" },
	oxblood: { label: "Oxblood", css: "#6b1f2a" },
} as const satisfies Record<string, { label: string; css: string }>;
export type InkColorId = keyof typeof INK_COLORS;
export const TEXT_SIZES = [16, 20, 24, 30] as const;
export type TextSizePt = (typeof TEXT_SIZES)[number];

export const STOCK_FONTS = {
	caveat: { label: "Caveat", file: "Caveat-Regular.ttf" },
	"patrick-hand": { label: "Patrick Hand", file: "PatrickHand-Regular.ttf" },
	"homemade-apple": {
		label: "Homemade Apple",
		file: "HomemadeApple-Regular.ttf",
	},
} as const satisfies Record<string, { label: string; file: string }>;
export type StockFontId = keyof typeof STOCK_FONTS;
```

```ts
export type Rect = {
	xIn: number;
	yIn: number;
	widthIn: number;
	heightIn: number;
};
export type PlacedBox = Rect & { side: number; rotationDeg: number };
export type Exclusion = Rect & { wrap: "left" | "right" | "both" };
export type FloatBox = {
	float: "left" | "right";
	clear: "none" | "left" | "right" | "both";
	widthIn: number;
	heightIn: number;
};
export type PlacementIssue = {
	elementId: string;
	kind: "outside-safe" | "keep-clear" | "beyond-sides";
};

export function writingSides(spec: PageSpec): number[];
export function sideTopIn(spec: PageSpec, side: number, gapIn: number): number;
export function columnBox(spec: PageSpec, gapIn: number): Rect;
export function pageExclusions(spec: PageSpec, gapIn: number): Exclusion[];
export function clipToText(
	spec: PageSpec,
	side: number,
	rect: Rect,
	gapIn: number,
): Rect | null;
export function boundsOf(box: PlacedBox): Rect;
export function sidesUsed(spec: PageSpec, params: SidesUsedParams): number;
export function overflowIn(spec: PageSpec, params: OverflowParams): number;
export function placementIssues(
	spec: PageSpec,
	params: PlacementIssuesParams,
): PlacementIssue[];
export function exclusionFloats(
	column: Rect,
	exclusions: readonly Exclusion[],
): FloatBox[];
export type SidesUsedParams = {
	textBottomIn: number;
	boxes: readonly PlacedBox[];
	minSides: number;
};
export type OverflowParams = { textBottomIn: number };
export type PlacementIssuesParams = {
	boxes: readonly (PlacedBox & { id: string })[];
	sides: number;
};
```

Column coordinates start at the top-left of the first writing side's text area and run every writing side up to `maxPages`. `pageExclusions` is the bands between writing sides plus every keep-clear zone clipped to the text area by `clipToText`.

**Tests first.** `page.test.ts` in `packages/types`:

- "every spec allows no more pages than its provider". `maxPages` is at most `providerMaxPages` for every entry.

`geometry.test.ts`, literal values throughout:

- "the band between side 1 and side 2 covers both margins and the gap". Letter, gap 0.5, gives a full-width band from 9.5 in to 11.5 in.
- "with no gap the bands sit on the page seams". Letter, gap 0, gives bands 9.5 to 11 and 20.5 to 22, one fewer than `maxPages`.
- "the letter's barcode corners add no exclusion". They sit inside the margin, so `pageExclusions` holds only bands.
- "a postcard writes only on its back". `writingSides` gives `[1]`, and the column is one back's text area.
- "the postcard's address block shapes the back's text". `pageExclusions` holds one `right` exclusion at x 4.775, y 2.675, width 3.602, height 2.702, to 3 decimals.
- "a box turned 90 degrees swaps its footprint about its centre". `{ xIn: 1, yIn: 1, widthIn: 2, heightIn: 1, rotationDeg: 90 }` gives `{ xIn: 1.5, yIn: 0.5, widthIn: 1, heightIn: 2 }`.
- "a square turned 45 degrees grows to its diagonal". A 1 in square gives width `Math.SQRT2` to 6 decimals.
- "text a tenth of an inch onto side 2 uses two sides". `textBottomIn` 11.1 gives 2.
- "text ending at the bottom of side 1 uses one side". `textBottomIn` 9.5 gives 1.
- "an added side counts even when empty". `textBottomIn` 2, `minSides` 2 gives 2.
- "a doodle alone on the third side makes three sides". One box on side 2 gives 3.
- "overflow is how far text runs past the last allowed side". Letter, `textBottomIn` 32 gives 0.5.
- "a box in the top-right barcode corner of side 1 is flagged, the same box on side 2 is not".
- "a box over the postcard's address block is flagged".
- "a box a tenth of an inch from the paper edge is outside the safe zone".
- "a rotated box is flagged by its footprint". A 2×0.2 in box at 45 degrees whose frame is inside and footprint is not gives `outside-safe`.
- "a box past the last allowed side is flagged". Side 3 of the letter (the fourth side, with `maxPages` 3) gives `beyond-sides`.
- "a band becomes a spacer and a clearing full-width float". One band at 9.5 to 11 in a 7 in column gives `[{ float: "left", clear: "none", widthIn: 0, heightIn: 9.5 }, { float: "left", clear: "both", widthIn: 7, heightIn: 1.5 }]`.
- "exclusions on both sides keep their own tops". A right exclusion 2 in wide at 1 to 3, then a left one 1 in wide at 2 to 4, give `[{ right, none, 0, 1 }, { right, right, 2, 2 }, { left, none, 0, 1 }, { left, left, 1, 2 }]`.

**Implementation.** Each function is arithmetic over the spec, and none names a product or a page count: everything comes from `PAGE_SPECS`. `exclusionFloats` sorts exclusions by top. For each it emits a zero-width spacer on its side whose height is the exclusion's top minus the previous exclusion's top, then the exclusion float with `clear` set to its side (`both` and full width for a band). A float may not sit higher than an earlier float's top, and the spacer always starts at the previous top, so every exclusion lands at its own top. `clipToText` intersects a rectangle with its side's text area and returns `null` when nothing remains; a clipped zone floats on the side its corner names.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `@repo/render/html` and `@repo/render/schema` with settled decision 3's edges, the coordinate system, "a new provider or product is one `PAGE_SPECS` entry", "the page limit is `maxPages`", and "exclusions are spacer floats" naming `exclusionFloats` and `pageExclusions`.

### 7. Define the letter document once and validate it from the catalogues

**Goal.** `LetterContent` as one type, the Tiptap schema that holds it, and one parser that refuses anything the catalogues do not allow, in every attribute. Stored values reach CSS only through catalogue lookups, so a saved letter cannot carry injected CSS.

**Files.**

- Create `packages/types/src/letter.ts` with `humanSeal`, `packages/types/src/letter.test.ts` and `packages/types/src/merge-field.ts` (the catalogue only; the chip arrives in step 33); add vitest to `packages/types`.
- Add the `./schema` subpath; create `packages/render/src/schema/{index,letter-schema,parse-letter,parse-letter.test}.ts`. This subpath imports `@tiptap/core`, `@tiptap/pm`, `zod` and `@repo/types` only: no JSX, no React, no DOM code, so services and Server Components can import it.

**Shapes.**

```ts
export type Align = "left" | "center" | "right";
export type FontRef = { kind: "stock"; id: StockFontId } | { kind: "own"; fontId: string };
export type InkStyle = { font: FontRef; sizePt: TextSizePt; color: InkColorId };
export type InkMark = { type: "ink"; attrs: { font: FontRef | null; sizePt: TextSizePt | null; color: InkColorId | null } };
export type TextNode = { type: "text"; text: string; marks?: InkMark[] };
export type HardBreakNode = { type: "hardBreak"; marks?: InkMark[] };
export type InlineNode = TextNode | HardBreakNode;
export type ParagraphNode = { type: "paragraph"; attrs: { align: Align }; content?: InlineNode[] };

export type PlacedElement = {
	id: string;
	kind: "drawing";
	drawingId: string;
	side: number;
	xIn: number;
	yIn: number;
	widthIn: number;
	heightIn: number;
	rotationDeg: number;
	tint: InkColorId;
	wrap: boolean;
};
export type LetterDoc = {
	type: "doc";
	attrs: { elements: PlacedElement[]; minSides: number; frontImageAssetId: string | null };
	content: ParagraphNode[];
};
export type LetterContent = { schemaVersion: 1; format: PageFormatId; defaults: InkStyle; doc: LetterDoc };

export type SealFont = { ownerName: string; chars: ReadonlySet<string> };
export function humanSeal(content: LetterContent, ownFonts: ReadonlyMap<string, SealFont>): string | null;

export const MERGE_FIELDS = {
	first_name: { label: "First name", sample: "Alex", longest: "Maximiliana" },
	last_name: { label: "Last name", sample: "Rivera", longest: "Wolfeschlegelstein" },
} as const satisfies Record<string, { label: string; sample: string; longest: string }>;
export type MergeFieldKey = keyof typeof MERGE_FIELDS;
export type MergeValues = Record<MergeFieldKey, string>;
export const SAMPLE_MERGE_VALUES: MergeValues;
export const LONGEST_MERGE_VALUES: MergeValues;
```

`SAMPLE_MERGE_VALUES` and `LONGEST_MERGE_VALUES` are built from `MERGE_FIELDS`, never typed out. The doc gains `mergeField` in step 33 and `signature` in step 34, each with its parser rule and a test. `wrap` is false on every element until step 35 lets text wrap.

```ts
export const letterExtensions: Extensions;
export const LETTER_LIMITS = { characters: 20_000, elements: 200 } as const;
export function parseLetterContent(json: unknown): LetterContent;
```

**Tests first.** `letter.test.ts` for `humanSeal`, with `ownFonts` holding `font-k` (Karla, mapping a to z and `D`) and `font-s` (Sam):

- "a letter all in one person's handwriting". `Written in Karla's own handwriting`.
- "a letter partly in it". 3 of 10 visible characters in `font-k` give `Partly written in Karla's own handwriting`.
- "spaces do not make a letter partial".
- "characters the font does not have do not count as handwriting". "Dear Alex" all in `font-k`, which lacks `A`, gives `Partly written in Karla's own handwriting`.
- "two people's handwriting". `Written in Karla's and Sam's own handwriting`.
- "the default style counts when a run sets no font".
- "doodles alone". `Doodles hand-drawn`.
- "handwriting and doodles". `Written in Karla's own handwriting · doodles hand-drawn`.
- "nothing human gives no seal". `null`.

`parse-letter.test.ts`:

- "a canonical letter parses to itself". A fixture with every node, mark and attribute in use round-trips deep-equal.
- "an ink colour outside the catalogue is refused". `color: "red;background:url(x)"` throws.
- "an align outside left, center and right is refused".
- "a size outside the catalogue is refused". `sizePt: 19` throws.
- "a stock font outside the catalogue is refused".
- "a node the schema does not have is refused". `{ type: "image" }` throws.
- "a bold mark is refused".
- "an HTML string instead of a document is refused".
- "a future schema version is refused".
- "an element with no width is refused".
- "a front image on a product whose front is for writing is refused". A letter with `frontImageAssetId` set throws; a postcard with it set parses.
- "an id that is not a UUID is refused". An own font id `x" } body { color: red` throws, and so does a non-UUID element `id` or `drawingId`.
- "more elements or characters than the limits are refused". 201 elements throws; 20,001 characters throws.
- "a missing minSides reads as 1, a missing wrap as false, and a missing front image as null".
- "minSides above the spec's maxPages is refused".

**Implementation.** `letterExtensions` are a handful of `Node.create` and `Mark.create` calls from `@tiptap/core`: `LetterDocument` (content `paragraph+`, attributes `elements` and `minSides`), `Paragraph` (`align`), `Text`, `HardBreak`, `Ink` (one mark with three nullable attributes), `LetterHistory` wrapping `history()` from `@tiptap/pm/history`. No starter kit, no Markdown. Each extension's `renderHTML` turns ids into CSS only through `INK_COLORS`, `STOCK_FONTS` and `TEXT_SIZES`; an own font becomes `font-family: "own-<fontId>", "stock-caveat"`. `parseLetterContent` runs one zod schema declared `z.ZodType<LetterContent>` over the whole tree (enums from the catalogue keys, literals from `TEXT_SIZES`, `z.uuid()` for every id, positive finite element sizes, the limits, `minSides` defaulting to 1 and at most the spec's `maxPages`, `wrap` defaulting to false, `frontImageAssetId` defaulting to null and allowed only when the spec's `front` is `"image"`), then `Node.fromJSON(getSchema(letterExtensions), doc).check()` for structure. `humanSeal` walks the doc once, counting non-whitespace characters per resolved font and counting an own font only for characters in its `chars`.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add "The letter document" naming `packages/types/src/letter.ts` and `parseLetterContent`, the rule that ids reach CSS only through catalogues, and that elements live in the doc's root attributes.

### 8. Render the shared letter page and prove text flows across sides in Chromium and WebKit

**Goal.** `LetterPage`, the one page component, with its contract fixed for every later step; `LetterPrint`, the print version of it; `renderLetterHtml`, the print document; and `measureLetter`. Then prove in both engines that text skips the bands and left and right exclusions at once, line by line, that the measure survives `transform: scale()`, and that empty paragraphs keep their line. The editable page is compared with the print page in step 12, where the editor exists.

**Files.**

- Copy `PP/ink-studio/apps/web/fonts/*.ttf` and their licences into `packages/render/fonts/`.
- Extend `packages/types/src/letter.ts` with `LetterResources`.
- Create `packages/render/src/html/{letter-page.tsx,letter-print.tsx,letter-css.ts,measure.ts,letter-page.browser.test.tsx}` and `packages/render/src/html/fixtures/index.ts`.
- Add the `.` export; create `packages/render/src/{index.ts,render-letter-html.tsx,render-letter-html.test.tsx}`.

**Shapes.**

```ts
export type LetterResources = {
	assetBaseUrl: string;
	stockFontBaseUrl: string;
	fonts: Record<string, string>;
	drawings: Record<string, { maskAssetId: string; aspect: number }>;
};
```

```ts
export type LetterPageProps = {
	letterId: string;
	content: LetterContent;
	resources: LetterResources;
	mode: "edit" | "print";
	mergeValues: MergeValues | null;
	sheets: number;
	flow: ReactNode;
	handles?: ReactNode;
};
export function LetterPage(props: LetterPageProps): ReactElement;
export function useLetterPage(): Pick<LetterPageProps, "resources" | "mergeValues" | "mode">;
export type LetterPrintProps = Pick<LetterPageProps, "letterId" | "content" | "resources"> & { mergeValues: MergeValues };
export function LetterPrint(props: LetterPrintProps): ReactElement;
export const LETTER_CSS: string;

export type MeasureInput = { heightIn: number; marginIn: number; gapIn: number; limitIn: number };
export type LetterMeasure = { lineTopsIn: number[]; textBottomIn: number; wordsPastLimit: number };
export function measureLetter(root: HTMLElement, input: MeasureInput): LetterMeasure;

export function renderLetterHtml(params: LetterPrintProps): string;
```

`fonts` maps a font id to its built font's asset id; `drawings` maps a drawing id to its mask. A URL is `assetBaseUrl + assetId` or `stockFontBaseUrl + id` (the catalogue id, never a file name). The app uses `/api/assets/` and `/fonts/stock/`; the worker uses `https://letter.invalid/assets/` and `https://letter.invalid/stock/`. `mergeValues` is one recipient's values, which a chip prints once merge fields exist (step 33); `null` shows the field's label, as the editor does. The preview and the proof pass `SAMPLE_MERGE_VALUES`, the fit check passes `LONGEST_MERGE_VALUES`, and project-post's fulfilment will pass each recipient's. Fixtures are `{ name, format, text, sides }`, and their text lengths are written against the default letter's `maxPages`: `note` (1), `one-side` (ends about 3 lines above the bottom of side 1, so 1), `blank-lines` (paragraphs separated by empty ones, and runs of spaces, 1), `one-and-a-half` (2), `nearly-full` (`maxPages`), `overflow` (past `maxPages`), and `postcard-back` (a postcard's back, filled). `MeasureInput.limitIn` is the column height of every writing side up to `maxPages`; `lineTopsIn` and `textBottomIn` are column inches with the gaps taken out, so the editor (gap 0.5 in) and the print (gap 0) give the same numbers, and `sidesUsed` and `overflowIn` take them as they are.

**Tests first.** `letter-page.browser.test.tsx` renders `LetterPage` with `renderToStaticMarkup`, loads it with `page.setContent` in both engines from `@repo/testing/browser`, and serves fonts through `page.route` with `Access-Control-Allow-Origin: *`. Each case runs at device scale factor 1 and at the print factor 300/96. For each engine:

- "no line box falls inside a band". `nearly-full`; every text line rectangle misses every band.
- "no line enters the postcard's address block". `postcard-back`; every line rectangle misses the block.
- "no line crosses a right-side exclusion while the bands hold". The page with an extra 2×2 in exclusion at the right of side 1 has no line overlapping it or a band.
- "left and right exclusions that overlap vertically both hold". A 1.5×2 in exclusion at the left and a 2×2 in one at the right of side 1, overlapping by 1 in, with no line crossing either.
- "an empty paragraph keeps one line of height". In `blank-lines`, the gap between paragraphs separated by an empty one is two line heights.
- "each fixture uses the sides it was written for". The measured sides equal the fixture's `sides`.
- "overflow is reported". `overflow` gives `overflowIn` above 0 and `wordsPastLimit` above 0.
- "keep-clear zones are marked only while editing". `mode="edit"` renders two `[data-keep-clear]` elements on side 1; `mode="print"` renders none.
- "the measure ignores the page's scale". `nearly-full` inside `transform: scale(1.25)` gives the same `lineTopsIn` to 0.01 in.
- "empty space is clickable text". With `contenteditable`, a click to the right of a short line puts the caret on that line.
- "the caret crosses a band". `ArrowDown` from side 1's last line lands below the band.

Across engines:

- "Chromium and WebKit agree on sides used for every fixture". Line counts are logged.

`render-letter-html.test.tsx`:

- "text that looks like markup stays text". A run `<script>alert(1)</script>` is escaped and no `<script` element exists.
- "the only URLs are built from the resources". Every `url(` and `src=` starts with `assetBaseUrl` or `stockFontBaseUrl`; the paper texture is a custom property the print never sets.
- "a drawing the resources lack is a broken state". It throws.
- "an empty paragraph keeps its line". `<p></p>` never appears; an empty paragraph renders `<p><br></p>`.

**Implementation.** `LetterPage` takes `spec` from `PAGE_SPECS[content.format]` and the gap from `mode` (0.5 in for `edit`, 0 for `print`). It renders `<style>{LETTER_CSS}</style>` itself, so the editor, the preview frame, the print document and the browser tests all carry the same rules with no stylesheet to import or inline. It always lays out `pageExclusions` for every writing side up to `maxPages`; `sheets` decides only how many paper sheets are drawn behind the flow. When the spec's `front` is `"image"`, side 0 is a full-bleed sheet whose `background-image` is `doc.attrs.frontImageAssetId` (cover-fitted), or, in `edit` mode with none chosen, an empty frame reading "Choose a front image"; the text column starts on the next side. The column is `<div class="letter-column">`, holding the `exclusionFloats` as `<div class="letter-float" style="...">` with `pointer-events: none`, then `flow`. Keep-clear zones render in `edit` mode as hatched `div`s with `data-keep-clear`. Elements come from `content.doc.attrs.elements`, each a `div` at `sideTopIn(side) + yIn`, rotated about its centre, `mask-image` from the drawing's mask URL, `background-color` from `INK_COLORS[tint]`. `handles` is an edit-only layer above. `LetterPage` provides `resources`, `mergeValues` and `mode` through a React context read by `useLetterPage`, so node components that need them (merge chips, the signature) render the same in the editor's node views and in the static renderer. `@font-face` rules are built inside from `STOCK_FONTS` and `resources.fonts`, family names `stock-<id>` and `own-<fontId>`. `LETTER_CSS` owns the letter's whole look: sheets (paper colour and shadow in `edit` with `background-image: var(--letter-paper-texture, none)`, which only the studio layout sets, plain white in `print`), keep-clear hatching, and one rule for `.letter-text` that the editor root and the static root share (`white-space: pre-wrap`, `line-height`, `overflow-wrap: anywhere`, `font-kerning: normal`, `font-variant-ligatures: normal`, no hyphens). `measureLetter` is self-contained (no imports, plain arguments) so Playwright can send it; the worker calls it as `page.locator(".letter-column").evaluate(measure, input)`, which passes the element first. It measures line rectangles from `Range.getClientRects` relative to the column's own top, divides by the column's scale, `root.getBoundingClientRect().height / root.offsetHeight`, then by 96, and takes out `gapIn` once per side boundary above each line. `LetterPrint` is `LetterPage` with `mode="print"`, `sheets` = `maxPages`, and a `flow` built by `@tiptap/static-renderer`'s React renderer over `letterExtensions`, mapping an empty paragraph, or one ending in a hard break, to a trailing `<br>` as ProseMirror does. It returns React elements, so it renders in a browser as well as on a server. `renderLetterHtml` wraps `renderToStaticMarkup(<LetterPrint />)` in a full document with `@page { size: 8.5in 11in; margin: 0 }`; only the worker calls it. Apps read stock font bytes themselves from `packages/render/fonts/` by `STOCK_FONTS[id].file`.

**Done.** `pnpm test` passes in both engines; the commit records the per-engine line counts, and `ARCHITECTURE.md` records the Chromium side counts that step 12 compares with a real iPad. `pnpm lint`, `pnpm typecheck` pass.

**ARCHITECTURE.md.** Add "One page" naming `LetterPage`'s props as the contract, `LETTER_CSS` as the letter's look, `LetterPrint` as the print version, the spacer floats, the scale-aware measure, and the parity result.

---

## M3. Editor

### 9. Store letters with titles, revisions and soft delete

**Goal.** Letters persist per organization. Every save is parsed by `parseLetterContent` and refused when stale.

**Files.**

- Create `packages/db/src/drizzle/schema/letters.ts`, `packages/db/src/drizzle/{letters,letters.test}.ts`; extend the contract (`packages/db/src/database.ts`, `src/drizzle/db.ts`, `src/drizzle/schema/index.ts`); migrate.
- Create `packages/services/{package.json,tsconfig.json,vitest.config.ts}` from project-post's (no `@repo/utils`; exports `./letters`; depends on `@repo/render`, importing only `@repo/render/schema`; `tsconfig.json` adds `"dom"` to `lib`, because Tiptap's types name DOM types; the vitest config without its comment), `packages/services/src/letters/{letters.service,letters.types,letters.service.test,index}.ts`.
- Add to `openapi.yaml`: `POST /api/letters`, `GET /api/letters/{letterId}` (returns `{ title, revision, content }`, for conflict recovery), `PUT /api/letters/{letterId}`, `DELETE /api/letters/{letterId}`, the `LetterContentEnvelope` schema (an object with `schemaVersion` and `format`, other properties allowed), codes `invalid_letter`, `invalid_title`, `stale_revision`.
- Create `apps/web/src/app/api/letters/route.ts`, `apps/web/src/app/api/letters/[letterId]/route.ts`, `apps/web/src/server/letters.ts`; extend `apps/web/src/server/services.ts` with `letters = new LetterService(db)` and `apps/web/package.json` with `@repo/services`.

**Shapes.**

```ts
export type Letter = {
	id: string;
	organizationId: string;
	title: string;
	content: LetterContent;
	revision: number;
	createdAt: Date;
	updatedAt: Date;
};
export interface Letters {
	byId(organizationId: string, id: string): Promise<Letter | null>;
	list(organizationId: string): Promise<Letter[]>;
	create(input: NewLetter): Promise<Letter>;
	save(
		organizationId: string,
		id: string,
		change: LetterChange,
	): Promise<number | null>;
	softDelete(organizationId: string, id: string): Promise<boolean>;
}
export type LetterChange = {
	title: string;
	content: LetterContent;
	expectedRevision: number;
};
```

```ts
export type LetterListItem = {
	id: string;
	title: string;
	updatedAt: Date;
	humanSeal: string | null;
};
export type EditableLetter = {
	id: string;
	title: string;
	content: LetterContent;
	revision: number;
	resources: LetterResources;
	editable: boolean;
};
export type SaveLetterParams = SaveLetterRequest;
export type CreateLetterParams = CreateLetterRequest;
export async function letterResources(
	tx: Tx,
	organizationId: string,
	content: LetterContent,
): Promise<LetterResources>;
export async function letterOwnerIds(
	tx: Tx,
	organizationId: string,
	content: LetterContent,
): Promise<Set<string>>;

export class LetterService {
	constructor(private readonly db: Db) {}
	createLetter(
		member: Member,
		params: CreateLetterParams,
	): Promise<{ id: string }>;
	getLetter(member: Member, letterId: string): Promise<EditableLetter | null>;
	listLetters(member: Member): Promise<LetterListItem[]>;
	saveLetter(
		member: Member,
		letterId: string,
		params: SaveLetterParams,
	): Promise<{ revision: number }>;
	deleteLetter(member: Member, letterId: string): Promise<void>;
}
```

`SaveLetterRequest` is the generated request type. The `letters` table: `id`, `organization_id`, `title`, `content` (jsonb), `revision`, `created_at`, `updated_at`, `deleted_at`; index on `(organization_id, updated_at)`. `letters` stands in for project-post's `product_editions` (settled decision 13). `editable` is false when the letter uses a font or signature the caller does not own; until those exist it is always true.

**Tests first.** `letters.service.test.ts`:

- "a new letter is an untitled empty Caveat letter in ink blue". With no format, the stored content equals the literal default (`DEFAULT_FORMAT`) and the title is `Untitled letter`.
- "a new postcard is titled as one". `format: "thanksio:postcard-6x9"` gives `Untitled postcard`, `minSides` 2 and no front image.
- "a stale save is refused and changes nothing". Save at 1 returns 2; save again at 1 gives `conflict` / `stale_revision`; the stored content is the first save's.
- "another organization cannot read, save or delete the letter". `getLetter` gives `null`; the others give `not_found`.
- "the list holds this organization's live letters, newest first".
- "a deleted letter is gone from the list and from getLetter".
- "a title that is empty, only spaces, has a control character or is over 120 characters is refused". `invalid_title`.
- "content the parser refuses is refused as invalid_letter". A stored colour outside the catalogue.
- "an own font that does not exist is refused". `invalid_letter`.

**Implementation.** `saveLetter` runs `parseLetterContent` (a throw becomes `ServiceError("invalid_input", "invalid_letter")`), trims and checks the title, then `UPDATE ... SET revision = revision + 1 WHERE organization_id = $1 AND id = $2 AND revision = $3 AND deleted_at IS NULL RETURNING revision`; `null` is stale or missing, and a `byId` tells which. Until fonts exist, every `own` font reference is not found. `getLetter` returns `resources` from `letterResources`, with `assetBaseUrl` `/api/assets/`, `stockFontBaseUrl` `/fonts/stock/`, and empty maps; later steps fill them there, and the export processor (step 31) calls the same function. `editable` is true when `letterOwnerIds` holds no one but the caller; it is empty until fonts (step 25) and signatures (step 34) add their owners. `CreateLetterRequest` is `{ format?: PageFormatId }`; the picker that sets it arrives in step 32. `server/letters.ts` exposes `getLetter` and `listLetters` to pages.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `services/letters`, the `letters` table and its stand-in role, and "a save is parsed and refused when stale".

### 10. Write on the page with autosave, a save line and conflict recovery

**Goal.** The editor. The letters list, a new letter, writing on the page in Caveat, an editable title, autosave that shows its state, and a stale tab that can keep its version or load the newer one.

**Files.**

- Create `apps/web/src/app/(studio)/letters/page.tsx` (list with an empty state), `apps/web/src/app/(studio)/letters/[letterId]/page.tsx`; make `apps/web/src/app/page.tsx` redirect to `/letters`.
- Create `apps/web/src/app/fonts/stock/[fontId]/route.ts`.
- Create `apps/web/src/features/editor/components/{letter-editor,letter-title,save-line,letter-card}.tsx` (the card's menu offers Delete), `apps/web/src/lib/{autosave,autosave.test,use-autosave}.ts`.
- Add vitest to `apps/web`, and `@repo/testing` as a devDependency.
- Create `apps/web/e2e/{harness.ts,editor.e2e.ts}`, `apps/web/vitest.e2e.config.ts`.

**Shapes.**

```ts
export type AutosaveState =
	| { status: "saved"; revision: number }
	| { status: "dirty"; revision: number; dueAt: number }
	| { status: "saving"; revision: number; dirtyAgain: boolean; attempt: number }
	| { status: "retrying"; revision: number; attempt: number; dueAt: number }
	| { status: "conflict"; revision: number };

export type AutosaveEvent =
	| { type: "edited"; now: number }
	| { type: "saveStarted" }
	| { type: "saveSucceeded"; revision: number; now: number }
	| { type: "saveFailed"; now: number }
	| { type: "saveConflicted" }
	| { type: "keptMine"; latestRevision: number; now: number };

export function autosave(
	state: AutosaveState,
	event: AutosaveEvent,
): AutosaveState;
```

`SAVE_DELAY_MS = 800`. Retries wait 2 s and double, up to 30 s.

**Tests first.** `autosave.test.ts`:

- "an edit schedules a save after the delay". From `saved` at 1000, `edited` gives `dirty` due at 1800.
- "an edit during a save saves again with the new revision". `saving` at 3, `edited`, `saveSucceeded` 4 gives `dirty` at 4 due now.
- "a conflict holds edits without saving". After `saveConflicted`, `edited` stays `conflict`.
- "keeping my version saves over the latest revision". `conflict` plus `keptMine` 9 gives `dirty` at 9 due now.
- "failures back off and cap at thirty seconds". Five rounds of `saveStarted` then `saveFailed` give waits of 2, 4, 8, 16, 30 s; `saving` carries `attempt` from `retrying` (0 for a first save).
- "an edit while waiting to retry keeps the wait".

`editor.e2e.ts`:

- "the empty list offers the first letter". A freshly seeded identity shows "Write your first letter".
- "a deleted letter leaves the list". Delete from the card's menu, confirm; the card is gone after a reload.
- "typed text survives a reload".
- "the stock font is really loaded". After `document.fonts.ready`, `document.fonts.check("20pt stock-caveat")` is true.
- "the title saves and shows in the list".
- "the save line reads Saved after typing settles".
- "the older tab can keep its version". Tab A saves; tab B types and shows "This letter changed in another tab" with Load the latest and Keep mine; Keep mine saves, and a reload shows tab B's text.
- "a clean tab reloads a newer version when it comes back into view".

**Implementation.** The editor page is a server component calling `getLetter` through `server/letters.ts`, with its own error view. `LetterEditor` (client) runs `useEditor` with `letterExtensions`, `injectCSS: false`, `immediatelyRender: false`, and `editorProps.attributes.class` `letter-text`, and passes `EditorContent` as `LetterPage`'s `flow` with `mode="edit"` and `mergeValues={null}`. The page scales to the desk width with `transform: scale()` up to 1.25; one `scale` value converts pointer pixels to inches. `useAutosave` drives the reducer with timers and the generated client, warns on `beforeunload` while not saved, and on `visibilitychange` to visible calls `GET /api/letters/{id}` and reloads when clean. Load the latest is `router.refresh()`; Keep mine reads the latest revision from the same endpoint and sends `keptMine`. `SaveLine` reads `Saved`, `Saving…`, `Offline, retrying` or the conflict choices. A letter whose `editable` is false opens read-only with one line saying whose hand it is in. Until `document.fonts.ready` resolves (at most 3 s) the paper shows without text, then the ink settles in with `animate-settle`, so a fallback font never flashes. The stock font route reads `packages/render/fonts/<STOCK_FONTS[id].file>` (`outputFileTracingIncludes` covers that folder) and answers with `font/ttf`, `Cache-Control: public, max-age=31536000, immutable`. The e2e harness calls `startTestBrowser({ chromiumArgs: ["--host-resolver-rules=MAP localhost host.docker.internal"] })`, seeds a fresh identity per test file with `seedDevIdentity` from `@repo/db/testing` (connecting with `DATABASE_URL`), sets the `dev_user` cookie to it, and creates a fresh letter per test.

**Done.** `pnpm dev`, then `pnpm test:e2e`; `pnpm screens /letters` for the empty list and a filled one, and the editor. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Fill "One letter, end to end" up to autosave; add the stock font route and `src/lib/autosave.ts`.

### 11. Format the selection and undo from the floating toolbar

**Goal.** One small floating toolbar for font, size, ink colour, align, undo and redo, following the keyboard on an iPad.

**Files.**

- Create `apps/web/src/features/editor/components/editor-toolbar.tsx`; extend `letter-editor.tsx`.
- Create `apps/web/e2e/formatting.e2e.ts`.

**Shapes.** No new shapes. Formatting is `setMark("ink", attrs)` with the changed attribute only.

**Tests first.** `formatting.e2e.ts`:

- "a font applied to a selection survives a reload". Select "Alex", pick Homemade Apple; after reload `document.fonts.check("20pt stock-homemade-apple")` is true and that word's computed family starts with `stock-homemade-apple`.
- "changing the colour keeps the font". Homemade Apple, then Oxblood, leaves both.
- "undo takes back formatting before typing". Type, format at once, Meta+Z once; the text stays.
- "align centers the paragraph".

**Implementation.** The toolbar sits at the top of the desk: a font `Select` of `STOCK_FONTS`, a size `ToggleGroup` of `TEXT_SIZES`, `Swatch`es of `INK_COLORS`, an align `ToggleGroup`, undo and redo bound to the history commands and Meta+Z, Shift+Meta+Z. Every formatting command calls `closeHistory(tr)` before `setMark`, so formatting is its own undo step even within ProseMirror's 500 ms grouping window. It shows the selection's resolved style. On a coarse pointer it follows `visualViewport`.

**Done.** `pnpm test:e2e`; `pnpm screens` with the toolbar open. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the toolbar file and "formatting sets one ink attribute".

### 12. Show sides, overflow, an added side, the Human Seal and the print preview

**Goal.** The creator always sees how many of the allowed sides the letter uses, sees text that will not fit on a ghost sheet with a plain sentence, can add an empty side for doodles, reads the Human Seal under the page, and opens a print preview that is the print page itself.

**Files.**

- Create `apps/web/src/features/editor/components/{sides-indicator,overflow-notice,add-side,human-seal,print-preview}.tsx`; extend `letter-editor.tsx`.
- Create `apps/web/e2e/{sides,preview}.e2e.ts`.

**Shapes.**

```ts
export type PageState = {
	measure: LetterMeasure;
	sides: number;
	overflowIn: number;
	issues: PlacementIssue[];
};
```

**Tests first.** `sides.e2e.ts`, at 1440 px (scale 1.25) and at 900 px:

- "a long letter reports its sides". The `one-and-a-half` text reads `2 of <maxPages> sides` at both widths, with the number taken from the spec, not the test.
- "text past the last allowed side shows on a ghost sheet with a count". `About <n> words won't fit on <maxPages> sides.` with `n` above 0.
- "Add a side stops at the limit". After `maxPages - 1` additions the control is gone.
- "deleting the extra text clears the notice", and "undo brings it back".
- "an added side stays after reload and undo removes it".
- "the seal reads the letter". A letter in stock fonts with no doodles shows no seal.

`preview.e2e.ts`:

- "the preview breaks lines where the editor does". For the six letter fixtures, `lineTopsIn` on the editor and in the preview `iframe` agree to 0.01 in.
- "the preview has no desk and no guides". The editor shows two `[data-keep-clear]` zones; the preview has none and no texture.

**Implementation.** After each transaction and on `document.fonts.ready`, `LetterEditor` runs `measureLetter` and computes `PageState` with `sidesUsed` (given `minSides`) and `overflowIn`, passing the measure's gap-free inches as they are; `sheets` is `sides` plus one ghost sheet when overflowing. Add a side is one doc-attribute transaction on `minSides`, offered while `minSides` is below the spec's `maxPages`. Every count in the copy comes from the spec. `HumanSeal` renders `humanSeal(content, ownFonts)` small, in `--ink-muted`, under the page; `ownFonts` is empty until step 25. `PrintPreview` renders `<LetterPrint mergeValues={SAMPLE_MERGE_VALUES} />` through a React portal into a same-origin `iframe`'s body, so the studio's styles cannot reach it and no server route renders HTML. React escapes every text node. The preview is the print page laid out by this browser; the PDF's fit is decided in Chromium (settled decision 8).

**Done.** `pnpm test:e2e`; `pnpm screens` of the ghost sheet and the preview. On the iPad, open the six letter fixtures and record their side counts beside the Chromium values in `ARCHITECTURE.md`. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add "text that does not fit is shown, never cut", the preview frame, and the iPad side counts.

---

## M4. Files and jobs

### 13. Upload files into GCS as asset rows served through one org-checked route

**Goal.** One `assets` table and one upload path. The web checks size before buffering past the limit, sniffs magic bytes, stores bytes under the organization's prefix and records a row. The browser reads a file only through `GET /api/assets/{assetId}`, which checks the organization and redirects to a fresh 300 s signed URL, so nothing expires in an open editor.

**Files.**

- Create `packages/types/src/asset.ts`.
- Create `packages/db/src/drizzle/schema/assets.ts`, `packages/db/src/drizzle/{assets,assets.test}.ts`; extend the contract (`packages/db/src/database.ts`, `src/drizzle/db.ts`, `src/drizzle/schema/index.ts`); migrate.
- Create `packages/services/src/assets/{assets.service,assets.types,assets.service.test,index}.ts`; add `./assets` to the exports.
- Create `packages/integrations/{package.json,tsconfig.json}`, `src/shared/gcp/{index.ts,storage/gcs-asset-storage.ts,storage/gcs-asset-storage.contract.test.ts}`.
- Create `apps/web/src/app/api/uploads/route.ts`, `apps/web/src/app/api/assets/[assetId]/route.ts`, `apps/web/src/app/api/assets/[assetId]/status/route.ts`; extend `server/services.ts`, `env.ts`, `.env.example` (`GCS_ASSETS_BUCKET`, `GOOGLE_CLOUD_PROJECT`, `STORAGE_EMULATOR_HOST`).
- Add the three paths to `openapi.yaml`; codes `file_too_large`, `unsupported_file`, `heic_not_supported`.
- Add `gcs` to `docker-compose.yml` (`fsouza/fake-gcs-server`, `-scheme http -port 4443 -public-host ${DEV_LAN_HOST:-localhost}:4443 -cors-headers Content-Type`, bucket folder `tools/docker/gcs/ink-studio-assets/` with a `.gitkeep` so a fresh clone has the bucket). Every `.env.example` sets `GCS_ASSETS_BUCKET=ink-studio-assets`, the folder's name.

**Shapes.**

```ts
export type UploadPurpose = "photo" | "mask" | "font-file";
export type AssetJob = { kind: "lift-ink"; photoAssetId: string };
export type AssetOrigin =
	| {
			source: "uploaded";
			purpose: UploadPurpose;
			filename: string;
			uploadedByUserId: string;
	  }
	| { source: "generated"; job: AssetJob };
export type AssetProcessing =
	| {
			status: "pending" | "running";
			attempts: number;
			lastError: string | null;
	  }
	| { status: "done"; attempts: number }
	| { status: "failed"; attempts: number; error: string };
export type Asset = {
	id: string;
	organizationId: string;
	storageKey: string;
	mimeType: string;
	byteSize: number | null;
	checksum: string | null;
	origin: AssetOrigin;
	processing: AssetProcessing;
	createdAt: Date;
	updatedAt: Date;
};
```

`AssetJob` gains `build-font` in step 25 and `render-letter` in step 31.

```ts
export interface AssetStorage {
	put(params: PutObjectParams): Promise<void>;
	get(key: string): Promise<Uint8Array>;
	signedReadUrl(params: SignedReadUrlParams): Promise<string>;
}
export type PutObjectParams = {
	key: string;
	bytes: Uint8Array;
	contentType: string;
};
export type SignedReadUrlParams = {
	key: string;
	expiresInSeconds: number;
	downloadName?: string;
};

export type UploadParams = {
	purpose: UploadPurpose;
	filename: string;
	declaredBytes: number | null;
	body: ReadableStream<Uint8Array>;
	uploadedByUserId: string;
};
export type AssetStatus = {
	status: AssetProcessing["status"];
	error: ApiErrorCode | null;
};

export function isServable(asset: Asset): boolean;
export async function assetReadUrl(
	storage: AssetStorage,
	asset: Asset,
): Promise<string | null>;

export class AssetService {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorage,
	) {}
	upload(
		userOrganization: UserOrganization,
		params: UploadParams,
	): Promise<Asset>;
	getAssetStatus(
		userOrganization: UserOrganization,
		assetId: string,
	): Promise<AssetStatus | null>;
	getAssetReadUrl(
		userOrganization: UserOrganization,
		assetId: string,
	): Promise<string | null>;
}

const UPLOADS = {
	photo: {
		maxBytes: 15 * MiB,
		mimeTypes: ["image/jpeg", "image/png", "image/webp"],
	},
	mask: { maxBytes: 8 * MiB, mimeTypes: ["image/png"] },
	"font-file": { maxBytes: 4 * MiB, mimeTypes: ["font/ttf", "font/otf"] },
} as const;
```

The `assets` table extends project-post's `schema.dbml` outline with a `purpose` column, a `job` jsonb column, an `asset_source` enum for `source` (the outline has `varchar`), and a check constraint tying `source = 'uploaded'` to `purpose IS NOT NULL AND job IS NULL`. `processing_last_error` is text; `services/assets` narrows a failed error to `ApiErrorCode`. Indexes on `organization_id` and `(processing_status, updated_at)`.

**Tests first.** `assets.service.test.ts`, real Postgres, `vi.fn()` storage:

- "a declared size over the limit is refused without reading the body". A body whose `pull` is a `vi.fn` with `highWaterMark: 0`; `file_too_large`, `pull` and `put` never called.
- "a body that grows past the limit is refused". 9 MiB streamed for `mask`; `file_too_large`, `put` never called.
- "the sniffed type is stored, not the name's". PNG bytes named `photo.jpg` give `image/png`.
- "HEIC is refused with its own code".
- "a type the purpose does not take is refused". PNG for `font-file`.
- "TrueType and OpenType are taken, WOFF is not".
- "bytes go under the organization's prefix with their checksum". Key `organizations/<orgId>/assets/<id>`; `checksum` is the literal SHA-256 hex.
- "another organization's asset is invisible". `getAssetStatus` and `getAssetReadUrl` give `null`.
- "a raw photo is never read back, a mask is". A done photo gives `null`; a done mask gives the signed URL, signed for 300 s.

`gcs-asset-storage.contract.test.ts`, fake-gcs-server through `testcontainers`:

- "a stored object reads back byte for byte".
- "a signed URL signs with real credentials". With a key pair generated by `crypto.generateKeyPairSync` at test start, never committed, `signedReadUrl` returns a V4 URL whose `X-Goog-Credential` names the test account.
- "the emulator answers a browser's cross-origin read". `fetch` of the read URL with `Origin: http://localhost:3000` returns `Access-Control-Allow-Origin`.

**Implementation.** `upload` checks the declared size, reads through a counter that cancels and throws past the limit, sniffs the first 16 bytes, puts the bytes, then inserts a `done` row, so a crash leaves an orphan object and never a row without bytes. `isServable` is true for uploaded masks, and from later steps for lifted masks, built fonts and PDFs. `assetReadUrl` is the one place that rule meets the 300 s expiry and, from step 31, the PDF's download name. The client reads any servable asset at `/api/assets/{assetId}`, so `AssetStatus` carries no URL. `GcsAssetStorage` takes `{ bucket, projectId, emulatorBaseUrl?: string, credentials?: { client_email: string; private_key: string } }` and reads no environment; `credentials` goes to `new Storage(...)` and is set only by the contract test; with `emulatorBaseUrl` it returns `<emulatorBaseUrl>/download/storage/v1/b/<bucket>/o/<object>?alt=media` instead of signing. Each app passes `env.STORAGE_EMULATOR_HOST` as `emulatorBaseUrl`. The contract test builds one instance with `emulatorBaseUrl` for the read-back and CORS cases and one without it, with the generated key, for the signing case. The asset route calls `requireUserOrganization`, then `getAssetReadUrl`, and answers 302 with `Cache-Control: private, no-store`, or 404. The upload route reads `request.body`, `content-length` and a URI-encoded `x-file-name`, inside `handleRequest`.

**Done.** `curl -X POST -H 'Origin: http://localhost:3000' -H 'x-file-name: heart.png' --data-binary @heart.png 'http://localhost:3000/api/uploads?purpose=mask'` returns an id, and `curl -L http://localhost:3000/api/assets/<id>` downloads the same bytes. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `services/assets`, `integrations/shared/gcp`, the `assets` table and how it extends the outline, `UPLOADS` by file and name, "the browser never holds a signed URL", and the bucket CORS rule for the move.

### 14. Run both worker pools against the Pub/Sub emulator

**Goal.** project-post's queue, publisher, subscriber and worker loop, with both pools running in `pnpm dev`, before any job exists.

**Files.**

- Copy: `packages/services/src/queue/*` with its test, `packages/integrations/src/shared/gcp/pubsub/{publisher,subscriber}.ts`, `apps/worker/{package.json,tsconfig.json,tsdown.config.ts,vitest.config.ts,.env.example}`, `apps/worker/src/{env,index,lib/logger}.ts`, `tools/docker/{Dockerfile.pubsub,pubsub-entrypoint.sh}`.
- Change the entrypoint's render filter to `attributes.type = "asset.render-letter"`.
- Extend `packages/services/package.json` with the `./queue` export and `packages/integrations/src/shared/gcp/index.ts` with the Pub/Sub exports. The worker's `tsconfig.json` extends `react-library.json`, because its processors import `@repo/render` (JSX, DOM types) from step 25 on.
- Add `dev:render` to `apps/worker/package.json` (`WORKER_POOL=render PUBSUB_JOBS_SUBSCRIPTION=jobs-worker-render`); the root `dev` runs `turbo run dev dev:render`.
- Add `pubsub` to `docker-compose.yml` on 8086; add Pub/Sub variables to the web's env.

**Shapes.** project-post's `Publisher`, `MessageProcessor`, `QueueManager`, unchanged.

**Tests first.** The copied `queue.manager.test.ts`, unchanged, because the manager is copied.

**Implementation.** `main` builds `db` and an empty processor list and loops as project-post's does. The worker's env drops Stripe and PostHog.

**Done.** `pnpm dev` logs `worker listening` twice, once per pool. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `apps/worker`, `services/queue`, the two pools, how dev runs both, and the "Jobs" table header.

### 15. Generate assets through jobs with retries and a sweep

**Goal.** One lifecycle for every generated file. A service creates a pending asset carrying its job, commits, then publishes. The worker claims it, produces bytes, stores them and marks it done. A transient failure retries; an input failure fails at once with its code; the sweep republishes stale work, every minute in dev.

**Files.**

- Extend `packages/db/src/drizzle/assets.ts`, its test and the contract.
- Extend `packages/services/src/assets/{assets.service,assets.types,assets.service.test}.ts`; create `assets.schemas.ts`.
- Create `apps/worker/src/processors/sweep.ts`; extend `apps/worker/src/{index,env}.ts` and `.env.example` with `SWEEP_EVERY_MS` (60000), `GCS_ASSETS_BUCKET` and `STORAGE_EMULATOR_HOST`, since the worker stores and reads assets from here on.
- Add `tools/dev/sweep.ts` and the root script `pnpm jobs:sweep`.
- Extend `apps/web/src/server/services.ts` to build a `PubSubPublisher` (`GOOGLE_CLOUD_PROJECT`, `PUBSUB_JOBS_TOPIC`) and pass it to `AssetService`.
- Add codes `processing_failed`, `photo_unreadable`.

**Shapes.**

```ts
export function assetMessageType<K extends AssetJob["kind"]>(
	kind: K,
): `asset.${K}`;

export interface Assets {
	byId(organizationId: string, id: string): Promise<Asset | null>;
	create(input: NewAsset): Promise<Asset>;
	claim(id: string, staleBefore: Date): Promise<Asset | null>;
	complete(id: string, file: StoredFile): Promise<void>;
	release(id: string, error: string): Promise<void>;
	fail(id: string, error: string): Promise<void>;
	stale(before: Date): Promise<Asset[]>;
}
export type StoredFile = {
	mimeType: string;
	byteSize: number;
	checksum: string;
};

export type ProducedFile<R> = {
	bytes: Uint8Array;
	mimeType: string;
	result: R;
};
export type AssetJobMessage = { assetId: string };
export type JobOf<K extends AssetJob["kind"]> = Extract<AssetJob, { kind: K }>;
export type RunJobParams<K extends AssetJob["kind"], R> = {
	assetId: string;
	kind: K;
	produce: (job: JobOf<K>, asset: Asset) => Promise<ProducedFile<R>>;
	onComplete?: (tx: Tx, asset: Asset, result: R) => Promise<void>;
};

export function generatedAsset(organizationId: string, job: AssetJob): NewAsset;
export async function publishAssetJob(
	publisher: Publisher,
	asset: Asset,
): Promise<void>;

export class AssetService {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorage,
		private readonly publisher: Publisher,
	) {}
	runJob<K extends AssetJob["kind"], R>(
		params: RunJobParams<K, R>,
	): Promise<void>;
	sweep(now: Date): Promise<number>;
}
```

`MAX_ATTEMPTS = 3`, `LEASE_MS` 15 minutes, `STALE_PENDING_MS` 5 minutes.

**Tests first.** `assets.service.test.ts`:

- "a redelivered job for a finished asset does nothing". `produce` and `put` never called.
- "a finished job stores the output with its size and checksum". `"abc"` gives `done`, `byteSize` 3, checksum `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- "two workers racing on one asset produce it once".
- "a transient failure releases the asset and nacks". `runJob` rejects; `byId` shows `pending`, attempts 1, `lastError` `boom`.
- "the third transient failure fails the asset and stops". `failed` with `processing_failed`; `runJob` resolves.
- "an input failure fails at once with its code". `ServiceError("invalid_input", "photo_unreadable")` gives `failed`, attempts 1.
- "a running asset whose lease ran out is taken over".
- "onComplete commits with the asset or not at all". An `onComplete` that throws leaves the asset `pending` with attempts 1 and its own write rolled back; one that succeeds commits beside `done`.
- "the sweep republishes stale work only". One stale pending, one fresh pending, one done give one publish of `("asset.lift-ink", { assetId })`.

**Implementation.** `claim` is one conditional `UPDATE ... RETURNING *` (pending, or running past the lease); the losing racer gets `null`. The bytes go to storage first; then one transaction runs `complete` and `onComplete`. An `invalid_input` `ServiceError` is an input failure; every other error is transient. Feature services insert `generatedAsset` in their transaction and call `publishAssetJob` after commit. Each job kind gets one worker processor, `apps/worker/src/processors/asset-<kind>.ts`, whose `type` is `assetMessageType(kind)`; it parses `AssetJobMessage` and calls `runJob` with a producer built on the worker-only provider. Services never hold a worker-only provider. `sweep.ts` calls `assets.sweep`; when `SWEEP_EVERY_MS` is set, `main` publishes `sweep` on that interval.

**Done.** `pnpm dev`; the worker logs a processed `sweep` every minute. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the lifecycle, the error rule, "one processor per kind, typed by `assetMessageType`", the `sweep` row, and Cloud Scheduler for the move.

---

## M5. Doodles by drawing

### 16. Draw with a pen, a mouse or a finger on one ink canvas

**Goal.** One drawing surface for doodles, signatures and font cells, with pencil pressure for a pen, perfect-freehand's simulated pressure with a mouse or a finger, palm rejection once a pen has drawn.

**Files.**

- Create `packages/types/src/stroke.ts`, `packages/render/src/html/ink.ts`.
- Create `apps/web/src/features/ink/{pointer-session,pointer-session.test}.ts`, `apps/web/src/features/ink/ink-canvas.tsx`.
- Extend `apps/web/src/app/(studio)/styleguide/page.tsx` with an `InkCanvas`.

**Shapes.**

```ts
export type StrokeInput = "pen" | "mouse" | "touch";
export type StrokePoint = readonly [
	x: number,
	y: number,
	pressure: number,
	t: number,
];
export type Stroke = { input: StrokeInput; points: StrokePoint[] };

export const STROKE_OPTIONS = {
	size: 8,
	thinning: 0.6,
	smoothing: 0.55,
	streamline: 0.4,
} as const;
export function strokeOutline(
	stroke: Stroke,
	scale: number,
): [number, number][];
export function outlinePath(outline: readonly [number, number][]): string;

export type PointerSample = {
	pointerId: number;
	input: StrokeInput;
	x: number;
	y: number;
	pressure: number;
	t: number;
};
export type PointerSessionState = {
	strokes: Stroke[];
	active: { pointerId: number; stroke: Stroke; startedAt: number } | null;
	penSeen: boolean;
};
export type PointerSessionEvent =
	| { type: "down"; sample: PointerSample }
	| { type: "move"; samples: PointerSample[] }
	| { type: "up"; pointerId: number }
	| { type: "cancel"; pointerId: number }
	| { type: "undo" }
	| { type: "clear" };
export function pointerSession(
	state: PointerSessionState,
	event: PointerSessionEvent,
): PointerSessionState;
```

**Tests first.** `pointer-session.test.ts`:

- "a pen stroke keeps its pressures and times from its own start".
- "a touch during a pen stroke is ignored".
- "after a pen has drawn, touches are palms, and a mouse still draws".
- "a mouse stroke stores a flat pressure of 0.5".
- "a cancelled stroke is dropped".
- "a second finger cancels the first finger's stroke".
- "undo removes the last stroke and clear removes all".

**Implementation.** `strokeOutline` calls `getStroke` with `STROKE_OPTIONS` scaled and `simulatePressure` unless the input is a pen; it is the one place that rule lives. `InkCanvas` is a `<canvas>` with `touch-action: none`, pointer events with `getCoalescedEvents`, the reducer, and a render loop filling `Path2D(outlinePath(outline))`. Props are `{ widthPx, heightPx, guides?: ReactNode, background?: ReactNode, strokeScale?: number, composite?: "source-over" | "destination-out", onStrokeEnd(strokes) }`; the defaults (no background, scale 1, `source-over`) are what doodles and font cells use, and the mask editor's eraser sets all three.

**Done.** Draw on `/styleguide` with a mouse and, on the iPad, with a pencil and a finger. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add "Ink" naming `strokeOutline` and the pressure and palm rules.

### 17. Save drawn doodles to the library and tap one onto the letter

**Goal.** A library of drawings per organization, reused across letters. A drawn doodle saves its strokes and a transparent PNG mask. Tapping a drawing places it on the page in the centre of the visible part of the current side. Placement shares the text's undo history.

**Files.**

- Create `packages/types/src/drawing.ts`.
- Create `packages/db/src/drizzle/schema/drawings.ts`, `packages/db/src/drizzle/{drawings,drawings.test}.ts`; extend the contract (`packages/db/src/database.ts`, `src/drizzle/db.ts`, `src/drizzle/schema/index.ts`); migrate.
- Extend `packages/services/package.json` with the `./drawings` export.
- Create `packages/services/src/drawings/{drawings.service,drawings.types,drawings.schemas,drawings.service.test,index}.ts`.
- Extend `packages/services/src/letters/letters.service.ts` and its test.
- Add to `openapi.yaml`: `POST /api/drawings`, `PATCH /api/drawings/{drawingId}`, `DELETE /api/drawings/{drawingId}`; codes `invalid_mask`, `invalid_drawing`, `not_owner`.
- Create the two drawing route files and `apps/web/src/server/drawings.ts`.
- Create `apps/web/src/features/library/components/{library-sheet,draw-doodle-dialog}.tsx`, `apps/web/src/features/library/rasterize.ts`, `apps/web/src/features/editor/{elements,elements.test}.ts`; extend `editor-toolbar.tsx` with a Library button.
- Create `apps/web/e2e/library.e2e.ts`.

**Shapes.**

```ts
export type DrawingKind = "doodle" | "signature";
export type DrawingSource =
	| {
			kind: "drawn";
			box: { widthPx: number; heightPx: number };
			strokes: Stroke[];
	  }
	| { kind: "photo"; photoAssetId: string };
export type Drawing = {
	id: string;
	organizationId: string;
	ownerUserId: string;
	kind: DrawingKind;
	name: string;
	source: DrawingSource;
	maskAssetId: string;
	aspect: number;
	createdAt: Date;
	deletedAt: Date | null;
};
export type LibraryDrawing = {
	id: string;
	kind: DrawingKind;
	name: string;
	aspect: number;
	maskAssetId: string;
};

export type CreateDrawingParams = CreateDrawingRequest;
export class DrawingService {
	constructor(
		private readonly db: Db,
		private readonly storage: AssetStorage,
	) {}
	createDrawing(
		member: Member,
		params: CreateDrawingParams,
	): Promise<{ id: string }>;
	listDrawings(member: Member, kind: DrawingKind): Promise<LibraryDrawing[]>;
	renameDrawing(member: Member, drawingId: string, name: string): Promise<void>;
	deleteDrawing(member: Member, drawingId: string): Promise<void>;
}

export function placeElement(
	state: EditorState,
	element: PlacedElement,
): Transaction;
export function updateElement(
	state: EditorState,
	id: string,
	change: ElementChange,
): Transaction;
export function removeElement(state: EditorState, id: string): Transaction;
export type ElementChange = Partial<
	Omit<PlacedElement, "id" | "kind" | "drawingId">
>;
```

The `drawings` table: `id`, `organization_id`, `owner_user_id`, `kind`, `name`, `source` (jsonb), `mask_asset_id`, `aspect`, `created_at`, `deleted_at`. Doodles are shared with the organization; a signature is usable, listed, renamed and deleted only by its owner (settled decision 9). `isUsableBy(member, drawing)` is the one rule. `letterResources` fills `resources.drawings` with every drawing the letter references, deleted or not.

**Tests first.** `drawings.service.test.ts`:

- "a mask from another organization is not found".
- "a photo cannot be a mask". `invalid_mask`.
- "the aspect comes from the PNG". A 1200×600 mask gives 2.
- "a PNG whose first chunk is not IHDR is refused". `invalid_mask`.
- "a mask over 4096 px on a side or with zero height is refused".
- "strokes with impossible values are refused". `NaN`, pressure 1.5, 2,001 strokes or 4,001 points in a stroke give `invalid_drawing`.
- "a name with control characters or over 60 characters is refused".
- "the library holds this organization's live drawings of one kind, newest first".
- "another organization cannot rename or delete a drawing". `not_found`.
- "a teammate sees Karla's doodles but not her signatures". Sam's `listDrawings(signature)` is empty; his doodle list holds Karla's doodle.
- "a teammate cannot rename or delete Karla's signature". `forbidden` / `not_owner`.
- "a deleted drawing leaves the library and still renders in a letter using it". `getLetter` still lists its mask.

`letters.service.test.ts` gains:

- "a letter cannot place another organization's drawing". `invalid_letter`.

`elements.test.ts`, `EditorState` with the history plugin, no DOM:

- "placing an element and undoing removes it".
- "one undo stack covers text and placement, newest first". Move to `xIn` 3, type "Hi", undo twice; "Hi" goes first, then the move.
- "updating an element that does not exist throws".

`library.e2e.ts`, at a touch viewport under 900 px:

- "an empty library offers Draw and Photograph".
- "a drawn doodle appears in the library".
- "tapping a doodle places it on the current side and closes the library". Its centre is within 0.1 in of the visible side's centre, and a reload keeps it.

**Implementation.** `createDrawing` loads the mask asset in the organization, requires `purpose` `mask`, reads the first 33 bytes and checks the PNG signature, the `IHDR` chunk type and the size bounds, validates a drawn source with `drawings.schemas.ts`, and inserts. `rasterize.ts` draws every `strokeOutline` in opaque black on a transparent offscreen canvas at 1200 px on the long side, crops to the ink with 2% padding, and exports a PNG. Placement commands use `tr.setDocAttribute("elements", next)`, which history undoes like text. Placing a drawing also adds it to the editor's own `resources.drawings`, so `LetterPage` can draw it before the next page load. The library opens from the toolbar as a `Sheet` (right on wide screens, bottom under 900 px), lists masks through `/api/assets/{maskAssetId}`, and offers rename and delete per drawing. Placed elements play `animate-settle`.

**Done.** Draw a heart, tap it onto the letter, undo. `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `services/drawings`, the `drawings` table, the mask rule, soft delete, and "placement is a doc-attribute step".

### 18. Move, resize, rotate and recolour placed doodles with one undo stack

**Goal.** Placed doodles can be moved, resized with their ratio kept, rotated with gentle snapping, recoloured to any ink, moved to another side and removed, with mouse, pen or finger. Every gesture is one undo step.

**Files.**

- Create `apps/web/src/features/editor/{transform,transform.test}.ts`, `apps/web/src/features/editor/components/{element-handles,element-menu}.tsx`; extend `letter-editor.tsx`.
- Create `apps/web/e2e/elements.e2e.ts`.

**Shapes.**

```ts
export type Handle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PointIn = { xIn: number; yIn: number };
export type PointerParams = { pointer: PointIn; spec: PageSpec; gapIn: number };
export function moveTo(
	element: PlacedElement,
	params: PointerParams,
): Pick<PlacedElement, "side" | "xIn" | "yIn">;
export function resizeFrom(
	element: PlacedElement,
	handle: Handle,
	params: PointerParams,
): Pick<PlacedElement, "xIn" | "yIn" | "widthIn" | "heightIn">;
export function rotateToward(
	element: PlacedElement,
	params: PointerParams,
): number;
export const MIN_ELEMENT_IN = 0.25;
export const SNAP_DEG = 4;
```

`pointer` is in page-stack coordinates (inches from the top of side 1, gaps included), so a drag can cross sides.

**Tests first.** `transform.test.ts`:

- "dragging the bottom-right handle keeps the ratio and the top-left corner". 2×1 at (1, 1), pointer (5, 4) gives 4×2 at (1, 1).
- "on a turned element the opposite corner stays put".
- "an element cannot shrink below a quarter inch".
- "rotation snaps within four degrees and is free elsewhere". 88 gives 90; 80 gives 80.
- "a drag into the next side moves the element to that side". A centre dropped 1 in into side 2 gives `side` 1 and `yIn` relative to side 2.
- "a drag past the last side stays on the last side".
- "resizing an element on side 2 works in side 2's coordinates". A 2×1 element on side 1 (the second side), gap 0.5, bottom-right handle dragged to the page-stack point 3 in right and 2 in down of its top-left gives 3×1.5 at the same top-left.

`elements.e2e.ts`:

- "one undo moves a moved doodle back". Move, Meta+Z, and it is at its first position, in the same page session.
- "a moved doodle survives a reload". Move, wait for Saved, reload.
- "recolour paints the doodle in the picked ink, and undo restores it". Pick Oxblood; `background-color` is `rgb(107, 31, 42)`; Meta+Z brings back ink blue; pick Oxblood again, reload, and it is still Oxblood.
- "a doodle in the barcode corner warns". `Keep this corner clear for the postal barcode.`

**Implementation.** `ElementHandles` is `LetterPage`'s `handles` layer: drag to move, four corners to resize, a handle above to rotate. During a gesture the element follows local state; on pointer up one `updateElement` lands. Delete and Backspace remove a selected element. `ElementMenu` offers the five `INK_COLORS` swatches and Remove. Placement issues show as a `--danger` outline and one sentence.

**Done.** `pnpm test:e2e`; `pnpm screens` with a selected doodle. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the transform file and "one transaction per gesture".

---

## M6. Photo ink lift

### 19. Lift ink with lighting, colour separation, Sauvola on brightness and a soft matte

**Goal.** The first half of the lift that replaces v1's adaptive-mean threshold. A photo of ink on paper becomes a soft alpha mask.

**Files.**

- Create `packages/integrations/src/worker/image/{index,lift,lift.test,synthetic}.ts`; add `./worker/image` to the exports.
- Add `ImageProcessor` to `packages/services/src/drawings/drawings.types.ts`.
- Add codes `photo_too_large`, `no_ink_found`.

**Shapes.**

```ts
export interface ImageProcessor {
	liftInk(photo: Uint8Array): Promise<Uint8Array>;
}
export type LiftMaskOptions = { removeLines: boolean; cropToInk: boolean };
export type Mask = { widthPx: number; heightPx: number; alpha: Uint8Array };
export function liftMask(
	photo: Uint8Array,
	options: LiftMaskOptions,
): Promise<Mask>;
export const LIFT_LIMITS = {
	maxInputPixels: 40_000_000,
	workingLongSidePx: 2400,
} as const;
export class SharpImageProcessor implements ImageProcessor {
	liftInk(photo: Uint8Array): Promise<Uint8Array>;
}
```

`liftInk` and `liftMask` both apply `LIFT_LIMITS`, so every path into the pipeline has the same cap. `synthetic.ts` is test-only and builds pages from SVG (paper, a lighting gradient, rulings, a grid, specks, ink) with their ground-truth ink mask.

**Tests first.** `lift.test.ts` measures IoU against the truth at alpha 128, recall of truth ink, and the share of non-ink pixels that come out opaque:

- "dark strokes on white become ink and paper becomes clear". IoU at least 0.9.
- "a shadow across the page does not become ink". A white-to-60%-grey gradient; opaque non-ink below 0.5%.
- "light blue rulings and a red margin vanish". 99% of ruling pixels below alpha 30.
- "blue ballpoint on blue rulings is kept". Recall at least 0.9.
- "EXIF orientation 6 is applied". Width and height swap and the L's foot is bottom right.
- "a transparent PNG is read as if on white".
- "a photo over the pixel cap is refused before decoding". `photo_too_large`.
- "bytes that are not an image are refused". `photo_unreadable`.
- "a blank page has no ink". `no_ink_found`.
- "the output is cropped to the ink with a small margin".
- "edges are soft". Over 1% of opaque pixels between 30 and 225.
- "the threshold window scales with the image". 1000 px and 3000 px versions agree at IoU 0.85.

**Implementation.** In order: `sharp(photo, { limitInputPixels })`, `.rotate()`, `.flatten({ background: "#ffffff" })`, resize to `workingLongSidePx`, raw RGB. For lighting, a background estimate (downscale by 16, 5×5 max filter, blurred upscale) divides each channel. For colour separation, brightness is `max(r, g, b)`, so light coloured rulings read as paper and dark ink of any hue stays dark. Sauvola on brightness with a window of `odd(round(shortSide / 30))`, `k` 0.3, `R` 0.5, from integral images of the value and its square; a pixel is ink where brightness is below its threshold `T`. The soft matte ramps alpha over `T - brightness` across ±0.04, inside a one-pixel dilation of the hard mask. `liftInk` crops to the ink plus 2% and writes a PNG with black colour channels. Every stage after decoding is plain TypeScript over the raw buffer; tests call `liftInk` and `liftMask` only.

**Done.** Run the lift on one of your phone photos with a scratch script and look at the PNG. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the lift stages by name, the pixel cap, and `sharp` stays out of the bundle.

### 20. Remove ruled lines, grids, specks and table edges from lifted ink

**Goal.** Long straight lines that survived separation (dark rulings, graph paper) go; specks go; a dark table edge around the paper goes; the dot on an i and a hand-drawn underline stay.

**Files.**

- Extend `packages/integrations/src/worker/image/{lift,lift.test,synthetic}.ts`.

**Shapes.** None new.

**Tests first.** Added to `lift.test.ts`:

- "a grey graph-paper grid is removed and the writing kept". 97% of grid pixels clear; recall at least 0.85; ink components change by at most 1.
- "dark notebook rulings are removed".
- "a wavy hand-drawn underline is kept".
- "specks are dropped and the dot on an i is kept".
- "a dark table edge around the paper is dropped".
- "line removal can be turned off". `liftMask(photo, { removeLines: false, cropToInk: false })` keeps the grid and the full frame.

**Implementation.** Line removal is run-length filtering on the hard mask, which is an opening with a 1×L line element in linear time. Horizontal runs of at least `round(width / 12)` px and vertical runs of at least `round(height / 12)` px are removed where the mask's thickness across the run is at most `2 + round(shortSide / 800)` px, so strokes crossing a line keep the crossing. Connected components (8-connected, union-find over runs) drop components below `max(12, 0.000004 × pixels)` px and any component touching the border with over 2% of the image. The matte runs after.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Extend the lift stages.

### 21. Lift a photo in the worker on request

**Goal.** The web asks for a lift; the standard pool lifts the photo with `SharpImageProcessor`; the result is a servable mask asset. Checked with `curl` before any UI.

**Files.**

- Extend `packages/services/src/drawings/{drawings.service,drawings.service.test}.ts`; the constructor gains the publisher, so extend `apps/web/src/server/services.ts` to pass it.
- Extend `packages/services/src/assets/{assets.service,assets.service.test}.ts`: `isServable` is true for generated `lift-ink` assets, with a case.
- Create `apps/worker/src/processors/{asset-lift-ink,asset-lift-ink.test}.ts`; extend `apps/worker/src/index.ts`, `apps/worker/tsdown.config.ts` (`sharp` external), `apps/worker/package.json`.
- Add `POST /api/drawings/lifts` to `openapi.yaml`, code `invalid_photo`; create the route.

**Shapes.**

```ts
export type RequestLiftParams = RequestLiftRequest;
export class DrawingService {
	requestLift(
		member: Member,
		params: RequestLiftParams,
	): Promise<{ assetId: string }>;
}
export class AssetLiftInkProcessor implements MessageProcessor {
	readonly type = assetMessageType("lift-ink");
	constructor(
		private readonly params: {
			db: Db;
			assets: AssetService;
			storage: AssetStorage;
			images: ImageProcessor;
		},
	) {}
	process(message: Message): Promise<void>;
}
```

**Tests first.** `drawings.service.test.ts` gains:

- "only a photo can be lifted". `invalid_photo`.
- "another organization's photo is not found".
- "a lift request is a pending asset published after it commits". Job `{ kind: "lift-ink", photoAssetId }`; publish `("asset.lift-ink", { assetId })`.

`asset-lift-ink.test.ts`, real Postgres, the real `SharpImageProcessor`, `vi.fn()` storage:

- "the processor stores the lifted mask". The bytes passed to `put` are a PNG with alpha.
- "an unreadable photo fails without retrying". `photo_unreadable`, attempts 1, `process` resolves.
- "a lifted mask can be read back". `getAssetReadUrl` gives a URL.

**Implementation.** `requestLift` inserts `generatedAsset(org, { kind: "lift-ink", photoAssetId })` and publishes after commit. The processor calls `runJob({ assetId, kind: "lift-ink", produce })`, where `produce` reads the photo and calls `images.liftInk`. `isServable` gains lift-ink outputs. `sharp` is external in tsdown and a worker dependency.

**Done.** Upload a photo with `curl -X POST -H 'Origin: http://localhost:3000' -H 'x-file-name: doodle.jpg' --data-binary @doodle.jpg 'http://localhost:3000/api/uploads?purpose=photo'`, then `curl -X POST -H 'Origin: http://localhost:3000' -H 'content-type: application/json' -d '{"photoAssetId":"<id>"}' http://localhost:3000/api/drawings/lifts`; `GET /api/assets/<liftId>/status` shows `done` and `curl -L http://localhost:3000/api/assets/<liftId>` downloads the mask. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the `asset.lift-ink` row.

### 22. Crop and erase a lifted doodle and save it to the library

**Goal.** The creator picks or takes a photo, waits calmly while the ink lifts, crops, erases leftovers with a brush, and saves the result like any drawing.

**Files.**

- Create `apps/web/src/features/library/components/{photo-doodle-dialog,mask-editor}.tsx`, `apps/web/src/features/library/compose-mask.ts`; extend `library-sheet.tsx` so Photograph opens `PhotoDoodleDialog`.
- Create `apps/web/e2e/photo-doodle.e2e.ts` and the fixture `apps/web/e2e/fixtures/doodle-on-ruled-paper.jpg`, made once by `synthetic.ts`.

**Shapes.** None new.

**Tests first.** `photo-doodle.e2e.ts`:

- "a photographed doodle becomes a library drawing". Pick the fixture, wait for the lift, save; the library shows it.
- "erasing through the ink clears exactly what was erased". Erase a stroke across the middle of the ink; in the saved mask those pixels have alpha 0 and ink 0.3 in away keeps alpha above 200.
- "the file picker does not offer HEIC". `accept` is `image/jpeg,image/png,image/webp`.
- "a lift that takes too long says so". With `page.route` answering every status request with `pending` and `page.clock` moved past 2 minutes, the dialog says "This is taking longer than usual" and offers to try again.

**Implementation.** The dialog uploads the photo, requests the lift, and polls the status route every second with a `StatusPill` reading "Lifting the ink". `MaskEditor` fetches the mask through `/api/assets/{id}` and decodes it with `createImageBitmap`, so the canvas is not tainted; it shows the mask tinted in `--ink` on paper, a crop frame, an eraser that is `InkCanvas` drawing with `destination-out` at a `Slider` size, and undo. `composeMask` applies crop and erase on an offscreen canvas at the mask's resolution and exports a PNG; Save uploads it as a `mask` and posts `createDrawing` with source `{ kind: "photo", photoAssetId }`.

**Done.** The photo flow with the fixture, and with a real photo on the iPad. `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the photo doodle flow to "One letter, end to end".

---

## M7. Fonts (separable)

Nothing outside this milestone depends on it: M8, M9 and M10 build and test with stock fonts only, and its additions to shared code go through `letterResources` and `letterOwnerIds`.

### 23. Prove alternate glyphs cycle the same way in Chromium and WebKit

**Goal.** Settle how a built font varies its letters. Letters with variants get glyphs `a`, `a.alt1`, `a.alt2`. Three stylistic sets each cycle variants by the previous glyph from a different start. The page picks one set from the letter id, so a letter always prints the same and two letters differ.

**Files.**

- Create `packages/integrations/src/worker/font/{index,opentype-font,opentype-font.test,opentype-font.browser.test}.ts`; add `./worker/font` to the exports.
- Extend `packages/render/src/html/letter-page.tsx` with the feature settings and `letter-page.browser.test.tsx`; create `packages/render/src/html/letter-page.test.tsx`.
- Add `@repo/testing` as a devDependency of `packages/integrations`.

**Shapes.**

```ts
export type PathSegment =
	| ["M", number, number]
	| ["L", number, number]
	| ["Q", number, number, number, number]
	| ["C", number, number, number, number, number, number];
export type Contour = PathSegment[];
export type GlyphOutline = {
	char: string;
	variant: number;
	contours: Contour[];
	advanceWidth: number;
};
export type BuildFontParams = {
	familyName: string;
	ascender: number;
	descender: number;
	glyphs: GlyphOutline[];
};
export const UNITS_PER_EM = 1000;
export function buildFont(params: BuildFontParams): Uint8Array;
```

`variantFeatureSettings` lives in `packages/render/src/html/letter-page.tsx`, because `LetterPage` sets it:

```ts
export function variantFeatureSettings(letterId: string): string;
```

**Tests first.** `opentype-font.test.ts`:

- "a built font reads back with every glyph mapped". `a`, `b`, `a.alt1` give a cmap with `a` and `b` and those three names.
- "two builds of one input parse to the same tables". cmap, glyph names, advances and GSUB lookups are deep-equal.

`opentype-font.browser.test.ts`, both engines through `@repo/testing/browser`, a test font whose `a`, `a.alt1`, `a.alt2` advance 500, 600, 700, at the print device scale factor:

- "ss01 cycles from the default". `aaaa` measures 500, 600, 700, 500.
- "ss02 starts one step later". 600, 700, 500, 600.
- "a letter without variants is untouched".
- "a letter with two variants cycles in twos".

`letter-page.browser.test.tsx` gains:

- "the variant set reaches the text in the editable root and the static root". The computed `font-feature-settings` of a span inside `.letter-text` contains the letter's set in both.

`letter-page.test.tsx` gains:

- "a letter keeps its variant set, and letters differ". One id gives the same set on every call; ten fixed ids give at least two different sets.

**Implementation.** `buildFont` creates an `opentype.Font` with `.notdef`, `space` (advance 300) and every glyph from its segments. GSUB holds one type 6 (chained context, format 3) lookup per stylistic set. Its subtables are ordered: backtrack `[last variant]` with no substitution (wrap to default), backtrack `[alt1]` to a single-substitution lookup default→alt2, backtrack `[default]` to default→alt1, and for `ss02` and `ss03` a final subtable with an empty backtrack giving the start offset. The single-substitution lookups are attached to no feature, and wrapping uses each letter's own variant count. Within one lookup, a subtable sees earlier substitutions in its backtrack, which is what makes the cycle run. `variantFeatureSettings` hashes the id with FNV-1a and returns `"ss01" 1`, `"ss02" 1` or `"ss03" 1`; `LetterPage` sets it on `.letter-text`. If either engine fails the cycle cases, stop and record what fails; the fallback is a decision for the user.

**Done.** `pnpm test` passes in both engines. `pnpm lint`, `pnpm typecheck` pass.

**ARCHITECTURE.md.** Add "How handwriting varies" naming the lookup layout and `variantFeatureSettings`.

### 24. Store handwriting fonts and their drawn glyphs

**Goal.** Personal handwriting fonts, created and drawn cell by cell by their owner. One rule decides which required characters are missing, used by the browser and the server.

**Files.**

- Create `packages/types/src/{handwriting,handwriting.test}.ts`; extend `packages/types/src/font.ts`.
- Create `packages/db/src/drizzle/schema/fonts.ts`, `packages/db/src/drizzle/{fonts,fonts.test}.ts`; extend the contract (`packages/db/src/database.ts`, `src/drizzle/db.ts`, `src/drizzle/schema/index.ts`); migrate.
- Create `packages/services/src/fonts/{fonts.service,fonts.types,fonts.schemas,fonts.service.test,index}.ts`; extend `packages/services/package.json` with the `./fonts` export and `apps/web/src/server/services.ts` with the `FontService`.
- Add to `openapi.yaml`: `POST /api/fonts`, `PUT /api/fonts/{fontId}/glyphs` (body `{ char, variant, strokes }`, so `.` and `/` are ordinary values), `DELETE /api/fonts/{fontId}`; codes `invalid_glyphs`, `invalid_owner_name`.
- Create the route files and `apps/web/src/server/fonts.ts`.

**Shapes.**

```ts
export const HANDWRITING_GLYPHS = [
	{ char: "a", variants: 3, required: true },
	{ char: "A", variants: 1, required: false },
] as const satisfies readonly {
	char: string;
	variants: 1 | 2 | 3;
	required: boolean;
}[];
export const CELL = {
	size: 1000,
	ascender: 150,
	xHeight: 450,
	baseline: 750,
	descender: 950,
	strokeScale: 5,
} as const;
export const GLYPH_LIMITS = { strokes: 40, pointsPerStroke: 2000 } as const;
export function missingChars(glyphs: readonly DrawnGlyph[]): string[];

export type DrawnGlyph = { char: string; variant: number; strokes: Stroke[] };
export type FontSource = { kind: "drawn"; glyphs: DrawnGlyph[] };
export type Font = {
	id: string;
	organizationId: string;
	ownerUserId: string;
	ownerName: string;
	source: FontSource;
	fontAssetId: string | null;
	pendingFontAssetId: string | null;
	chars: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
};
export type FontOption = {
	id: string;
	ownerName: string;
	assetId: string | null;
	building: boolean;
	chars: string;
};
export type EditableFont = {
	id: string;
	ownerName: string;
	glyphs: DrawnGlyph[];
	assetId: string | null;
	building: boolean;
};

export type CreateFontParams = CreateFontRequest;
export type SaveGlyphParams = SaveGlyphRequest;
export class FontService {
	constructor(
		private readonly db: Db,
		private readonly publisher: Publisher,
	) {}
	createFont(member: Member, params: CreateFontParams): Promise<{ id: string }>;
	saveGlyph(
		member: Member,
		fontId: string,
		params: SaveGlyphParams,
	): Promise<void>;
	listFonts(member: Member): Promise<FontOption[]>;
	getFont(member: Member, fontId: string): Promise<EditableFont | null>;
	deleteFont(member: Member, fontId: string): Promise<void>;
}
```

The full `HANDWRITING_GLYPHS` list is settled decision 18's 94 glyphs. The `fonts` table has `owner_user_id` beside `organization_id`; `listFonts` returns the caller's own fonts only, and every write checks the owner through one rule, `isOwnFont(member, font)`. Glyph strokes are stored in `CELL` units (0 to 1000), never screen pixels. `CELL.strokeScale` is the scale passed to `strokeOutline` for a glyph, which makes a stroke 40 cell units wide (`STROKE_OPTIONS.size` 8 × 5). `FontSource` gains `template-photo` in step 28 and `upload` in step 29.

**Tests first.** `handwriting.test.ts` in `packages/types`:

- "variants beyond the first are optional". Every required character drawn once gives `[]`.
- "a cell with no strokes does not count". `x` with `strokes: []` gives `["x"]`.

`fonts.service.test.ts`:

- "an owner name is trimmed and checked". `" Karla "` stores `Karla`; an empty name, 41 characters, or a control character give `invalid_owner_name`.
- "a glyph outside the cell is refused". A point at x 1001 gives `invalid_glyphs`.
- "more strokes or points than the limits are refused".
- "another organization cannot save a glyph or delete the font". `not_found`.
- "a teammate in the same organization cannot use Karla's font". Sam's `listFonts` excludes it; his `saveGlyph` and `deleteFont` give `forbidden` / `not_owner`.
- "the characters . and / save like any other".
- "the owner reads back the glyphs she drew, a teammate reads nothing". Karla's `getFont` returns the saved glyphs; Sam's returns `null`.

**Implementation.** `missingChars` derives the required set from `HANDWRITING_GLYPHS` and treats a glyph with no strokes as missing. `saveGlyph` replaces one cell in `source.glyphs` inside a transaction (`SELECT ... FOR UPDATE`), so concurrent cell saves do not lose each other. The web saves a cell on stroke end with a plain request.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `services/fonts`, the `fonts` table, `missingChars` as the one rule, and "strokes are stored in cell units".

### 25. Build a font from drawn glyphs in the worker

**Goal.** A drawn font builds in the worker into a servable font. A rebuild never breaks letters, because the last good build stays in use until the new one is done. Letters can use a built font.

**Files.**

- Extend `packages/types/src/asset.ts` (`build-font` job), `packages/services/src/fonts/*` and their tests, `packages/services/src/letters/*` and their tests.
- Extend `packages/integrations/src/worker/font/opentype-font.ts` with `OpentypeFontBuilder` and its tests.
- Create `apps/worker/src/processors/{asset-build-font,asset-build-font.test}.ts`; extend `apps/worker/src/index.ts` and `apps/worker/package.json` (`@repo/render` for `strokeOutline`, `opentype.js` as a devDependency for the test).
- Extend `packages/services/src/assets/{assets.service,assets.service.test}.ts` (`isServable` for built fonts, and the job-kind case below).
- Extend `apps/web/src/features/editor/components/{human-seal,letter-editor}.tsx` to feed `sealFonts` and the caller's fonts to `humanSeal`.
- Add `POST /api/fonts/{fontId}/builds`, codes `font_incomplete`, `font_not_ready`; create the route.

**Shapes.**

```ts
export type AssetJob =
	| { kind: "lift-ink"; photoAssetId: string }
	| { kind: "build-font"; fontId: string };

export type OutlineGlyph = {
	char: string;
	variant: number;
	polygons: [number, number][][];
};
export type FromStrokeOutlinesParams = {
	familyName: string;
	glyphs: OutlineGlyph[];
};
export type BuiltFont = { bytes: Uint8Array; chars: string };
export interface FontBuilder {
	fromStrokeOutlines(params: FromStrokeOutlinesParams): Promise<BuiltFont>;
}
export class FontService {
	requestBuild(member: Member, fontId: string): Promise<{ assetId: string }>;
}
export class AssetBuildFontProcessor implements MessageProcessor {
	readonly type = assetMessageType("build-font");
	constructor(
		private readonly params: {
			db: Db;
			assets: AssetService;
			storage: AssetStorage;
			builder: FontBuilder;
		},
	) {}
	process(message: Message): Promise<void>;
}
```

The family name inside the file is `own-<fontId>`, never the owner's name.

**Tests first.** `opentype-font.test.ts` gains, through `fromStrokeOutlines`:

- "a polygon from the ascender line to the baseline makes a glyph that tall". A 40×600-unit rectangle from cell y 150 to 750 gives a glyph y range of 0 to 600.
- "the advance is the ink width plus both side bearings". 200 units of ink advance 320.
- "an empty cell makes no glyph, and space exists".
- "variants become alternates". Three `e` give `e`, `e.alt1`, `e.alt2`.
- "overlapping polygons fill as one shape". Two crossing rectangles, one wound each way, rasterised with `getPath` and `sharp`, have no hole at the crossing.

`fonts.service.test.ts` gains:

- "a build needs every required character". `font_incomplete`.
- "a build request is a pending asset beside the current build". `pendingFontAssetId` is the new asset; `fontAssetId` is unchanged; publish `("asset.build-font", { assetId })`.

`assets.service.test.ts` gains:

- "a job of another kind is a broken state". `runJob({ assetId, kind: "build-font", produce })` on a `lift-ink` asset throws.

`asset-build-font.test.ts`:

- "a drawn stroke makes a glyph as tall as its centre line plus its width". A vertical stroke from the ascender line to the baseline, outlined at `CELL.strokeScale` (40 units wide), gives a y range of -20 to 620 within 5 units.
- "a finished build becomes the font in use and records its characters". `fontAssetId` is the asset, `pendingFontAssetId` is null, `chars` holds the drawn characters.
- "a failed rebuild leaves the last good build in use". `fontAssetId` is unchanged.

`letters.service.test.ts` gains:

- "a letter cannot use another organization's font". `invalid_letter`.
- "a teammate in the same organization cannot write in Karla's font". Sam saving a letter with Karla's font gives `forbidden` / `not_owner`.
- "a teammate opens a letter in Karla's hand read-only". Sam's `getLetter` gives `editable: false` and the font's asset in resources.
- "a letter cannot use a font that has never finished a build". `font_not_ready`.
- "a deleted font still renders in letters that use it". After `deleteFont`, `getLetter` still lists its asset in `resources.fonts`.

**Implementation.** The processor loads the font by the job's `fontId`, maps each drawn glyph's strokes through `strokeOutline(stroke, CELL.strokeScale)` (from `@repo/render/html`, in `apps/worker`) into polygons, and calls `builder.fromStrokeOutlines`; the producer returns `{ bytes, mimeType: "font/otf", result: chars }`. The builder converts each polygon to a contour with quadratic smoothing through segment midpoints, orients every drawn contour the same way so overlapping strokes union under the nonzero rule, maps `y = CELL.baseline - y`, adds 60-unit side bearings, and calls `buildFont`. Its `onComplete` swaps `pendingFontAssetId` into `fontAssetId` and stores `chars`, in the transaction that marks the asset done. `letterOwnerIds` adds the owner of every own font the letter uses, so `saveLetter` refuses another owner's font with `not_owner` and `editable` follows; `getLetter` gains `sealFonts: Record<string, { ownerName: string; chars: string }>` for the own fonts the letter uses, which the editor feeds to `humanSeal` beside the caller's `FontOption`s. `isServable` gains built fonts; org members' browsers receive the font file through `@font-face`, and there is no download or export feature. `letterResources` adds `resources.fonts`, so the export processor loads own fonts with no change of its own.

**Done.** Build a font from scripted strokes in `pnpm dev`. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the `asset.build-font` row, the pending-build swap, and "only the owner writes with a font; members' browsers receive its file to show letters; no other organization ever does".

### 26. Draw the template in the app and write with "My handwriting"

**Goal.** The creator fills a grid of cells, builds the font, and writes in "Karla's handwriting" from the toolbar, with variants showing while they type.

**Files.**

- Create `apps/web/src/app/(studio)/fonts/page.tsx` (the creator's own fonts, each with Delete), `apps/web/src/app/(studio)/fonts/new/page.tsx`, `apps/web/src/app/(studio)/fonts/[fontId]/draw/page.tsx`.
- Create `apps/web/src/features/fonts/components/{glyph-grid,glyph-cell,font-preview}.tsx`, `apps/web/src/features/fonts/{cell-units,cell-units.test}.ts`.
- Extend `editor-toolbar.tsx`, `letter-editor.tsx`.
- Create `apps/web/e2e/fonts.e2e.ts`.

**Shapes.**

```ts
export function toCellUnits(stroke: Stroke, cellPx: number): Stroke;
```

**Tests first.** `cell-units.test.ts`:

- "the same stroke on a 200 px cell and a 120 px cell saves the same points".

`fonts.e2e.ts`:

- "the toolbar offers to make a handwriting font when there is none". The empty "My handwriting" group links to `/fonts/new`.
- "the draw page lists what is still missing". With `x` undrawn, Build is off and `x` is listed.
- "a drawn font becomes a choice in the toolbar and in the seal". Draw every required cell with scripted pointer strokes, build, apply to all text; `document.fonts.check` for the own family is true and the seal reads `Written in Karla's own handwriting`.
- "variants show while editing". The computed `font-feature-settings` of a span in the editor contains the letter's set.
- "a deleted font leaves the fonts page".

**Implementation.** `/fonts/new` offers Draw it here, Photograph the template, Upload a font file; the last two link once steps 28 and 29 exist. Draw it asks "What name should the seal use?", which becomes `ownerName`. The draw page loads its cells through `getFont` (via `server/fonts.ts`) and shows `HANDWRITING_GLYPHS` as `GlyphCell`s, each an `InkCanvas` with faint guides from `CELL` and the character in `--ink-muted`, saving on stroke end through `toCellUnits`. Missing characters come from `missingChars` over the loaded glyphs. A preview line renders the last build. The toolbar's font select gains a "My handwriting" group from `listFonts`, built fonts only; applying one adds `{ [fontId]: assetId }` to the editor's own `resources.fonts`, so `LetterPage` emits its `@font-face` at once.

**Done.** Draw real cells with a pencil on the iPad, build, write. `pnpm screens` of the toolbar's empty "My handwriting" group and of the fonts page. `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the drawn-font flow.

### 27. Turn ink masks into glyph contours

**Goal.** The tracer that template photos need, with no new dependency (potrace is GPL). A mask becomes closed contours, holes wound the other way, simplified.

**Files.**

- Create `packages/integrations/src/worker/font/{vectorize,vectorize.test}.ts`.

**Shapes.**

```ts
export type VectorizeParams = { tolerancePx: number };
export function vectorize(
	mask: Mask,
	params: VectorizeParams,
): [number, number][][];
```

**Tests first.** `vectorize.test.ts`:

- "a filled square is one contour with four corners".
- "a ring is an outer contour and a hole wound the other way".
- "two blobs are two contours".
- "pixels touching only at a corner stay one shape".
- "the contours fill back to the mask". IoU at least 0.95 for a handwritten g from `synthetic.ts`.

**Implementation.** Marching squares at alpha 128 over a one-pixel padded mask, saddles resolved by the centre average; segments chained into loops; Ramer-Douglas-Peucker at `tolerancePx` (default 0.8); orientation by containment depth, even depth clockwise and odd depth counter-clockwise.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `vectorize`.

### 28. Build a font from a photo of the printed template

**Goal.** The creator prints the template, writes in the cells, photographs it, and gets a font. Corner markers locate the page; cell borders and guides print in light cyan, which the lift's colour separation removes.

**Files.**

- Extend `packages/types/src/handwriting.ts` (template geometry) and `packages/types/src/font.ts` (`template-photo` source).
- Create `apps/web/src/app/(studio)/fonts/template/page.tsx`, `apps/web/src/features/fonts/components/template-photo-dialog.tsx`.
- Create `packages/integrations/src/worker/font/{template,template.test}.ts`; extend `OpentypeFontBuilder` with `fromTemplatePhoto`.
- Extend `FontService.createFont`, `AssetBuildFontProcessor` and their tests. Add code `template_markers_not_found`.
- Extend `openapi.yaml`'s `CreateFontRequest` with the `template-photo` source, run `pnpm api:generate`, and extend the fonts route and `apps/web/src/app/(studio)/fonts/new/page.tsx` (Photograph the template links to `/fonts/template` and opens the dialog).
- Extend `packages/types/src/handwriting.test.ts`.

**Shapes.**

```ts
export const HANDWRITING_TEMPLATE = {
	version: 1,
	page: { widthIn: 8.5, heightIn: 11 },
	marker: { sizeIn: 0.4, insetIn: 0.4, notchIn: 0.12 },
	grid: {
		columns: 8,
		rows: 13,
		xIn: 0.9,
		yIn: 1.2,
		cellWidthIn: 0.84,
		cellHeightIn: 0.72,
		cellInsetIn: 0.06,
	},
	printColors: {
		border: "#8fd3e8",
		guide: "#c4ecf6",
		label: "#8fd3e8",
		marker: "#000000",
	},
} as const;
export type FontSource =
	| { kind: "drawn"; glyphs: DrawnGlyph[] }
	| { kind: "template-photo"; templateVersion: 1; photoAssetId: string };

export type TemplateCell = { char: string; variant: number; mask: Mask };
export function readTemplate(photo: Uint8Array): Promise<TemplateCell[]>;
export type FromTemplatePhotoParams = { familyName: string; photo: Uint8Array };
```

**Tests first.** `template.test.ts`, on a synthetic template (the geometry as SVG, an `o` and an `l` written in their cells) distorted with `sharp().affine()` (7 degrees, scale 0.8, shear 0.05) and a lighting gradient:

- "the four markers are found within four pixels".
- "the glyphs fit the template grid" (in `handwriting.test.ts`). The summed variants of `HANDWRITING_GLYPHS` are at most `HANDWRITING_TEMPLATE.grid.columns * rows`.
- "cells come back in template order with their ink".
- "a sideways photo without EXIF is read the right way up", from the notched marker.
- "printed borders and labels leave no ink". The `l` glyph is under 0.2 em wide.
- "a photo missing a corner is refused". `template_markers_not_found`.
- "a photo that is not a template is refused".
- "the o has an open counter". The built `o` rasterised through `getPath` and `sharp` has a transparent centre.

`fonts.service.test.ts` gains:

- "another organization's photo cannot make a template font". `not_found`.

**Implementation.** `readTemplate` calls `liftMask(photo, { removeLines: false, cropToInk: false })`, finds dark square components near each corner, takes the notched one as top left, solves the homography from the four centres to template inches, and resamples each cell's inner box at 150 px per inch. Each cell goes through `vectorize`; contours keep vectorize's depth-based orientation, then get the same midpoint smoothing, glyph mapping and `buildFont`. `createFont` with a `template-photo` source requires the organization's `photo` asset and requests a build at once. `/fonts/template` prints the page at 100%.

**Done.** Print, write, photograph on the iPad, build, write with it. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the template flow and "template ink is cyan so the lift removes it".

### 29. Build a font from an uploaded TTF or OTF

**Goal.** A creator who made a font elsewhere uploads it. The worker parses it in a thread with limits, rebuilds a new font from its outlines inside that thread, and never serves the upload.

**Files.**

- Extend `packages/types/src/font.ts` (`upload` source).
- Extend `OpentypeFontBuilder` with `fromUpload`; create `packages/integrations/src/worker/font/parse-thread.ts`.
- Extend `FontService`, `AssetBuildFontProcessor` and their tests. Add codes `font_unreadable`, `font_timeout`, `font_missing_glyphs`.
- Extend `openapi.yaml`'s `CreateFontRequest` with the `upload` source, run `pnpm api:generate`, and extend the fonts route.
- Create `apps/web/src/features/fonts/components/font-upload-dialog.tsx`; extend `apps/web/src/app/(studio)/fonts/new/page.tsx` so Upload a font file opens it.
- Extend `apps/worker/tsdown.config.ts` with the thread entry, and `apps/worker/src/index.ts` with the builder's thread settings.
- Add `tsx` as a devDependency of `packages/integrations`.

**Shapes.**

```ts
export type FontSource =
	| { kind: "drawn"; glyphs: DrawnGlyph[] }
	| { kind: "template-photo"; templateVersion: 1; photoAssetId: string }
	| { kind: "upload"; fileAssetId: string };
export type FromUploadParams = { familyName: string; file: Uint8Array };
export class OpentypeFontBuilder implements FontBuilder {
	constructor(
		private readonly params: {
			thread: { url: URL; execArgv: string[] };
			parseTimeoutMs: number;
			parseMaxMemoryMb: number;
		},
	) {}
	fromUpload(params: FromUploadParams): Promise<BuiltFont>;
}
```

Defaults are 5,000 ms and 256 MB. The worker's `main` passes the bundled thread file's URL with `execArgv: []`; tests pass the `.ts` source URL with `execArgv: ["--import", "tsx"]`, so the thread resolves the repo's extensionless imports the way vitest does.

**Tests first.** `opentype-font.test.ts` gains, with uploads made in the test by opentype.js:

- "an uploaded font is rebuilt at 1000 units with scaled advances". 2048-unit `a` 520 and `b` 610 give 254 and 298.
- "curves survive the rebuild". A glyph with one cubic segment rebuilds with a cubic segment at the scaled points.
- "nothing from the upload's name table survives". `ACME Secret Foundry` is absent from the output bytes.
- "truncated bytes are refused". `font_unreadable`.
- "a font without lowercase letters is refused". `font_missing_glyphs`.
- "a glyph with too many points is refused". Over 2,000 commands in one glyph give `font_unreadable`.
- "a parse that runs too long is stopped". `parseTimeoutMs: 1` gives `font_timeout`, and the thread is gone.

`fonts.service.test.ts` gains:

- "only a font file can make an upload font".
- "another organization's font file cannot make an upload font". `not_found`.
- "the uploaded file is never read back". `getAssetReadUrl` gives `null`.

**Implementation.** `fromUpload` starts the thread with `resourceLimits.maxOldGenerationSizeMb`, posts the bytes, and terminates it at the timeout. The thread parses, caps commands per glyph (2,000) and in total (200,000), takes the handwriting set's characters, scales to 1000 units keeping segments as they are, and runs `buildFont`; only the rebuilt bytes and `chars` leave it. Alternates and kerning are dropped (settled decision 11).

**Done.** Upload a Calligraphr export, build, write. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the upload flow and its three rules (thread with limits, rebuilt inside it, never served).

---

## M8. Proofs and postcards

### 30. Render pages to raster PDFs and PNGs with Chromium

**Goal.** `PlaywrightPrintRenderer` alone. It measures a page's HTML and renders it either to a PDF of full-size rasters, one per used side, padded to even, or to one side as a PNG, with the outside network blocked. Its tests use hand-written HTML and a committed test font, so `integrations` never imports `render` and nothing here needs M7.

**Files.**

- Create `packages/integrations/src/worker/chromium/{index,playwright-print-renderer,playwright-print-renderer.test}.ts` and `packages/integrations/src/worker/chromium/fixtures/square-a.ttf` (made once with opentype.js, its `a` a solid square); add `./worker/chromium` to the exports; add `@repo/testing` as a devDependency.
- Add `PrintRenderer` to `packages/services/src/letters/letters.types.ts`.

**Shapes.**

```ts
export type PrintResource = { bytes: Uint8Array; contentType: string };
export type PrintOutput =
	| { format: "pdf"; duplex: boolean }
	| { format: "png"; side: number };
export type MeasureParams = {
	html: string;
	resources: ReadonlyMap<string, PrintResource>;
	measure: typeof measureLetter;
	input: MeasureInput;
};
export type RenderParams = MeasureParams & {
	sheet: { widthIn: number; heightIn: number };
	output: PrintOutput;
	sides: (measure: LetterMeasure) => number;
};
export interface PrintRenderer {
	measure(params: MeasureParams): Promise<LetterMeasure>;
	render(params: RenderParams): Promise<Uint8Array>;
}
export class PlaywrightPrintRenderer implements PrintRenderer {
	static connect(params: {
		wsEndpoint: string;
	}): Promise<PlaywrightPrintRenderer>;
	static launch(): Promise<PlaywrightPrintRenderer>;
	close(): Promise<void>;
}
```

The HTML must have one `.letter-column` element; `measure` runs on it in the page, and `sides` runs in Node on the result, so the renderer knows nothing about pages beyond `sheet`.

**Tests first.** `playwright-print-renderer.test.ts`, with a renderer built by `PlaywrightPrintRenderer.connect({ wsEndpoint })` from `startTestBrowser()`, and HTML strings written in the test (a `.letter-column` holding fixed-height blocks) and a small self-contained measure function:

- "a one-side letter is two pages of full-size rasters". 2 `/Type /Page`, each `/MediaBox [0 0 612 792]`; page 1's image `/Width 2550 /Height 3300`.
- "a three-side letter is four pages". `sides` returning 3 gives 4 pages.
- "one side renders as a PNG of the whole canvas". A 2738/300 × 1838/300 in `sheet` with `{ format: "png", side: 1 }` gives a 2738×1838 PNG of the second side.
- "measure runs on the column element". A measure returning the element's `className` sees `letter-column`.
- "an outside URL is never fetched". A background `url(https://example.com/x.png)` renders paper white there.
- "the font is loaded before the picture is taken". `square-a.ttf` served with `Access-Control-Allow-Origin: *` darkens the pixels under the first `a`.
- "the same letter renders the same pages". Two renders have the same page count and byte-identical decoded image streams per page.

**Implementation.** One context per call with `javaScriptEnabled: false` and `deviceScaleFactor: 300 / 96`, so measure and pictures share one layout. `https://letter.invalid/*` is fulfilled from the resource map with its content type and `Access-Control-Allow-Origin: *`; every other request is aborted. `setContent`, then `document.fonts.ready`, then `page.locator(".letter-column").evaluate(params.measure, params.input)`, which passes the element first. `render` measures in its own page load and screenshots each side at its `sheet` clip. For `png` it returns the one side asked for. For `pdf` it asks `params.sides` how many sides to print, then sets a second document of one full-page `<img>` per side, padded to even when `duplex`, and prints it with `page.pdf({ preferCSSPageSize: true, printBackground: true })`.

**Done.** `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the renderer and its rules (network blocked, one scale factor, raster, PDF padded to even, PNG per side, `.letter-column` as the measured root).

### 31. Export a proof from the worker's render pool

**Goal.** Export renders a frozen snapshot of the letter in the render pool, for one recipient's merge values (the samples in v2), and labels the output a proof: one PDF for a letter, one PNG per side for a product whose spec says `png`. It is refused with the reason when text overflows or a doodle sits in a keep-clear zone. Only a member who may edit the letter can export it. Everything here works with stock fonts only.

**Files.**

- Extend `packages/types/src/asset.ts` (`render-letter` job), `packages/services/src/letters/*` and their tests (`requestExport`; the constructor gains the publisher), `packages/services/src/assets/assets.service.ts` (`assetReadUrl` adds a proof's download name).
- Extend `apps/worker/package.json` with `playwright-core` (catalog) and `@repo/testing` (dev), and `apps/web/src/server/services.ts` to pass the publisher to `LetterService`.
- Create `apps/worker/src/processors/{asset-render-letter,asset-render-letter.test,asset-render-letter.browser.test}.ts`; extend `apps/worker/src/{index,env}.ts` and `.env.example` (`BROWSER_WS_ENDPOINT`, `STOCK_FONTS_DIR`), `apps/worker/tsdown.config.ts` (`playwright-core` external; copy `packages/render/fonts` to `dist/fonts`).
- Create `Dockerfile.worker` from project-post's stages (prune, build, runtime) on `mcr.microsoft.com/playwright:v<version>-noble`, installing `sharp` and `playwright-core` in the runtime stage, with `STOCK_FONTS_DIR=/app/dist/fonts`; add a `browser` service to `docker-compose.yml` (the same image running `run-server` on 3001).
- Add `POST /api/letters/{letterId}/exports` (body `{ revision }`, response `{ assetIds }`), codes `letter_overflow`, `letter_placement`; create the route and `apps/web/src/features/editor/components/export-button.tsx`.

**Shapes.**

```ts
export type AssetJob =
	| { kind: "lift-ink"; photoAssetId: string }
	| { kind: "build-font"; fontId: string }
	| {
			kind: "render-letter";
			letterId: string;
			title: string;
			content: LetterContent;
			mergeValues: MergeValues;
			output: PrintOutput;
	  };

export type RequestExportParams = RequestExportRequest;
export class LetterService {
	requestExport(
		member: Member,
		letterId: string,
		params: RequestExportParams,
	): Promise<{ assetIds: string[] }>;
}
export class AssetRenderLetterProcessor implements MessageProcessor {
	readonly type = assetMessageType("render-letter");
	constructor(
		private readonly params: {
			db: Db;
			assets: AssetService;
			storage: AssetStorage;
			renderer: PrintRenderer;
			stockFontsDir: URL;
		},
	) {}
	process(message: Message): Promise<void>;
}
```

`PrintOutput` moves to `packages/types/src/asset.ts`, since the job carries it. `requestExport` creates one asset when the spec's `output` is `pdf` and one per side when it is `png`, all with `SAMPLE_MERGE_VALUES`. The download name is the title slugged (lowercase letters, digits and hyphens) plus `-proof.pdf`, or `-proof-side-<n>.png`.

**Tests first.** `letters.service.test.ts` gains:

- "an export of a stale revision is refused".
- "an export carries the letter as it was and one recipient's values". Job content equals the content at request time; `mergeValues` equals `SAMPLE_MERGE_VALUES`.
- "a letter exports one PDF". One asset id, output `{ format: "pdf", duplex: true }`.
- "a teammate cannot export a letter in Karla's hand". `forbidden` / `not_owner`.

`asset-render-letter.test.ts`, real Postgres, `vi.fn()` storage and renderer:

- "later edits do not reach the export". Edits saved after `requestExport` are absent from the HTML the renderer receives.
- "text that does not fit fails the export with its reason". `measure` returns `wordsPastLimit` 12; `letter_overflow`.
- "a doodle in the barcode corner fails the export". `letter_placement`.
- "the export is a PDF proof with a safe download name". `application/pdf`; a title `Dear "Alex"\n` signs `downloadName` `dear-alex-proof.pdf`.

`asset-render-letter.browser.test.ts`, the real `PlaywrightPrintRenderer` (connected to `startTestBrowser()`'s `wsEndpoint`), `measureLetter` and `renderLetterHtml`, stock fonts only:

- "the overflow fixture fails as overflow and the one-and-a-half fixture prints two pages".

**Implementation.** `requestExport` checks the revision and the owner rule, inserts the assets with the snapshot, the values and each output, and publishes `asset.render-letter` for each; the emulator routes them to the render pool. The processor parses the job's content with `parseLetterContent` (jsonb is outside data), checks `placementIssues`, builds resources with `letterResources` (so drawings, and own fonts once M7 exists, come with no change here) with `assetBaseUrl` `https://letter.invalid/assets/` and `stockFontBaseUrl` `https://letter.invalid/stock/`, and loads the bytes of every asset those resources and the content's front image name, plus the stock fonts from `stockFontsDir`. It measures `renderLetterHtml` with `LONGEST_MERGE_VALUES` and refuses overflow, then renders `renderLetterHtml` with the job's `mergeValues` and `output`, passing `sides` as `sidesUsed` over the measure. `main` uses `connect` when `BROWSER_WS_ENDPOINT` is set and `launch` otherwise. The Export button reads "Export proof", shows a `StatusPill` per asset, then download links through `/api/assets/{id}`, or the failure's message. `isServable` gains proofs.

**Done.** Export a real letter in `pnpm dev` and open the PDF. Then `pnpm --filter worker build` and run `WORKER_POOL=render PUBSUB_JOBS_SUBSCRIPTION=jobs-worker-render node apps/worker/dist/index.mjs` in place of the dev render worker, and export again, which runs the bundled `measureLetter` through Chromium. `docker build -f Dockerfile.worker .`, run the image against the compose stack and see `worker listening`. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the `asset.render-letter` row, "the render takes one recipient's values; the v2 proof uses the samples; project-post's fulfilment calls it once per recipient", the image, and the end of "One letter, end to end".

### 32. Make postcards: pick the product, choose the front image, export PNGs

**Goal.** The creator picks a letter or a postcard when creating. A postcard's front is one full-bleed image and its back is the writing side, with the address and postage block kept clear. Its proof is one PNG per side, the format Thanks.io takes (`front_image_url` and `custom_background_image`). Everything a postcard needs beyond this is already data in `PAGE_SPECS` from step 6.

**Files.**

- Extend `packages/services/src/assets/{assets.service,assets.service.test}.ts`: `UPLOADS` gains `cover` (JPEG or PNG, 15 MiB) and `isServable` is true for it; add `cover` to the upload purpose in `openapi.yaml` and regenerate.
- Extend `packages/services/src/letters/{letters.service,letters.service.test}.ts`: a front image must be one of the organization's `cover` assets; `letterResources` lists it.
- Create `apps/web/src/app/(studio)/letters/new/page.tsx` (the product picker), `apps/web/src/features/editor/components/front-image-picker.tsx`; extend `letter-card.tsx` (the product's label) and `apps/web/src/app/(studio)/letters/page.tsx` (New opens the picker).
- Extend `apps/worker/src/processors/asset-render-letter.test.ts` and `asset-render-letter.browser.test.ts`.
- Create `apps/web/e2e/postcard.e2e.ts`.

**Shapes.**

```ts
export type UploadPurpose = "photo" | "mask" | "font-file" | "cover";
```

**Tests first.** `assets.service.test.ts` gains:

- "a cover takes JPEG and PNG, not WebP, and can be read back".

`letters.service.test.ts` gains:

- "a postcard's front image must be the organization's cover". Another organization's asset gives `invalid_letter`; a `photo` asset gives `invalid_letter`; a `cover` saves.
- "a postcard exports one PNG per side". Two asset ids, outputs `{ format: "png", side: 0 }` and `{ format: "png", side: 1 }`.

`asset-render-letter.test.ts` gains:

- "a postcard side has its own download name". Side 1 signs `<slug>-proof-side-1.png` as `image/png`.

`asset-render-letter.browser.test.ts` gains:

- "a postcard's back renders as a 2738×1838 PNG with no ink in the address block".

`postcard.e2e.ts`:

- "a new postcard shows a front to fill and a back to write on". Pick Postcard; the front reads "Choose a front image" and the indicator reads `2 of 2 sides`.
- "the chosen front image fills the front edge to edge, and undo removes it".
- "text on the back never enters the address block".
- "there is no Add a side on a postcard".
- "a postcard proof downloads two PNGs".

**Implementation.** `/letters/new` lists `PAGE_SPECS` entries as cards (label, product, size), the default letter first, and calls `POST /api/letters` with the chosen `format`. `FrontImagePicker` uploads a `cover`, then sets `frontImageAssetId` in one doc-attribute transaction, so undo covers it. `LetterPage` already draws an image front and lays the back's text around the address block through `pageExclusions`; nothing in the editor or the renderer names a postcard. The worker already renders PNG outputs; it gains the front image's bytes through the content.

**Done.** Create a postcard, choose a front photo, write on the back on desktop and iPad, export, and open both PNGs at 2738×1838. `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add "a product is a `PAGE_SPECS` entry; the editor and the renderer read it and never name one", the `cover` upload, and the postcard's two outputs.

---

## M9. Merge fields and signature

### 33. Add merge fields through an @ menu

**Goal.** Typing `@` opens a small menu of the `MERGE_FIELDS` catalogue, as in a mention; picking one inserts a chip that takes the surrounding ink and deletes as one. The page prints the recipient's value: the sample in the preview and the proof, and the export checks fit with the longest value.

**Files.**

- Extend `packages/types/src/letter.ts` (`MergeFieldNode` in `InlineNode`); `MERGE_FIELDS` exists since step 7.
- Create `packages/render/src/html/merge-chip.tsx`; extend `packages/render/src/schema/{letter-schema,parse-letter,parse-letter.test}.ts`, `letter-print.tsx` (the chip mapping) and `render-letter-html.test.tsx`, and `asset-render-letter.test.ts`.
- Create `apps/web/src/features/editor/{merge-field-menu.tsx,merge-field-suggestion.ts}`; extend `letter-editor.tsx` (the chip's node view and the suggestion), `editor-toolbar.tsx` (Insert field) and `apps/web/package.json` (`@tiptap/suggestion`, `@floating-ui/dom`).
- Create `apps/web/e2e/merge-fields.e2e.ts`.

**Shapes.**

```ts
export type MergeFieldNode = { type: "mergeField"; attrs: { field: MergeFieldKey }; marks?: InkMark[] };
export function MergeChip(props: { field: MergeFieldKey }): ReactElement;
export const mergeFieldSuggestion: Extension;
```

**Tests first.** `merge-fields.e2e.ts`:

- "@ opens the field menu and a pick inserts a chip". Type `@fir`, press Enter; the doc holds a `first_name` chip and no `@fir`.
- "the menu filters and Escape leaves the text". `@last` shows only Last name; Escape leaves `@last` as text.
- "an @ in an email address stays text". `alex@example.com` followed by a space inserts no chip.
- "backspace after a chip removes the whole chip".
- "a chip keeps the ink around it".
- "the preview prints the sample". The preview `iframe` shows `Alex` where the editor shows the `First name` chip.

`render-letter-html.test.tsx` gains:

- "a chip prints the recipient's value". `SAMPLE_MERGE_VALUES` gives `Alex`; values `{ first_name: "<b>Jo</b>", last_name: "Lee" }` give the escaped text `<b>Jo</b>`.

`parse-letter.test.ts` gains:

- "a field the catalogue does not have is refused".

`asset-render-letter.test.ts` gains:

- "a letter that fits with Alex but not with the longest name fails the export". The renderer's `measure` returns 12 words past only for HTML containing `Maximiliana`; `letter_overflow`.

**Implementation.** `MergeField` is an inline atom node in `@repo/render/schema`, with no editor behaviour. `mergeFieldSuggestion` is an editor-only extension built on `@tiptap/suggestion` with `char: "@"`, `allowSpaces: false` and a start that must follow a space or the start of a line; its items are `MERGE_FIELDS` filtered by label, and its command inserts a `mergeField` node with the current ink mark. `MergeFieldMenu` renders through `ReactRenderer` and is placed at the suggestion's `clientRect` with `@floating-ui/dom`'s `computePosition`; arrow keys and Enter pick, Escape closes, and it follows the toolbar's tokens. `MergeChip` reads `mergeValues` and `mode` from `useLetterPage()`: it prints the recipient's value, or the field's label with a soft `--ink-accent` underline while editing. The editor's node view and the static renderer's mapping both render `MergeChip`, so there is one chip. The Insert field button in the toolbar opens the same menu at the caret.

**Done.** Insert a chip by typing `@` and from the toolbar; the preview and the proof show "Alex". `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add `MERGE_FIELDS` by file, the `@` menu files, and "a render takes one recipient's values; the fit check uses the longest".

### 34. Sign the letter with your own signature

**Goal.** The creator draws or photographs a signature once; it is saved like a doodle and belongs to them. "Sign" puts it after the last line, in a chosen ink and size. The seal adds "signed by hand".

**Files.**

- Extend `packages/types/src/letter.ts` (`SignatureNode`, `SIGNATURE_WIDTHS`, the doc content, `humanSeal`) and its test.
- Create `packages/render/src/html/signature-mark.tsx`; extend `letter-schema.ts`, `parse-letter.ts`, `letter-print.tsx` (the signature mapping), `letters.service.ts`, `elements.ts`, `asset-render-letter.ts` and their tests (`render-letter-html.test.tsx` for the print).
- Extend `letter-editor.tsx` (the signature's node view), `draw-doodle-dialog.tsx`, `photo-doodle-dialog.tsx` and `library-sheet.tsx` with a `kind`; create `apps/web/src/features/editor/components/sign-button.tsx`.

**Shapes.**

```ts
export const SIGNATURE_WIDTHS = [1.5, 2.25, 3] as const;
export type SignatureNode = {
	type: "signature";
	attrs: {
		drawingId: string;
		widthIn: (typeof SIGNATURE_WIDTHS)[number];
		align: Align;
		color: InkColorId;
	};
};
export type LetterDoc = {
	type: "doc";
	attrs: { elements: PlacedElement[]; minSides: number };
	content: (ParagraphNode | SignatureNode)[];
};
export function signLetter(
	state: EditorState,
	signature: SignatureNode["attrs"],
): Transaction;
export function SignatureMark(props: SignatureNode["attrs"]): ReactElement;
```

The document's content expression is `paragraph+ signature?`, so a signature anywhere but last cannot be stored. The signature `drawingId` is a UUID like every other id.

**Tests first.** `letter.test.ts` gains:

- "a signature adds signed by hand". `Written in Karla's own handwriting · doodles hand-drawn · signed by hand`.
- "a signature alone is a seal". `Signed by hand`.

`elements.test.ts` gains:

- "signing twice keeps one signature, the newer one".
- "Enter at the end of the last paragraph adds a paragraph above the signature".

`parse-letter.test.ts` gains:

- "a signature in the middle is refused".

`render-letter-html.test.tsx` gains:

- "the signature's mask URL comes from the resources", and "a signature drawing the resources lack throws".

`letters.service.test.ts` gains:

- "a doodle cannot be used as a signature". `invalid_letter`.
- "a letter cannot sign with another organization's signature". `invalid_letter`.
- "a teammate in the same organization cannot sign with Karla's signature". `forbidden` / `not_owner`.
- "a signed letter's resources hold its signature mask".

`asset-render-letter.test.ts` gains:

- "a signed letter's export loads the signature mask". The resource map the renderer receives holds the mask's bytes.

**Implementation.** `Signature` is a block atom node. `SignatureMark` reads `resources` from `useLetterPage()` and renders the mask tinted in `INK_COLORS[color]`, `widthIn` wide, aligned; the editor's node view and the static renderer's mapping both render it. `signLetter` replaces or appends. The library gains a Signatures tab, listing only the caller's own signatures, using the same dialogs. `SignButton` opens them with swatches and the three widths, or offers to make one. `letterResources` covers signature drawings, and `letterOwnerIds` adds each signature's owner, so `saveLetter` and `editable` apply the same rule.

**Done.** Sign a letter in a stock font with a doodle on it; the seal reads "Doodles hand-drawn · signed by hand"; export a proof. If M7 is built, repeat in your own font and the seal reads all three clauses. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add the signature rule (last block, enforced by the schema; usable only by its owner) and the seal's clauses by file.

---

## M10. Text wrap

### 35. Let text wrap around a doodle's footprint

**Goal.** A doodle can ask text to wrap around its footprint. Text flows down the wider side, line by line, in both engines. Every element has carried `wrap: false` since step 7, so no stored letter or test fixture changes shape.

**Files.**

- Extend `packages/render/src/html/{geometry,geometry.test}.ts`, `letter-page.tsx`, `letter-page.browser.test.tsx`; extend `apps/web/src/features/editor/components/element-menu.tsx`.

**Shapes.**

```ts
export function wrapExclusions(
	spec: PageSpec,
	elements: readonly PlacedElement[],
	gapIn: number,
): Exclusion[];
export const WRAP_PADDING_IN = 0.12;
```

**Tests first.** `geometry.test.ts` gains:

- "a doodle in the left half pushes text to its right". An element at `xIn` 1 on a 7 in column gives a `left` exclusion from the column's edge to the footprint's right edge plus padding.
- "a doodle in the right half pushes text to its left".
- "a doodle that does not wrap adds no exclusion".
- "a wrapping doodle on side 2 sits in side 2's stretch of the column".
- "a wrapping doodle in the bottom margin adds no exclusion". Its footprint lies wholly inside the band, so nothing remains after clipping.
- "two overlapping wrapping doodles on one side become one exclusion".

`letter-page.browser.test.tsx` gains, both engines:

- "no line crosses a wrapping doodle's footprint".
- "a doodle that does not wrap floats over the text".

**Implementation.** `LetterPage` passes `[...pageExclusions, ...wrapExclusions]` to `exclusionFloats`, so callers change nothing. `wrapExclusions` takes each wrapping footprint, padded, clips it to its side's text area with `clipToText` (step 6), drops what is empty, merges overlapping footprints on the same side and float edge into one, and puts each on the side with less room. That keeps every exclusion out of the bands, so the side seams never move. Wrap text is one `updateElement` transaction.

**Done.** Wrap text around a doodle on desktop and iPad; export a proof; the PDF matches. `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

**ARCHITECTURE.md.** Add wrapping to "One page".

---

## M11. Move rehearsal

### 36. Rehearse the move by hand in a throwaway clone of project-post

**Goal.** Find out what the move really costs, without touching the real repository and without writing a merge tool.

**Files.**

- Extend `ARCHITECTURE.md` "Moving into project-post".

**Shapes.** None.

**Tests first.** None. The clone's own `pnpm typecheck` and `pnpm test` are the check.

**Implementation.** `git clone --no-hardlinks` project-post into the scratch directory and branch. Follow Appendix A row by row by hand: copy folders, merge the contract files, the spec, the exports, the catalog and Biome groups, delete v2's copies of shared packages, replace `getSession`, regenerate migrations and the API client. Then compare every package's workspace dependencies in `package.json` with settled decision 3's edges and project-post's layer rules.

**Done.** In the clone, `pnpm typecheck` and `pnpm test` pass, and no workspace dependency exists beyond settled decision 3's edges. "Moving into project-post" points to Appendix A and lists each file that needed a hand edit, with the edit in one line. In `PP/project-post`, `git status` is clean.

**ARCHITECTURE.md.** As above.

---

## Appendix A. Where each piece lands in project-post

| v2 path                                                                                                                                              | project-post destination                                | Action                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/typescript-config`, `packages/logger`, `packages/errors`, `packages/services/src/queue`, the Pub/Sub classes                               | same                                                    | Drop v2's copy; add v2's error codes                                                                                                                                                                               |
| `packages/api/openapi.yaml`                                                                                                                          | same                                                    | Merge paths, schemas, codes                                                                                                                                                                                        |
| `packages/types/src/{asset,page,ink,font,stroke,drawing,letter,merge-field,handwriting}.ts`                                                          | same                                                    | Merge                                                                                                                                                                                                              |
| `assets` table                                                                                                                                       | same                                                    | Schema change: `purpose`, `job`, the `source` enum and the check constraint extend the outline; update `schema.dbml`                                                                                               |
| `letters` table, `services/letters`, `/api/letters*`                                                                                                 | `product_editions`, `services/editions`                 | Rewrite (settled decision 13): content becomes a component entry in `product_editions.content`; revision moves to editions                                                                                         |
| `asset.render-letter` and its processor                                                                                                              | `edition.preflight`                                     | Rewrite: the proof becomes `preflight_proof_asset_id`; the job snapshot becomes `approved_render_spec`; per-recipient renders join fulfilment                                                                      |
| `drawings`, `services/drawings`, `asset.lift-ink`                                                                                                    | same                                                    | Merge; replaces `catalog.uploadSignature` and `asset.process-signature` (settled decision 13)                                                                                                                      |
| `fonts`, `services/fonts`, `asset.build-font`                                                                                                        | same                                                    | Merge; `owner_user_id` and the `Member` caller come with them                                                                                                                                                      |
| `packages/testing`                                                                                                                                   | same                                                    | Merge as a dev-only package                                                                                                                                                                                        |
| `packages/integrations/src/shared/gcp/storage`                                                                                                       | same                                                    | Merge; the Cloud Storage class the layout plans                                                                                                                                                                    |
| `packages/integrations/src/worker/{image,font,chromium}`                                                                                             | same                                                    | Merge                                                                                                                                                                                                              |
| `packages/render`                                                                                                                                    | same                                                    | Merge; file the ADR in settled decision 3                                                                                                                                                                          |
| `packages/ui`                                                                                                                                        | same                                                    | Merge components; v2 tokens are already scoped to `.studio`                                                                                                                                                        |
| `apps/web/src/app/(studio)`                                                                                                                          | `apps/web/src/app/(studio)` beside `(org)`              | Move as its own route group with the same session check, outside the onboarding chrome                                                                                                                             |
| `apps/web/src/app/page.tsx` redirect                                                                                                                 | none                                                    | Drop; project-post's marketing page owns `/`                                                                                                                                                                       |
| `apps/web/src/app/(studio)/styleguide`                                                                                                               | none                                                    | Drop                                                                                                                                                                                                               |
| `apps/web/src/app/fonts/stock`, `/api/assets/*`, `/api/uploads`, `/api/letters*`, `/api/drawings*`, `/api/fonts*`                                    | same                                                    | Merge                                                                                                                                                                                                              |
| `apps/web/src/features/{editor,ink,library,fonts}`, `apps/web/src/lib/{autosave,use-autosave}.ts`, `apps/web/src/server/{letters,drawings,fonts}.ts` | same                                                    | Merge                                                                                                                                                                                                              |
| `packages/types/src/session.ts` `Member`                                                                                                             | project-post's `session.ts`                             | Add the type; `requireUserOrganization` already returns that shape                                                                                                                                                 |
| `packages/services/src/assets`                                                                                                                       | same                                                    | Merge                                                                                                                                                                                                              |
| `packages/db/src/testing/seed-dev-identity.ts`, the `dev_user` cookie in `getSession`                                                                | none                                                    | Drop with the dev identity                                                                                                                                                                                         |
| `apps/web/e2e`, `apps/web/vitest.e2e.config.ts`, root `test:e2e`                                                                                     | same                                                    | Merge; the harness signs in through project-post's auth emulator instead of the `dev_user` cookie                                                                                                                  |
| `tools/dev/{screens,sweep}.ts`, root `screens` and `jobs:sweep`                                                                                      | same                                                    | Merge as dev tools                                                                                                                                                                                                 |
| `docker-compose.yml` `gcs` and `browser` services                                                                                                    | same                                                    | Merge                                                                                                                                                                                                              |
| `tools/check-comments.ts`, `tools/check-architecture.ts`, their tests, the `check` script, `@babel/parser`, the lefthook `comments` command          | same                                                    | Merge; check-architecture reads project-post's `docs/project-layout.md` or a moved `ARCHITECTURE.md`, decided then                                                                                                 |
| `apps/web/src/server/auth.ts` `getSession`                                                                                                           | project-post's                                          | Replace                                                                                                                                                                                                            |
| `tools/dev/seed.ts`                                                                                                                                  | none                                                    | Drop                                                                                                                                                                                                               |
| `apps/worker/src/processors/*`                                                                                                                       | same                                                    | Merge; register in `main`                                                                                                                                                                                          |
| `Dockerfile.worker`                                                                                                                                  | per pool                                                | Decide (settled decision 14): Playwright base for the render pool, `node:26-slim` plus `sharp` for standard                                                                                                        |
| `renderLetterHtml`, `AssetRenderLetterProcessor`, `PrintRenderer` (one recipient's `mergeValues` per render)                                         | project-post's fulfilment worker                        | Mail merge: for each recipient, fill `mergeValues` from the customer record, render once, submit, then the next address. The template, the render and the fit check are reused unchanged; v2 has no recipient list |
| `PAGE_SPECS` (`thanksio:letter-windowless`, `thanksio:postcard-6x9`)                                                                                 | same                                                    | Merge; add each further provider or size (Thanks.io 4×6, 6×11) as one entry                                                                                                                                        |
| Pub/Sub render filter                                                                                                                                | `tools/docker/pubsub-entrypoint.sh`, Terraform `pubsub` | Add `asset.render-letter`; Cloud Scheduler publishes `sweep`                                                                                                                                                       |
| Bucket access                                                                                                                                        | Terraform `storage`, `iam`                              | Add a CORS rule (GET from the platform origin, `Content-Type`); grant `roles/iam.serviceAccountTokenCreator` to the web and worker accounts on themselves for signBlob                                             |
| `.github/workflows/ci.yml` lint job                                                                                                                  | same                                                    | Add `pnpm --filter tools check` (a CI change you approve)                                                                                                                                                          |

## Appendix B. Risks

| Risk                                                                                                                 | Lands in            | What the owner watches                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Safari on iPad breaks lines differently from Linux Chromium                                                          | Steps 8, 12         | The recorded iPad side counts; settled decision 8 keeps the export honest                               |
| Spacer floats confuse the caret in contenteditable on iPad Safari                                                    | Steps 8, 10         | The caret cases in both engines and a manual check on a real iPad                                       |
| opentype.js 2.x writes the chained lookups wrongly                                                                   | Step 23             | The cycle cases in both engines                                                                         |
| The Playwright run-server downloads its package at test start                                                        | Step 5              | CI needs network for that container; the version comes from `playwright-core`                           |
| Lift quality on real photos differs from synthetic fixtures                                                          | Steps 19 to 22, 28  | Add real phone photos as fixtures as soon as they exist                                                 |
| A recipient's name longer than the catalogue's longest overflows                                                     | Step 33             | project-post's fulfilment preflights per recipient                                                      |
| Chromium raster output changes between image versions                                                                | Step 30             | The determinism case per image version; bump the image deliberately                                     |
| Thanks.io reads its rules differently than settled decision 7 assumes                                                | Step 6              | Confirm with Thanks.io; one `PAGE_SPECS` entry                                                          |
| A creator uploads a font they have no licence for                                                                    | Step 29             | Terms of service; flag before launch                                                                    |
| project-post is being rebuilt around a new MVP shape (creators create a storefront) in work Calum has not pushed yet | Step 36, Appendix A | Re-check every project-post path, table and job named in Appendix A once his PR merges, before the move |
| Printed signatures may carry legal requirements                                                                      | Step 34             | Signatures print as normal for now; Calum is checking, and a rule would be a spec or export change      |
| The 6×9 postcard's address block, bleed and safe values read differently than Thanks.io prints them                  | Steps 6, 32         | Confirm with a Thanks.io test print; each is one value in `PAGE_SPECS`                                  |
| A member's read-only view of a teammate's letter is mistaken for permission to export it                             | Steps 25, 31, 34    | The `not_owner` cases on save and export                                                                |

## Appendix C. Reading list for every agent

- `PP/ink-studio-v2/AGENTS.md` and `PP/ink-studio-v2/ARCHITECTURE.md`.
- `PP/project-post/docs/project-layout.md` sections 2 to 5 and 13.
- `PP/project-post/packages/services/src/auth/` as the reference service, test and types.
- `PP/project-post/apps/worker/src/index.ts` and `packages/services/src/queue/`.
- `PP/project-post/docs/schema.dbml`, the `assets` and `product_editions` tables.
- For steps 19 and 20, `PP/ink-studio/apps/worker/src/lift.ts` as what not to do; for step 13, `PP/ink-studio/apps/worker/src/ingest.ts` for the sniffing it replaces.

## Review findings not taken

- **Cap JSON body size inside `handleJson`.** v2 keeps project-post's `handleJson` byte for byte so the move is a deletion; the schemas cap counts (`LETTER_LIMITS`, `GLYPH_LIMITS`, the drawing limits) and the platform caps request size.
- **Give built fonts no URL.** `@font-face` needs the font in members' browsers, so `isServable` includes built fonts; the plan now says so plainly and has no export feature.
- **Store `{ schemaVersion, components }` in letters from the start.** v2 has no variants or components; settled decision 13 records `letters` as a stand-in and Appendix A lists the rewrite.
- **Weaken the seal for uploads, review template cells before build.** The user settled both (decisions 10 and 12).
- **Prove editable and static layout equal inside step 8.** Mounting Tiptap in the render browser test needs a browser bundle; step 12 compares the real editor with the real preview instead, and step 8 no longer claims it.
- **Count variant sets over 300 committed UUIDs.** That pins a hash's distribution; step 23 keeps one behaviour case (stable per letter, different across letters).
- **A "check print fit" button before export.** The export already measures in Chromium and says why it refuses; a second path to the same measure adds code without a new answer.
