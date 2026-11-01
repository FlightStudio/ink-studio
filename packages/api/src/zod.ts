import { z } from "zod";
import {
	type CreateDrawingRequest,
	type CreateFontRequest,
	type CreateLetterRequest,
	DrawingKind,
	DrawnFontSourceKind,
	GlyphStrokeInput,
	type LetterContentEnvelope,
	type LetterResources,
	type LetterState,
	type ListLettersParams,
	PageFormatId,
	type RenameDrawingRequest,
	type RequestExportRequest,
	type RequestLiftRequest,
	type SaveGlyphRequest,
	type SaveLetterRequest,
	StrokeInput,
	TemplatePhotoFontSourceKind,
	TemplatePhotoFontSourceTemplateVersion,
	UploadFontSourceKind,
	UploadPurpose,
} from "./gen/api.ts";

export const pageFormatIdSchema = z.enum(PageFormatId);

export const letterContentEnvelopeSchema: z.ZodType<LetterContentEnvelope> =
	z.looseObject({
		schemaVersion: z.number().int(),
		format: z.string(),
	});

export const createLetterRequestSchema: z.ZodType<CreateLetterRequest> =
	z.strictObject({
		format: pageFormatIdSchema.optional(),
		fontId: z.uuid().optional(),
	});

export const requestExportRequestSchema: z.ZodType<RequestExportRequest> =
	z.strictObject({
		revision: z.number().int().min(1),
		fonts: z.record(z.uuid(), z.uuid()),
	});

export const saveLetterRequestSchema: z.ZodType<SaveLetterRequest> =
	z.strictObject({
		title: z.string(),
		content: letterContentEnvelopeSchema,
		expectedRevision: z.number().int().min(1),
	});

const letterResourcesSchema: z.ZodType<LetterResources> = z.strictObject({
	assetBaseUrl: z.string(),
	stockFontBaseUrl: z.string(),
	fonts: z.record(z.string(), z.uuid()),
	drawings: z.record(
		z.string(),
		z.strictObject({ maskAssetId: z.uuid(), aspect: z.number() }),
	),
	frontImageAssetId: z.uuid().nullable(),
});

export const letterStateSchema: z.ZodType<LetterState> = z.strictObject({
	title: z.string(),
	revision: z.number().int(),
	content: letterContentEnvelopeSchema,
	resources: letterResourcesSchema,
});

export const listLettersParamsSchema: z.ZodType<ListLettersParams> =
	z.strictObject({
		cursor: z.string().optional(),
	});

export const drawnFontSourceSchema = z.strictObject({
	kind: z.enum(DrawnFontSourceKind),
});

export const templatePhotoFontSourceSchema = z.strictObject({
	kind: z.enum(TemplatePhotoFontSourceKind),
	templateVersion: z.literal(TemplatePhotoFontSourceTemplateVersion.NUMBER_1),
	photoAssetId: z.uuid(),
});

export const uploadFontSourceSchema = z.strictObject({
	kind: z.enum(UploadFontSourceKind),
	fileAssetId: z.uuid(),
});

export const createFontRequestSchema: z.ZodType<CreateFontRequest> =
	z.strictObject({
		ownerName: z.string(),
		source: z
			.union([
				drawnFontSourceSchema,
				templatePhotoFontSourceSchema,
				uploadFontSourceSchema,
			])
			.optional(),
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

const strokeSchema = z.strictObject({
	input: z.enum(StrokeInput),
	points: z.array(z.array(z.number()).length(4)),
});

export const createDrawingRequestSchema: z.ZodType<CreateDrawingRequest> =
	z.strictObject({
		kind: z.enum(DrawingKind),
		name: z.string(),
		maskAssetId: z.uuid(),
		source: z.discriminatedUnion("kind", [
			z.strictObject({
				kind: z.literal("drawn"),
				box: z.strictObject({
					widthPx: z.number(),
					heightPx: z.number(),
				}),
				strokes: z.array(strokeSchema),
			}),
			z.strictObject({
				kind: z.literal("photo"),
				photoAssetId: z.uuid(),
			}),
		]),
	});

export const requestLiftRequestSchema: z.ZodType<RequestLiftRequest> =
	z.strictObject({
		photoAssetId: z.uuid(),
	});

export const renameDrawingRequestSchema: z.ZodType<RenameDrawingRequest> =
	z.strictObject({
		name: z.string(),
	});
