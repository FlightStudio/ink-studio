import type { Organization } from "./organization.ts";
import type { OrganizationRole } from "./organization-user.ts";

export type UserOrganization = {
	id: string;
	userId: string;
	organizationId: string;
	role: OrganizationRole;
	organization: Organization;
};
