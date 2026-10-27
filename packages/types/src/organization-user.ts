export type OrganizationRole = "owner" | "member";

export type OrganizationUser = {
	id: string;
	userId: string;
	organizationId: string;
	role: OrganizationRole;
};

export type NewOrganizationUser = {
	userId: string;
	organizationId: string;
	role: OrganizationRole;
};
