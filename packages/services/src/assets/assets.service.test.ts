import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import { ServiceError } from "@repo/errors";
import type { AssetProcessing, Member, UploadPurpose } from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Publisher } from "../queue/index.ts";
import { AssetService, generatedAsset } from "./assets.service.ts";
import type { AssetStorage, ProducedFile } from "./assets.types.ts";

const MiB = 1024 * 1024;

const PNG = bytes([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
]);
const JPEG = bytes([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
	0x00, 0x00, 0x01, 0x00, 0x01,
]);
const HEIC = bytes([
	0x00,
	0x00,
	0x00,
	0x18,
	...ascii("ftypheic"),
	0x00,
	0x00,
	0x00,
	0x00,
	...ascii("mif1heic"),
]);
const TTF = bytes([
	0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x80, 0x00, 0x03, 0x00, 0x20, 0x4f,
	0x53, 0x2f, 0x32,
]);
const OTF = bytes([
	...ascii("OTTO"),
	0x00,
	0x0a,
	0x00,
	0x80,
	0x00,
	0x03,
	0x00,
	0x20,
	...ascii("CFF "),
]);
const WOFF = bytes([
	...ascii("wOFF"),
	0x00,
	0x01,
	0x00,
	0x00,
	0,
	0,
	0,
	0,
	0,
	0,
]);

let testDb: TestDb;
let storage: {
	put: ReturnType<typeof vi.fn<AssetStorage["put"]>>;
	get: ReturnType<typeof vi.fn<AssetStorage["get"]>>;
	signedReadUrl: ReturnType<typeof vi.fn<AssetStorage["signedReadUrl"]>>;
};
let publisher: { publish: ReturnType<typeof vi.fn<Publisher["publish"]>> };
let assets: AssetService;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

beforeEach(() => {
	storage = {
		put: vi.fn<AssetStorage["put"]>(async () => {}),
		get: vi.fn<AssetStorage["get"]>(async () => new Uint8Array()),
		signedReadUrl: vi.fn<AssetStorage["signedReadUrl"]>(
			async ({ key }) => `https://storage.test/${key}?signed`,
		),
	};
	publisher = { publish: vi.fn<Publisher["publish"]>(async () => {}) };
	assets = new AssetService(testDb.db, storage, publisher);
});

function bytes(values: number[]): Uint8Array {
	return Uint8Array.from(values);
}

function ascii(text: string): number[] {
	return [...text].map((character) => character.charCodeAt(0));
}

function member(name: string): Promise<Member> {
	return seedDevIdentity(testDb.db, {
		email: `${name}@example.com`,
		organizationName: `${name} Studio`,
	});
}

function streamOf(content: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(content);
			controller.close();
		},
	});
}

function upload(
	caller: Member,
	purpose: UploadPurpose,
	filename: string,
	content: Uint8Array,
) {
	return assets.upload(caller.userOrganization, {
		purpose,
		filename,
		declaredBytes: content.byteLength,
		body: streamOf(content),
		uploadedByUserId: caller.user.id,
	});
}

it("a declared size over the limit is refused without reading the body", async () => {
	const ada = await member("ada-declared");
	const pull = vi.fn();
	const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
	await expect(
		assets.upload(ada.userOrganization, {
			purpose: "mask",
			filename: "huge.png",
			declaredBytes: 9 * MiB,
			body,
			uploadedByUserId: ada.user.id,
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "file_too_large" });
	expect(pull).not.toHaveBeenCalled();
	expect(storage.put).not.toHaveBeenCalled();
});

it("a body that grows past the limit is refused", async () => {
	const ada = await member("ada-growing");
	const chunk = new Uint8Array(MiB);
	chunk.set(PNG);
	let sent = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent === 9) {
				controller.close();
				return;
			}
			sent += 1;
			controller.enqueue(chunk.slice());
		},
	});
	await expect(
		assets.upload(ada.userOrganization, {
			purpose: "mask",
			filename: "growing.png",
			declaredBytes: null,
			body,
			uploadedByUserId: ada.user.id,
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "file_too_large" });
	expect(storage.put).not.toHaveBeenCalled();
});

it("the sniffed type is stored, not the name's", async () => {
	const ada = await member("ada-sniffed");
	const asset = await upload(ada, "photo", "photo.jpg", PNG);
	expect(asset.mimeType).toBe("image/png");
	expect(storage.put).toHaveBeenCalledWith(
		expect.objectContaining({ contentType: "image/png" }),
	);
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		asset.id,
	);
	expect(stored?.mimeType).toBe("image/png");
	expect(stored?.origin).toEqual({
		source: "uploaded",
		purpose: "photo",
		filename: "photo.jpg",
		uploadedByUserId: ada.user.id,
	});
});

it("HEIC is refused with its own code", async () => {
	const ada = await member("ada-heic");
	await expect(
		upload(ada, "photo", "IMG_0001.HEIC", HEIC),
	).rejects.toMatchObject({
		kind: "invalid_input",
		code: "heic_not_supported",
	});
	expect(storage.put).not.toHaveBeenCalled();
});

it("a type the purpose does not take is refused", async () => {
	const ada = await member("ada-wrong-type");
	await expect(
		upload(ada, "font-file", "heart.ttf", PNG),
	).rejects.toMatchObject({ kind: "invalid_input", code: "unsupported_file" });
	expect(storage.put).not.toHaveBeenCalled();
});

it("TrueType and OpenType are taken, WOFF is not", async () => {
	const ada = await member("ada-fonts");
	expect((await upload(ada, "font-file", "hand.ttf", TTF)).mimeType).toBe(
		"font/ttf",
	);
	expect((await upload(ada, "font-file", "hand.otf", OTF)).mimeType).toBe(
		"font/otf",
	);
	await expect(
		upload(ada, "font-file", "hand.woff", WOFF),
	).rejects.toMatchObject({ kind: "invalid_input", code: "unsupported_file" });
	expect(storage.put).toHaveBeenCalledTimes(2);
});

it("bytes go under the organization's prefix with their checksum", async () => {
	const ada = await member("ada-prefix");
	const organizationId = ada.userOrganization.organizationId;
	const asset = await upload(ada, "mask", "heart.png", PNG);
	const key = `organizations/${organizationId}/assets/${asset.id}`;
	expect(storage.put).toHaveBeenCalledWith({
		key,
		bytes: PNG,
		contentType: "image/png",
	});
	expect(await testDb.db.assets.byId(organizationId, asset.id)).toMatchObject({
		storageKey: key,
		byteSize: PNG.byteLength,
		checksum:
			"d51696591e6a664adeecee08d772d017975c6d8d466d015246afd911ca06d7e8",
		processing: { status: "done", attempts: 0 },
	});
});

it("another organization's asset is invisible", async () => {
	const ada = await member("ada-private-asset");
	const bob = await member("bob-private-asset");
	const asset = await upload(ada, "mask", "heart.png", PNG);
	expect(
		await assets.getAssetStatus(bob.userOrganization, asset.id),
	).toBeNull();
	expect(
		await assets.getAssetReadUrl(bob.userOrganization, asset.id),
	).toBeNull();
	expect(await assets.getAssetStatus(ada.userOrganization, asset.id)).toEqual({
		status: "done",
		error: null,
	});
	expect(storage.signedReadUrl).not.toHaveBeenCalled();
});

it("a finished lift-ink mask can be read back", async () => {
	const ada = await member("ada-lift-servable");
	const asset = await generated(ada, { status: "done", attempts: 1 });
	expect(await assets.getAssetReadUrl(ada.userOrganization, asset.id)).toBe(
		`https://storage.test/${asset.storageKey}?signed`,
	);
});

it("a raw photo is never read back, a mask is", async () => {
	const ada = await member("ada-servable");
	const photo = await upload(ada, "photo", "desk.jpg", JPEG);
	const mask = await upload(ada, "mask", "heart.png", PNG);
	expect(
		await assets.getAssetReadUrl(ada.userOrganization, photo.id),
	).toBeNull();
	expect(storage.signedReadUrl).not.toHaveBeenCalled();
	expect(await assets.getAssetReadUrl(ada.userOrganization, mask.id)).toBe(
		`https://storage.test/${mask.storageKey}?signed`,
	);
	expect(storage.signedReadUrl).toHaveBeenCalledExactlyOnceWith({
		key: mask.storageKey,
		expiresInSeconds: 300,
	});
});

const ABC = new TextEncoder().encode("abc");

function produced(): ProducedFile<null> {
	return { bytes: ABC, mimeType: "image/png", result: null };
}

async function generated(caller: Member, processing?: AssetProcessing) {
	const asset = generatedAsset(caller.userOrganization.organizationId, {
		kind: "lift-ink",
		photoAssetId: uuidv7(),
	});
	return testDb.db.assets.create(processing ? { ...asset, processing } : asset);
}

async function backdate(id: string, minutes: number) {
	await testDb.execute(
		"update assets set updated_at = now() - make_interval(mins => $2) where id = $1",
		[id, minutes],
	);
}

function processingOf(caller: Member, id: string) {
	return testDb.db.assets
		.byId(caller.userOrganization.organizationId, id)
		.then((asset) => asset?.processing);
}

it("a redelivered job for a finished asset does nothing", async () => {
	const ada = await member("ada-redelivered");
	const asset = await generated(ada, { status: "done", attempts: 1 });
	const produce = vi.fn(async () => produced());
	await assets.runJob({ assetId: asset.id, kind: "lift-ink", produce });
	expect(produce).not.toHaveBeenCalled();
	expect(storage.put).not.toHaveBeenCalled();
	expect(await processingOf(ada, asset.id)).toEqual({
		status: "done",
		attempts: 1,
	});
});

it("a finished job stores the output with its size and checksum", async () => {
	const ada = await member("ada-finished-job");
	const asset = await generated(ada);
	await assets.runJob({
		assetId: asset.id,
		kind: "lift-ink",
		produce: async () => produced(),
	});
	expect(storage.put).toHaveBeenCalledExactlyOnceWith({
		key: asset.storageKey,
		bytes: ABC,
		contentType: "image/png",
	});
	expect(
		await testDb.db.assets.byId(ada.userOrganization.organizationId, asset.id),
	).toMatchObject({
		mimeType: "image/png",
		byteSize: 3,
		checksum:
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		processing: { status: "done", attempts: 1 },
	});
});

it("two workers racing on one asset produce it once", async () => {
	const ada = await member("ada-racing");
	const asset = await generated(ada);
	const produce = vi.fn(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		return produced();
	});
	await Promise.all([
		assets.runJob({ assetId: asset.id, kind: "lift-ink", produce }),
		assets.runJob({ assetId: asset.id, kind: "lift-ink", produce }),
	]);
	expect(produce).toHaveBeenCalledOnce();
	expect(storage.put).toHaveBeenCalledOnce();
	expect(await processingOf(ada, asset.id)).toEqual({
		status: "done",
		attempts: 1,
	});
});

it("a transient failure releases the asset and nacks", async () => {
	const ada = await member("ada-transient");
	const asset = await generated(ada);
	await expect(
		assets.runJob({
			assetId: asset.id,
			kind: "lift-ink",
			produce: async () => {
				throw new Error("boom");
			},
		}),
	).rejects.toThrow("boom");
	expect(await processingOf(ada, asset.id)).toEqual({
		status: "pending",
		attempts: 1,
		lastError: "boom",
	});
});

it("the third transient failure fails the asset and stops", async () => {
	const ada = await member("ada-third");
	const asset = await generated(ada);
	const params = {
		assetId: asset.id,
		kind: "lift-ink" as const,
		produce: async (): Promise<ProducedFile<null>> => {
			throw new Error("boom");
		},
	};
	await expect(assets.runJob(params)).rejects.toThrow("boom");
	await expect(assets.runJob(params)).rejects.toThrow("boom");
	await expect(assets.runJob(params)).resolves.toBeUndefined();
	expect(await processingOf(ada, asset.id)).toEqual({
		status: "failed",
		attempts: 3,
		error: "processing_failed",
	});
	expect(await assets.getAssetStatus(ada.userOrganization, asset.id)).toEqual({
		status: "failed",
		error: "processing_failed",
	});
});

it("an input failure fails at once with its code", async () => {
	const ada = await member("ada-input");
	const asset = await generated(ada);
	await expect(
		assets.runJob({
			assetId: asset.id,
			kind: "lift-ink",
			produce: async () => {
				throw new ServiceError("invalid_input", "photo_unreadable");
			},
		}),
	).resolves.toBeUndefined();
	expect(await processingOf(ada, asset.id)).toEqual({
		status: "failed",
		attempts: 1,
		error: "photo_unreadable",
	});
	expect(storage.put).not.toHaveBeenCalled();
});

it("a running asset whose lease ran out is taken over", async () => {
	const ada = await member("ada-lease");
	const asset = await generated(ada, {
		status: "running",
		attempts: 1,
		lastError: null,
	});
	const produce = vi.fn(async () => produced());
	await assets.runJob({ assetId: asset.id, kind: "lift-ink", produce });
	expect(produce).not.toHaveBeenCalled();
	await backdate(asset.id, 16);
	await assets.runJob({ assetId: asset.id, kind: "lift-ink", produce });
	expect(produce).toHaveBeenCalledOnce();
	expect(await processingOf(ada, asset.id)).toEqual({
		status: "done",
		attempts: 2,
	});
});

it("onComplete commits with the asset or not at all", async () => {
	const ada = await member("ada-on-complete");
	const organizationId = ada.userOrganization.organizationId;
	const rolledBack = await generated(ada);
	const committed = await generated(ada);
	const siblingOf = new Map([
		[rolledBack.id, uuidv7()],
		[committed.id, uuidv7()],
	]);
	const writeSibling = async (
		tx: Parameters<
			NonNullable<Parameters<AssetService["runJob"]>[0]["onComplete"]>
		>[0],
		siblingId: string,
	) => {
		await tx.assets.create({
			...generatedAsset(organizationId, {
				kind: "lift-ink",
				photoAssetId: uuidv7(),
			}),
			id: siblingId,
		});
	};
	await expect(
		assets.runJob({
			assetId: rolledBack.id,
			kind: "lift-ink",
			produce: async (_job, asset) => ({
				...produced(),
				result: siblingOf.get(asset.id) ?? "",
			}),
			onComplete: async (tx, _asset, siblingId) => {
				await writeSibling(tx, siblingId);
				throw new Error("after the write");
			},
		}),
	).rejects.toThrow("after the write");
	expect(await processingOf(ada, rolledBack.id)).toEqual({
		status: "pending",
		attempts: 1,
		lastError: "after the write",
	});
	expect(
		await testDb.db.assets.byId(
			organizationId,
			siblingOf.get(rolledBack.id) ?? "",
		),
	).toBeNull();

	const onComplete = vi.fn(writeSibling);
	await assets.runJob({
		assetId: committed.id,
		kind: "lift-ink",
		produce: async (_job, asset) => ({
			...produced(),
			result: siblingOf.get(asset.id) ?? "",
		}),
		onComplete: (tx, _asset, siblingId) => onComplete(tx, siblingId),
	});
	expect(await processingOf(ada, committed.id)).toEqual({
		status: "done",
		attempts: 1,
	});
	expect(
		await testDb.db.assets.byId(
			organizationId,
			siblingOf.get(committed.id) ?? "",
		),
	).not.toBeNull();
});

it("the sweep republishes stale work only", async () => {
	const ada = await member("ada-sweep");
	const stalePending = await generated(ada);
	await generated(ada);
	const done = await generated(ada, { status: "done", attempts: 1 });
	const leasedRunning = await generated(ada, {
		status: "running",
		attempts: 1,
		lastError: null,
	});
	await backdate(stalePending.id, 6);
	await backdate(done.id, 6);
	await backdate(leasedRunning.id, 6);
	expect(await assets.sweep(new Date())).toBe(1);
	expect(publisher.publish).toHaveBeenCalledExactlyOnceWith("asset.lift-ink", {
		assetId: stalePending.id,
	});
});
