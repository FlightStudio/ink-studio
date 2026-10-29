# Catalog product assessment

Assessment of Ink Studio v2 at `1526ab0` on `main` (29 Oct 2026), against Calum Jones's catalog-product proposal and the eleven review claims. Every claim was checked in this repo. Project Post itself is not in this checkout, so anything about his deployed types, his letter rows, or a vendor-price table is unconfirmed here.

His TypeScript and the postcard JSON are not in this repository. They are treated as the proposal under test, not as code that already runs.

Stored page geometry in v2 is inches, with an `In` suffix. His configuration is millimetres. The figures below convert with 25.4 mm to the inch, and they name the source constant rather than inventing a second definition.

## 1. Verdicts

| # | Verdict | Evidence | Notes |
| --- | --- | --- | --- |
| 1 | True | `packages/types/src/page.ts:10-81` | `PAGE_SPECS` is a compile-time constant. The keys are `thanksio:letter-windowless` and `thanksio:postcard-6x9`. Each value has `provider`, `product`, `label`, `widthIn`, `heightIn`, `dpi`, `safeIn`, `marginIn`, `maxPages`, `providerMaxPages`, `front`, `duplex`, `output`, and `keepClear`. The claim's field list omitted `label`, `widthIn`, `heightIn`, and `dpi`, which are on the same object. Sizes are inches. `dpi` is 300 on both entries and is not read by the renderer (see §2). |
| 2 | Partly true | `packages/types/src/letter.ts:56-58`, `packages/db/src/drizzle/schema/letters.ts:22`, `packages/render/src/schema/parse-letter.ts:111`, `packages/api/openapi.yaml:466-470`, `packages/api/src/zod.ts:47-57`, `packages/db/src/drizzle/letters.ts:91-96` | `LetterContent.format` is `PageFormatId`, the vendor key, inside the `letters.content` jsonb document. There is no format column. `parseLetterContent` builds the enum with `keyOf(PAGE_SPECS)` and rejects anything else. Create-letter uses the OpenAPI `PageFormatId` enum via `pageFormatIdSchema`. The save envelope types `format` as a free string (`packages/api/src/zod.ts:49-53`); the strict check is the parser, which every save and export runs. A cutover that drops the old keys needs a jsonb rewrite, and the blank-draft query compares `content->>'format'` to those keys. A reader that still accepts the old key does not need a rewrite first. How many rows exist outside this repo is unconfirmed. |
| 3 | Partly true | Readers listed in §1.3 | The lookup is wide. Replacing the constant with a database row is not a mechanical edit. `PageFormatId` is a key union, the parser's zod enum is built from that object, `LetterPage` looks the spec up itself, and the client bundle contains the catalogue. A rename of keys inside the constant is mechanical. Loading specs at runtime is a different change. |
| 4 | Partly true | `packages/types/src/page.ts:3-8`, `packages/render/src/html/geometry.ts:63-69`, `packages/render/src/html/geometry.ts:127-139`, `packages/render/src/html/letter-page.tsx:270-277`, `apps/web/src/features/editor/components/keep-clear-guides.tsx:44-55` | `KeepClearZone` is a 0-based side index, a corner, and a size in inches. `keepClearRect` turns that into a rectangle from the top-left of the canvas. Intersection, clipping, and placement already take rectangles. The corner is still read to decide which way text floats, and it is the React key and the `data-keep-clear` value. A rectangle that is not flush with a corner cannot be stored. Calum's sample rectangle is flush with the right and bottom edges of his 152.4 × 101.6 mm card, so that one sample fits a bottom-right corner if his origin is top-left and y grows downward. His origin is unconfirmed. The change is local only for corner-flush zones. |
| 5 | Partly true | `packages/types/src/page.ts:39-42`, `packages/types/src/page.ts:63-66`, `packages/render/src/html/geometry.ts:33-35`, `packages/render/src/html/geometry.ts:72-77`, `packages/integrations/src/worker/chromium/playwright-print-renderer.ts:69` | v2 counts flat sides: `maxPages`, with `duplex` as a boolean. Writing starts at side 0, or side 1 when `front` is `"image"`. A uniform `printedSides.length × maxSheets` maps onto that index when every sheet prints the same sides. The letter does not fit that product: `duplex` is true and `maxPages` is 3, while `providerMaxPages` is 12. Three is not two times a sheet count. An image front, and the blank back page added when a duplex PDF has an odd side count, are outside the multiplication. |
| 6 | True | `packages/types/src/page.ts:10-27`, `PLAN.md:464` | The editor's page model uses `front` (`"writing"` or `"image"`), a text inset `marginIn` that is separate from `safeIn`, `dpi`, and `output` (`"pdf"` or `"png"`). None of those are on `CatalogProductConfiguration`. `dpi` and `output` sit on the vendor-keyed spec today; whether they move to a vendor product is a design choice this repo does not settle. `front` and the text inset have no field in his type. v2 has no `bleed` field and no `notecard` kind. Postcard bleed is folded into the canvas size and into `safeIn` (19 px plus 42 px at 300 dpi). `ProductKind` is `"letter"` or `"postcard"`. |
| 7 | True | `packages/types/src/page.ts:34-42`, `packages/render/src/render-letter-html.tsx:8-10`, `packages/integrations/src/worker/chromium/playwright-print-renderer.ts:21-23`, `apps/web/src/app/(studio)/fonts/template/page.tsx:15`, `packages/types/src/handwriting.ts:66-68` | The letter product is a 8.5 × 11 in canvas, duplex, with `maxPages` 3. That is not a front-only letter. The proof's `@page` size is the spec's `widthIn` and `heightIn`. It is not a literal `8.5in 11in` in the letter renderer. The handwriting template's print CSS and `HANDWRITING_TEMPLATE.page` are hard-coded 8.5 × 11 in. The letters empty state and the styleguide use the same aspect as decoration (`apps/web/src/app/(studio)/letters/page.tsx:43`, `apps/web/src/app/(studio)/styleguide/page.tsx:485`). `packages/db/drizzle/0005_placed_signatures.sql:21-22` also hard-codes 8.5, 11, 0.75 in, and `1838/300` for an old signature placement. |
| 8 | True | `packages/types/src/page.ts:54-76`, `PLAN.md:24`, `PLAN.md:2199` | 152.4 × 101.6 mm is 6 × 4 in. The only postcard in `PAGE_SPECS` is `thanksio:postcard-6x9`. Its canvas is `2738/300` × `1838/300` in (9.1267 × 6.1267 in, 231.82 × 155.62 mm). `PLAN.md` describes that canvas as 6 × 9 in plus bleed, and lists Thanks.io 4 × 6 and 6 × 11 as future entries. They are not in the constant. His 3.13 mm bleed is not the postcard's 19 px bleed (1.61 mm per edge). |
| 9 | Partly true | `packages/render/src/html/letter-page.tsx:201`, `packages/render/src/schema/parse-letter.ts:108-137` | An adapter can convert millimetres to inches and can emit a `PageSpec` only by filling the fields his configuration does not have. As specified, `pageSpecFrom` plus a slug swap does not leave the editor and the renderer untouched, and it cannot round-trip the two current products. See §4, steps 1 to 4, for the split that does. |
| 10 | True, with a smaller change than a new column | `packages/types/src/letter.ts:86-123`, `packages/types/src/letter.test.ts:87-167`, `packages/services/src/letters/letters.service.ts:167-175`, `packages/services/src/letters/letters.types.ts:29`, `apps/web/src/features/editor/components/human-seal.tsx:20-30`, `packages/types/src/font.ts:14-17`, `packages/types/src/drawing.ts:5-11`, `apps/web/src/features/fonts/components/font-upload-dialog.tsx:14`, `PLAN.md:27`, `ARCHITECTURE.md:237` | The mechanism in the claim is what the code does. The provenance ladder is not in the code, and it contradicts settled decision 10. Fonts and drawings already store a source kind. The seal does not read it. Size is in §1.10. |
| 11 | Partly true | `ARCHITECTURE.md:257-267`, `ARCHITECTURE.md:279`, `apps/web/src/features/ink/pointer-session.ts:37-48`, `apps/web/src/features/editor/components/element-handles.tsx:47`, `apps/web/e2e/elements.e2e.ts:384-397`, `apps/web/src/features/fonts/two-finger-tap.ts:37-38`, `apps/web/e2e/fonts.e2e.ts:566-594` | Pointer events, pen pressure, 44 px coarse targets, and two-finger tap are implemented, and automated tests drive the touch and coarse-pointer paths in Playwright. The repo records that the six fixture side counts are still unchecked on an iPad, and that Linux WebKit is HarfBuzz rather than iPad Safari's Core Text. "Never run on a real iPad" is unconfirmed beyond that written record. What a device pass still has to cover is in §1.11. |

### 1.3 Where `PAGE_SPECS` is read

Production readers of the catalogue, or of the format string it defines:

- `packages/render/src/html/letter-page.tsx:201` takes the spec from `content.format`.
- `packages/render/src/html/letter-print.tsx:68` uses it for the default sheet count.
- `packages/render/src/render-letter-html.tsx:8-10` uses it for `@page`.
- `packages/render/src/schema/parse-letter.ts:111` and `:120` validate the format, `minSides`, and the front image.
- `packages/services/src/letters/letters.service.ts:47-70` builds new content, the untitled title, and the blank-draft filter. `:364-371` chooses PDF or PNG. `:388` and `:441` read the product label.
- `packages/services/src/letters/letter-preview.ts:83`, `:102`, and `:113` crop the card to one side.
- `apps/worker/src/processors/asset-render-letter.ts:60` measures and clips with the spec.
- `apps/web/src/features/editor/products.ts:16-28` builds the picker. `product-picker.tsx` sends the chosen `PageFormatId` to `POST /api/letters`.
- `apps/web/src/features/editor/components/letter-editor.tsx:405`, `letter-thumbnail.tsx:18`, `print-preview.tsx:120`, and `letter-card.tsx:38`.
- `packages/api/openapi.yaml:466-470`, generated again as `packages/api/src/gen/api.ts:10-13`.
- `packages/db/src/drizzle/letters.ts:91-96` compares `content->>'format'` with the blank-draft keys.

Tests and browser journeys import the same constant (`geometry.test.ts`, `letter-page` tests, `parse-letter.test.ts`, `letters.service.test.ts`, `letter-preview.test.ts`, `products.test.ts`, `export-progress.test.ts`, `transform.test.ts`, and the e2e files `editor`, `postcard`, `preview`, `sides`, and `elements`). `packages/render/src/html/fixtures/index.ts:52` sizes its texts from the default spec's `maxPages`.

`spec.dpi` is written in `page.ts` and in `PLAN.md`. The only dpi the proof uses is `PRINT_DPI` in `packages/integrations/src/worker/chromium/playwright-print-renderer.ts:11`, which is a separate constant. Screenshot width is `sheet.widthIn * PRINT_DPI` (`:136-137`). Nothing reads `spec.dpi`.

### 1.10 Human Seal, confirmed and sized

`humanSeal` is a pure function. It returns a sentence or `null`. `HumanSeal` calls it on each render. `letters` has no seal column. `ARCHITECTURE.md:237` says nothing stores it.

For text, a character counts as handwriting when its font is `{ kind: "own" }` and that font's `chars` contain the character. Stock fonts never do. The function does not look at `FontSource`. `sealRecord` copies `ownerName` and `chars` only. `SealFontView` has those two fields. `FontOption` already carries `source` (`"drawn"`, `"template-photo"`, or `"upload"`) into the toolbar, and `HumanSeal` throws that away when it builds the map.

So a drawn font, a template photo, and an uploaded TTF or OTF all produce "Written in {name}'s own handwriting" when every visible character is covered, and "Partly written…" otherwise. `PLAN.md:27` (decision 10) states that an uploaded font is treated like a drawn one. The checkbox "This font is made from my own handwriting." is `required`, and the file control stays disabled until it is ticked (`font-upload-dialog.tsx:71-93`). The tick is not sent to the server. `FontSource` for an upload is `{ kind: "upload"; fileAssetId }`. There is no stored boolean beside the kind.

A placed element with `kind: "drawing"` adds "doodles hand-drawn". `kind: "signature"` adds "signed by hand". `DrawingSource` is `"drawn"` (strokes) or `"photo"`, and the placed element does not carry it. A photo doodle and a photo signature get the same sentences as ink drawn in the editor. Strokes store `input: "pen" | "mouse" | "touch"` and a pressure per point (`packages/types/src/stroke.ts:1-10`). The seal does not read that. Mouse and touch outlines drop the pressure and simulate it (`packages/render/src/html/ink.ts:15-21`).

There is no tier enum. The strongest text clause is "Written in…". Stock type already gets no text clause (`letter.test.ts:164-166`). The rule that typed text in a font is never the top tier is not implemented. It also disagrees with decision 10, which equates an upload with a drawn font, and with the tests that expect a drawn own-font to be "Written in…". If "typed" means any text set in a font, a font built from iPad strokes is also typed once it is used in the letter, so the gap is the whole handwriting clause, not only the upload path. Which of those readings is the product rule is unconfirmed in this repo.

Size, if the ladder can be expressed with the source kinds that already exist:

- Pass `FontSource["kind"]` through `SealFont` and `sealRecord`. `getLetter` already loads the referenced font rows.
- Pass a `drawingId` to source-kind map into `humanSeal`. That map is not on the document. `PlacedElement` has `kind` and `drawingId` only, so the letter read has to join `drawings.source`.
- Branch the sentence in `humanSeal`. Add cases to `packages/types/src/letter.test.ts`. Adjust the service test that snapshots `sealFonts`.
- No letter migration. The seal is computed. No new column, and no default, while the function reads `source`.
- The visible sentence changes for uploads, and for photo doodles, the day the copy changes. That needs the product sentence before the code.

Size, if the ladder needs a fact those kinds do not store (paper ink versus digital pen as a property of the font, or a record of the checkbox distinct from `kind: "upload"`):

- A new column or jsonb field, with a default derived from `source.kind`.
- A drawn font's strokes can mix pen, mouse, and touch. One font-level value cannot say which without a rule for mixed input. That rule is unconfirmed.
- Template-photo is the closest thing to ink on paper. A photo doodle is a photograph, which is not the same claim. Unconfirmed that it should say "hand-drawn" or "paper".
- This is a migration plus copy plus the function. It is larger than the source-kind branch, and it is not justified until the ladder is written down.

### 1.11 What an iPad pass has to cover

Do not treat the Playwright touch tests as a device pass. They set `hasTouch` and, in `elements.e2e.ts`, assert `(pointer: coarse)` inside Chromium.

Still to record on a real iPad, in Safari:

- The six fixtures in `packages/render/src/html/fixtures/index.ts`, in the editor and in the print preview. `ARCHITECTURE.md:257-265` leaves every iPad cell as unchecked. `PLAN.md` step 12 asked for that comparison. The table says it was not done.
- Pencil versus finger on a glyph cell and on a doodle. A pen stroke keeps its pressures (`pointer-session.ts:47`). A mouse stores a flat 0.5. Touch is not a pen, so its outline simulates pressure. Whether a finger on iPad reports `pointerType` `"touch"` or `"pen"` is unconfirmed on device.
- Targets of at least 44 px under a coarse pointer: handles (`element-handles.tsx:47` uses 44), toolbar controls (`pointer-coarse:min-h-11` in `editor-toolbar.tsx`), the letter title, merge-field rows, and the studio header. `min-h-11` is 2.75 rem. At the usual 16 px root that is 44 px. An iPad text-size change can move it. Unconfirmed on device.
- Two-finger tap undo on the glyph grid (`two-finger-tap.ts`). A touch marked stylus fails the gesture (`:38`), so a pencil plus a finger is a different case from two fingers. The e2e in `fonts.e2e.ts:566` drives Chrome DevTools touch points, not an iPad.
- The formatting toolbar moving off the software keyboard (`editor-toolbar.tsx` follows the keyboard when the pointer is coarse).
- Stylistic-set shaping. `ARCHITECTURE.md:279` says the Linux WebKit test uses HarfBuzz, and iPad Safari uses Core Text, which that test does not reach.
- A postcard: full-bleed front image, writing on the back, address block left clear.
- Dragging a doodle with a pencil while the palm rests on the glass. `drawsWith` can ignore touch after a pen has been seen (`pointer-session.ts:37-42`). That path is unit-tested, not device-tested.

## 2. Things we missed

These are in the code and were not in the eleven claims.

1. **`dpi` on the spec is unused.** The proof hard-codes 300 in `PRINT_DPI`. Putting dpi on a vendor product does nothing until the renderer takes it from the sheet it was given. Today the sheet passed into the renderer is only `widthIn` and `heightIn` (`asset-render-letter.ts:114`).

2. **Two margins, with no check that the text inset contains the safe inset.** Text is padded by `marginIn` (`letter-page.tsx:252-254`). Placed drawings and signatures must lie inside the `safeIn` rectangle (`geometry.ts:264-276`). For both current products `marginIn` is larger than `safeIn` (letter 0.75 in versus `50/300` in; postcard 0.375 in versus `61/300` in), so text sits inside the safe rectangle. Nothing in `page.test.ts` enforces that. A future spec can invert them and let text enter the unsafe band. Placed art may sit in the band between `safeIn` and `marginIn`. It may not cross `safeIn`. The postcard front image is the exception: it is a full-bleed cover (`letter-page.tsx:170-178`, `PLAN.md:713`) and ignores both insets. Calum's "images might be allowed into the safe margin" is not how placed art works. The cover is looser than that sentence, and doodles are stricter.

3. **Letter keep-clear zones already apply to the first side only.** Both barcode zones are `side: 0` (`page.ts:44-51`). Sides 1 and 2 have none. `ARCHITECTURE.md:223` says sides are numbered from 0. `PLAN.md:24` says the barcode zones stay clear on "side 1". The data and `ARCHITECTURE.md` agree with each other. The decision sentence is 1-based, or it is wrong. That split already exists, before his `sheets` array.

4. **One caption for every zone of a product.** `KEEP_CLEAR_COPY` is keyed by `ProductKind`, not by zone (`keep-clear-guides.tsx:11-25`). Both letter corners say "Postal barcode". His `label` is per reserved area. A window and a QR code on the same sheet cannot say different things until that map changes.

5. **An odd duplex PDF grows a blank page.** `playwright-print-renderer.ts:69` adds one page when `output.duplex` is true and the side count is odd. A one-side letter exports as two PDF pages. That behaviour is not in his `layout`. It is why decision 7 says a letter with an odd number of sides gets a blank back (`PLAN.md:24`). Combined with `maxPages: 3`, a full letter is four PDF pages, the last one blank.

6. **`providerMaxPages` is a second cap.** The letter's editorial cap is 3 and the provider cap is 12. `page.test.ts:5-8` checks `maxPages <= providerMaxPages`. His layout has `maxSheets` only. The deployment knob `PLAN.md` describes has no field in the catalog configuration.

7. **The format string is SQL, not only a TypeScript enum.** Blank drafts are filtered with `content->>'format'` (`letters.ts:95`). Migration `0005_placed_signatures.sql` special-cases `thanksio:postcard-6x9` and hard-codes letter and postcard inches. A slug change that forgets the filter will hide or show the wrong drafts. Historical migrations are already applied; they do not need rewriting. The next migration does, if it rewrites `format`.

8. **There is no catalog table, vendor-product table, or price.** The only provider is the string `"thanksio"` on each spec. Routing a finished piece to the cheapest vendor cannot be done from this data. `proofOutputs` snapshots `output` onto the render job (`letters.service.ts:364-371`, `packages/types/src/asset.ts:13-19`). That snapshot is the seam a vendor choice would later fill. The editor does not choose a vendor.

9. **Assets are a wider table than the sketch, and letters are not assets.** `packages/db/src/drizzle/schema/assets.ts:22-46` has `id`, `organization_id`, `storage_key`, `uploaded_by_user_id`, and also mime type, byte size, checksum, source (`uploaded` or `generated`), purpose, filename, job, and processing status. Fonts and drawings are their own tables (`fonts.ts`, `drawings.ts`) and point at asset ids. Letter JSON points at font ids, drawing ids, and a front-image asset id. Calum's "alongside `assets`" matches the file bytes. It does not match letters, fonts, or drawings, which are not rows in `assets`.

10. **The letter product is windowless, and its zones are barcodes.** The key is `thanksio:letter-windowless`. There is no address-window product. His examples of a vendor QR, a window, and a postcard address box are three different reserved areas. v2 has the barcode pair and the postcard address block only.

11. **`notecard` has nowhere to land in the copy.** `UNTITLED` in `letters.service.ts:32-35` and `KEEP_CLEAR_COPY` are exhaustive over `"letter" | "postcard"`. Adding the kind to the union without those maps is a type error, which is the right failure. The editor still needs a title and keep-clear copy for the new kind.

12. **Postcard numbers are still marked unconfirmed against a Thanks.io print.** `PLAN.md:2219` says the 6 × 9 address block, bleed, and safe values may not match what Thanks.io prints, and that each value is one entry in `PAGE_SPECS`. `PLAN.md:24` says the Thanks.io rules are read safely until Thanks.io confirms. The canvas-includes-bleed convention is written in `PLAN.md:464` and `ARCHITECTURE.md:225`. It has not been confirmed by a test print in this repo.

13. **Units.** A catalog configuration in millimetres has to be converted once, at the boundary, into the inch `PageSpec` the editor already measures. Letter JSON (`xIn`, `yIn`, `widthIn`, `heightIn`) should stay in inches. Mixing millimetre fields into `LetterContent` would break every placed element and the measure.

14. **`schemaVersion` does not need to move for a format alias.** It is the literal `1` (`parse-letter.ts:110`). Old documents keep parsing if the parser still accepts their format string. Bumping the version and rejecting version 1 would refuse every stored letter.

## 3. Field mapping

v2's coordinate origin is the top-left of the canvas, y downward, bleed included in the canvas (`ARCHITECTURE.md:223-225`). His origin is unconfirmed. His sample rectangle ends on the right and bottom edges (`65.28 + 87.12 = 152.4`, `38.78 + 62.82 = 101.6`), which is the bottom-right block if his origin matches v2.

| `PageSpec` / related | Current letter | Current postcard | Where it belongs |
| --- | --- | --- | --- |
| `product` | `"letter"` | `"postcard"` | Catalog `kind`. v2 has no `"notecard"`. |
| `label` | `"Letter"` | `"Postcard 6 × 9"` | Catalog `name`. The picker also builds a description in `products.ts:10-14` from `front` and `maxPages`. His `description` can hold that sentence. It does not replace `front`. |
| `widthIn`, `heightIn` | 8.5 × 11 in (215.9 × 279.4 mm). `2550/300` by `3300/300`. | 9.1267 × 6.1267 in (231.82 × 155.62 mm). `2738/300` by `1838/300`. | Catalog `dimensions`, after the bleed question. In v2 these are the full canvas. Letter bleed in the numbers is 0, because the canvas is exactly US Letter. Postcard trim, if the 19 px per edge in `PLAN.md:464` is right, is 9 × 6 in (228.6 × 152.4 mm). His sample dimensions are 6 × 4 in, a different product. |
| bleed | No field. Treated as included in the canvas. | 19 px at 300 dpi = 1.61 mm per edge, and only inside the `safeIn` expression `(19 + 42) / 300`. | Catalog `printRequirements.bleedMm`, if dimensions are trim. If dimensions are the canvas, bleed is already inside `widthMm` / `heightMm` and a second bleed double-counts. Unconfirmed for his type. |
| `safeIn` | `50/300` in = 4.23 mm from the canvas edge. | `61/300` in = 5.16 mm from the canvas edge, described as 19 px bleed + 42 px safe (3.56 mm inside the trim). | Catalog `printRequirements.safeMarginMm` only after the edge it is measured from is agreed. His sample uses 6.35 mm, which is 0.25 in, and does not equal either v2 value. |
| `marginIn` | 0.75 in = 19.05 mm. Text inset. | 0.375 in = 9.525 mm. Text inset. | Not on his configuration. This is the inset the text column uses. It is not `safeMarginMm`. It has to live on the catalog product (or on a studio layout beside it) because both vendors of one kind would share it. |
| `dpi` | 300, unread. | 300, unread. | Vendor product, once the renderer stops using `PRINT_DPI`. Until then it is a constant of the proof pipeline. |
| `output` | `"pdf"` | `"png"` (one file per side, `maxPages` of them). | Vendor product. Thanks.io is why the postcard is PNG (`PLAN.md:1941`). Another vendor could take PDF for the same catalog kind. The render job already stores the chosen `PrintOutput`. |
| `duplex` | `true` | `true` | Split. "Which sides exist" is catalog `layout.printedSides`. "Pad an odd PDF with a blank back" is a vendor print behaviour (`playwright-print-renderer.ts:69`). A front-only letter is `printedSides: ["front"]` and `duplex: false`. v2's letter is neither. |
| `maxPages` | 3 | 2 | Catalog layout, as `printedSides.length × maxSheets`, for products where that product equals the cap. The letter's 3 does not. See §1, claim 5. |
| `providerMaxPages` | 12 | 2 | Vendor product. It is the physical cap. `maxPages` is the cap this deployment offers, and it may be lower. |
| `front` | `"writing"` | `"image"` | Not on his configuration. Required for the postcard cover, `minSides` of a new postcard (`letters.service.ts:57`), and which side the text column starts on (`geometry.ts:33-35`). This is a property of the catalog kind, shared by vendors. |
| `keepClear` | Two zones on side 0: top-right `135/300` × `140/300` in (11.43 × 11.85 mm); bottom-left `200/300` × `260/300` in (16.93 × 22.01 mm). | One zone on side 1, bottom-right, `1193/300` × `923/300` in (101.01 × 78.15 mm), origin at 130.81 mm, 77.47 mm on the canvas. | Catalog `reservedAreas`, as free rectangles, plus a side and a sheet list. v2 can represent only the corner-flush case, and only as a flat side index. His `label` replaces `KEEP_CLEAR_COPY` once zones on one product can mean different things. A vendor QR that is not on every vendor belongs on the vendor product, not the catalog kind. A window and the postcard address box are catalog rules if every vendor must leave them. Unconfirmed which of his three examples is which. |
| `provider` and the format key | `thanksio`, `thanksio:letter-windowless` | `thanksio`, `thanksio:postcard-6x9` | Vendor product id, linked to a catalog kind. The letter document should store the catalog slug, not this key. Today it stores this key. |
| `id`, `slug`, `status` | Absent. The key is the id. | Absent. | Catalog product. The editor should load `active` only. `draft` and `inactive` must not become choices in the picker. There is no such status in v2. |

`PlacedElement.side` and `KeepClearZone.side` are 0-based flat indexes (`ARCHITECTURE.md:223`). They are not `sheets[]` plus `"front" | "back"`.

## 4. Plan

Project Post merges auto-deploy to production. A step that will move there has to keep old letters readable, and a rollback of that deploy has to keep letters written by the new code readable. The way to get that is expand, then backfill, then contract, in separate deploys. Deleting an accepted format string and rewriting jsonb in the same deploy is not reversible.

Do not start with `pageSpecFrom` and a slug swap together.

`pageSpecFrom` as proposed cannot build today's letter or postcard. It would have to invent `front`, `marginIn`, `dpi`, `output`, and `providerMaxPages`, choose a rounding rule for the letter's 3 sides, and reject any reserved rectangle that is not flush with a corner. `LetterPage` looks up `PAGE_SPECS[content.format]` internally (`letter-page.tsx:201`), so a new slug is invisible to the renderer until that lookup changes. The editor is not untouched.

The steps below are independently shippable. Each leaves the two current products printing as they do now. Steps 1 and 2 can land before Calum answers. Steps 3 and later wait on the questions in §5.

### Step 1. Project today's specs into a catalog-shaped value, in code only

Add a pure function that reads a `PageSpec` and returns his configuration fields where the mapping in §3 is defined, plus an explicit list of the fields that have no slot (`front`, `marginIn`, `dpi`, `output`, `provider`, `providerMaxPages`, and keep-clear zones that are not corner-flush). Do not add `pageSpecFrom` in this step. A lossy adapter would hide the gap.

Scope: a new module under `packages/types` or `packages/render`, called from tests only. `ARCHITECTURE.md` names the file. No editor, parser, or worker change.

Risk: none at runtime. Rollback is deleting the file.

Tests: one case per current `PAGE_SPECS` entry. Assert the letter's side count is not `printedSides.length × maxSheets` for any reading that treats duplex as both sides. Assert the postcard canvas and the 19 px bleed note stay distinguishable. Assert both letter zones and the postcard zone round-trip as rectangles with a corner, and that a rectangle inset from every edge is reported as not representable.

### Step 2. Let geometry consume a rectangle, and keep the corner data

Teach `pageExclusions` to take the rectangle from `keepClearRect` and to choose the float side from which half of the text column the rectangle occupies. Keep `KeepClearZone` as the stored shape for this step, so the two products do not change. Add a stable id only if two zones on one side would share a corner; they do not today.

Scope: `packages/render/src/html/geometry.ts`, `geometry.test.ts`. Guides and `letter-page.tsx` can keep using `corner` until a real free rectangle exists.

Risk: the postcard address block and the letter barcodes could float the other way if the half-column rule disagrees with `corner.endsWith("left")`. Both current zones are corner-flush, so the existing geometry tests are the regression net. Rollback is the function.

Tests: the current `geometry.test.ts` cases stay. Add one fixture rectangle that is not on a corner and assert its float side and its intersection with the safe rectangle. Do not change `PAGE_SPECS`.

### Step 3. Resolve the open questions, then add missing product fields to the in-code catalogue

After §5 is answered, extend the in-code configuration so a round trip of both current products is exact. Likely additions on the catalog side are `front` and a text margin. Likely vendor-product fields, still constants beside the catalog entry, are `output`, `providerMaxPages`, and the blank-back rule. Convert millimetres at this boundary and keep `PageSpec` in inches.

Still no database table, and no change to `LetterContent.format`.

Scope: `packages/types/src/page.ts`, the projection from step 1, `page.test.ts`, `ARCHITECTURE.md`.

Risk: low while nothing reads the new object except tests. A wrong bleed convention written into `widthIn` would change a proof, so this step must not recompute the two existing canvases. It records them. Rollback is the type.

Tests: round-trip both entries to equal the current `PageSpec`, including keep-clear rectangles. A notecard or a 6 × 4 postcard is a later data entry (step 6), not part of this step, because the numbers are unconfirmed and a new picker card can be saved by a creator as soon as the id exists.

### Step 4. One lookup, still backed by the constant

Replace `PAGE_SPECS[content.format]` with one function, `pageSpecFor(format)`, that returns the same object. This is the mechanical edit, and it is safe only because the key type does not change.

Scope: the readers in §1.3, excluding OpenAPI and the historical SQL migration. `LetterPage` should take the spec from that function once.

Risk: a missed call site. TypeScript catches a key that is no longer assignable to `PageFormatId`. It does not catch a hand-built format string in SQL. Rollback is the lookup.

Tests: the existing unit, service, worker, and e2e suites. No new behaviour, so a new test that `pageSpecFor` returns the identical spec for both ids is enough on top.

### Step 5. Accept a catalog slug as an alias, and keep writing the vendor key

Expand the parser and the OpenAPI enum so a slug and the vendor key resolve to the same `PageSpec`. New letters still persist the vendor key. Old letters keep parsing. The blank-draft filter stays on the key that is actually written.

Scope: `page.ts`, `parse-letter.ts`, `packages/api/openapi.yaml`, the generated `packages/api/src/gen/api.ts`, `parse-letter.test.ts`, `ARCHITECTURE.md`.

Risk: two names for one product, if a later step writes the slug and forgets the blank-draft list. This step does not write the slug, which is what makes it reversible. A rollback that removes the slug from the enum is safe because no row stores it.

Tests: `parseLetterContent` accepts the slug and returns the same document it would for the vendor key. Create-letter still stores the vendor key. A slug that matches no product is refused.

### Step 6. New sizes are new catalogue entries, after the numbers are confirmed

A 6 × 4 postcard and a notecard are additional `PAGE_SPECS` entries, which is the extension `PLAN.md:24` already describes for 4 × 6 and 6 × 11. They need `UNTITLED`, `KEEP_CLEAR_COPY`, an OpenAPI enum value, and picker coverage. They ship only when width, height, bleed, safe inset, text inset, sides, and reserved areas are confirmed. Shipping a guessed 6 × 4 into an auto-deployed picker lets creators save letters on a wrong canvas.

Scope: `page.ts`, `letters.service.ts`, `keep-clear-guides.tsx`, `openapi.yaml`, generated client, `products.test.ts`, `parse-letter.test.ts`.

Risk: a wrong canvas in a proof. Mitigation is confirmed numbers, and leaving the new id out until then. Rollback before anyone saves that format is removing the enum value. After someone saves it, the id has to stay acceptable to the parser (step 5's rule).

Tests: the new entry round-trips through step 3's projection. `minSides`, front image, and keep-clear behaviour follow the same tests the postcard already has.

### Step 7. Write the slug, then backfill, then consider dropping the vendor key

Three deploys, in order.

1. New letters persist the catalog slug. The parser still accepts the vendor key. Blank-draft filters include both strings for each product. Rollback still reads both.
2. An idempotent data migration rewrites `content->>'format'` from the vendor key to the slug. It updates only the known keys. It does not touch titles or geometry.
3. Removing the vendor key from the enum waits until a rollback of the app no longer needs to read old rows that were not backfilled. Keeping the alias forever is safer than step 3, and it costs a branch in `pageSpecFor`. Prefer keeping it.

Scope: `letters.service.ts` `newLetterContent`, `packages/db` migration, blank-draft keys, parser tests.

Risk: a reader deployed between the backfill and a rollback that has forgotten the slug will refuse every new letter. That is why the alias lands in step 5, before any row changes. The backfill is reversible by the inverse map, which is one-to-one only while each catalog product has a single vendor key. Do not run the backfill after a second vendor exists for the same slug, or the inverse map is no longer a function.

Tests: a fixture row with the old key and a fixture row with the slug both parse. The migration test runs twice and changes a row once.

### Step 8. Database catalog, with the constant as fallback

Only once Project Post has the table, and only behind `pageSpecFor`. The editor loads one resolved spec with the letter, not on each keystroke. A missing, `draft`, or `inactive` product fails closed for new letters. Known slugs fall back to the constant if the table read fails, so a bad deploy does not blank the editor. `dpi`, `output`, and `providerMaxPages` come from the vendor product at export time and are already snapshotted onto the job as `output`. Cheapest-vendor routing is a Project Post change at that snapshot. It is not an editor rewrite.

Scope: `pageSpecFor`'s implementation, the letter load, export in `letters.service.ts`. The renderer keeps taking a `PageSpec`.

Risk: the editor depending on a table it does not own. The fallback is the reversibility. Do not delete `PAGE_SPECS` in the same deploy as the table read.

Tests: active product renders, inactive product is not in the picker, a failed read of a known slug matches the constant, an unknown slug is refused.

### Step 9. Human Seal, after the ladder is written down

Do this apart from the page-spec work. Wait until Karla or Anya retire decision 10 and name the sentences.

If the ladder matches `FontSource["kind"]` and `DrawingSource["kind"]`, the change is the function, `sealRecord`, a drawing-source map on the letter read, and `letter.test.ts`. No migration.

If the ladder needs paper versus pen as its own fact, add the field with a default taken from `source.kind`, and do not pretend mixed pen and mouse strokes are one thing. The checkbox stays a gate unless product wants it stored. Today it would be true for every upload row, so a column adds nothing those rows do not already say.

Risk: creators see a different sentence under letters that already exist. The code rollback restores the old sentence because nothing was stored. The copy should be agreed first so the deploy is not the first time the sentence exists.

Tests: stock font still yields `null` for text. Each own-font source yields the sentence product named. A photo doodle and a drawn doodle follow the drawing rule. A signature follows the signature rule. Existing `letter.test.ts` cases that expect "Written in Karla's own handwriting" for an own font stay or change in the same commit as the decision, not before.

### What not to ship

- A database catalog, a slug backfill, and a renderer rewrite in one deploy.
- `pageSpecFrom` that fills `front` or `marginIn` with a guessed constant.
- A notecard or 6 × 4 entry whose millimetres are copied from the sample before the bleed question is answered.
- Vendor routing in the editor. The job's `output` is the hook.

## 5. Questions

### Answered from this code

- **v2 side indexes are 0-based.** The first side is 0. The postcard back is 1. `ARCHITECTURE.md:223`. Letter barcodes are stored on side 0. `PLAN.md:24` calls that "side 1".
- **v2 canvases include bleed, by the plan's own rule** (`PLAN.md:464`, `ARCHITECTURE.md:225`). The letter canvas equals US Letter, so the included bleed is 0 in the numbers. The postcard canvas is 38 px larger than 9 × 6 in, and the plan calls 19 px of that the bleed inside `safeIn`. A Thanks.io test print has not confirmed those values (`PLAN.md:2219`).
- **v2 letters are not front-only.** They are duplex, up to 3 sides, with a blank PDF page when the count is odd, and with reserved areas on side 0 only.
- **`front` and the text margin live on `PageSpec` today.** They have no field on `CatalogProductConfiguration`.
- **His sample `sheets: [1]` with `maxSheets: 1` does not fit a 0-based sheet index.** Sheet 1 would be out of range if the only legal indexes were `0 .. maxSheets - 1`. It does fit a 1-based index. That is a reading of his example, not a statement he recorded in this repo.
- **The sample postcard is not the v2 postcard.** 152.4 × 101.6 mm is 6 × 4 in. v2 is a 6 × 9 in trim with bleed on the canvas, and there is no 4 × 6 entry yet.
- **There is no cheapest-vendor path here.** One provider string, no prices.

### Only Calum, or Karla and Anya, can answer

1. Are `sheets` 0-based or 1-based? The sample uses `[1]` on a one-sheet product. The meeting was heard as both "sheet one" and "zero" for the back. v2 cannot settle his meaning.
2. Are `dimensions` the trim, with `bleedMm` added outside, or the full canvas? v2's written convention is the full canvas. Using both conventions at once double-counts the postcard bleed.
3. Is his coordinate origin the top-left, with y downward? The sample rectangle is consistent with that. He did not say it.
4. Where do `front: "image" | "writing"` and the text margin live? They are required by the editor. They are shared by every vendor of a kind, so a vendor product is the wrong table if two vendors print the same postcard.
5. Are Project Post letters front-only? v2's are not. If his rows are front-only, the catalog letter is a different product from `thanksio:letter-windowless`, and existing v2 letters cannot be retargeted by renaming the slug.
6. Is the letter's cap of 3 sides an editorial limit we keep, or does the catalog's `printedSides × maxSheets` replace it? What is `providerMaxPages` (12) in his model?
7. Which reserved areas are catalog rules (every vendor leaves them clear) and which are vendor marks (a QR code only Thanks.io prints)?
8. May placed images cross the safe margin, and may the postcard cover remain full bleed? v2 forbids the first and does the second.
9. Does the Human Seal ladder demote every typed font, including one built from the creator's own drawn glyphs, or only stock fonts and uploaded files? Decision 10 currently says an upload counts as "Written in {name}'s own handwriting". Who retires that sentence, and what is the new sentence for each of `drawn`, `template-photo`, `upload`, photo doodle, and drawn doodle?
10. Is a notecard in the editor's first slice, and is the 6 × 4 sample a product we will offer beside 6 × 9?
