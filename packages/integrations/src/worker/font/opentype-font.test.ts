import opentype from "opentype.js";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import {
	type BuildFontParams,
	buildFont,
	type GlyphOutline,
	OpentypeFontBuilder,
	type OutlineGlyph,
} from "./opentype-font.ts";

type ParsedFont = ReturnType<typeof opentype.parse>;

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
				["M", 50, 0],
				["L", advanceWidth - 50, 0],
				["Q", advanceWidth, 250, advanceWidth - 50, 500],
				["C", 300, 600, 200, 600, 50, 500],
				["L", 50, 0],
			],
		],
	};
}

const params: BuildFontParams = {
	familyName: "Test Hand",
	ascender: 800,
	descender: -200,
	glyphs: [
		glyph("a", 0, 500),
		glyph("b", 0, 400),
		glyph("a", 1, 600),
		glyph("c", 0, 450),
		glyph("a", 2, 700),
		glyph("c", 1, 550),
	],
};

function parse(bytes: Uint8Array): ParsedFont {
	return opentype.parse(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	);
}

function nameAt(font: ParsedFont, index: number): string {
	return font.glyphs.get(index).name ?? "";
}

function glyphNames(font: ParsedFont): string[] {
	const names: string[] = [];
	for (let index = 0; index < font.glyphs.length; index += 1) {
		names.push(nameAt(font, index));
	}
	return names;
}

function cmapNames(font: ParsedFont): Record<string, string> {
	const map: Record<string, string> = {};
	for (const [code, index] of Object.entries(
		font.tables.cmap?.glyphIndexMap as Record<string, number>,
	)) {
		map[String.fromCodePoint(Number(code))] = nameAt(font, index);
	}
	return map;
}

function tables(font: ParsedFont) {
	const advances: Record<string, number> = {};
	for (let index = 0; index < font.glyphs.length; index += 1) {
		advances[nameAt(font, index)] = font.glyphs.get(index).advanceWidth ?? 0;
	}
	return {
		cmap: cmapNames(font),
		names: glyphNames(font),
		advances,
		lookups: font.tables.gsub?.lookups as unknown,
	};
}

describe("buildFont", () => {
	test("a built font reads back with every glyph mapped", () => {
		const font = parse(
			buildFont({
				...params,
				glyphs: [glyph("a", 0, 500), glyph("b", 0, 400), glyph("a", 1, 600)],
			}),
		);
		const cmap = cmapNames(font);
		expect(cmap.a).toBe("a");
		expect(cmap.b).toBe("b");
		expect(Object.values(cmap)).not.toContain("a.alt1");
		expect(glyphNames(font)).toEqual(
			expect.arrayContaining(["a", "b", "a.alt1"]),
		);
	});

	test("two builds of one input parse to the same tables", () => {
		const first = tables(parse(buildFont(params)));
		const second = tables(parse(buildFont(params)));
		expect(first.lookups).toBeDefined();
		expect(second).toEqual(first);
	});
});

function rectangle(
	x: number,
	y: number,
	width: number,
	height: number,
	winding: "cw" | "ccw" = "cw",
): [number, number][] {
	const points: [number, number][] = [
		[x, y],
		[x + width, y],
		[x + width, y + height],
		[x, y + height],
	];
	return winding === "cw" ? points : [...points].reverse();
}

async function builtGlyph(glyphs: OutlineGlyph[]) {
	const built = await new OpentypeFontBuilder().fromStrokeOutlines({
		familyName: "Stroke Hand",
		glyphs,
	});
	return { built, font: parse(built.bytes) };
}

describe("fromStrokeOutlines", () => {
	test("a polygon from the ascender line to the baseline makes a glyph that tall", async () => {
		const { font } = await builtGlyph([
			{
				char: "I",
				variant: 0,
				polygons: [rectangle(100, 150, 40, 600)],
			},
		]);
		const box = font.charToGlyph("I").getBoundingBox();
		expect(box.y1).toBeCloseTo(0, 0);
		expect(box.y2).toBeCloseTo(600, 0);
	});

	test("the advance is the ink width plus both side bearings", async () => {
		const { font } = await builtGlyph([
			{
				char: "m",
				variant: 0,
				polygons: [rectangle(0, 400, 200, 100)],
			},
		]);
		expect(font.charToGlyph("m").advanceWidth).toBe(320);
	});

	test("an empty cell makes no glyph, and space exists", async () => {
		const { built, font } = await builtGlyph([
			{ char: "a", variant: 0, polygons: [] },
			{
				char: "b",
				variant: 0,
				polygons: [
					[
						[0, 0],
						[1, 0],
					],
				],
			},
		]);
		expect(built.chars).toBe("");
		expect(glyphNames(font)).toContain("space");
		expect(font.charToGlyph("a").name).toBe(".notdef");
		expect(font.charToGlyph("b").name).toBe(".notdef");
	});

	test("variants become alternates", async () => {
		const { font } = await builtGlyph(
			[0, 1, 2].map((variant) => ({
				char: "e",
				variant,
				polygons: [rectangle(80, 400, 40, 80)],
			})),
		);
		expect(glyphNames(font)).toEqual(
			expect.arrayContaining(["e", "e.alt1", "e.alt2"]),
		);
	});

	test("overlapping polygons fill as one shape", async () => {
		const { font } = await builtGlyph([
			{
				char: "x",
				variant: 0,
				polygons: [
					rectangle(200, 300, 300, 300, "cw"),
					rectangle(350, 150, 300, 300, "ccw"),
				],
			},
		]);
		const size = 1000;
		const baseline = 800;
		const path = font.charToGlyph("x").getPath(0, baseline, size);
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${path.toSVG(2)}</svg>`;
		const { data, info } = await sharp(Buffer.from(svg))
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const alpha = (x: number, y: number) =>
			data[(Math.round(y) * info.width + Math.round(x)) * info.channels + 3] ??
			0;
		expect(alpha(285, 425)).toBeGreaterThan(200);
		expect(alpha(135, 575)).toBeGreaterThan(200);
		expect(alpha(435, 275)).toBeGreaterThan(200);
		expect(alpha(20, 20)).toBeLessThan(20);
	});
});

const UNITS = 2048;

function letterGlyph(
	char: string,
	advanceWidth: number,
	draw: (path: opentype.Path) => void,
): opentype.Glyph {
	const path = new opentype.Path();
	draw(path);
	return new opentype.Glyph({
		name: char,
		unicode: char.codePointAt(0),
		advanceWidth,
		path,
	});
}

function uploadBytes(options: {
	familyName?: string;
	glyphs?: opentype.Glyph[];
	lowercase?: boolean;
}): Uint8Array {
	const glyphs = [
		new opentype.Glyph({
			name: ".notdef",
			advanceWidth: UNITS / 2,
			path: new opentype.Path(),
		}),
		...(options.glyphs ?? []),
	];
	if (options.lowercase !== false) {
		for (const char of "abcdefghijklmnopqrstuvwxyz") {
			if (glyphs.some((glyph) => glyph.name === char)) continue;
			glyphs.push(
				letterGlyph(char, 400, (path) => {
					path.moveTo(0, 0);
					path.lineTo(100, 0);
				}),
			);
		}
	}
	const font = new opentype.Font({
		familyName: options.familyName ?? "Uploaded",
		styleName: "Regular",
		unitsPerEm: UNITS,
		ascender: 1600,
		descender: -400,
		glyphs,
	});
	return new Uint8Array(font.toArrayBuffer());
}

function parsedUpload(bytes: Uint8Array) {
	return opentype.parse(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	);
}

describe("fromUpload", () => {
	test("an uploaded font is rebuilt at 1000 units with scaled advances", async () => {
		const file = uploadBytes({
			glyphs: [
				letterGlyph("a", 520, (path) => {
					path.moveTo(0, 0);
					path.lineTo(200, 0);
				}),
				letterGlyph("b", 610, (path) => {
					path.moveTo(0, 0);
					path.lineTo(200, 0);
				}),
			],
		});
		const built = await new OpentypeFontBuilder().fromUpload({
			familyName: "own-test",
			file,
		});
		const font = parsedUpload(built.bytes);
		expect(font.charToGlyph("a").advanceWidth).toBe(254);
		expect(font.charToGlyph("b").advanceWidth).toBe(298);
	});

	test("curves survive the rebuild", async () => {
		const file = uploadBytes({
			glyphs: [
				letterGlyph("a", 800, (path) => {
					path.moveTo(0, 0);
					path.bezierCurveTo(512, 1024, 1024, 1536, 2048, 512);
				}),
			],
		});
		const built = await new OpentypeFontBuilder().fromUpload({
			familyName: "own-test",
			file,
		});
		const cubic = parsedUpload(built.bytes)
			.charToGlyph("a")
			.path.commands.find((command) => command.type === "C");
		expect(cubic).toMatchObject({
			type: "C",
			x1: 250,
			y1: 500,
			x2: 500,
			y2: 750,
			x: 1000,
			y: 250,
		});
	});

	test("nothing from the upload's name table survives", async () => {
		const file = uploadBytes({ familyName: "ACME Secret Foundry" });
		const built = await new OpentypeFontBuilder().fromUpload({
			familyName: "own-test",
			file,
		});
		expect(Buffer.from(built.bytes).includes("ACME Secret Foundry")).toBe(
			false,
		);
		expect(parsedUpload(built.bytes).getEnglishName("fontFamily")).toBe(
			"own-test",
		);
	});

	test("truncated bytes are refused", async () => {
		const file = uploadBytes({});
		await expect(
			new OpentypeFontBuilder().fromUpload({
				familyName: "own-test",
				file: file.subarray(0, 32),
			}),
		).rejects.toMatchObject({ code: "font_unreadable" });
	});

	test("a font without lowercase letters is refused", async () => {
		const file = uploadBytes({
			lowercase: false,
			glyphs: [
				letterGlyph("A", 600, (path) => {
					path.moveTo(0, 0);
					path.lineTo(100, 400);
				}),
			],
		});
		await expect(
			new OpentypeFontBuilder().fromUpload({ familyName: "own-test", file }),
		).rejects.toMatchObject({ code: "font_missing_glyphs" });
	});

	test("a glyph with too many points is refused", async () => {
		const file = uploadBytes({
			glyphs: [
				letterGlyph("a", 500, (path) => {
					path.moveTo(0, 0);
					for (let index = 0; index < 2001; index += 1) {
						path.lineTo(index, index);
					}
				}),
			],
		});
		await expect(
			new OpentypeFontBuilder().fromUpload({ familyName: "own-test", file }),
		).rejects.toMatchObject({ code: "font_unreadable" });
	});

	test("a parse that runs too long is stopped", async () => {
		const before = process
			.getActiveResourcesInfo()
			.filter((name) => name === "Worker").length;
		const file = uploadBytes({});
		await expect(
			new OpentypeFontBuilder({
				thread: {
					url: new URL("./parse-thread.ts", import.meta.url),
					execArgv: ["--import", "tsx"],
				},
				parseTimeoutMs: 1,
				parseMaxMemoryMb: 256,
			}).fromUpload({ familyName: "own-test", file }),
		).rejects.toMatchObject({ code: "font_timeout" });
		expect(
			process.getActiveResourcesInfo().filter((name) => name === "Worker")
				.length,
		).toBe(before);
	});
});
