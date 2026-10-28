import type { DrawingSource, Stroke } from "@repo/types";
import { z } from "zod";

export const DRAWING_LIMITS = {
	strokes: 2_000,
	points: 4_000,
	nameCharacters: 60,
	maskSidePx: 4_096,
} as const;

const strokePoint = z.tuple([
	z.number().finite(),
	z.number().finite(),
	z.number().finite().min(0).max(1),
	z.number().finite(),
]);

const strokeSchema: z.ZodType<Stroke> = z.strictObject({
	input: z.enum(["pen", "mouse", "touch"]),
	points: z.array(strokePoint).max(DRAWING_LIMITS.points),
});

export const drawnSourceSchema: z.ZodType<
	Extract<DrawingSource, { kind: "drawn" }>
> = z.strictObject({
	kind: z.literal("drawn"),
	box: z.strictObject({
		widthPx: z.number().finite().positive(),
		heightPx: z.number().finite().positive(),
	}),
	strokes: z.array(strokeSchema).max(DRAWING_LIMITS.strokes),
});

export const photoSourceSchema: z.ZodType<
	Extract<DrawingSource, { kind: "photo" }>
> = z.strictObject({
	kind: z.literal("photo"),
	photoAssetId: z.uuid(),
});
