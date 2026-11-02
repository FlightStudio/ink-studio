import { existsSync, readFileSync } from "node:fs";
import { createDb } from "@repo/db";
import { seedDevIdentity } from "@repo/db/testing";

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
const email = process.env.DEV_USER_EMAIL;
const organizationName = process.env.DEV_ORGANIZATION_NAME;
if (!url) throw new Error("DATABASE_URL is required");
if (!email) throw new Error("DEV_USER_EMAIL is required");
if (!organizationName) throw new Error("DEV_ORGANIZATION_NAME is required");

const db = createDb(url);
const member = await seedDevIdentity(db, { email, organizationName });
await db.close();
console.log(
	JSON.stringify({
		userId: member.user.id,
		email: member.user.email,
		organizationId: member.userOrganization.organization.id,
		organizationName: member.userOrganization.organization.name,
		role: member.userOrganization.role,
	}),
);
