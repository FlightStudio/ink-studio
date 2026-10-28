import type { Stroke } from "./stroke.ts";

export type DrawnGlyph = {
	char: string;
	variant: number;
	strokes: Stroke[];
};

const VARIANTS = {
	a: 3,
	e: 3,
	n: 3,
	o: 3,
	t: 3,
	d: 2,
	h: 2,
	i: 2,
	l: 2,
	r: 2,
	s: 2,
} as const satisfies Record<string, 2 | 3>;

const REQUIRED_PUNCTUATION = [".", ",", "!", "?", "'"] as const;

const PUNCTUATION = [
	...REQUIRED_PUNCTUATION,
	'"',
	":",
	";",
	"-",
	"(",
	")",
	"/",
	"&",
	"@",
	"#",
	"*",
] as const;

function glyph(
	char: string,
	required: boolean,
): { char: string; variants: 1 | 2 | 3; required: boolean } {
	return {
		char,
		variants: VARIANTS[char as keyof typeof VARIANTS] ?? 1,
		required,
	};
}

export const HANDWRITING_GLYPHS = [
	...[..."abcdefghijklmnopqrstuvwxyz"].map((char) => glyph(char, true)),
	...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((char) => glyph(char, false)),
	...[..."0123456789"].map((char) => glyph(char, false)),
	...PUNCTUATION.map((char) =>
		glyph(char, (REQUIRED_PUNCTUATION as readonly string[]).includes(char)),
	),
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

export function missingChars(glyphs: readonly DrawnGlyph[]): string[] {
	const drawn = new Set<string>();
	for (const glyph of glyphs) {
		if (glyph.strokes.length > 0) drawn.add(glyph.char);
	}
	return HANDWRITING_GLYPHS.filter(
		(entry) => entry.required && !drawn.has(entry.char),
	).map((entry) => entry.char);
}
