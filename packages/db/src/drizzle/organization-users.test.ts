import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

it("a user in two organizations gets the one they joined first", async () => {
	const user = await testDb.db.users.getOrCreate({
		externalId: "dev:member@example.com",
		email: "member@example.com",
		name: "Member",
	});
	const first = await testDb.db.organizations.create({ name: "First studio" });
	await testDb.db.organizationUsers.create({
		userId: user.user.id,
		organizationId: first.id,
		role: "owner",
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	const second = await testDb.db.organizations.create({
		name: "Second studio",
	});
	await testDb.db.organizationUsers.create({
		userId: user.user.id,
		organizationId: second.id,
		role: "member",
	});
	const membership = await testDb.db.organizationUsers.userOrganizationByUserId(
		user.user.id,
	);
	expect(membership?.organization.id).toBe(first.id);
});

it("a user with no membership gets null", async () => {
	const user = await testDb.db.users.getOrCreate({
		externalId: "dev:solo@example.com",
		email: "solo@example.com",
		name: "Solo",
	});
	expect(
		await testDb.db.organizationUsers.userOrganizationByUserId(user.user.id),
	).toBeNull();
});
