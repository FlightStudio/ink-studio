import type { EditableFont, FontOption, Member } from "@repo/types";
import { cache } from "react";
import { z } from "zod";
import { getSessionOrRedirect, requireUserOrganization } from "./auth.ts";
import { getFontService } from "./services.ts";

const fontIdSchema = z.uuid();

export function isFontId(value: string): boolean {
	return fontIdSchema.safeParse(value).success;
}

async function getMember(): Promise<Member> {
	await getSessionOrRedirect();
	return requireUserOrganization();
}

export const getFont = cache(
	async (fontId: string): Promise<EditableFont | null> => {
		if (!isFontId(fontId)) return null;
		return getFontService().getFont(await getMember(), fontId);
	},
);

export const listFonts = cache(
	async (): Promise<FontOption[]> =>
		getFontService().listFonts(await getMember()),
);
