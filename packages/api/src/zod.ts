import { apiErrorCodes } from "@repo/errors";
import { z } from "zod";
import {
	type CreatedLetter,
	type CreateLetterRequest,
	type LetterContentEnvelope,
	type LetterState,
	PageFormatId,
	type SavedLetter,
	type SaveLetterRequest,
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
