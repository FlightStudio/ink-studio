import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestDb } from "../database.ts";

export type { TestDb };

import { createDb } from "../drizzle/db.ts";
import { migrate } from "../drizzle/migrate.ts";

export async function startTestDb(): Promise<TestDb> {
	const container = await new PostgreSqlContainer("postgres:17").start();
	const url = container.getConnectionUri();
	await migrate(url);
	const db = createDb(url);
	return {
		db,
		async stop() {
			await db.close();
			await container.stop();
		},
	};
}
