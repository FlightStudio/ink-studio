import { ServiceError } from "@repo/errors";
import {
	CELL,
	type DrawnGlyph,
	GLYPH_LIMITS,
	HANDWRITING_GLYPHS,
	OWNER_NAME_MAX_CHARACTERS,
} from "@repo/types";
import { z } from "zod";

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

export function parseOwnerName(value: string): string {
	const trimmed = value.replace(/\s+/gu, " ").trim();
	if (trimmed === "" || /\p{Cc}/u.test(trimmed)) {
		throw new ServiceError("invalid_input", "invalid_owner_name");
	}
	if ([...trimmed].length > OWNER_NAME_MAX_CHARACTERS) {
		throw new ServiceError("invalid_input", "owner_name_too_long");
	}
	return trimmed;
}
