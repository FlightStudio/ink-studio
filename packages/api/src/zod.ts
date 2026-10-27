import { apiErrorCodes } from "@repo/errors";
import { z } from "zod";

export const apiErrorCodeSchema = z.enum(apiErrorCodes);

export const apiErrorSchema = z.object({
	code: apiErrorCodeSchema,
	message: z.string(),
});

export const healthSchema = z.object({
	ok: z.boolean(),
});
