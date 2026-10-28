import { apiErrorCodes } from "@repo/errors";
import { z } from "zod";
import {
	AssetProcessingStatus,
	type AssetStatus,
	type CreatedFont,
	type CreatedLetter,
	type CreateFontRequest,
	type CreateLetterRequest,
	DrawnFontSourceKind,
	GlyphStrokeInput,
	type LetterContentEnvelope,
	type LetterState,
	PageFormatId,
	type SavedLetter,
	type SaveGlyphRequest,
	type SaveLetterRequest,
	type UploadedAsset,
	UploadPurpose,
} from "./gen/api.ts";

export const apiErrorCodeSchema = z.enum(apiErrorCodes);

export const apiErrorSchema = z.object({
	code: apiErrorCodeSchema,
	message: z.string(),
});

export const healthSchema = z.object({
	ok: z.boolean(),
});

export const pageFormatIdSchema = z.enum(PageFormatId);

export const letterContentEnvelopeSchema: z.ZodType<LetterContentEnvelope> =
	z.looseObject({
		schemaVersion: z.number().int(),
		format: z.string(),
	});

export const createLetterRequestSchema: z.ZodType<CreateLetterRequest> =
	z.strictObject({
		format: pageFormatIdSchema.optional(),
	});

export const createdLetterSchema: z.ZodType<CreatedLetter> = z.strictObject({
	id: z.uuid(),
});

export const saveLetterRequestSchema: z.ZodType<SaveLetterRequest> =
	z.strictObject({
		title: z.string(),
		content: letterContentEnvelopeSchema,
		expectedRevision: z.number().int().min(1),
	});

export const savedLetterSchema: z.ZodType<SavedLetter> = z.strictObject({
	revision: z.number().int(),
});

export const letterStateSchema: z.ZodType<LetterState> = z.strictObject({
	title: z.string(),
	revision: z.number().int(),
	content: letterContentEnvelopeSchema,
});

export const drawnFontSourceSchema = z.strictObject({
	kind: z.enum(DrawnFontSourceKind),
});

export const createFontRequestSchema: z.ZodType<CreateFontRequest> =
	z.strictObject({
		ownerName: z.string(),
		source: drawnFontSourceSchema.optional(),
	});

export const createdFontSchema: z.ZodType<CreatedFont> = z.strictObject({
	id: z.uuid(),
});

const glyphPointSchema = z.tuple([
	z.number(),
	z.number(),
	z.number(),
	z.number(),
]);

export const saveGlyphRequestSchema: z.ZodType<SaveGlyphRequest> =
	z.strictObject({
		char: z.string(),
		variant: z.number().int().min(0),
		strokes: z.array(
			z.strictObject({
				input: z.enum(GlyphStrokeInput),
				points: z.array(glyphPointSchema),
			}),
		),
	});

export const uploadPurposeSchema = z.enum(UploadPurpose);

export const uploadedAssetSchema: z.ZodType<UploadedAsset> = z.strictObject({
	id: z.uuid(),
});

export const assetProcessingStatusSchema = z.enum(AssetProcessingStatus);

export const assetStatusSchema: z.ZodType<AssetStatus> = z.strictObject({
	status: assetProcessingStatusSchema,
	error: apiErrorCodeSchema.nullable(),
});
