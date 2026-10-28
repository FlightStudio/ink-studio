import type { LibraryDrawing } from "@repo/types";
import { cache } from "react";
import { z } from "zod";
import { getSessionOrRedirect, requireUserOrganization } from "./auth.ts";
import { getDrawingService } from "./services.ts";

const drawingIdSchema = z.uuid();

export function isDrawingId(value: string): boolean {
	return drawingIdSchema.safeParse(value).success;
}

export const listDoodles = cache(async (): Promise<LibraryDrawing[]> => {
	await getSessionOrRedirect();
	return getDrawingService().listDrawings(
		await requireUserOrganization(),
		"doodle",
	);
});
