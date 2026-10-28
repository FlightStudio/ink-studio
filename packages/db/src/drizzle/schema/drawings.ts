import type { DrawingKind, DrawingSource } from "@repo/types";
import { sql } from "drizzle-orm";
import {
	check,
	doublePrecision,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets.ts";
import { createdAt, id } from "./columns.ts";
import { organizations, users } from "./identity.ts";

export const drawings = pgTable(
	"drawings",
	{
		id: id(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind").$type<DrawingKind>().notNull(),
		name: text("name").notNull(),
		source: jsonb("source").$type<DrawingSource>().notNull(),
		maskAssetId: uuid("mask_asset_id")
			.notNull()
			.references(() => assets.id),
		aspect: doublePrecision("aspect").notNull(),
		createdAt: createdAt(),
		deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
	},
	(table) => [
		index("drawings_organization_id_kind_created_at_idx").on(
			table.organizationId,
			table.kind,
			table.createdAt,
		),
		check("drawings_kind_check", sql`${table.kind} in ('doodle', 'signature')`),
		check("drawings_aspect_check", sql`${table.aspect} > 0`),
	],
);
