import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import { ServiceError } from "@repo/errors";
import {
	type FontBuilder,
	OpentypeFontBuilder,
} from "@repo/integrations/worker/font";
import type { AssetStorage } from "@repo/services/assets";
import { AssetService, generatedAsset } from "@repo/services/assets";
import type { Publisher } from "@repo/services/queue";
import { CELL, type Member, type Stroke } from "@repo/types";
import opentype from "opentype.js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AssetBuildFontProcessor } from "./asset-build-font.ts";

let testDb: TestDb;
let files: Map<string, Uint8Array>;
let storage: AssetStorage;
let assets: AssetService;

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

function stem(): Stroke {
	const steps = 8;
	const points: Stroke["points"] = [];
	for (let index = 0; index <= steps; index += 1) {
		const y = CELL.ascender + ((CELL.baseline - CELL.ascender) * index) / steps;
		points.push([500, y, 0.5, index]);
	}
	return { input: "pen", points };
}

function processorFor(builder: FontBuilder): AssetBuildFontProcessor {
	return new AssetBuildFontProcessor({
		db: testDb.db,
		assets,
		storage,
		builder,
	});
}

async function drawnFont(caller: Member, assetId: string | null) {
	return testDb.db.fonts.create({
		organizationId: caller.userOrganization.organizationId,
		ownerUserId: caller.user.id,
		ownerName: "Karla",
		source: {
			kind: "drawn",
			glyphs: [{ char: "l", variant: 0, strokes: [stem()] }],
		},
		fontAssetId: assetId,
		pendingFontAssetId: null,
		chars: "",
	});
}

async function pendingBuild(caller: Member, fontId: string) {
	return testDb.db.assets.create(
		generatedAsset(caller.userOrganization.organizationId, {
			kind: "build-font",
			fontId,
		}),
	);
}

function message(processor: AssetBuildFontProcessor, assetId: string) {
	return {
		id: assetId,
		type: processor.type,
		data: { assetId },
		attributes: {},
	};
}

function parsed(bytes: Uint8Array) {
	return opentype.parse(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
	);
}

it("a drawn stroke makes a glyph as tall as its centre line plus its width", async () => {
	const karla = await member("karla-stem");
	const font = await drawnFont(karla, null);
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const processor = processorFor(new OpentypeFontBuilder());
	await processor.process(message(processor, asset.id));
	const bytes = files.get(asset.storageKey);
	if (!bytes) throw new Error("the font file was not stored");
	const built = parsed(bytes);
	const box = built.charToGlyph("l").getBoundingBox();
	expect(Math.abs(box.y1 - -20)).toBeLessThanOrEqual(5);
	expect(Math.abs(box.y2 - 620)).toBeLessThanOrEqual(5);
	expect(built.getEnglishName("fontFamily")).toBe(`own-${font.id}`);
});

it("a finished build becomes the font in use and records its characters", async () => {
	const karla = await member("karla-finished-font");
	const font = await drawnFont(karla, null);
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const processor = processorFor(new OpentypeFontBuilder());
	await processor.process(message(processor, asset.id));
	const stored = await testDb.db.fonts.byId(
		karla.userOrganization.organizationId,
		font.id,
	);
	expect(stored?.fontAssetId).toBe(asset.id);
	expect(stored?.pendingFontAssetId).toBeNull();
	expect(stored?.chars).toBe("l");
	expect(await assets.getAssetReadUrl(karla.userOrganization, asset.id)).toBe(
		`https://storage.test/${asset.storageKey}?signed`,
	);
});

it("a template photo is built from the photograph", async () => {
	const karla = await member("karla-template-photo");
	const photoId = crypto.randomUUID();
	const storageKey = `organizations/${karla.userOrganization.organizationId}/assets/${photoId}`;
	const photo = new Uint8Array([9, 8, 7]);
	files.set(storageKey, photo);
	await testDb.db.assets.create({
		id: photoId,
		organizationId: karla.userOrganization.organizationId,
		storageKey,
		mimeType: "image/png",
		byteSize: photo.byteLength,
		checksum: "c".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "template.png",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const font = await testDb.db.fonts.create({
		organizationId: karla.userOrganization.organizationId,
		ownerUserId: karla.user.id,
		ownerName: "Karla",
		source: {
			kind: "template-photo",
			templateVersion: 1,
			photoAssetId: photoId,
		},
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const fromTemplatePhoto = vi.fn<FontBuilder["fromTemplatePhoto"]>(
		async () => ({
			bytes: Uint8Array.from([4]),
			chars: "lo",
		}),
	);
	const processor = processorFor({
		fromStrokeOutlines: async () => {
			throw new Error("drawn");
		},
		fromTemplatePhoto,
		fromUpload: async () => {
			throw new Error("upload");
		},
	});
	await processor.process(message(processor, asset.id));
	expect(fromTemplatePhoto).toHaveBeenCalledExactlyOnceWith({
		familyName: `own-${font.id}`,
		photo,
	});
	const stored = await testDb.db.fonts.byId(
		karla.userOrganization.organizationId,
		font.id,
	);
	expect(stored?.fontAssetId).toBe(asset.id);
	expect(stored?.chars).toBe("lo");
});

it("an uploaded file is rebuilt from its bytes", async () => {
	const karla = await member("karla-upload-font");
	const fileId = crypto.randomUUID();
	const storageKey = `organizations/${karla.userOrganization.organizationId}/assets/${fileId}`;
	const file = new Uint8Array([1, 2, 3, 4]);
	files.set(storageKey, file);
	await testDb.db.assets.create({
		id: fileId,
		organizationId: karla.userOrganization.organizationId,
		storageKey,
		mimeType: "font/ttf",
		byteSize: file.byteLength,
		checksum: "e".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "font-file",
			filename: "hand.ttf",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const font = await testDb.db.fonts.create({
		organizationId: karla.userOrganization.organizationId,
		ownerUserId: karla.user.id,
		ownerName: "Karla",
		source: { kind: "upload", fileAssetId: fileId },
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const fromUpload = vi.fn<FontBuilder["fromUpload"]>(async () => ({
		bytes: Uint8Array.from([4]),
		chars: "lo",
	}));
	const processor = processorFor({
		fromStrokeOutlines: async () => {
			throw new Error("drawn");
		},
		fromTemplatePhoto: async () => {
			throw new Error("template");
		},
		fromUpload,
	});
	await processor.process(message(processor, asset.id));
	expect(fromUpload).toHaveBeenCalledExactlyOnceWith({
		familyName: `own-${font.id}`,
		file,
	});
	const stored = await testDb.db.fonts.byId(
		karla.userOrganization.organizationId,
		font.id,
	);
	expect(stored?.fontAssetId).toBe(asset.id);
	expect(stored?.chars).toBe("lo");
});

it("a failed rebuild leaves the last good build in use", async () => {
	const karla = await member("karla-failed-font");
	const good = await pendingBuild(
		karla,
		"0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99",
	);
	const font = await drawnFont(karla, good.id);
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const processor = processorFor({
		fromStrokeOutlines: async () => {
			throw new Error("disk");
		},
		fromTemplatePhoto: async () => {
			throw new Error("disk");
		},
		fromUpload: async () => {
			throw new Error("disk");
		},
	});
	await expect(processor.process(message(processor, asset.id))).rejects.toThrow(
		"disk",
	);
	const stored = await testDb.db.fonts.byId(
		karla.userOrganization.organizationId,
		font.id,
	);
	expect(stored?.fontAssetId).toBe(good.id);
});

it("drawn variants become alternates, and a cleared first one gives way to the next", async () => {
	const karla = await member("karla-drawn-variants");
	const font = await testDb.db.fonts.create({
		organizationId: karla.userOrganization.organizationId,
		ownerUserId: karla.user.id,
		ownerName: "Karla",
		source: {
			kind: "drawn",
			glyphs: [
				{ char: "l", variant: 0, strokes: [stem()] },
				{ char: "e", variant: 0, strokes: [] },
				{ char: "e", variant: 1, strokes: [stem()] },
				{ char: "e", variant: 2, strokes: [stem()] },
			],
		},
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const processor = processorFor(new OpentypeFontBuilder());
	await processor.process(message(processor, asset.id));
	const bytes = files.get(asset.storageKey);
	if (!bytes) throw new Error("the font file was not stored");
	const built = parsed(bytes);
	expect(built.charToGlyph("e").name).toBe("e");
	const names: string[] = [];
	for (let index = 0; index < built.glyphs.length; index += 1) {
		names.push(built.glyphs.get(index).name ?? "");
	}
	expect(names).toContain("e.alt1");
	expect(names).not.toContain("e.alt2");
	const stored = await testDb.db.fonts.byId(
		karla.userOrganization.organizationId,
		font.id,
	);
	expect(stored?.chars).toBe("le");
});

it("a photo without its corner marks fails the build once, on the font's pending build", async () => {
	const karla = await member("karla-markers-font");
	const photoId = crypto.randomUUID();
	const storageKey = `organizations/${karla.userOrganization.organizationId}/assets/${photoId}`;
	files.set(storageKey, new Uint8Array([1]));
	await testDb.db.assets.create({
		id: photoId,
		organizationId: karla.userOrganization.organizationId,
		storageKey,
		mimeType: "image/png",
		byteSize: 1,
		checksum: "c".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "template.png",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const font = await testDb.db.fonts.create({
		organizationId: karla.userOrganization.organizationId,
		ownerUserId: karla.user.id,
		ownerName: "Karla",
		source: {
			kind: "template-photo",
			templateVersion: 1,
			photoAssetId: photoId,
		},
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	const asset = await pendingBuild(karla, font.id);
	await testDb.db.fonts.setPending(
		karla.userOrganization.organizationId,
		font.id,
		asset.id,
	);
	const fromTemplatePhoto = vi.fn<FontBuilder["fromTemplatePhoto"]>(
		async () => {
			throw new ServiceError("invalid_input", "template_markers_not_found");
		},
	);
	const processor = processorFor({
		fromStrokeOutlines: async () => {
			throw new Error("drawn");
		},
		fromTemplatePhoto,
		fromUpload: async () => {
			throw new Error("upload");
		},
	});
	await processor.process(message(processor, asset.id));
	await processor.process(message(processor, asset.id));
	expect(fromTemplatePhoto).toHaveBeenCalledOnce();
	const stored = await testDb.db.fonts.byId(
		karla.userOrganization.organizationId,
		font.id,
	);
	expect(stored?.pendingBuild).toEqual({
		status: "failed",
		attempts: 1,
		error: "template_markers_not_found",
	});
});
