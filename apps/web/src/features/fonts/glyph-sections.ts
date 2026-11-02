import type { DrawnGlyph } from "@repo/types";
import { HANDWRITING_GLYPHS, missingChars } from "@repo/types";
import { cellKey } from "./glyph-history.ts";

export type GlyphSlot = {
	key: string;
	char: string;
	variant: number;
	label: string;
};

export type GlyphSectionId = "needed" | "natural" | "capitals" | "punctuation";

export type GlyphSection = { id: GlyphSectionId; slots: GlyphSlot[] };

const CAPITALS_AND_NUMBERS = /^[A-Z0-9]$/;

export function glyphLabel(char: string, variant: number): string {
	return variant === 0 ? char : `${char}·${variant + 1}`;
}

function slot(char: string, variant: number): GlyphSlot {
	return {
		key: cellKey(char, variant),
		char,
		variant,
		label: glyphLabel(char, variant),
	};
}

const NEEDED = HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
	(entry) => slot(entry.char, 0),
);

const NATURAL = HANDWRITING_GLYPHS.flatMap((entry) =>
	Array.from({ length: entry.variants - 1 }, (_, index) =>
		slot(entry.char, index + 1),
	),
);

const CAPITALS = HANDWRITING_GLYPHS.filter(
	(entry) => !entry.required && CAPITALS_AND_NUMBERS.test(entry.char),
).map((entry) => slot(entry.char, 0));

const PUNCTUATION = HANDWRITING_GLYPHS.filter(
	(entry) => !entry.required && !CAPITALS_AND_NUMBERS.test(entry.char),
).map((entry) => slot(entry.char, 0));

export function glyphSections(glyphs: readonly DrawnGlyph[]): GlyphSection[] {
	const natural =
		missingChars(glyphs).length === 0 ||
		glyphs.some((glyph) => glyph.variant > 0 && glyph.strokes.length > 0);
	return [
		{ id: "needed", slots: NEEDED },
		...(natural ? [{ id: "natural" as const, slots: NATURAL }] : []),
		{ id: "capitals", slots: CAPITALS },
		{ id: "punctuation", slots: PUNCTUATION },
	];
}

export function slotFor(char: string): string | null {
	return HANDWRITING_GLYPHS.some((entry) => entry.char === char)
		? cellKey(char, 0)
		: null;
}

export function startSlot(
	glyphs: readonly DrawnGlyph[],
	glyph: string | null,
): string | null {
	const asked = glyph === null ? null : slotFor(glyph);
	if (asked) return asked;
	const [first] = missingChars(glyphs);
	return first === undefined ? null : cellKey(first, 0);
}
