import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

it("getOrCreate returns the existing user the second time", async () => {
	const input = {
		externalId: "dev:ada@example.com",
		email: "ada@example.com",
		name: "Ada",
	};
	const first = await testDb.db.users.getOrCreate(input);
	const second = await testDb.db.users.getOrCreate(input);
	expect(first.created).toBe(true);
	expect(second.created).toBe(false);
	expect(second.user.id).toBe(first.user.id);
});

it("a second account with a taken email is a unique violation", async () => {
	await testDb.db.users.getOrCreate({
		externalId: "dev:one@example.com",
		email: "shared@example.com",
		name: "One",
	});
	await expect(
		testDb.db.users.getOrCreate({
			externalId: "dev:two@example.com",
			email: "shared@example.com",
			name: "Two",
		}),
	).rejects.toMatchObject({
		name: "UniqueViolationError",
		constraint: "users_email_unique",
	});
});
