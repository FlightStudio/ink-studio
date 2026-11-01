import type { OrganizationRole } from "@repo/types";
import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.ts";

export const users = pgTable(
	"users",
	{
		id: id(),
		externalId: text("external_id").notNull().unique(),
		email: text("email").notNull(),
		name: text("name").notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const organizations = pgTable("organizations", {
	id: id(),
	name: text("name").notNull(),
	createdAt: createdAt(),
});

export const organizationUsers = pgTable("organization_users", {
	id: id(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id),
	role: text("role").$type<OrganizationRole>().notNull(),
	createdAt: createdAt(),
});
