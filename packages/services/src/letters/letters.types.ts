import type { CreateLetterRequest, SaveLetterRequest } from "@repo/api";
import type { LetterContent, LetterResources } from "@repo/types";

export type LetterListItem = {
	id: string;
	title: string;
	updatedAt: Date;
	humanSeal: string | null;
};

export type EditableLetter = {
	id: string;
	title: string;
	content: LetterContent;
	revision: number;
	resources: LetterResources;
	editable: boolean;
};

export type SaveLetterParams = SaveLetterRequest;

export type CreateLetterParams = CreateLetterRequest;
