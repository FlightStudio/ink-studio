import type { NewOrganization, Organization } from "@repo/types";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Query } from "./query.ts";
import { organizations } from "./schema/identity.ts";

export type Organizations = {
	byId: (id: string) => Promise<Organization | null>;
	create: (input: NewOrganization) => Promise<Organization>;
};

function toOrganization(row: typeof organizations.$inferSelect): Organization {
	return { id: row.id, name: row.name };
}

export function createOrganizations(db: Query): Organizations {
	return {
		async byId(id) {
			const rows = await db
				.select()
				.from(organizations)
				.where(eq(organizations.id, id))
				.limit(1);
			const row = rows[0];
			return row ? toOrganization(row) : null;
		},
		async create(input) {
			const inserted = await db
				.insert(organizations)
				.values({ id: uuidv7(), name: input.name })
				.returning();
			const row = inserted[0];
			if (!row) throw new Error("organization insert returned no row");
			return toOrganization(row);
		},
	};
}
