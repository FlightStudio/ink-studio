import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const envFile = resolve(dirname(fileURLToPath(import.meta.url)), ".env.local");
const fileEnv = existsSync(envFile)
	? parseEnv(readFileSync(envFile, "utf8"))
	: {};
const env = Object.fromEntries(
	Object.entries(fileEnv).filter(
		(entry): entry is [string, string] =>
			entry[1] !== undefined && process.env[entry[0]] === undefined,
	),
);

export default defineConfig({
	test: {
		include: ["e2e/**/*.e2e.ts"],
		env,
		testTimeout: 60_000,
		hookTimeout: 240_000,
		fileParallelism: false,
	},
});
