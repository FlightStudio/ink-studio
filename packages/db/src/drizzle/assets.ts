import type { Asset, AssetOrigin, AssetProcessing } from "@repo/types";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Query } from "./query.ts";
import { assets } from "./schema/assets.ts";

export type NewAsset = Omit<Asset, "createdAt" | "updatedAt">;

export type StoredFile = {
	mimeType: string;
	byteSize: number;
	checksum: string;
};

export type Assets = {
	byId: (organizationId: string, id: string) => Promise<Asset | null>;
	referenced: (organizationId: string, ids: string[]) => Promise<Asset[]>;
	create: (input: NewAsset) => Promise<Asset>;
	claim: (id: string, staleBefore: Date) => Promise<Asset | null>;
	complete: (id: string, file: StoredFile) => Promise<void>;
	release: (id: string, error: string) => Promise<void>;
	fail: (id: string, error: string) => Promise<void>;
	stale: (before: Date) => Promise<Asset[]>;
};

type AssetRow = typeof assets.$inferSelect;

function originOf(row: AssetRow): AssetOrigin {
	if (row.source === "generated") {
		if (!row.job) throw new Error(`generated asset ${row.id} has no job`);
		return { source: "generated", job: row.job };
	}
	if (!row.purpose || row.filename === null || !row.uploadedByUserId) {
		throw new Error(`uploaded asset ${row.id} is missing its upload fields`);
	}
	return {
		source: "uploaded",
		purpose: row.purpose,
		filename: row.filename,
		uploadedByUserId: row.uploadedByUserId,
	};
}

export function processingOf(row: AssetRow): AssetProcessing {
	const attempts = row.processingAttempts;
	switch (row.processingStatus) {
		case "done":
			return { status: "done", attempts };
		case "failed":
			return {
				status: "failed",
				attempts,
				error: row.processingLastError ?? "internal_error",
			};
		default:
			return {
				status: row.processingStatus,
				attempts,
				lastError: row.processingLastError,
			};
	}
}

function toAsset(row: AssetRow): Asset {
	return {
		id: row.id,
		organizationId: row.organizationId,
		storageKey: row.storageKey,
		mimeType: row.mimeType,
		byteSize: row.byteSize,
		checksum: row.checksum,
		origin: originOf(row),
		processing: processingOf(row),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function originColumns(origin: AssetOrigin) {
	if (origin.source === "generated") {
		return {
			source: origin.source,
			purpose: null,
			filename: null,
			uploadedByUserId: null,
			job: origin.job,
		};
	}
	return {
		source: origin.source,
		purpose: origin.purpose,
		filename: origin.filename,
		uploadedByUserId: origin.uploadedByUserId,
		job: null,
	};
}

function processingColumns(processing: AssetProcessing) {
	return {
		processingStatus: processing.status,
		processingAttempts: processing.attempts,
		processingLastError:
			processing.status === "done"
				? null
				: processing.status === "failed"
					? processing.error
					: processing.lastError,
	};
}

function running(id: string) {
	return and(eq(assets.id, id), eq(assets.processingStatus, "running"));
}

export function createAssets(db: Query): Assets {
	return {
		async byId(organizationId, id) {
			const rows = await db
				.select()
				.from(assets)
				.where(
					and(eq(assets.organizationId, organizationId), eq(assets.id, id)),
				)
				.limit(1);
			const row = rows[0];
			return row ? toAsset(row) : null;
		},
		async referenced(organizationId, ids) {
			if (ids.length === 0) return [];
			const rows = await db
				.select()
				.from(assets)
				.where(
					and(
						eq(assets.organizationId, organizationId),
						inArray(assets.id, ids),
					),
				);
			return rows.map(toAsset);
		},
		async create(input) {
			const inserted = await db
				.insert(assets)
				.values({
					id: input.id,
					organizationId: input.organizationId,
					storageKey: input.storageKey,
					mimeType: input.mimeType,
					byteSize: input.byteSize,
					checksum: input.checksum,
					...originColumns(input.origin),
					...processingColumns(input.processing),
				})
				.returning();
			const row = inserted[0];
			if (!row) throw new Error("asset insert returned no row");
			return toAsset(row);
		},
		async claim(id, staleBefore) {
			const claimed = await db
				.update(assets)
				.set({
					processingStatus: "running",
					processingAttempts: sql`${assets.processingAttempts} + 1`,
					updatedAt: sql`now()`,
				})
				.where(
					and(
						eq(assets.id, id),
						or(
							eq(assets.processingStatus, "pending"),
							and(
								eq(assets.processingStatus, "running"),
								lt(assets.updatedAt, staleBefore),
							),
						),
					),
				)
				.returning();
			const row = claimed[0];
			return row ? toAsset(row) : null;
		},
		async complete(id, file) {
			await db
				.update(assets)
				.set({
					mimeType: file.mimeType,
					byteSize: file.byteSize,
					checksum: file.checksum,
					processingStatus: "done",
					processingLastError: null,
					updatedAt: sql`now()`,
				})
				.where(running(id));
		},
		async release(id, error) {
			await db
				.update(assets)
				.set({
					processingStatus: "pending",
					processingLastError: error,
					updatedAt: sql`now()`,
				})
				.where(running(id));
		},
		async fail(id, error) {
			await db
				.update(assets)
				.set({
					processingStatus: "failed",
					processingLastError: error,
					updatedAt: sql`now()`,
				})
				.where(running(id));
		},
		async stale(before) {
			const rows = await db
				.select()
				.from(assets)
				.where(
					and(
						inArray(assets.processingStatus, ["pending", "running"]),
						lt(assets.updatedAt, before),
					),
				)
				.orderBy(asc(assets.updatedAt));
			return rows.map(toAsset);
		},
	};
}
