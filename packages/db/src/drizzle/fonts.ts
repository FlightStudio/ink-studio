import type { Font, FontSource } from "@repo/types";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Query } from "./query.ts";
import { fonts } from "./schema/fonts.ts";

export type NewFont = {
	organizationId: string;
	ownerUserId: string;
	ownerName: string;
	source: FontSource;
	fontAssetId: string | null;
	pendingFontAssetId: string | null;
	chars: string;
};

export type Fonts = {
	byId: (organizationId: string, id: string) => Promise<Font | null>;
	lockById: (organizationId: string, id: string) => Promise<Font | null>;
	listByOwner: (organizationId: string, ownerUserId: string) => Promise<Font[]>;
	create: (input: NewFont) => Promise<Font>;
	saveSource: (
		organizationId: string,
		id: string,
		source: FontSource,
	) => Promise<boolean>;
	softDelete: (organizationId: string, id: string) => Promise<boolean>;
};

function toFont(row: typeof fonts.$inferSelect): Font {
	return {
		id: row.id,
		organizationId: row.organizationId,
		ownerUserId: row.ownerUserId,
		ownerName: row.ownerName,
		source: row.source,
		fontAssetId: row.fontAssetId,
		pendingFontAssetId: row.pendingFontAssetId,
		chars: row.chars,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt,
	};
}

function live(organizationId: string, id: string) {
	return and(
		eq(fonts.organizationId, organizationId),
		eq(fonts.id, id),
		isNull(fonts.deletedAt),
	);
}

export function createFonts(db: Query): Fonts {
	return {
		async byId(organizationId, id) {
			const rows = await db
				.select()
				.from(fonts)
				.where(live(organizationId, id))
				.limit(1);
			const row = rows[0];
			return row ? toFont(row) : null;
		},
		async lockById(organizationId, id) {
			const rows = await db
				.select()
				.from(fonts)
				.where(live(organizationId, id))
				.for("update")
				.limit(1);
			const row = rows[0];
			return row ? toFont(row) : null;
		},
		async listByOwner(organizationId, ownerUserId) {
			const rows = await db
				.select()
				.from(fonts)
				.where(
					and(
						eq(fonts.organizationId, organizationId),
						eq(fonts.ownerUserId, ownerUserId),
						isNull(fonts.deletedAt),
					),
				)
				.orderBy(desc(fonts.updatedAt), desc(fonts.id));
			return rows.map(toFont);
		},
		async create(input) {
			const inserted = await db
				.insert(fonts)
				.values({
					id: uuidv7(),
					organizationId: input.organizationId,
					ownerUserId: input.ownerUserId,
					ownerName: input.ownerName,
					source: input.source,
					fontAssetId: input.fontAssetId,
					pendingFontAssetId: input.pendingFontAssetId,
					chars: input.chars,
				})
				.returning();
			const row = inserted[0];
			if (!row) throw new Error("font insert returned no row");
			return toFont(row);
		},
		async saveSource(organizationId, id, source) {
			const updated = await db
				.update(fonts)
				.set({ source, updatedAt: sql`now()` })
				.where(live(organizationId, id))
				.returning({ id: fonts.id });
			return updated.length > 0;
		},
		async softDelete(organizationId, id) {
			const deleted = await db
				.update(fonts)
				.set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
				.where(live(organizationId, id))
				.returning({ id: fonts.id });
			return deleted.length > 0;
		},
	};
}
