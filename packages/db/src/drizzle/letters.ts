import type { LetterContent, PageFormatId } from "@repo/types";
import {
	and,
	desc,
	eq,
	getTableColumns,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
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

export type LetterCursor = { updatedAt: string; id: string };

export type BlankDraft = {
	format: PageFormatId;
	title: string;
	minSides: number;
};

export type LetterListQuery = {
	limit: number;
	after: LetterCursor | null;
	hideBlank: readonly BlankDraft[];
};

export type ListedLetters = { letters: Letter[]; next: LetterCursor | null };

export type Letters = {
	byId: (organizationId: string, id: string) => Promise<Letter | null>;
	list: (
		organizationId: string,
		query: LetterListQuery,
	) => Promise<ListedLetters>;
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

const exactUpdatedAt = sql<string>`to_char(${letters.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function blankDraft(drafts: readonly BlankDraft[]): SQL {
	const untitled = or(
		...drafts.map(
			(draft) =>
				sql`(${letters.content}->>'format' = ${draft.format} and ${letters.title} = ${draft.title} and ${letters.content} #> '{doc,attrs,minSides}' = to_jsonb(${draft.minSides}::int))`,
		),
	);
	if (untitled === undefined) return sql`false`;
	return sql`coalesce(${untitled}
		and jsonb_array_length(${letters.content} #> '{doc,attrs,elements}') = 0
		and jsonb_typeof(${letters.content} #> '{doc,attrs,frontImageAssetId}') = 'null'
		and jsonb_array_length(${letters.content} #> '{doc,content}') = 1
		and ${letters.content} #>> '{doc,content,0,type}' = 'paragraph'
		and coalesce(jsonb_array_length(${letters.content} #> '{doc,content,0,content}'), 0) = 0, false)`;
}

function before(cursor: LetterCursor | null): SQL | undefined {
	if (cursor === null) return undefined;
	return sql`(${letters.updatedAt}, ${letters.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)`;
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
		async list(organizationId, query) {
			const rows = await db
				.select({ ...getTableColumns(letters), exactUpdatedAt })
				.from(letters)
				.where(
					and(
						eq(letters.organizationId, organizationId),
						isNull(letters.deletedAt),
						sql`not ${blankDraft(query.hideBlank)}`,
						before(query.after),
					),
				)
				.orderBy(desc(letters.updatedAt), desc(letters.id))
				.limit(query.limit + 1);
			const page = rows.slice(0, query.limit);
			const last = page.at(-1);
			return {
				letters: page.map(toLetter),
				next:
					rows.length > query.limit && last
						? { updatedAt: last.exactUpdatedAt, id: last.id }
						: null,
			};
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
