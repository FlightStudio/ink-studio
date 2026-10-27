import type { OrganizationUsers } from "./drizzle/organization-users.ts";
import type { Organizations } from "./drizzle/organizations.ts";
import type { Users } from "./drizzle/users.ts";

export type { Organizations, OrganizationUsers, Users };

export type Tx = {
	users: Users;
	organizations: Organizations;
	organizationUsers: OrganizationUsers;
};

export type Db = Tx & {
	transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	close: () => Promise<void>;
};

export type TestDb = {
	db: Db;
	stop: () => Promise<void>;
};
