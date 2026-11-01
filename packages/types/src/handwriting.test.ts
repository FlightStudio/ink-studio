import { describe, expect, it } from "vitest";
import {
	GLYPH_ALIASES,
	HANDWRITING_GLYPHS,
	HANDWRITING_TEMPLATE,
	missingChars,
	missingLowercase,
	withAliases,
} from "./handwriting.ts";
import type { Stroke } from "./stroke.ts";

const stroke: Stroke = {
	input: "pen",
	points: [[100, 100, 0.5, 0]],
};

function drawnOnce() {
	return HANDWRITING_GLYPHS.filter((glyph) => glyph.required).map((glyph) => ({
		char: glyph.char,
		variant: 0,
		strokes: glyph.char === "x" ? [] : [stroke],
	}));
}

describe("missingChars", () => {
	it("variants beyond the first are optional", () => {
		const glyphs = HANDWRITING_GLYPHS.filter((glyph) => glyph.required).map(
			(glyph) => ({
				char: glyph.char,
				variant: 0,
				strokes: [stroke],
			}),
		);
		expect(missingChars(glyphs)).toEqual([]);
	});

	it("a cell with no strokes does not count", () => {
		expect(missingChars(drawnOnce())).toEqual(["x"]);
	});

	it("a to z is complete, and sentence marks are optional like the hyphen", () => {
		const letters = [..."abcdefghijklmnopqrstuvwxyz"].map((char) => ({
			char,
			variant: 0,
			strokes: [stroke],
		}));
		expect(missingChars(letters)).toEqual([]);
		expect(missingChars(letters.filter((glyph) => glyph.char !== "z"))).toEqual(
			["z"],
		);
		const missing = missingChars([]);
		for (const char of [".", ",", "!", "?", "'", "-"]) {
			expect(missing).not.toContain(char);
		}
	});
});

describe("missingLowercase", () => {
	it("names each lowercase letter a font's characters lack", () => {
		expect(missingLowercase("abcdefghijklmnoprstuvwxy.ABC")).toEqual([
			"q",
			"z",
		]);
		expect(missingLowercase("abcdefghijklmnopqrstuvwxyz")).toEqual([]);
	});
});

describe("withAliases", () => {
	it("the straight quotes bring their curly ones", () => {
		expect(GLYPH_ALIASES["'"]).toEqual(["\u2019", "\u2018"]);
		expect(GLYPH_ALIASES['"']).toEqual(["\u201C", "\u201D"]);
		expect(withAliases(["a", "'", "b", '"'])).toBe(
			"a'b\"\u2019\u2018\u201C\u201D",
		);
	});

	it("a font without straight quotes gains nothing, and nothing repeats", () => {
		expect(withAliases(["a", "b"])).toBe("ab");
		expect(withAliases(["'", "\u2019"])).toBe("'\u2019\u2018");
	});
});

describe("HANDWRITING_GLYPHS", () => {
	it("holds the 94 glyphs of the handwriting template", () => {
		expect(
			HANDWRITING_GLYPHS.reduce((sum, glyph) => sum + glyph.variants, 0),
		).toBe(94);
		const variants = Object.fromEntries(
			HANDWRITING_GLYPHS.map((glyph) => [glyph.char, glyph.variants]),
		);
		expect(variants.a).toBe(3);
		expect(variants.e).toBe(3);
		expect(variants.t).toBe(3);
		expect(variants.o).toBe(3);
		expect(variants.n).toBe(3);
		for (const char of ["i", "s", "r", "h", "l", "d"]) {
			expect(variants[char]).toBe(2);
		}
		expect(variants.b).toBe(1);
		expect(variants.A).toBe(1);
		expect(variants["0"]).toBe(1);
		expect(variants["."]).toBe(1);
		expect(variants["/"]).toBe(1);
		expect(
			HANDWRITING_GLYPHS.filter((glyph) => glyph.required).map(
				(glyph) => glyph.char,
			),
		).toEqual([..."abcdefghijklmnopqrstuvwxyz"]);
		expect(new Set(HANDWRITING_GLYPHS.map((glyph) => glyph.char)).size).toBe(
			HANDWRITING_GLYPHS.length,
		);
	});

	it("the glyphs fit the template grid", () => {
		const cells = HANDWRITING_GLYPHS.reduce(
			(sum, glyph) => sum + glyph.variants,
			0,
		);
		expect(cells).toBeLessThanOrEqual(
			HANDWRITING_TEMPLATE.grid.columns * HANDWRITING_TEMPLATE.grid.rows,
		);
	});
});
