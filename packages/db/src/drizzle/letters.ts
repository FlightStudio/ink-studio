import type { LetterContent } from "@repo/types";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Query } from "./query.ts";
import { letters } from "./schema/letters.ts";

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

function toLetter(row: typeof letters.$inferSelect): Letter {
	return {
		id: row.id,
		organizationId: row.organizationId,
		title: row.title,
		content: row.content,
		revision: row.revision,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function live(organizationId: string, id: string) {
	return and(
		eq(letters.organizationId, organizationId),
		eq(letters.id, id),
		isNull(letters.deletedAt),
	);
}

export function createLetters(db: Query): Letters {
	return {
		async byId(organizationId, id) {
			const rows = await db
				.select()
				.from(letters)
				.where(live(organizationId, id))
				.limit(1);
			const row = rows[0];
			return row ? toLetter(row) : null;
		},
		async list(organizationId) {
			const rows = await db
				.select()
				.from(letters)
				.where(
					and(
						eq(letters.organizationId, organizationId),
						isNull(letters.deletedAt),
					),
				)
				.orderBy(desc(letters.updatedAt), desc(letters.id));
			return rows.map(toLetter);
		},
		async create(input) {
			const inserted = await db
				.insert(letters)
				.values({
					id: uuidv7(),
					organizationId: input.organizationId,
					title: input.title,
					content: input.content,
					revision: 1,
				})
				.returning();
			const row = inserted[0];
			if (!row) throw new Error("letter insert returned no row");
			return toLetter(row);
		},
		async save(organizationId, id, change) {
			const updated = await db
				.update(letters)
				.set({
					title: change.title,
					content: change.content,
					revision: sql`${letters.revision} + 1`,
					updatedAt: sql`now()`,
				})
				.where(
					and(
						live(organizationId, id),
						eq(letters.revision, change.expectedRevision),
					),
				)
				.returning({ revision: letters.revision });
			return updated[0]?.revision ?? null;
		},
		async softDelete(organizationId, id) {
			const deleted = await db
				.update(letters)
				.set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
				.where(live(organizationId, id))
				.returning({ id: letters.id });
			return deleted.length > 0;
		},
	};
}
