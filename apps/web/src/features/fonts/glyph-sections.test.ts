import type { DrawnGlyph, Stroke } from "@repo/types";
import { HANDWRITING_GLYPHS } from "@repo/types";
import { describe, expect, test } from "vitest";
import {
	glyphLabel,
	glyphSections,
	slotFor,
	startSlot,
} from "./glyph-sections.ts";

const ink: Stroke[] = [{ input: "pen", points: [[1, 2, 0.5, 0]] }];

function drawn(chars: Iterable<string>, variant = 0): DrawnGlyph[] {
	return [...chars].map((char) => ({ char, variant, strokes: ink }));
}

const required = HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
	(entry) => entry.char,
);

function ids(glyphs: DrawnGlyph[]) {
	return glyphSections(glyphs).map((section) => section.id);
}

describe("glyphSections", () => {
	test("the needed section is every required character, in catalogue order", () => {
		const [needed] = glyphSections([]);
		expect(needed?.id).toBe("needed");
		expect(needed?.slots.map((slot) => slot.char)).toEqual(required);
		expect(needed?.slots.every((slot) => slot.variant === 0)).toBe(true);
	});

	test("capitals and numbers come next, then the other punctuation", () => {
		const [, capitals, punctuation] = glyphSections([]);
		expect(capitals?.id).toBe("capitals");
		expect(capitals?.slots.map((slot) => slot.char).join("")).toBe(
			"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
		);
		expect(punctuation?.id).toBe("punctuation");
		expect(punctuation?.slots.map((slot) => slot.char).join("")).toBe(
			'":;-()/&@#*',
		);
	});

	test("the natural section waits until every needed letter is drawn", () => {
		expect(ids([])).toEqual(["needed", "capitals", "punctuation"]);
		expect(ids(drawn(required))).toEqual([
			"needed",
			"natural",
			"capitals",
			"punctuation",
		]);
	});

	test("the natural section stays once a second version is drawn", () => {
		expect(ids(drawn("e", 1))).toContain("natural");
	});

	test("the natural section asks for every extra version of the common letters", () => {
		const natural = glyphSections(drawn(required)).find(
			(section) => section.id === "natural",
		);
		const expected = HANDWRITING_GLYPHS.flatMap((entry) =>
			Array.from({ length: entry.variants - 1 }, (_, index) => ({
				char: entry.char,
				variant: index + 1,
			})),
		);
		expect(
			natural?.slots.map((slot) => ({
				char: slot.char,
				variant: slot.variant,
			})),
		).toEqual(expected);
		expect(natural?.slots.find((slot) => slot.key === "a:2")?.label).toBe(
			"a·3",
		);
	});

	test("a first version is labelled with the character alone", () => {
		const [needed] = glyphSections([]);
		expect(needed?.slots[0]).toEqual({
			key: "a:0",
			char: "a",
			variant: 0,
			label: "a",
		});
	});
});

describe("startSlot", () => {
	test("opens at the first needed letter still blank", () => {
		expect(startSlot(drawn("abc"), null)).toBe("d:0");
	});

	test("a glyph asked for wins", () => {
		expect(startSlot(drawn("abc"), "S")).toBe("S:0");
	});

	test("an unknown glyph falls back to the first blank letter", () => {
		expect(startSlot([], "€")).toBe("a:0");
	});

	test("with every needed letter drawn there is nowhere to jump", () => {
		expect(startSlot(drawn(required), null)).toBeNull();
	});
});

describe("slotFor", () => {
	test("finds the first version of a catalogue character", () => {
		expect(slotFor("?")).toBe("?:0");
		expect(slotFor("é")).toBeNull();
	});
});

describe("glyphLabel", () => {
	test("the first version is the character, later ones are numbered", () => {
		expect(glyphLabel("a", 0)).toBe("a");
		expect(glyphLabel("a", 1)).toBe("a·2");
		expect(glyphLabel("a", 2)).toBe("a·3");
	});
});
