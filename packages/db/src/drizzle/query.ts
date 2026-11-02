import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema/index.ts";

export type Query = Pick<
	NodePgDatabase<typeof schema>,
	"select" | "insert" | "update"
>;
