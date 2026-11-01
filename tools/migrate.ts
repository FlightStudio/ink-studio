import { existsSync, readFileSync } from "node:fs";
import { migrate } from "@repo/db";

function loadEnv(path: string) {
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
		const splitAt = trimmed.indexOf("=");
		if (splitAt < 0) continue;
		const key = trimmed.slice(0, splitAt);
		if (process.env[key] !== undefined) continue;
		process.env[key] = trimmed.slice(splitAt + 1);
	}
}

loadEnv(".env");
loadEnv("tools/.env");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
await migrate(url);
