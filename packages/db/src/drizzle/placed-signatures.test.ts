import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LetterContent, PageFormatId, PlacedElement } from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedDevIdentity } from "../testing/seed-dev-identity.ts";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";

const MIGRATION = readFileSync(
	resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../drizzle/0005_placed_signatures.sql",
	),
	"utf8",
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

async function studio(name: string) {
	const ada = await seedDevIdentity(testDb.db, {
		email: `${name}@example.com`,
		organizationName: name,
	});
	const organizationId = ada.userOrganization.organizationId;
	const maskAssetId = uuidv7();
	await testDb.db.assets.create({
		id: maskAssetId,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${maskAssetId}`,
		mimeType: "image/png",
		byteSize: 33,
		checksum: "a".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "signature.png",
			uploadedByUserId: ada.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const signature = await testDb.db.drawings.create({
		organizationId,
		ownerUserId: ada.user.id,
		kind: "signature",
		name: "Ada",
		source: { kind: "drawn", box: { widthPx: 10, heightPx: 10 }, strokes: [] },
		maskAssetId,
		aspect: 3,
	});
	return { organizationId, signatureId: signature.id };
}

const doodle: PlacedElement = {
	id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a40",
	kind: "drawing",
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a41",
	side: 0,
	xIn: 1,
	yIn: 1,
	widthIn: 1,
	heightIn: 1,
	rotationDeg: 10,
	tint: "forest",
	wrap: true,
};

function content(format: PageFormatId): LetterContent {
	return {
		schemaVersion: 1,
		format,
		defaults: {
			font: { kind: "stock", id: "caveat" },
			sizePt: 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: { elements: [doodle], minSides: 1, frontImageAssetId: null },
			content: [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [{ type: "text", text: "Love," }],
				},
			],
		},
	};
}

async function storedWith(
	organizationId: string,
	stored: unknown,
	format: PageFormatId,
): Promise<string> {
	const letter = await testDb.db.letters.create({
		organizationId,
		title: "Signed",
		content: content(format),
	});
	await testDb.execute("update letters set content = $1 where id = $2", [
		JSON.stringify(stored),
		letter.id,
	]);
	return letter.id;
}

function signedInText(format: PageFormatId, signatureId: string) {
	const base = content(format);
	return {
		...base,
		doc: {
			...base.doc,
			content: [
				...base.doc.content,
				{
					type: "signature",
					attrs: {
						drawingId: signatureId,
						widthIn: 2.25,
						align: "right",
						color: "sepia",
					},
				},
			],
		},
	};
}

it("a signature in a letter's text moves onto the page, bottom right of the first side", async () => {
	const { organizationId, signatureId } = await studio("ada-migrate-letter");
	const id = await storedWith(
		organizationId,
		signedInText("thanksio:letter-windowless", signatureId),
		"thanksio:letter-windowless",
	);
	await testDb.execute(MIGRATION);
	const letter = await testDb.db.letters.byId(organizationId, id);
	expect(letter?.content.doc.content).toEqual(
		content("thanksio:letter-windowless").doc.content,
	);
	const [kept, placed] = letter?.content.doc.attrs.elements ?? [];
	expect(kept).toEqual(doodle);
	expect(placed).toEqual({
		id: expect.stringMatching(UUID),
		kind: "signature",
		drawingId: signatureId,
		side: 0,
		xIn: 5.5,
		yIn: 9.5,
		widthIn: 2.25,
		heightIn: 0.75,
		rotationDeg: 0,
		tint: "sepia",
		wrap: false,
	});
});

it("a postcard's signature lands bottom left of its back, clear of the address", async () => {
	const { organizationId, signatureId } = await studio("ada-migrate-postcard");
	const id = await storedWith(
		organizationId,
		signedInText("thanksio:postcard-6x9", signatureId),
		"thanksio:postcard-6x9",
	);
	await testDb.execute(MIGRATION);
	const letter = await testDb.db.letters.byId(organizationId, id);
	const placed = letter?.content.doc.attrs.elements.at(-1);
	expect(placed?.side).toBe(1);
	expect(placed?.xIn).toBe(0.375);
	expect(placed?.yIn).toBeCloseTo(1838 / 300 - 0.375 - 0.75, 6);
});

it("a letter with no signature is left exactly as it was", async () => {
	const { organizationId } = await studio("ada-migrate-unsigned");
	const unsigned = content("thanksio:letter-windowless");
	const id = await storedWith(
		organizationId,
		unsigned,
		"thanksio:letter-windowless",
	);
	const before = await testDb.db.letters.byId(organizationId, id);
	await testDb.execute(MIGRATION);
	const after = await testDb.db.letters.byId(organizationId, id);
	expect(after?.content).toEqual(unsigned);
	expect(after?.updatedAt).toEqual(before?.updatedAt);
});
