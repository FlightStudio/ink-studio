import type { AssetProcessing } from "@repo/types";
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

const MINUTE = 60_000;

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

it("referenced reads many of the organization's assets at once", async () => {
	const ada = await member("ada-referenced");
	const bob = await member("bob-referenced");
	const organizationId = ada.userOrganization.organizationId;
	const first = await generated(organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const second = await generated(organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const foreign = await generated(bob.userOrganization.organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const found = await testDb.db.assets.referenced(organizationId, [
		first.id,
		second.id,
		foreign.id,
	]);
	expect(found.map((asset) => asset.id).sort()).toEqual(
		[first.id, second.id].sort(),
	);
	expect(await testDb.db.assets.referenced(organizationId, [])).toEqual([]);
});

async function generated(organizationId: string, processing: AssetProcessing) {
	const id = uuidv7();
	return testDb.db.assets.create({
		id,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${id}`,
		mimeType: "application/octet-stream",
		byteSize: null,
		checksum: null,
		origin: {
			source: "generated",
			job: { kind: "lift-ink", photoAssetId: uuidv7() },
		},
		processing,
	});
}

async function backdate(id: string, minutes: number) {
	await testDb.execute(
		"update assets set updated_at = now() - make_interval(mins => $2) where id = $1",
		[id, minutes],
	);
}

function minutesAgo(minutes: number): Date {
	return new Date(Date.now() - minutes * MINUTE);
}

it("a pending asset is claimed once and the claim counts an attempt", async () => {
	const ada = await member("ada-claim");
	const asset = await generated(ada.userOrganization.organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const claimed = await testDb.db.assets.claim(asset.id, minutesAgo(15));
	expect(claimed?.processing).toEqual({
		status: "running",
		attempts: 1,
		lastError: null,
	});
	expect(await testDb.db.assets.claim(asset.id, minutesAgo(15))).toBeNull();
});

it("a running asset is claimed again only once its lease ran out", async () => {
	const ada = await member("ada-lease");
	const asset = await generated(ada.userOrganization.organizationId, {
		status: "running",
		attempts: 1,
		lastError: null,
	});
	expect(await testDb.db.assets.claim(asset.id, minutesAgo(15))).toBeNull();
	await backdate(asset.id, 16);
	const claimed = await testDb.db.assets.claim(asset.id, minutesAgo(15));
	expect(claimed?.processing).toEqual({
		status: "running",
		attempts: 2,
		lastError: null,
	});
});

it("a finished asset is never claimed", async () => {
	const ada = await member("ada-finished");
	const organizationId = ada.userOrganization.organizationId;
	const done = await generated(organizationId, { status: "done", attempts: 1 });
	const failed = await generated(organizationId, {
		status: "failed",
		attempts: 3,
		error: "processing_failed",
	});
	await backdate(done.id, 60);
	await backdate(failed.id, 60);
	expect(await testDb.db.assets.claim(done.id, minutesAgo(15))).toBeNull();
	expect(await testDb.db.assets.claim(failed.id, minutesAgo(15))).toBeNull();
});

it("complete stores the file and clears the last error", async () => {
	const ada = await member("ada-complete");
	const organizationId = ada.userOrganization.organizationId;
	const asset = await generated(organizationId, {
		status: "pending",
		attempts: 1,
		lastError: "boom",
	});
	await testDb.db.assets.claim(asset.id, minutesAgo(15));
	await testDb.db.assets.complete(asset.id, {
		mimeType: "image/png",
		byteSize: 3,
		checksum: "c".repeat(64),
	});
	expect(await testDb.db.assets.byId(organizationId, asset.id)).toMatchObject({
		mimeType: "image/png",
		byteSize: 3,
		checksum: "c".repeat(64),
		processing: { status: "done", attempts: 2 },
	});
});

it("release puts a running asset back with its error and fail ends it", async () => {
	const ada = await member("ada-release");
	const organizationId = ada.userOrganization.organizationId;
	const released = await generated(organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const ended = await generated(organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	await testDb.db.assets.claim(released.id, minutesAgo(15));
	await testDb.db.assets.claim(ended.id, minutesAgo(15));
	await testDb.db.assets.release(released.id, "timeout");
	await testDb.db.assets.fail(ended.id, "photo_unreadable");
	expect(
		(await testDb.db.assets.byId(organizationId, released.id))?.processing,
	).toEqual({ status: "pending", attempts: 1, lastError: "timeout" });
	expect(
		(await testDb.db.assets.byId(organizationId, ended.id))?.processing,
	).toEqual({ status: "failed", attempts: 1, error: "photo_unreadable" });
});

it("a finished asset is not moved by a late release or fail", async () => {
	const ada = await member("ada-late");
	const organizationId = ada.userOrganization.organizationId;
	const asset = await generated(organizationId, {
		status: "done",
		attempts: 1,
	});
	await testDb.db.assets.release(asset.id, "late");
	await testDb.db.assets.fail(asset.id, "processing_failed");
	expect(
		(await testDb.db.assets.byId(organizationId, asset.id))?.processing,
	).toEqual({ status: "done", attempts: 1 });
});

it("stale finds unfinished work untouched since the cutoff", async () => {
	const ada = await member("ada-stale");
	const organizationId = ada.userOrganization.organizationId;
	const oldPending = await generated(organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const oldRunning = await generated(organizationId, {
		status: "running",
		attempts: 1,
		lastError: null,
	});
	const freshPending = await generated(organizationId, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const oldDone = await generated(organizationId, {
		status: "done",
		attempts: 1,
	});
	await backdate(oldPending.id, 10);
	await backdate(oldRunning.id, 10);
	await backdate(oldDone.id, 10);
	const ids = (await testDb.db.assets.stale(minutesAgo(5))).map(
		(asset) => asset.id,
	);
	expect(ids).toEqual(expect.arrayContaining([oldPending.id, oldRunning.id]));
	expect(ids).not.toContain(freshPending.id);
	expect(ids).not.toContain(oldDone.id);
});
