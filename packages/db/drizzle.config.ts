import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/drizzle/schema/index.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url:
			process.env.DATABASE_URL ??
			"postgresql://postgres:postgres@127.0.0.1:5434/ink_studio",
	},
});
