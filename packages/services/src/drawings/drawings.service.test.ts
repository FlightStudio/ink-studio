import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import type { Member, StrokePoint } from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AssetService } from "../assets/assets.service.ts";
import type { AssetStorage } from "../assets/assets.types.ts";
import { LetterService } from "../letters/letters.service.ts";
import type { Publisher } from "../queue/index.ts";
import {
	type CreateDrawingParams,
	DrawingService,
} from "./drawings.service.ts";

let testDb: TestDb;
let files: Map<string, Uint8Array>;
let drawings: DrawingService;
let letters: LetterService;
let assets: AssetService;
let publisher: Publisher;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

beforeEach(() => {
	files = new Map();
	const storage: AssetStorage = {
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
	publisher = {
		publish: vi.fn<Publisher["publish"]>(async () => {}),
	};
	drawings = new DrawingService(testDb.db, storage, publisher);
	letters = new LetterService(testDb.db, publisher);
	assets = new AssetService(testDb.db, storage, publisher);
});

function member(name: string): Promise<Member> {
	return seedDevIdentity(testDb.db, {
		email: `${name}@example.com`,
		organizationName: `${name} Studio`,
	});
}

async function teammate(owner: Member, name: string): Promise<Member> {
	const email = `${name}@example.com`;
	const { user } = await testDb.db.users.getOrCreate({
		externalId: `dev:${email}`,
		email,
		name,
	});
	const membership = await testDb.db.organizationUsers.create({
		userId: user.id,
		organizationId: owner.userOrganization.organizationId,
		role: "member",
	});
	return {
		user,
		userOrganization: {
			...membership,
			organization: owner.userOrganization.organization,
		},
	};
}

function png(width: number, height: number, type = "IHDR"): Uint8Array {
	const bytes = new Uint8Array(33);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	const view = new DataView(bytes.buffer);
	view.setUint32(8, 13);
	bytes.set(
		[...type].map((character) => character.charCodeAt(0)),
		12,
	);
	view.setUint32(16, width);
	view.setUint32(20, height);
	bytes[24] = 8;
	bytes[25] = 6;
	return bytes;
}

function streamOf(content: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(content);
			controller.close();
		},
	});
}

async function upload(
	caller: Member,
	purpose: "mask" | "photo",
	content: Uint8Array,
): Promise<string> {
	const asset = await assets.upload(caller.userOrganization, {
		purpose,
		filename: purpose === "mask" ? "mask.png" : "photo.jpg",
		declaredBytes: content.byteLength,
		body: streamOf(content),
		uploadedByUserId: caller.user.id,
	});
	return asset.id;
}

const JPEG = Uint8Array.from([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
	0x00, 0x00, 0x01, 0x00, 0x01,
]);

const point = [4, 8, 0.5, 12] as const satisfies StrokePoint;

function drawn(
	maskAssetId: string,
	name = "Fern",
	kind: CreateDrawingParams["kind"] = "doodle",
): CreateDrawingParams {
	return {
		kind,
		name,
		maskAssetId,
		source: {
			kind: "drawn",
			box: { widthPx: 120, heightPx: 80 },
			strokes: [{ input: "mouse", points: [[...point]] }],
		},
	};
}

it("a mask from another organization is not found", async () => {
	const ada = await member("ada-mask-org");
	const bob = await member("bob-mask-org");
	const maskAssetId = await upload(bob, "mask", png(20, 20));
	await expect(
		drawings.createDrawing(ada, drawn(maskAssetId)),
	).rejects.toMatchObject({ kind: "not_found", code: "not_found" });
});

it("a photographed doodle remembers its photo", async () => {
	const ada = await member("ada-photo-source");
	const photoAssetId = await upload(ada, "photo", JPEG);
	const maskAssetId = await upload(ada, "mask", png(40, 20));
	const { id } = await drawings.createDrawing(ada, {
		kind: "doodle",
		name: "Snap",
		maskAssetId,
		source: { kind: "photo", photoAssetId },
	});
	const stored = await testDb.db.drawings.byId(
		ada.userOrganization.organizationId,
		id,
	);
	expect(stored?.source).toEqual({ kind: "photo", photoAssetId });
	expect(stored?.aspect).toBe(2);
});

it("another organization's photo is not the source of a doodle", async () => {
	const ada = await member("ada-photo-owner");
	const bob = await member("bob-photo-owner");
	const photoAssetId = await upload(bob, "photo", JPEG);
	const maskAssetId = await upload(ada, "mask", png(20, 20));
	await expect(
		drawings.createDrawing(ada, {
			kind: "doodle",
			name: "Snap",
			maskAssetId,
			source: { kind: "photo", photoAssetId },
		}),
	).rejects.toMatchObject({ kind: "not_found", code: "not_found" });
});

it("only a photo can be the source of a photographed doodle", async () => {
	const ada = await member("ada-photo-kind");
	const maskAssetId = await upload(ada, "mask", png(20, 20));
	await expect(
		drawings.createDrawing(ada, {
			kind: "doodle",
			name: "Snap",
			maskAssetId,
			source: { kind: "photo", photoAssetId: maskAssetId },
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_drawing" });
});

it("a photo cannot be a mask", async () => {
	const ada = await member("ada-photo-mask");
	const photo = Uint8Array.from([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
		0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
	]);
	const maskAssetId = await upload(ada, "photo", photo);
	await expect(
		drawings.createDrawing(ada, drawn(maskAssetId)),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_mask" });
});

it("the aspect comes from the PNG", async () => {
	const ada = await member("ada-aspect");
	const maskAssetId = await upload(ada, "mask", png(1200, 600));
	const { id } = await drawings.createDrawing(ada, drawn(maskAssetId, "Wide"));
	const [library] = await drawings.listDrawings(ada, "doodle");
	expect(library).toEqual({
		id,
		kind: "doodle",
		name: "Wide",
		aspect: 2,
		maskAssetId,
	});
});

it("a PNG whose first chunk is not IHDR is refused", async () => {
	const ada = await member("ada-ihdr");
	const maskAssetId = await upload(ada, "mask", png(20, 20, "IDAT"));
	await expect(
		drawings.createDrawing(ada, drawn(maskAssetId)),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_mask" });
});

it("a mask over 4096 px on a side or with zero height is refused", async () => {
	const ada = await member("ada-mask-size");
	for (const [width, height] of [
		[4097, 10],
		[10, 4097],
		[10, 0],
		[0, 10],
	] as const) {
		const maskAssetId = await upload(ada, "mask", png(width, height));
		await expect(
			drawings.createDrawing(ada, drawn(maskAssetId)),
		).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_mask" });
	}
});

it("strokes with impossible values are refused", async () => {
	const ada = await member("ada-strokes");
	const maskAssetId = await upload(ada, "mask", png(20, 20));
	const base = drawn(maskAssetId);
	const tooManyStrokes = Array.from({ length: 2001 }, () => ({
		input: "pen" as const,
		points: [[...point]],
	}));
	const tooManyPoints = Array.from({ length: 4001 }, (_, index) => [
		index,
		0,
		0.5,
		index,
	]);
	const sources: CreateDrawingParams["source"][] = [
		{
			kind: "drawn",
			box: { widthPx: 10, heightPx: 10 },
			strokes: [{ input: "mouse", points: [[Number.NaN, 0, 0.5, 0]] }],
		},
		{
			kind: "drawn",
			box: { widthPx: 10, heightPx: 10 },
			strokes: [{ input: "pen", points: [[0, 0, 1.5, 0]] }],
		},
		{
			kind: "drawn",
			box: { widthPx: 10, heightPx: 10 },
			strokes: tooManyStrokes,
		},
		{
			kind: "drawn",
			box: { widthPx: 10, heightPx: 10 },
			strokes: [{ input: "mouse", points: tooManyPoints }],
		},
	];
	for (const source of sources) {
		await expect(
			drawings.createDrawing(ada, { ...base, source }),
		).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_drawing" });
	}
	expect(await drawings.listDrawings(ada, "doodle")).toEqual([]);
});

it("a name with control characters or over 60 characters is refused", async () => {
	const ada = await member("ada-name");
	const maskAssetId = await upload(ada, "mask", png(20, 20));
	for (const name of ["Fern\u0007", "Hello\n", "a".repeat(61)]) {
		await expect(
			drawings.createDrawing(ada, drawn(maskAssetId, name)),
		).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_drawing" });
	}
	expect(await drawings.listDrawings(ada, "doodle")).toEqual([]);
});

it("the library holds this organization's live drawings of one kind, newest first", async () => {
	const ada = await member("ada-library");
	const bob = await member("bob-library");
	const adaMask = await upload(ada, "mask", png(1200, 600));
	const bobMask = await upload(bob, "mask", png(1200, 600));
	const older = await drawings.createDrawing(ada, drawn(adaMask, "Older"));
	const signature = await drawings.createDrawing(
		ada,
		drawn(adaMask, "Karla", "signature"),
	);
	const newer = await drawings.createDrawing(ada, drawn(adaMask, "Newer"));
	const gone = await drawings.createDrawing(ada, drawn(adaMask, "Gone"));
	await drawings.createDrawing(bob, drawn(bobMask, "Bob"));
	await drawings.deleteDrawing(ada, gone.id);
	const doodles = await drawings.listDrawings(ada, "doodle");
	expect(doodles.map((item) => item.id)).toEqual([newer.id, older.id]);
	expect(doodles[0]).toEqual({
		id: newer.id,
		kind: "doodle",
		name: "Newer",
		aspect: 2,
		maskAssetId: adaMask,
	});
	expect(await drawings.listDrawings(ada, "signature")).toEqual([
		{
			id: signature.id,
			kind: "signature",
			name: "Karla",
			aspect: 2,
			maskAssetId: adaMask,
		},
	]);
	expect(
		(await drawings.listDrawings(bob, "doodle")).map((item) => item.name),
	).toEqual(["Bob"]);
});

it("another organization cannot rename or delete a drawing", async () => {
	const ada = await member("ada-private-drawing");
	const bob = await member("bob-private-drawing");
	const maskAssetId = await upload(ada, "mask", png(20, 20));
	const { id } = await drawings.createDrawing(ada, drawn(maskAssetId, "Mine"));
	await expect(drawings.renameDrawing(bob, id, "Stolen")).rejects.toMatchObject(
		{ kind: "not_found", code: "not_found" },
	);
	await expect(drawings.deleteDrawing(bob, id)).rejects.toMatchObject({
		kind: "not_found",
		code: "not_found",
	});
	expect(await drawings.listDrawings(ada, "doodle")).toEqual([
		{
			id,
			kind: "doodle",
			name: "Mine",
			aspect: 1,
			maskAssetId,
		},
	]);
});

it("a teammate sees Karla's doodles but not her signatures", async () => {
	const karla = await member("karla-share");
	const sam = await teammate(karla, "sam-share");
	const maskAssetId = await upload(karla, "mask", png(20, 10));
	const doodle = await drawings.createDrawing(
		karla,
		drawn(maskAssetId, "Shared fern"),
	);
	await drawings.createDrawing(
		karla,
		drawn(maskAssetId, "Karla's hand", "signature"),
	);
	expect(await drawings.listDrawings(sam, "signature")).toEqual([]);
	expect(await drawings.listDrawings(sam, "doodle")).toEqual([
		{
			id: doodle.id,
			kind: "doodle",
			name: "Shared fern",
			aspect: 2,
			maskAssetId,
		},
	]);
});

it("a teammate cannot rename or delete Karla's signature", async () => {
	const karla = await member("karla-own");
	const sam = await teammate(karla, "sam-own");
	const maskAssetId = await upload(karla, "mask", png(20, 20));
	const { id } = await drawings.createDrawing(
		karla,
		drawn(maskAssetId, "Karla's hand", "signature"),
	);
	await expect(drawings.renameDrawing(sam, id, "Sam's")).rejects.toMatchObject({
		kind: "forbidden",
		code: "not_owner",
	});
	await expect(drawings.deleteDrawing(sam, id)).rejects.toMatchObject({
		kind: "forbidden",
		code: "not_owner",
	});
	expect((await drawings.listDrawings(karla, "signature"))[0]?.name).toBe(
		"Karla's hand",
	);
});

it("a deleted drawing leaves the library and still renders in a letter using it", async () => {
	const ada = await member("ada-deleted-drawing");
	const maskAssetId = await upload(ada, "mask", png(1200, 600));
	const { id: drawingId } = await drawings.createDrawing(
		ada,
		drawn(maskAssetId, "Kept"),
	);
	const { id: letterId } = await letters.createLetter(ada, {});
	const letter = await testDb.db.letters.byId(
		ada.userOrganization.organizationId,
		letterId,
	);
	if (!letter) throw new Error("the letter is not stored");
	const elementId = uuidv7();
	await letters.saveLetter(ada, letterId, {
		title: letter.title,
		expectedRevision: 1,
		content: {
			...letter.content,
			doc: {
				...letter.content.doc,
				attrs: {
					...letter.content.doc.attrs,
					elements: [
						{
							id: elementId,
							kind: "drawing",
							drawingId,
							side: 0,
							xIn: 1,
							yIn: 1,
							widthIn: 2,
							heightIn: 1,
							rotationDeg: 0,
							tint: "ink-blue",
							wrap: false,
						},
					],
				},
			},
		},
	});
	await drawings.deleteDrawing(ada, drawingId);
	expect(await drawings.listDrawings(ada, "doodle")).toEqual([]);
	const loaded = await letters.getLetter(ada, letterId);
	expect(loaded?.resources.drawings).toEqual({
		[drawingId]: { maskAssetId, aspect: 2 },
	});
});

it("only a photo can be lifted", async () => {
	const ada = await member("ada-lift-mask");
	const maskId = await upload(ada, "mask", png(20, 10));
	await expect(
		drawings.requestLift(ada, { photoAssetId: maskId }),
	).rejects.toMatchObject({ code: "invalid_photo" });
});

it("another organization's photo is not found", async () => {
	const ada = await member("ada-lift-owner");
	const bob = await member("bob-lift-other");
	const photoId = await upload(ada, "photo", JPEG);
	await expect(
		drawings.requestLift(bob, { photoAssetId: photoId }),
	).rejects.toMatchObject({ code: "not_found" });
});

it("a lift request is a pending asset published after it commits", async () => {
	const ada = await member("ada-lift");
	const photoId = await upload(ada, "photo", JPEG);
	const organizationId = ada.userOrganization.organizationId;
	vi.mocked(publisher.publish).mockImplementation(async (_type, data) => {
		const assetId = (data as { assetId: string }).assetId;
		const row = await testDb.db.assets.byId(organizationId, assetId);
		expect(row?.processing).toEqual({
			status: "pending",
			attempts: 0,
			lastError: null,
		});
		expect(row?.origin).toEqual({
			source: "generated",
			job: { kind: "lift-ink", photoAssetId: photoId },
		});
	});
	const { assetId } = await drawings.requestLift(ada, {
		photoAssetId: photoId,
	});
	expect(publisher.publish).toHaveBeenCalledExactlyOnceWith("asset.lift-ink", {
		assetId,
	});
});
