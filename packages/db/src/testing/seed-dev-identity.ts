import type { Member } from "@repo/types";
import type { Db } from "../database.ts";

export type SeedParams = {
	email: string;
	organizationName: string;
};

export async function seedDevIdentity(
	db: Db,
	params: SeedParams,
): Promise<Member> {
	return db.transaction(async (tx) => {
		const { user } = await tx.users.getOrCreate({
			externalId: `dev:${params.email}`,
			email: params.email,
			name: params.email,
		});
		const existing = await tx.organizationUsers.userOrganizationByUserId(
			user.id,
		);
		if (existing) return { user, userOrganization: existing };
		const organization = await tx.organizations.create({
			name: params.organizationName,
		});
		const membership = await tx.organizationUsers.create({
			userId: user.id,
			organizationId: organization.id,
			role: "owner",
		});
		return {
			user,
			userOrganization: { ...membership, organization },
		};
	});
}
