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

export const LOWERCASE_LETTERS = [..."abcdefghijklmnopqrstuvwxyz"] as const;

const REQUIRED_PUNCTUATION = [] as const;

const PUNCTUATION = [
	".",
	",",
	"!",
	"?",
	"'",
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
	...LOWERCASE_LETTERS.map((char) => glyph(char, true)),
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

export const HANDWRITING_TEMPLATE = {
	version: 1,
	page: { widthIn: 8.5, heightIn: 11 },
	marker: { sizeIn: 0.4, insetIn: 0.4, notchIn: 0.12 },
	label: {
		xIn: 0.04,
		yIn: 0.02,
		sizePt: 10,
		zoneWidthIn: 0.32,
		zoneHeightIn: 0.2,
	},
	grid: {
		columns: 8,
		rows: 13,
		xIn: 0.9,
		yIn: 1.2,
		cellWidthIn: 0.84,
		cellHeightIn: 0.72,
		cellInsetIn: 0.06,
	},
	printColors: {
		border: "#8fd3e8",
		guide: "#c4ecf6",
		label: "#8fd3e8",
		marker: "#000000",
	},
} as const;

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

export function missingLowercase(chars: string): string[] {
	const present = new Set(chars);
	return LOWERCASE_LETTERS.filter((char) => !present.has(char));
}

export const GLYPH_ALIASES: Readonly<Record<string, readonly string[]>> = {
	"'": ["\u2019", "\u2018"],
	'"': ["\u201C", "\u201D"],
};

export function withAliases(chars: Iterable<string>): string {
	const all = new Set(chars);
	for (const char of [...all]) {
		for (const alias of GLYPH_ALIASES[char] ?? []) all.add(alias);
	}
	return [...all].join("");
}
