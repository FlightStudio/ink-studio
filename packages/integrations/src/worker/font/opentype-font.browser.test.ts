import { startTestBrowser, type TestBrowsers } from "@repo/testing/browser";
import type { BrowserContext } from "playwright-core";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildFont, type GlyphOutline, UNITS_PER_EM } from "./opentype-font.ts";

type Engine = "chromium" | "webkit";
type VariantSet = "ss01" | "ss02" | "ss03";

const ENGINES: Engine[] = ["chromium", "webkit"];
const PRINT_SCALE = 300 / 96;
const FONT_SIZE_PX = 100;
const FAMILY = "variant-test";

function glyph(
	char: string,
	variant: number,
	advanceWidth: number,
): GlyphOutline {
	return {
		char,
		variant,
		advanceWidth,
		contours: [
			[
				["M", 40, 0],
				["L", advanceWidth - 40, 0],
				["L", advanceWidth - 40, 500],
				["L", 40, 500],
				["L", 40, 0],
			],
		],
	};
}

const fontBase64 = Buffer.from(
	buildFont({
		familyName: "Variant Test",
		ascender: 800,
		descender: -200,
		glyphs: [
			glyph("a", 0, 500),
			glyph("a", 1, 600),
			glyph("a", 2, 700),
			glyph("b", 0, 400),
			glyph("c", 0, 450),
			glyph("c", 1, 550),
		],
	}),
).toString("base64");

let browsers: TestBrowsers | undefined;
const contexts = new Map<Engine, BrowserContext>();

beforeAll(async () => {
	browsers = await startTestBrowser();
	for (const engine of ENGINES) {
		contexts.set(
			engine,
			await browsers[engine].newContext({
				deviceScaleFactor: PRINT_SCALE,
				viewport: { width: 1200, height: 600 },
			}),
		);
	}
});

afterAll(async () => {
	for (const context of contexts.values()) await context.close();
	await browsers?.stop();
});

async function advances(
	engine: Engine,
	set: VariantSet,
	text: string,
): Promise<number[]> {
	const context = contexts.get(engine);
	if (!context) throw new Error(`No context for ${engine}`);
	const page = await context.newPage();
	try {
		await page.setContent(
			`<!doctype html><html><head><meta charset="utf-8"><style>@font-face { font-family: "${FAMILY}"; src: url(data:font/otf;base64,${fontBase64}); font-display: block; } #line { font-family: "${FAMILY}"; font-size: ${FONT_SIZE_PX}px; font-feature-settings: "${set}" 1; white-space: pre; }</style></head><body style="margin: 0"><span id="line">${text}</span></body></html>`,
		);
		const widths = await page.evaluate(async (family) => {
			await document.fonts.load(`16px "${family}"`);
			await document.fonts.ready;
			const face = [...document.fonts].find(
				(item) => item.family.replaceAll('"', "") === family,
			);
			if (face?.status !== "loaded") {
				throw new Error(`The test font did not load: ${face?.status}`);
			}
			const node = document.getElementById("line")?.firstChild;
			if (!node) throw new Error("No text to measure");
			const range = document.createRange();
			range.setStart(node, 0);
			const result: number[] = [];
			let before = 0;
			for (
				let index = 1;
				index <= (node.textContent ?? "").length;
				index += 1
			) {
				range.setEnd(node, index);
				const after = range.getBoundingClientRect().width;
				result.push(after - before);
				before = after;
			}
			return result;
		}, FAMILY);
		const units = widths.map((width) =>
			Math.round((width / FONT_SIZE_PX) * UNITS_PER_EM),
		);
		console.log(
			`${engine} ${set} ${text}: ${units.join(", ")} units (${widths.map((width) => width.toFixed(3)).join(", ")} px)`,
		);
		return units;
	} finally {
		await page.close();
	}
}

describe.each(ENGINES)("%s at the print device scale factor", (engine) => {
	test("ss01 cycles from the default", async () => {
		expect(await advances(engine, "ss01", "aaaa")).toEqual([
			500, 600, 700, 500,
		]);
	});

	test("ss02 starts one step later", async () => {
		expect(await advances(engine, "ss02", "aaaa")).toEqual([
			600, 700, 500, 600,
		]);
	});

	test("ss03 starts two steps later", async () => {
		expect(await advances(engine, "ss03", "aaaa")).toEqual([
			700, 500, 600, 700,
		]);
	});

	test("a letter without variants is untouched", async () => {
		for (const set of ["ss01", "ss02", "ss03"] as const) {
			expect(await advances(engine, set, "bbbb")).toEqual([400, 400, 400, 400]);
		}
	});

	test("a letter with two variants cycles in twos", async () => {
		expect(await advances(engine, "ss01", "cccc")).toEqual([
			450, 550, 450, 550,
		]);
		expect(await advances(engine, "ss02", "cccc")).toEqual([
			550, 450, 550, 450,
		]);
	});
});
