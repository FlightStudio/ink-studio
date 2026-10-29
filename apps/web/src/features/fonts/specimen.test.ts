import { strokeOutline } from "@repo/render/html";
import type { DrawnGlyph, Stroke } from "@repo/types";
import { CELL, GLYPH_LIMITS } from "@repo/types";
import { describe, expect, test } from "vitest";
import { SIDE_BEARING, SPECIMEN_TEXT, specimenWords } from "./specimen.ts";

function line(from: number, to: number): Stroke {
	return {
		input: "pen",
		points: [
			[from, 500, 0.5, 0],
			[to, 700, 0.5, 10],
		],
	};
}

function glyph(char: string, variant: number, strokes: Stroke[]): DrawnGlyph {
	return { char, variant, strokes };
}

describe("specimenWords", () => {
	test("the specimen invites the writer to connect", () => {
		expect(SPECIMEN_TEXT).toBe(
			"Connect with your community through your writing",
		);
	});

	test("undrawn characters fall back to the stock hand", () => {
		expect(specimenWords("hi", [])).toEqual([
			[
				{ char: "h", kind: "stock" },
				{ char: "i", kind: "stock" },
			],
		]);
	});

	test("a drawn character is its own ink, as wide as the ink plus side bearings", () => {
		const stroke = line(300, 600);
		const [word] = specimenWords("a", [glyph("a", 0, [stroke])]);
		const xs = strokeOutline(stroke, CELL.strokeScale).map((point) => point[0]);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		expect(word?.[0]).toMatchObject({
			char: "a",
			kind: "ink",
			left: minX - SIDE_BEARING,
			advance: maxX - minX + SIDE_BEARING * 2,
		});
		expect(word?.[0]?.kind === "ink" && word[0].paths).toHaveLength(1);
	});

	test("words split at spaces so they wrap whole", () => {
		const words = specimenWords("ab c", [glyph("a", 0, [line(1, 2)])]);
		expect(words.map((word) => word.map((each) => each.char).join(""))).toEqual(
			["ab", "c"],
		);
	});

	test("a repeated letter cycles through its drawn versions", () => {
		const glyphs = [
			glyph("e", 2, [line(500, 900)]),
			glyph("e", 0, [line(100, 200)]),
			glyph("e", 1, []),
		];
		const [word] = specimenWords("eee", glyphs);
		const lefts = word?.map((each) => (each.kind === "ink" ? each.left : null));
		expect(lefts?.[0]).toBe(lefts?.[2]);
		expect(lefts?.[0]).not.toBe(lefts?.[1]);
		expect(lefts?.[0]).toBeLessThan(lefts?.[1] ?? 0);
	});

	test("a cleared cell counts as undrawn", () => {
		expect(specimenWords("a", [glyph("a", 0, [])])).toEqual([
			[{ char: "a", kind: "stock" }],
		]);
	});

	test("a glyph as dense as the limits allow still has its width", () => {
		const scribble: Stroke[] = Array.from(
			{ length: GLYPH_LIMITS.strokes },
			(_, stroke) => ({
				input: "pen",
				points: Array.from(
					{ length: GLYPH_LIMITS.pointsPerStroke },
					(_, index): [number, number, number, number] => [
						300 + ((index * 37 + stroke * 11) % 400),
						300 + ((index * 53 + stroke * 7) % 500),
						0.5,
						index,
					],
				),
			}),
		);
		const [word] = specimenWords("a", [glyph("a", 0, scribble)]);
		const shape = word?.[0];
		expect(shape?.kind).toBe("ink");
		expect(shape?.kind === "ink" && shape.paths).toHaveLength(
			GLYPH_LIMITS.strokes,
		);
		expect(shape?.kind === "ink" && shape.advance).toBeGreaterThan(400);
	});
});
