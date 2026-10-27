import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as runMigrate } from "drizzle-orm/node-postgres/migrator";
import { createPool } from "./connection.ts";

const migrationsFolder = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../drizzle",
);

export async function migrate(url: string): Promise<void> {
	const pool = createPool(url);
	try {
		await runMigrate(drizzle(pool), { migrationsFolder });
	} finally {
		await pool.end();
	}
}
