import type {
	AssetJob,
	AssetProcessingStatus,
	UploadPurpose,
} from "@repo/types";
import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.ts";
import { organizations, users } from "./identity.ts";

export const assetSource = pgEnum("asset_source", ["uploaded", "generated"]);

export const assets = pgTable(
	"assets",
	{
		id: id(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		storageKey: text("storage_key").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size"),
		checksum: text("checksum"),
		source: assetSource("source").notNull(),
		purpose: text("purpose").$type<UploadPurpose>(),
		filename: text("filename"),
		uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
		job: jsonb("job").$type<AssetJob>(),
		processingStatus: text("processing_status")
			.$type<AssetProcessingStatus>()
			.notNull(),
		processingAttempts: integer("processing_attempts").notNull().default(0),
		processingLastError: text("processing_last_error"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("assets_organization_id_idx").on(table.organizationId),
		index("assets_processing_status_updated_at_idx").on(
			table.processingStatus,
			table.updatedAt,
		),
		check(
			"assets_origin_check",
			sql`(${table.source} = 'uploaded') = (${table.purpose} IS NOT NULL AND ${table.job} IS NULL)`,
		),
	],
);
