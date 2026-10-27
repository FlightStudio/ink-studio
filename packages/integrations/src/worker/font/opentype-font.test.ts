import opentype from "opentype.js";
import { describe, expect, test } from "vitest";
import {
	type BuildFontParams,
	buildFont,
	type GlyphOutline,
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
