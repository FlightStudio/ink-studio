import type { EditableLetter, LetterListItem } from "@repo/services/letters";
import type { Member } from "@repo/types";
import { cache } from "react";
import { z } from "zod";
import { getSessionOrRedirect, requireUserOrganization } from "./auth.ts";
import { getLetterService } from "./services.ts";

const letterIdSchema = z.uuid();

export function isLetterId(value: string): boolean {
	return letterIdSchema.safeParse(value).success;
}

async function getMember(): Promise<Member> {
	await getSessionOrRedirect();
	return requireUserOrganization();
}

export const getLetter = cache(
	async (letterId: string): Promise<EditableLetter | null> => {
		if (!isLetterId(letterId)) return null;
		return getLetterService().getLetter(await getMember(), letterId);
	},
);

export const listLetters = cache(
	async (): Promise<LetterListItem[]> =>
		getLetterService().listLetters(await getMember()),
);
