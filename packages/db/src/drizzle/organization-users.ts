import type {
	NewOrganizationUser,
	OrganizationUser,
	UserOrganization,
} from "@repo/types";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { Query } from "./query.ts";
import { organizations, organizationUsers } from "./schema/identity.ts";

export type OrganizationUsers = {
	userOrganizationByUserId: (
		userId: string,
	) => Promise<UserOrganization | null>;
	create: (input: NewOrganizationUser) => Promise<OrganizationUser>;
};

function toOrganizationUser(
	row: typeof organizationUsers.$inferSelect,
): OrganizationUser {
	return {
		id: row.id,
		userId: row.userId,
		organizationId: row.organizationId,
		role: row.role,
	};
}

export function createOrganizationUsers(db: Query): OrganizationUsers {
	return {
		async userOrganizationByUserId(userId) {
			const rows = await db
				.select({
					membership: organizationUsers,
					organization: organizations,
				})
				.from(organizationUsers)
				.innerJoin(
					organizations,
					eq(organizationUsers.organizationId, organizations.id),
				)
				.where(eq(organizationUsers.userId, userId))
				.orderBy(asc(organizationUsers.createdAt))
				.limit(1);
			const row = rows[0];
			if (!row) return null;
			return {
				...toOrganizationUser(row.membership),
				organization: { id: row.organization.id, name: row.organization.name },
			};
		},
		async create(input) {
			const inserted = await db
				.insert(organizationUsers)
				.values({
					id: uuidv7(),
					userId: input.userId,
					organizationId: input.organizationId,
					role: input.role,
				})
				.returning();
			const row = inserted[0];
			if (!row) throw new Error("membership insert returned no row");
			return toOrganizationUser(row);
		},
	};
}
