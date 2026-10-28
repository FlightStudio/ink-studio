import type { FontSource } from "@repo/types";
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { assets } from "./assets.ts";
import { createdAt, id, updatedAt } from "./columns.ts";
import { organizations, users } from "./identity.ts";

export const fonts = pgTable(
	"fonts",
	{
		id: id(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id),
		ownerName: text("owner_name").notNull(),
		source: jsonb("source").$type<FontSource>().notNull(),
		fontAssetId: uuid("font_asset_id").references(() => assets.id),
		pendingFontAssetId: uuid("pending_font_asset_id").references(
			() => assets.id,
		),
		chars: text("chars").notNull().default(""),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
	},
	(table) => [
		index("fonts_organization_id_owner_user_id_idx").on(
			table.organizationId,
			table.ownerUserId,
		),
	],
);
