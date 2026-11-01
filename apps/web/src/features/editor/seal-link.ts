import type { FontOption, LetterContent } from "@repo/types";
import { GLYPH_ALIASES, HANDWRITING_GLYPHS } from "@repo/types";
import { drawPage } from "../fonts/font-links.ts";

function glyphFor(char: string): string | null {
	if (HANDWRITING_GLYPHS.some((entry) => entry.char === char)) return char;
	for (const [glyph, aliases] of Object.entries(GLYPH_ALIASES)) {
		if (aliases.includes(char)) return glyph;
	}
	return null;
}

export function missingLetterHref(
	content: LetterContent,
	fonts: readonly FontOption[],
	letterId: string,
): string | null {
	const drawn = new Map(
		fonts
			.filter((font) => font.source === "drawn")
			.map((font) => [font.id, new Set(font.chars)]),
	);
	for (const block of content.doc.content) {
		if (block.type !== "paragraph") continue;
		for (const node of block.content ?? []) {
			if (node.type !== "text") continue;
			const ink = node.marks?.find((mark) => mark.type === "ink");
			const font = ink?.attrs.font ?? content.defaults.font;
			if (font.kind !== "own") continue;
			const chars = drawn.get(font.fontId);
			if (!chars) continue;
			for (const char of node.text) {
				if (/\s/u.test(char) || chars.has(char)) continue;
				const glyph = glyphFor(char);
				if (glyph === null || chars.has(glyph)) continue;
				return drawPage(font.fontId, letterId, glyph);
			}
		}
	}
	return null;
}
