import { afterAll, beforeAll, expect, it } from "vitest";
import { seedDevIdentity } from "./seed-dev-identity.ts";
import { startTestDb, type TestDb } from "./start-test-db.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

it("seeding twice leaves one user, one organization and one owner membership", async () => {
	const params = {
		email: "ada@example.com",
		organizationName: "Ada Studio",
	};
	const first = await seedDevIdentity(testDb.db, params);
	const second = await seedDevIdentity(testDb.db, params);
	expect(second.user.id).toBe(first.user.id);
	expect(second.user.externalId).toBe("dev:ada@example.com");
	expect(second.userOrganization.id).toBe(first.userOrganization.id);
	expect(second.userOrganization.role).toBe("owner");
	expect(second.userOrganization.organization.id).toBe(
		first.userOrganization.organization.id,
	);
	expect(second.userOrganization.organization.name).toBe("Ada Studio");
	const again = await testDb.db.users.getOrCreate({
		externalId: "dev:ada@example.com",
		email: params.email,
		name: params.email,
	});
	expect(again.created).toBe(false);
	expect(again.user.id).toBe(first.user.id);
});

it("seeding a user who has no organization gives them one as owner", async () => {
	const email = "new@example.com";
	const created = await testDb.db.users.getOrCreate({
		externalId: `dev:${email}`,
		email,
		name: email,
	});
	expect(
		await testDb.db.organizationUsers.userOrganizationByUserId(created.user.id),
	).toBeNull();
	const member = await seedDevIdentity(testDb.db, {
		email,
		organizationName: "New Studio",
	});
	expect(member.user.id).toBe(created.user.id);
	expect(member.userOrganization.role).toBe("owner");
	expect(member.userOrganization.organization.name).toBe("New Studio");
});
