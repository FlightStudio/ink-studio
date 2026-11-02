import type { User } from "./user.ts";
import type { UserOrganization } from "./user-organization.ts";

export type Session = {
	user: User;
	userOrganization: UserOrganization | null;
};

export type Member = {
	user: User;
	userOrganization: UserOrganization;
};
