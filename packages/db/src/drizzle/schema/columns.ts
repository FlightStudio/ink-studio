import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey();

export const createdAt = () =>
	timestamp("created_at", { withTimezone: true, mode: "date" })
		.notNull()
		.defaultNow();

export const updatedAt = () =>
	timestamp("updated_at", { withTimezone: true, mode: "date" })
		.notNull()
		.defaultNow();
