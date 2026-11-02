import type { Drawing, DrawingKind, DrawingSource } from "@repo/types";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Query } from "./query.ts";
import { drawings } from "./schema/drawings.ts";

export type NewDrawing = {
	organizationId: string;
	ownerUserId: string;
	kind: DrawingKind;
	name: string;
	source: DrawingSource;
	maskAssetId: string;
	aspect: number;
};

export type Drawings = {
	byId: (organizationId: string, id: string) => Promise<Drawing | null>;
	referenced: (organizationId: string, ids: string[]) => Promise<Drawing[]>;
	list: (organizationId: string, kind: DrawingKind) => Promise<Drawing[]>;
	create: (input: NewDrawing) => Promise<Drawing>;
	rename: (
		organizationId: string,
		id: string,
		name: string,
	) => Promise<boolean>;
	softDelete: (organizationId: string, id: string) => Promise<boolean>;
};

function toDrawing(row: typeof drawings.$inferSelect): Drawing {
	return {
		id: row.id,
		organizationId: row.organizationId,
		ownerUserId: row.ownerUserId,
		kind: row.kind,
		name: row.name,
		source: row.source,
		maskAssetId: row.maskAssetId,
		aspect: row.aspect,
		createdAt: row.createdAt,
		deletedAt: row.deletedAt,
	};
}

function live(organizationId: string, id: string) {
	return and(
		eq(drawings.organizationId, organizationId),
		eq(drawings.id, id),
		isNull(drawings.deletedAt),
	);
}

export function createDrawings(db: Query): Drawings {
	return {
		async byId(organizationId, id) {
			const rows = await db
				.select()
				.from(drawings)
				.where(live(organizationId, id))
				.limit(1);
			const row = rows[0];
			return row ? toDrawing(row) : null;
		},
		async referenced(organizationId, ids) {
			if (ids.length === 0) return [];
			const rows = await db
				.select()
				.from(drawings)
				.where(
					and(
						eq(drawings.organizationId, organizationId),
						inArray(drawings.id, ids),
					),
				);
			return rows.map(toDrawing);
		},
		async list(organizationId, kind) {
			const rows = await db
				.select()
				.from(drawings)
				.where(
					and(
						eq(drawings.organizationId, organizationId),
						eq(drawings.kind, kind),
						isNull(drawings.deletedAt),
					),
				)
				.orderBy(desc(drawings.createdAt), desc(drawings.id));
			return rows.map(toDrawing);
		},
		async create(input) {
			const inserted = await db
				.insert(drawings)
				.values({
					id: uuidv7(),
					organizationId: input.organizationId,
					ownerUserId: input.ownerUserId,
					kind: input.kind,
					name: input.name,
					source: input.source,
					maskAssetId: input.maskAssetId,
					aspect: input.aspect,
				})
				.returning();
			const row = inserted[0];
			if (!row) throw new Error("drawing insert returned no row");
			return toDrawing(row);
		},
		async rename(organizationId, id, name) {
			const renamed = await db
				.update(drawings)
				.set({ name })
				.where(live(organizationId, id))
				.returning({ id: drawings.id });
			return renamed.length > 0;
		},
		async softDelete(organizationId, id) {
			const deleted = await db
				.update(drawings)
				.set({ deletedAt: sql`now()` })
				.where(live(organizationId, id))
				.returning({ id: drawings.id });
			return deleted.length > 0;
		},
	};
}
