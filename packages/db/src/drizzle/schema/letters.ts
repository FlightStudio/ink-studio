import type { LetterContent } from "@repo/types";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.ts";
import { organizations } from "./identity.ts";

export const letters = pgTable(
	"letters",
	{
		id: id(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		title: text("title").notNull(),
		content: jsonb("content").$type<LetterContent>().notNull(),
		revision: integer("revision").notNull().default(1),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
	},
	(table) => [
		index("letters_organization_id_updated_at_idx").on(
			table.organizationId,
			table.updatedAt,
		),
	],
);
