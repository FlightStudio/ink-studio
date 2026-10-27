import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import type { Member, UploadPurpose } from "@repo/types";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AssetService } from "./assets.service.ts";
import type { AssetStorage } from "./assets.types.ts";

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
	assets = new AssetService(testDb.db, storage);
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
