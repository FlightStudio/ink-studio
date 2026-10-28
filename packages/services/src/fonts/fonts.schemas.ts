import {
	CELL,
	type DrawnGlyph,
	GLYPH_LIMITS,
	HANDWRITING_GLYPHS,
} from "@repo/types";
import { z } from "zod";

const OWNER_NAME_MAX_CHARACTERS = 40;

const strokePoint = z.tuple([
	z.number().finite().min(0).max(CELL.size),
	z.number().finite().min(0).max(CELL.size),
	z.number().finite().min(0).max(1),
	z.number().finite().min(0),
]);

export const drawnGlyphSchema = z.strictObject({
	char: z.string(),
	variant: z.number().int().nonnegative(),
	strokes: z
		.array(
			z.strictObject({
				input: z.enum(["pen", "mouse", "touch"]),
				points: z.array(strokePoint).max(GLYPH_LIMITS.pointsPerStroke),
			}),
		)
		.max(GLYPH_LIMITS.strokes),
});

export function parseDrawnGlyph(value: unknown): DrawnGlyph | null {
	const parsed = drawnGlyphSchema.safeParse(value);
	if (!parsed.success) return null;
	const spec = HANDWRITING_GLYPHS.find(
		(entry) => entry.char === parsed.data.char,
	);
	if (!spec || parsed.data.variant >= spec.variants) return null;
	return parsed.data;
}

export function parseOwnerName(value: string): string | null {
	const trimmed = value.trim();
	if (
		trimmed === "" ||
		/\p{Cc}/u.test(trimmed) ||
		[...trimmed].length > OWNER_NAME_MAX_CHARACTERS
	) {
		return null;
	}
	return trimmed;
}
