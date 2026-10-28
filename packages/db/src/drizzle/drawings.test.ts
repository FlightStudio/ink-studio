import type { DrawingSource } from "@repo/types";
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

const source: DrawingSource = {
	kind: "drawn",
	box: { widthPx: 10, heightPx: 10 },
	strokes: [],
};

async function mask(organizationId: string, userId: string): Promise<string> {
	const id = uuidv7();
	await testDb.db.assets.create({
		id,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${id}`,
		mimeType: "image/png",
		byteSize: 33,
		checksum: "a".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "mask.png",
			uploadedByUserId: userId,
		},
		processing: { status: "done", attempts: 0 },
	});
	return id;
}

it("live drawings of one kind come back newest first and a deleted one stays readable", async () => {
	const ada = await seedDevIdentity(testDb.db, {
		email: "ada-drawings@example.com",
		organizationName: "Ada drawings",
	});
	const organizationId = ada.userOrganization.organizationId;
	const maskAssetId = await mask(organizationId, ada.user.id);
	const older = await testDb.db.drawings.create({
		organizationId,
		ownerUserId: ada.user.id,
		kind: "doodle",
		name: "Older",
		source,
		maskAssetId,
		aspect: 1,
	});
	const newer = await testDb.db.drawings.create({
		organizationId,
		ownerUserId: ada.user.id,
		kind: "doodle",
		name: "Newer",
		source,
		maskAssetId,
		aspect: 2,
	});
	await testDb.db.drawings.create({
		organizationId,
		ownerUserId: ada.user.id,
		kind: "signature",
		name: "Hand",
		source,
		maskAssetId,
		aspect: 3,
	});
	expect(
		(await testDb.db.drawings.list(organizationId, "doodle")).map(
			(drawing) => drawing.id,
		),
	).toEqual([newer.id, older.id]);
	expect(await testDb.db.drawings.softDelete(organizationId, newer.id)).toBe(
		true,
	);
	expect(
		(await testDb.db.drawings.list(organizationId, "doodle")).map(
			(drawing) => drawing.id,
		),
	).toEqual([older.id]);
	expect(await testDb.db.drawings.byId(organizationId, newer.id)).toBeNull();
	const kept = await testDb.db.drawings.referenced(organizationId, [
		newer.id,
		older.id,
	]);
	expect(kept.map((drawing) => drawing.id).sort()).toEqual(
		[newer.id, older.id].sort(),
	);
	expect(
		kept.find((drawing) => drawing.id === newer.id)?.deletedAt,
	).toBeInstanceOf(Date);
});
