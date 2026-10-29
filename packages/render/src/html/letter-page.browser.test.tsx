import { readFile } from "node:fs/promises";
import { startTestBrowser, type TestBrowsers } from "@repo/testing/browser";
import type {
	LetterContent,
	LetterResources,
	PageSpec,
	PlacedElement,
	StockFontId,
} from "@repo/types";
import { PAGE_SPECS, STOCK_FONTS } from "@repo/types";
import type { BrowserContext, Page, Route } from "playwright-core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	fixtureContent,
	LETTER_FIXTURES,
	letterFixture,
} from "./fixtures/index.ts";
import {
	boundsOf,
	columnBox,
	type Exclusion,
	exclusionFloats,
	overflowIn,
	pageExclusions,
	type Rect,
	sidesUsed,
	sideTopIn,
} from "./geometry.ts";
import {
	LetterPage,
	measureInputFor,
	pageGapIn,
	variantFeatureSettings,
} from "./letter-page.tsx";
import { LetterText } from "./letter-print.tsx";
import { type LetterMeasure, measureLetter } from "./measure.ts";

type Engine = "chromium" | "webkit";
type Mode = "edit" | "print";
type LoadParams = { content: LetterContent; mode: Mode; wrapperScale?: number };

const ENGINES: Engine[] = ["chromium", "webkit"];
const SCALES = [1, 300 / 96];
const MODES: Mode[] = ["edit", "print"];
const EPSILON_IN = 0.005;
const LETTER_ID = "0190a8d6-5c1e-7b3a-9f00-000000000001";
const FONTS_DIR = new URL("../../fonts/", import.meta.url);

const resources: LetterResources = {
	assetBaseUrl: "https://letter.invalid/assets/",
	stockFontBaseUrl: "https://letter.invalid/stock/",
	fonts: {},
	drawings: {},
	frontImageAssetId: null,
};

let browsers: TestBrowsers | undefined;
const contexts = new Map<string, BrowserContext>();
const fontBytes = new Map<string, Buffer>();

function resourcesFor(content: LetterContent): LetterResources {
	const drawings = { ...resources.drawings };
	for (const element of content.doc.attrs.elements) {
		drawings[element.drawingId] ??= {
			maskAssetId: element.drawingId,
			aspect: element.widthIn / element.heightIn,
		};
	}
	return { ...resources, drawings };
}

function contextFor(engine: Engine, scale: number): BrowserContext {
	const context = contexts.get(`${engine}@${scale}`);
	if (!context) throw new Error(`No context for ${engine} at ${scale}`);
	return context;
}

async function serveFont(route: Route): Promise<void> {
	const id = new URL(route.request().url()).pathname.replace("/stock/", "");
	if (!Object.hasOwn(STOCK_FONTS, id)) return route.abort();
	const file = STOCK_FONTS[id as StockFontId].file;
	const body =
		fontBytes.get(file) ?? (await readFile(new URL(file, FONTS_DIR)));
	fontBytes.set(file, body);
	await route.fulfill({
		status: 200,
		contentType: "font/ttf",
		headers: { "Access-Control-Allow-Origin": "*" },
		body,
	});
}

beforeAll(async () => {
	browsers = await startTestBrowser();
	for (const engine of ENGINES) {
		for (const scale of SCALES) {
			const context = await browsers[engine].newContext({
				deviceScaleFactor: scale,
				viewport: { width: 1200, height: 900 },
			});
			await context.route("https://letter.invalid/**", serveFont);
			contexts.set(`${engine}@${scale}`, context);
		}
	}
});

afterAll(async () => {
	for (const context of contexts.values()) await context.close();
	await browsers?.stop();
});

async function load(
	context: BrowserContext,
	params: LoadParams,
): Promise<Page> {
	const spec = PAGE_SPECS[params.content.format];
	const markup = renderToStaticMarkup(
		<LetterPage
			letterId={LETTER_ID}
			content={params.content}
			resources={resourcesFor(params.content)}
			mode={params.mode}
			mergeValues={null}
			sheets={spec.maxPages}
			flow={<LetterText doc={params.content.doc} />}
		/>,
	);
	const body =
		params.wrapperScale === undefined
			? markup
			: `<div style="transform: scale(${params.wrapperScale}); transform-origin: 0 0">${markup}</div>`;
	const page = await context.newPage();
	await page.setContent(
		`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin: 0">${body}</body></html>`,
	);
	const loaded = await page.evaluate(async () => {
		await Promise.all([...document.fonts].map((face) => face.load()));
		await document.fonts.ready;
		return [...document.fonts]
			.filter((face) => face.status === "loaded")
			.map((face) => face.family.replaceAll('"', ""));
	});
	expect(loaded).toContain("stock-caveat");
	return page;
}

async function withPage<T>(
	context: BrowserContext,
	params: LoadParams,
	run: (page: Page) => Promise<T>,
): Promise<T> {
	const page = await load(context, params);
	try {
		return await run(page);
	} finally {
		await page.close();
	}
}

function measure(
	page: Page,
	spec: PageSpec,
	mode: Mode,
): Promise<LetterMeasure> {
	return page
		.locator(".letter-column")
		.evaluate(measureLetter, measureInputFor(spec, mode));
}

function wordBoxes(page: Page): Promise<Rect[]> {
	return page.locator(".letter-column").evaluate((root: HTMLElement) => {
		const origin = root.getBoundingClientRect();
		const pxPerIn = (origin.height / root.offsetHeight) * 96;
		const boxes: Rect[] = [];
		const range = document.createRange();
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (
			let node = walker.nextNode();
			node !== null;
			node = walker.nextNode()
		) {
			for (const match of (node.textContent ?? "").matchAll(/\S+/gu)) {
				range.setStart(node, match.index);
				range.setEnd(node, match.index + match[0].length);
				for (const rect of range.getClientRects()) {
					if (rect.width === 0 || rect.height === 0) continue;
					boxes.push({
						xIn: (rect.left - origin.left) / pxPerIn,
						yIn: (rect.top - origin.top) / pxPerIn,
						widthIn: rect.width / pxPerIn,
						heightIn: rect.height / pxPerIn,
					});
				}
			}
		}
		return boxes;
	});
}

function overlaps(a: Rect, b: Rect): boolean {
	return (
		a.xIn < b.xIn + b.widthIn - EPSILON_IN &&
		b.xIn < a.xIn + a.widthIn - EPSILON_IN &&
		a.yIn < b.yIn + b.heightIn - EPSILON_IN &&
		b.yIn < a.yIn + a.heightIn - EPSILON_IN
	);
}

function beside(box: Rect, exclusion: Rect): boolean {
	return (
		box.yIn < exclusion.yIn + exclusion.heightIn &&
		exclusion.yIn < box.yIn + box.heightIn
	);
}

const DOODLE_ID = "0190a8d6-5c1e-7b3a-9f00-0000000000d1";

function doodleLetter(wrap: boolean): LetterContent {
	const content = fixtureContent(letterFixture("one-side"));
	const element: PlacedElement = {
		id: DOODLE_ID,
		kind: "drawing",
		drawingId: DOODLE_ID,
		side: 0,
		xIn: 1.2,
		yIn: 2,
		widthIn: 2,
		heightIn: 1.5,
		rotationDeg: 0,
		tint: "ink-blue",
		wrap,
	};
	content.doc.attrs.elements = [element];
	return content;
}

function columnFootprint(
	spec: PageSpec,
	element: PlacedElement,
	mode: Mode,
): Rect {
	const bounds = boundsOf(element);
	return {
		xIn: bounds.xIn - spec.marginIn,
		yIn:
			bounds.yIn -
			spec.marginIn +
			sideTopIn(spec, element.side, pageGapIn(mode)),
		widthIn: bounds.widthIn,
		heightIn: bounds.heightIn,
	};
}

function bandsOf(spec: PageSpec, mode: Mode): Exclusion[] {
	return pageExclusions(spec, pageGapIn(mode)).filter(
		(exclusion) => exclusion.wrap === "both",
	);
}

async function replaceFloats(
	page: Page,
	spec: PageSpec,
	mode: Mode,
	exclusions: Exclusion[],
): Promise<void> {
	const gapIn = pageGapIn(mode);
	const markup = exclusionFloats(columnBox(spec, gapIn), exclusions)
		.map(
			(box) =>
				`<div class="letter-float" style="float: ${box.float}; clear: ${box.clear}; width: ${box.widthIn}in; height: ${box.heightIn}in"></div>`,
		)
		.join("");
	await page.locator(".letter-column").evaluate((column, html) => {
		for (const node of column.querySelectorAll(":scope > .letter-float")) {
			node.remove();
		}
		column.insertAdjacentHTML("afterbegin", html);
	}, markup);
}

async function clickAt(page: Page, xIn: number, yIn: number): Promise<void> {
	const point = await page.locator(".letter-column").evaluate(
		(root: HTMLElement, at: { xIn: number; yIn: number }) => {
			const pxPerIn =
				(root.getBoundingClientRect().height / root.offsetHeight) * 96;
			const before = root.getBoundingClientRect();
			window.scrollTo(
				0,
				before.top + window.scrollY + at.yIn * pxPerIn - window.innerHeight / 2,
			);
			const origin = root.getBoundingClientRect();
			return {
				x: origin.left + at.xIn * pxPerIn,
				y: origin.top + at.yIn * pxPerIn,
			};
		},
		{ xIn, yIn },
	);
	await page.mouse.click(point.x, point.y);
}

function caretTopIn(page: Page): Promise<number | null> {
	return page.locator(".letter-column").evaluate((root: HTMLElement) => {
		const selection = window.getSelection();
		const node = selection?.focusNode;
		if (!selection || !node) return null;
		const range = document.createRange();
		if (node.nodeType === Node.TEXT_NODE) {
			const length = node.textContent?.length ?? 0;
			const start = Math.min(selection.focusOffset, Math.max(0, length - 1));
			range.setStart(node, start);
			range.setEnd(node, Math.min(length, start + 1));
		} else {
			range.selectNode(node.childNodes[selection.focusOffset] ?? node);
		}
		const rect = range.getClientRects()[0];
		if (!rect) return null;
		const origin = root.getBoundingClientRect();
		const pxPerIn = (origin.height / root.offsetHeight) * 96;
		return (rect.top - origin.top) / pxPerIn;
	});
}

async function makeEditable(page: Page): Promise<void> {
	await page
		.locator(".letter-text")
		.evaluate((root) => root.setAttribute("contenteditable", "true"));
}

describe.each(ENGINES)("%s", (engine) => {
	describe.each(SCALES)("at device scale factor %d", (scale) => {
		const context = () => contextFor(engine, scale);

		test("no line box falls inside a band", async () => {
			const content = fixtureContent(letterFixture("nearly-full"));
			const spec = PAGE_SPECS[content.format];
			for (const mode of MODES) {
				const boxes = await withPage(context(), { content, mode }, wordBoxes);
				const bands = bandsOf(spec, mode);
				const lastSeam = bands.at(-2);
				expect(bands).toHaveLength(spec.maxPages);
				expect(boxes.some((box) => lastSeam && box.yIn > lastSeam.yIn)).toBe(
					true,
				);
				expect(
					boxes.filter((box) => bands.some((band) => overlaps(box, band))),
				).toEqual([]);
			}
		});

		test("no line enters the postcard's address block", async () => {
			const content = fixtureContent(letterFixture("postcard-back"));
			const spec = PAGE_SPECS[content.format];
			for (const mode of MODES) {
				const boxes = await withPage(context(), { content, mode }, wordBoxes);
				const blocks = pageExclusions(spec, pageGapIn(mode)).filter(
					(exclusion) => exclusion.wrap !== "both",
				);
				expect(blocks).toHaveLength(1);
				for (const block of blocks) {
					expect(boxes.some((box) => beside(box, block))).toBe(true);
					expect(boxes.filter((box) => overlaps(box, block))).toEqual([]);
				}
			}
		});

		test("no line crosses a right-side exclusion while the bands hold", async () => {
			const content = fixtureContent(letterFixture("nearly-full"));
			const spec = PAGE_SPECS[content.format];
			for (const mode of MODES) {
				const gapIn = pageGapIn(mode);
				const column = columnBox(spec, gapIn);
				const extra: Exclusion = {
					xIn: column.widthIn - 2,
					yIn: 3,
					widthIn: 2,
					heightIn: 2,
					wrap: "right",
				};
				const boxes = await withPage(
					context(),
					{ content, mode },
					async (page) => {
						await replaceFloats(page, spec, mode, [
							...pageExclusions(spec, gapIn),
							extra,
						]);
						return wordBoxes(page);
					},
				);
				const bands = bandsOf(spec, mode);
				expect(boxes.some((box) => beside(box, extra))).toBe(true);
				expect(
					boxes.filter(
						(box) =>
							overlaps(box, extra) || bands.some((band) => overlaps(box, band)),
					),
				).toEqual([]);
			}
		});

		test("left and right exclusions that overlap vertically both hold", async () => {
			const content = fixtureContent(letterFixture("nearly-full"));
			const spec = PAGE_SPECS[content.format];
			for (const mode of MODES) {
				const gapIn = pageGapIn(mode);
				const column = columnBox(spec, gapIn);
				const left: Exclusion = {
					xIn: 0,
					yIn: 2,
					widthIn: 1.5,
					heightIn: 2,
					wrap: "left",
				};
				const right: Exclusion = {
					xIn: column.widthIn - 2,
					yIn: 3,
					widthIn: 2,
					heightIn: 2,
					wrap: "right",
				};
				const boxes = await withPage(
					context(),
					{ content, mode },
					async (page) => {
						await replaceFloats(page, spec, mode, [
							...pageExclusions(spec, gapIn),
							left,
							right,
						]);
						return wordBoxes(page);
					},
				);
				expect(boxes.some((box) => beside(box, left))).toBe(true);
				expect(boxes.some((box) => beside(box, right))).toBe(true);
				expect(
					boxes.filter((box) => overlaps(box, left) || overlaps(box, right)),
				).toEqual([]);
			}
		});

		test("no line crosses a wrapping doodle's footprint", async () => {
			const content = doodleLetter(true);
			const spec = PAGE_SPECS[content.format];
			const element = content.doc.attrs.elements[0];
			if (!element) throw new Error("the fixture has no doodle");
			for (const mode of MODES) {
				const footprint = columnFootprint(spec, element, mode);
				const boxes = await withPage(context(), { content, mode }, wordBoxes);
				expect(boxes.some((box) => beside(box, footprint))).toBe(true);
				expect(boxes.filter((box) => overlaps(box, footprint))).toEqual([]);
			}
		});

		test("a doodle that does not wrap floats over the text", async () => {
			const content = doodleLetter(false);
			const spec = PAGE_SPECS[content.format];
			const element = content.doc.attrs.elements[0];
			if (!element) throw new Error("the fixture has no doodle");
			for (const mode of MODES) {
				const footprint = columnFootprint(spec, element, mode);
				const boxes = await withPage(context(), { content, mode }, wordBoxes);
				expect(boxes.some((box) => overlaps(box, footprint))).toBe(true);
			}
		});

		test("an empty paragraph keeps one line of height", async () => {
			const content = fixtureContent(letterFixture("blank-lines"));
			for (const mode of MODES) {
				const gaps = await withPage(context(), { content, mode }, (page) =>
					page.locator(".letter-text").evaluate((root) => {
						const paragraphs = [...root.querySelectorAll("p")];
						const range = document.createRange();
						const lineTops = (paragraph: Element) => {
							range.selectNodeContents(paragraph);
							return [...range.getClientRects()]
								.filter((rect) => rect.height > 0)
								.map((rect) => rect.top);
						};
						const results: { gapPx: number; lineHeightPx: number }[] = [];
						for (let index = 0; index + 2 < paragraphs.length; index += 1) {
							const [before, empty, after] = paragraphs.slice(index, index + 3);
							if (!before || !empty || !after) continue;
							if (before.textContent === "" || after.textContent === "")
								continue;
							if (empty.textContent !== "") continue;
							const beforeTop = Math.max(...lineTops(before));
							const afterTop = Math.min(...lineTops(after));
							results.push({
								gapPx: afterTop - beforeTop,
								lineHeightPx: Number.parseFloat(
									getComputedStyle(empty).lineHeight,
								),
							});
						}
						return results;
					}),
				);
				expect(gaps.length).toBeGreaterThan(0);
				for (const gap of gaps) {
					expect(gap.gapPx / 96).toBeCloseTo((2 * gap.lineHeightPx) / 96, 2);
				}
			}
		});

		test("each fixture uses the sides it was written for", async () => {
			for (const fixture of LETTER_FIXTURES) {
				const content = fixtureContent(fixture);
				const spec = PAGE_SPECS[content.format];
				for (const mode of MODES) {
					const measured = await withPage(
						context(),
						{ content, mode },
						(page) => measure(page, spec, mode),
					);
					const sides = sidesUsed(spec, {
						textBottomIn: measured.textBottomIn,
						boxes: [],
						minSides: content.doc.attrs.minSides,
					});
					expect(sides, `${fixture.name} in ${mode}`).toBe(fixture.sides);
				}
			}
		});

		test("overflow is reported", async () => {
			const overflow = fixtureContent(letterFixture("overflow"));
			const full = fixtureContent(letterFixture("nearly-full"));
			const spec = PAGE_SPECS[overflow.format];
			for (const mode of MODES) {
				const past = await withPage(
					context(),
					{ content: overflow, mode },
					(page) => measure(page, spec, mode),
				);
				const within = await withPage(
					context(),
					{ content: full, mode },
					(page) => measure(page, spec, mode),
				);
				expect(
					overflowIn(spec, { textBottomIn: past.textBottomIn }),
				).toBeGreaterThan(0);
				expect(past.wordsPastLimit).toBeGreaterThan(0);
				expect(overflowIn(spec, { textBottomIn: within.textBottomIn })).toBe(0);
				expect(within.wordsPastLimit).toBe(0);
			}
		});

		test("text past the last side starts in the text area of the sheet after it", async () => {
			const content = fixtureContent(letterFixture("overflow"));
			const spec = PAGE_SPECS[content.format];
			for (const mode of MODES) {
				const boxes = await withPage(context(), { content, mode }, wordBoxes);
				const trailing = bandsOf(spec, mode).at(-1);
				if (!trailing) throw new Error("the letter has no bands");
				expect(trailing.yIn + trailing.heightIn).toBeCloseTo(
					sideTopIn(spec, spec.maxPages, pageGapIn(mode)),
				);
				expect(boxes.some((box) => box.yIn >= trailing.yIn)).toBe(true);
				expect(boxes.filter((box) => overlaps(box, trailing))).toEqual([]);
			}
		});

		test("an overflowing letter measures the same while editing and in print", async () => {
			const content = fixtureContent(letterFixture("overflow"));
			const spec = PAGE_SPECS[content.format];
			const [edit, print] = await Promise.all(
				MODES.map((mode) =>
					withPage(context(), { content, mode }, (page) =>
						measure(page, spec, mode),
					),
				),
			);
			expect(edit?.wordsPastLimit).toBe(print?.wordsPastLimit);
			expect(
				Math.abs((edit?.textBottomIn ?? 0) - (print?.textBottomIn ?? 1)),
			).toBeLessThan(0.01);
		});

		test("the settle animation leaves a turned doodle turned, while editing and in print", async () => {
			const content = doodleLetter(false);
			const element = content.doc.attrs.elements[0];
			if (!element) throw new Error("the fixture has no doodle");
			const turned = { ...element, rotationDeg: 40 };
			content.doc.attrs.elements = [turned];
			const expected = boundsOf(turned);
			for (const mode of MODES) {
				const drawn = await withPage(context(), { content, mode }, (page) =>
					page.locator(".letter-element").evaluate(async (node) => {
						await Promise.all(
							node.getAnimations().map((animation) => animation.finished),
						);
						const rect = node.getBoundingClientRect();
						return { widthIn: rect.width / 96, heightIn: rect.height / 96 };
					}),
				);
				expect(drawn.widthIn, mode).toBeCloseTo(expected.widthIn, 2);
				expect(drawn.heightIn, mode).toBeCloseTo(expected.heightIn, 2);
			}
		});

		test("keep-clear zones are marked only while editing", async () => {
			const content = fixtureContent(letterFixture("note"));
			const counts = async (mode: Mode) =>
				withPage(context(), { content, mode }, async (page) => ({
					all: await page.locator("[data-keep-clear]").count(),
					firstSide: await page
						.locator('[data-keep-clear][data-side="0"]')
						.count(),
				}));
			expect(await counts("edit")).toEqual({ all: 2, firstSide: 2 });
			expect(await counts("print")).toEqual({ all: 0, firstSide: 0 });
		});

		test("the measure ignores the page's scale", async () => {
			const content = fixtureContent(letterFixture("nearly-full"));
			const spec = PAGE_SPECS[content.format];
			for (const mode of MODES) {
				const plain = await withPage(context(), { content, mode }, (page) =>
					measure(page, spec, mode),
				);
				const scaled = await withPage(
					context(),
					{ content, mode, wrapperScale: 1.25 },
					(page) => measure(page, spec, mode),
				);
				expect(scaled.lineTopsIn).toHaveLength(plain.lineTopsIn.length);
				expect(plain.lineTopsIn.length).toBeGreaterThan(0);
				for (const [index, top] of plain.lineTopsIn.entries()) {
					expect(
						Math.abs((scaled.lineTopsIn[index] ?? Number.NaN) - top),
					).toBeLessThan(0.01);
				}
				expect(Math.abs(scaled.textBottomIn - plain.textBottomIn)).toBeLessThan(
					0.01,
				);
			}
		});

		test("empty space is clickable text", async () => {
			const content = fixtureContent(letterFixture("note"));
			const spec = PAGE_SPECS[content.format];
			const column = columnBox(spec, pageGapIn("edit"));
			const result = await withPage(
				context(),
				{ content, mode: "edit" },
				async (page) => {
					await makeEditable(page);
					const boxes = await wordBoxes(page);
					const firstTop = Math.min(...boxes.map((box) => box.yIn));
					const firstLine = boxes.filter(
						(box) => Math.abs(box.yIn - firstTop) < EPSILON_IN,
					);
					const lineRight = Math.max(
						...firstLine.map((box) => box.xIn + box.widthIn),
					);
					const lineHeight = Math.max(...firstLine.map((box) => box.heightIn));
					await clickAt(page, column.widthIn - 0.25, firstTop + lineHeight / 2);
					return { firstTop, lineRight, caret: await caretTopIn(page) };
				},
			);
			expect(result.lineRight).toBeLessThan(column.widthIn - 1);
			expect(result.caret).not.toBeNull();
			expect(
				Math.abs((result.caret ?? Number.NaN) - result.firstTop),
			).toBeLessThan(0.05);
		});

		test("the variant set reaches the text in the editable root and the static root", async () => {
			const note = fixtureContent(letterFixture("note"));
			const content: LetterContent = {
				...note,
				doc: {
					...note.doc,
					content: [
						{
							type: "paragraph",
							attrs: { align: "left" },
							content: [
								{
									type: "text",
									text: "Dear Alex,",
									marks: [
										{
											type: "ink",
											attrs: { font: null, sizePt: 24, color: "sepia" },
										},
									],
								},
							],
						},
					],
				},
			};
			const tag = variantFeatureSettings(LETTER_ID).split(" ")[0] ?? "";
			const settingsOf = (page: Page) =>
				page
					.locator(".letter-text span")
					.first()
					.evaluate((span) => getComputedStyle(span).fontFeatureSettings);
			const editable = await withPage(
				context(),
				{ content, mode: "edit" },
				async (page) => {
					await makeEditable(page);
					return settingsOf(page);
				},
			);
			const fixed = await withPage(
				context(),
				{ content, mode: "print" },
				settingsOf,
			);
			expect(tag).toMatch(/^"ss0[123]"$/u);
			expect(editable).toContain(tag);
			expect(fixed).toContain(tag);
		});

		test("the caret crosses a band", async () => {
			const content = fixtureContent(letterFixture("nearly-full"));
			const spec = PAGE_SPECS[content.format];
			const [band] = bandsOf(spec, "edit");
			if (!band) throw new Error("The letter has no band");
			const result = await withPage(
				context(),
				{ content, mode: "edit" },
				async (page) => {
					await makeEditable(page);
					const boxes = await wordBoxes(page);
					const above = boxes.filter(
						(box) => box.yIn + box.heightIn <= band.yIn,
					);
					const lastTop = Math.max(...above.map((box) => box.yIn));
					const last = above.find((box) => box.yIn === lastTop);
					if (!last) throw new Error("No line above the band");
					await clickAt(
						page,
						last.xIn + last.widthIn / 2,
						last.yIn + last.heightIn / 2,
					);
					const before = await caretTopIn(page);
					await page.keyboard.press("ArrowDown");
					return { before, after: await caretTopIn(page) };
				},
			);
			const bandBottom = band.yIn + band.heightIn;
			expect(result.before).not.toBeNull();
			expect(result.before ?? Number.NaN).toBeLessThan(band.yIn);
			expect(result.after ?? Number.NaN).toBeGreaterThanOrEqual(
				bandBottom - EPSILON_IN,
			);
		});
	});
});

describe("across engines", () => {
	test("Chromium and WebKit agree on sides used for every fixture", async () => {
		const rows: {
			fixture: string;
			mode: Mode;
			scale: number;
			lines: Record<Engine, number>;
			sides: Record<Engine, number>;
		}[] = [];
		for (const fixture of LETTER_FIXTURES) {
			const content = fixtureContent(fixture);
			const spec = PAGE_SPECS[content.format];
			for (const scale of SCALES) {
				for (const mode of MODES) {
					const lines = { chromium: 0, webkit: 0 };
					const sides = { chromium: 0, webkit: 0 };
					for (const engine of ENGINES) {
						const measured = await withPage(
							contextFor(engine, scale),
							{ content, mode },
							(page) => measure(page, spec, mode),
						);
						lines[engine] = measured.lineTopsIn.length;
						sides[engine] = sidesUsed(spec, {
							textBottomIn: measured.textBottomIn,
							boxes: [],
							minSides: content.doc.attrs.minSides,
						});
					}
					rows.push({ fixture: fixture.name, mode, scale, lines, sides });
				}
			}
		}
		for (const row of rows) {
			console.log(
				`${row.fixture} ${row.mode} @${row.scale.toFixed(3)}: chromium ${row.lines.chromium} lines ${row.sides.chromium} sides, webkit ${row.lines.webkit} lines ${row.sides.webkit} sides`,
			);
		}
		for (const row of rows) {
			expect(row.sides.webkit, `${row.fixture} ${row.mode} @${row.scale}`).toBe(
				row.sides.chromium,
			);
		}
	}, 600_000);
});
