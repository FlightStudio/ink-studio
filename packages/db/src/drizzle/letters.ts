import type { LetterContent } from "@repo/types";
import type { Query } from "./query.ts";

export type Letter = {
	id: string;
	organizationId: string;
	title: string;
	content: LetterContent;
	revision: number;
	createdAt: Date;
	updatedAt: Date;
};

export type NewLetter = {
	organizationId: string;
	title: string;
	content: LetterContent;
};

export type LetterChange = {
	title: string;
	content: LetterContent;
	expectedRevision: number;
};

export type Letters = {
	byId: (organizationId: string, id: string) => Promise<Letter | null>;
	list: (organizationId: string) => Promise<Letter[]>;
	create: (input: NewLetter) => Promise<Letter>;
	save: (
		organizationId: string,
		id: string,
		change: LetterChange,
	) => Promise<number | null>;
	softDelete: (organizationId: string, id: string) => Promise<boolean>;
};

export function createLetters(_db: Query): Letters {
	const pending = () => Promise.reject(new Error("letters are not stored yet"));
	return {
		byId: pending,
		list: pending,
		create: pending,
		save: pending,
		softDelete: pending,
	};
}
