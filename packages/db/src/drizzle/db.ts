import { drizzle } from "drizzle-orm/node-postgres";
import type { Db, Tx } from "../database.ts";
import { createPool } from "./connection.ts";
import { createLetters } from "./letters.ts";
import { createOrganizationUsers } from "./organization-users.ts";
import { createOrganizations } from "./organizations.ts";
import type { Query } from "./query.ts";
import * as schema from "./schema/index.ts";
import { createUsers } from "./users.ts";

export function createDb(url: string): Db {
	const pool = createPool(url);
	const orm = drizzle(pool, { schema });
	const bound = (query: Query): Tx => ({
		users: createUsers(query),
		organizations: createOrganizations(query),
		organizationUsers: createOrganizationUsers(query),
		letters: createLetters(query),
	});
	return {
		...bound(orm),
		async transaction(fn) {
			return orm.transaction(async (tx) => fn(bound(tx)));
		},
		async close() {
			await pool.end();
		},
	};
}
