import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import { SharpImageProcessor } from "@repo/integrations/worker/image";
import type { AssetStorage } from "@repo/services/assets";
import { AssetService } from "@repo/services/assets";
import { DrawingService } from "@repo/services/drawings";
import type { Publisher } from "@repo/services/queue";
import type { Member } from "@repo/types";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AssetLiftInkProcessor } from "./asset-lift-ink.ts";

let testDb: TestDb;
let files: Map<string, Uint8Array>;
let storage: AssetStorage;
let assets: AssetService;
let drawings: DrawingService;
let processor: AssetLiftInkProcessor;

beforeAll(async () => {
	testDb = await startTestDb();
	files = new Map();
	storage = {
		put: vi.fn<AssetStorage["put"]>(async ({ key, bytes }) => {
			files.set(key, bytes);
		}),
		get: vi.fn<AssetStorage["get"]>(
			async (key) => files.get(key) ?? new Uint8Array(),
		),
		signedReadUrl: vi.fn<AssetStorage["signedReadUrl"]>(
			async ({ key }) => `https://storage.test/${key}?signed`,
		),
	};
	const publisher: Publisher = {
		publish: vi.fn<Publisher["publish"]>(async () => {}),
	};
	assets = new AssetService(testDb.db, storage, publisher);
	drawings = new DrawingService(testDb.db, storage, publisher);
	processor = new AssetLiftInkProcessor({
		db: testDb.db,
		assets,
		storage,
		images: new SharpImageProcessor(),
	});
});

afterAll(async () => {
	await testDb?.stop();
});

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

async function upload(caller: Member, content: Uint8Array): Promise<string> {
	const asset = await assets.upload(caller.userOrganization, {
		purpose: "photo",
		filename: "doodle.jpg",
		declaredBytes: content.byteLength,
		body: streamOf(content),
		uploadedByUserId: caller.user.id,
	});
	return asset.id;
}

async function inkPhoto(): Promise<Uint8Array> {
	const svg = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="white"/><circle cx="200" cy="160" r="7" fill="black"/><path d="M80 220 C 120 180, 160 260, 220 210" stroke="black" stroke-width="3" fill="none"/></svg>`,
	);
	return new Uint8Array(await sharp(svg).jpeg().toBuffer());
}

const STUB_JPEG = Uint8Array.from([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
	0x00, 0x00, 0x01, 0x00, 0x01,
]);

it("the processor stores the lifted mask", async () => {
	const ada = await member("ada-lift-store");
	const photoId = await upload(ada, await inkPhoto());
	const { assetId } = await drawings.requestLift(ada, {
		photoAssetId: photoId,
	});
	await processor.process({
		id: "1",
		type: processor.type,
		data: { assetId },
		attributes: {},
	});
	const stored = vi.mocked(storage.put).mock.calls.at(-1)?.[0];
	expect(stored?.contentType).toBe("image/png");
	expect(stored?.bytes[0]).toBe(0x89);
	expect(stored?.bytes[25]).toBe(6);
});

it("an unreadable photo fails without retrying", async () => {
	const ada = await member("ada-lift-unreadable");
	const photoId = await upload(ada, STUB_JPEG);
	const { assetId } = await drawings.requestLift(ada, {
		photoAssetId: photoId,
	});
	await expect(
		processor.process({
			id: "2",
			type: processor.type,
			data: { assetId },
			attributes: {},
		}),
	).resolves.toBeUndefined();
	expect(
		await testDb.db.assets
			.byId(ada.userOrganization.organizationId, assetId)
			.then((asset) => asset?.processing),
	).toEqual({ status: "failed", attempts: 1, error: "photo_unreadable" });
});

it("a lifted mask can be read back", async () => {
	const ada = await member("ada-lift-read");
	const photoId = await upload(ada, await inkPhoto());
	const { assetId } = await drawings.requestLift(ada, {
		photoAssetId: photoId,
	});
	await processor.process({
		id: "3",
		type: processor.type,
		data: { assetId },
		attributes: {},
	});
	expect(await assets.getAssetReadUrl(ada.userOrganization, assetId)).toBe(
		`https://storage.test/organizations/${ada.userOrganization.organizationId}/assets/${assetId}/attempts/1?signed`,
	);
});
