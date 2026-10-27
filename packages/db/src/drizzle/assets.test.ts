import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedDevIdentity } from "../testing/seed-dev-identity.ts";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

function member(name: string) {
	return seedDevIdentity(testDb.db, {
		email: `${name}@example.com`,
		organizationName: `${name} Studio`,
	});
}

it("an uploaded asset reads back as it was stored", async () => {
	const ada = await member("ada-asset");
	const organizationId = ada.userOrganization.organizationId;
	const id = uuidv7();
	const asset = await testDb.db.assets.create({
		id,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${id}`,
		mimeType: "image/png",
		byteSize: 68,
		checksum: "a".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "heart.png",
			uploadedByUserId: ada.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	expect(asset).toMatchObject({
		id,
		organizationId,
		mimeType: "image/png",
		byteSize: 68,
		origin: { source: "uploaded", purpose: "mask", filename: "heart.png" },
		processing: { status: "done", attempts: 0 },
	});
	expect(await testDb.db.assets.byId(organizationId, id)).toEqual(asset);
});

it("a generated asset carries its job and a pending one its last error", async () => {
	const ada = await member("ada-generated");
	const organizationId = ada.userOrganization.organizationId;
	const id = uuidv7();
	const photoAssetId = uuidv7();
	const asset = await testDb.db.assets.create({
		id,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${id}`,
		mimeType: "image/png",
		byteSize: null,
		checksum: null,
		origin: { source: "generated", job: { kind: "lift-ink", photoAssetId } },
		processing: { status: "pending", attempts: 1, lastError: "timeout" },
	});
	expect(asset.origin).toEqual({
		source: "generated",
		job: { kind: "lift-ink", photoAssetId },
	});
	expect(asset.processing).toEqual({
		status: "pending",
		attempts: 1,
		lastError: "timeout",
	});
	expect(await testDb.db.assets.byId(organizationId, id)).toEqual(asset);
});

it("another organization finds nothing", async () => {
	const ada = await member("ada-owner");
	const bob = await member("bob-neighbour");
	const organizationId = ada.userOrganization.organizationId;
	const id = uuidv7();
	await testDb.db.assets.create({
		id,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${id}`,
		mimeType: "image/png",
		byteSize: 68,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "heart.png",
			uploadedByUserId: ada.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	expect(
		await testDb.db.assets.byId(bob.userOrganization.organizationId, id),
	).toBeNull();
});
