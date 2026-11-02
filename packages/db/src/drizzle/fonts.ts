import type { AssetProcessing, Font, FontSource } from "@repo/types";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { processingOf } from "./assets.ts";
import type { Query } from "./query.ts";
import { assets } from "./schema/assets.ts";
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

export type FontWithBuild = Font & { pendingBuild: AssetProcessing | null };

export type Fonts = {
	byId: (organizationId: string, id: string) => Promise<FontWithBuild | null>;
	lockById: (organizationId: string, id: string) => Promise<Font | null>;
	listByOwner: (
		organizationId: string,
		ownerUserId: string,
	) => Promise<FontWithBuild[]>;
	create: (input: NewFont) => Promise<Font>;
	saveSource: (
		organizationId: string,
		id: string,
		source: FontSource,
	) => Promise<boolean>;
	setPending: (
		organizationId: string,
		id: string,
		assetId: string,
	) => Promise<boolean>;
	finishBuild: (
		organizationId: string,
		id: string,
		assetId: string,
		chars: string,
	) => Promise<boolean>;
	referenced: (organizationId: string, ids: string[]) => Promise<Font[]>;
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

function withBuild(row: {
	font: typeof fonts.$inferSelect;
	pending: typeof assets.$inferSelect | null;
}): FontWithBuild {
	return {
		...toFont(row.font),
		pendingBuild: row.pending ? processingOf(row.pending) : null,
	};
}

const pendingAsset = and(
	eq(assets.id, fonts.pendingFontAssetId),
	eq(assets.organizationId, fonts.organizationId),
);

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
				.select({ font: fonts, pending: assets })
				.from(fonts)
				.leftJoin(assets, pendingAsset)
				.where(live(organizationId, id))
				.limit(1);
			const row = rows[0];
			return row ? withBuild(row) : null;
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
				.select({ font: fonts, pending: assets })
				.from(fonts)
				.leftJoin(assets, pendingAsset)
				.where(
					and(
						eq(fonts.organizationId, organizationId),
						eq(fonts.ownerUserId, ownerUserId),
						isNull(fonts.deletedAt),
					),
				)
				.orderBy(desc(fonts.updatedAt), desc(fonts.id));
			return rows.map(withBuild);
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
		async setPending(organizationId, id, assetId) {
			const updated = await db
				.update(fonts)
				.set({ pendingFontAssetId: assetId, updatedAt: sql`now()` })
				.where(live(organizationId, id))
				.returning({ id: fonts.id });
			return updated.length > 0;
		},
		async finishBuild(organizationId, id, assetId, chars) {
			const rows = await db
				.select()
				.from(fonts)
				.where(and(eq(fonts.organizationId, organizationId), eq(fonts.id, id)))
				.for("update")
				.limit(1);
			const row = rows[0];
			if (!row) return false;
			const current = toFont(row);
			if (
				current.pendingFontAssetId !== assetId &&
				current.fontAssetId !== null
			) {
				return true;
			}
			const updated = await db
				.update(fonts)
				.set({
					fontAssetId: assetId,
					pendingFontAssetId:
						current.pendingFontAssetId === assetId
							? null
							: current.pendingFontAssetId,
					chars,
					updatedAt: sql`now()`,
				})
				.where(and(eq(fonts.organizationId, organizationId), eq(fonts.id, id)))
				.returning({ id: fonts.id });
			return updated.length > 0;
		},
		async referenced(organizationId, ids) {
			if (ids.length === 0) return [];
			const rows = await db
				.select()
				.from(fonts)
				.where(
					and(eq(fonts.organizationId, organizationId), inArray(fonts.id, ids)),
				);
			return rows.map(toFont);
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
