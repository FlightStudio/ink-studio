import type { NewUser, User } from "@repo/types";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Query } from "./query.ts";
import { asUniqueViolation } from "./query-error.ts";
import { users } from "./schema/identity.ts";

export type Users = {
	byExternalId: (externalId: string) => Promise<User | null>;
	getOrCreate: (input: NewUser) => Promise<{ user: User; created: boolean }>;
};

function toUser(row: typeof users.$inferSelect): User {
	return {
		id: row.id,
		externalId: row.externalId,
		email: row.email,
		name: row.name,
	};
}

export function createUsers(db: Query): Users {
	return {
		async byExternalId(externalId) {
			const rows = await db
				.select()
				.from(users)
				.where(eq(users.externalId, externalId))
				.limit(1);
			const row = rows[0];
			return row ? toUser(row) : null;
		},
		async getOrCreate(input) {
			const existing = await this.byExternalId(input.externalId);
			if (existing) return { user: existing, created: false };
			try {
				const inserted = await db
					.insert(users)
					.values({
						id: uuidv7(),
						externalId: input.externalId,
						email: input.email,
						name: input.name,
					})
					.returning();
				const row = inserted[0];
				if (!row) throw new Error("user insert returned no row");
				return { user: toUser(row), created: true };
			} catch (error) {
				const unique = asUniqueViolation(error);
				if (unique) throw unique;
				throw error;
			}
		},
	};
}
