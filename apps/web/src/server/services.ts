import { createDb, type Db } from "@repo/db";
import { env } from "../env.ts";

let cached: Db | undefined;

export function getDb(): Db {
	cached ??= createDb(env.DATABASE_URL);
	return cached;
}
