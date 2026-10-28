import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import type { LetterContent, Member } from "@repo/types";
import { SAMPLE_MERGE_VALUES } from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { generatedAsset } from "../assets/assets.service.ts";
import { FontService } from "../fonts/fonts.service.ts";
import type { Publisher } from "../queue/queue.types.ts";
import { LetterService } from "./letters.service.ts";

const ownFontId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10";

let testDb: TestDb;
let letters: LetterService;

beforeAll(async () => {
	testDb = await startTestDb();
	letters = new LetterService(testDb.db, { publish: async () => {} });
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

function organizationId(caller: Member): string {
	return caller.userOrganization.organizationId;
}

async function stored(caller: Member, id: string) {
	const letter = await testDb.db.letters.byId(organizationId(caller), id);
	if (!letter) throw new Error("the letter is not stored");
	return letter;
}

function written(content: LetterContent, text: string): LetterContent {
	return {
		...content,
		doc: {
			...content.doc,
			content: [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [{ type: "text", text }],
				},
			],
		},
	};
}

it("a new letter is an untitled empty Caveat letter in ink blue", async () => {
	const ada = await member("ada");
	const { id } = await letters.createLetter(ada, {});
	const letter = await stored(ada, id);
	expect(letter.title).toBe("Untitled letter");
	expect(letter.revision).toBe(1);
	expect(letter.content).toEqual({
		schemaVersion: 1,
		format: "thanksio:letter-windowless",
		defaults: {
			font: { kind: "stock", id: "caveat" },
			sizePt: 20,
			color: "ink-blue",
		},
		doc: {
			type: "doc",
			attrs: { elements: [], minSides: 1, frontImageAssetId: null },
			content: [{ type: "paragraph", attrs: { align: "left" } }],
		},
	});
	expect(await letters.getLetter(ada, id)).toEqual({
		id,
		title: "Untitled letter",
		content: letter.content,
		revision: 1,
		resources: {
			assetBaseUrl: "/api/assets/",
			stockFontBaseUrl: "/fonts/stock/",
			fonts: {},
			drawings: {},
		},
		sealFonts: {},
		editable: true,
	});
});

it("a new postcard is titled as one", async () => {
	const ada = await member("ada-postcard");
	const { id } = await letters.createLetter(ada, {
		format: "thanksio:postcard-6x9",
	});
	const letter = await stored(ada, id);
	expect(letter.title).toBe("Untitled postcard");
	expect(letter.content.format).toBe("thanksio:postcard-6x9");
	expect(letter.content.doc.attrs.minSides).toBe(2);
	expect(letter.content.doc.attrs.frontImageAssetId).toBeNull();
});

it("a stale save is refused and changes nothing", async () => {
	const ada = await member("ada-stale");
	const { id } = await letters.createLetter(ada, {});
	const { content } = await stored(ada, id);
	const first = written(content, "Dear Alex,");
	expect(
		await letters.saveLetter(ada, id, {
			title: "To Alex",
			content: first,
			expectedRevision: 1,
		}),
	).toEqual({ revision: 2 });
	await expect(
		letters.saveLetter(ada, id, {
			title: "From another tab",
			content: written(content, "Dear Sam,"),
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ kind: "conflict", code: "stale_revision" });
	const letter = await stored(ada, id);
	expect(letter.title).toBe("To Alex");
	expect(letter.revision).toBe(2);
	expect(letter.content).toEqual(first);
});

it("another organization cannot read, save or delete the letter", async () => {
	const ada = await member("ada-private");
	const bob = await member("bob-private");
	const { id } = await letters.createLetter(ada, {});
	const { content } = await stored(ada, id);
	expect(await letters.getLetter(bob, id)).toBeNull();
	await expect(
		letters.saveLetter(bob, id, {
			title: "Taken",
			content: written(content, "Not yours"),
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ kind: "not_found", code: "not_found" });
	await expect(letters.deleteLetter(bob, id)).rejects.toMatchObject({
		kind: "not_found",
		code: "not_found",
	});
	const letter = await stored(ada, id);
	expect(letter.title).toBe("Untitled letter");
	expect(letter.revision).toBe(1);
	expect(await letters.getLetter(ada, id)).not.toBeNull();
});

it("the list holds this organization's live letters, newest first", async () => {
	const ada = await member("ada-list");
	const bob = await member("bob-list");
	const older = await letters.createLetter(ada, {});
	const newer = await letters.createLetter(ada, {});
	const deleted = await letters.createLetter(ada, {});
	await letters.createLetter(bob, {});
	await letters.deleteLetter(ada, deleted.id);
	const { content } = await stored(ada, older.id);
	await letters.saveLetter(ada, older.id, {
		title: "Touched last",
		content: written(content, "Dear Alex,"),
		expectedRevision: 1,
	});
	const list = await letters.listLetters(ada);
	expect(list.map((item) => item.id)).toEqual([older.id, newer.id]);
	expect(list[0]).toEqual({
		id: older.id,
		title: "Touched last",
		updatedAt: (await stored(ada, older.id)).updatedAt,
		humanSeal: null,
	});
	expect(list[1]?.title).toBe("Untitled letter");
});

it("a deleted letter is gone from the list and from getLetter", async () => {
	const ada = await member("ada-delete");
	const { id } = await letters.createLetter(ada, {});
	await letters.deleteLetter(ada, id);
	expect(await letters.getLetter(ada, id)).toBeNull();
	expect(await letters.listLetters(ada)).toEqual([]);
	await expect(letters.deleteLetter(ada, id)).rejects.toMatchObject({
		kind: "not_found",
		code: "not_found",
	});
});

it("a title that is empty, only spaces, has a control character or is over 120 characters is refused", async () => {
	const ada = await member("ada-title");
	const { id } = await letters.createLetter(ada, {});
	const { content } = await stored(ada, id);
	for (const title of [
		"",
		"   ",
		"Dear\u0007Alex",
		"To\nAlex",
		"a".repeat(121),
	]) {
		await expect(
			letters.saveLetter(ada, id, { title, content, expectedRevision: 1 }),
		).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_title" });
	}
	expect((await stored(ada, id)).revision).toBe(1);
	expect(
		await letters.saveLetter(ada, id, {
			title: `  ${"✉".repeat(120)}  `,
			content,
			expectedRevision: 1,
		}),
	).toEqual({ revision: 2 });
	expect((await stored(ada, id)).title).toBe("✉".repeat(120));
	expect(
		await letters.saveLetter(ada, id, {
			title: "😀".repeat(120),
			content,
			expectedRevision: 2,
		}),
	).toEqual({ revision: 3 });
});

it("content the parser refuses is refused as invalid_letter", async () => {
	const ada = await member("ada-invalid");
	const { id } = await letters.createLetter(ada, {});
	const { content } = await stored(ada, id);
	await expect(
		letters.saveLetter(ada, id, {
			title: "Crimson",
			content: {
				...content,
				defaults: { ...content.defaults, color: "crimson" },
			},
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_letter" });
	expect((await stored(ada, id)).content).toEqual(content);
});

it("an own font that does not exist is refused", async () => {
	const ada = await member("ada-own-font");
	const { id } = await letters.createLetter(ada, {});
	const { content } = await stored(ada, id);
	const own = { kind: "own", fontId: ownFontId } as const;
	const inDefaults: LetterContent = {
		...content,
		defaults: { ...content.defaults, font: own },
	};
	const inMark: LetterContent = {
		...content,
		doc: {
			...content.doc,
			content: [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [
						{ type: "text", text: "Dear " },
						{
							type: "text",
							text: "Alex",
							marks: [
								{
									type: "ink",
									attrs: { font: own, sizePt: null, color: null },
								},
							],
						},
					],
				},
			],
		},
	};
	for (const refused of [inDefaults, inMark]) {
		await expect(
			letters.saveLetter(ada, id, {
				title: "In my hand",
				content: refused,
				expectedRevision: 1,
			}),
		).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_letter" });
	}
	expect((await stored(ada, id)).revision).toBe(1);
});

it("a letter cannot place another organization's drawing", async () => {
	const ada = await member("ada-foreign-drawing");
	const bob = await member("bob-foreign-drawing");
	const maskId = uuidv7();
	await testDb.db.assets.create({
		id: maskId,
		organizationId: organizationId(bob),
		storageKey: `organizations/${organizationId(bob)}/assets/${maskId}`,
		mimeType: "image/png",
		byteSize: 33,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "bob.png",
			uploadedByUserId: bob.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const drawing = await testDb.db.drawings.create({
		organizationId: organizationId(bob),
		ownerUserId: bob.user.id,
		kind: "doodle",
		name: "Bob's star",
		source: {
			kind: "drawn",
			box: { widthPx: 10, heightPx: 10 },
			strokes: [],
		},
		maskAssetId: maskId,
		aspect: 1,
	});
	const { id } = await letters.createLetter(ada, {});
	const { content, title } = await stored(ada, id);
	await expect(
		letters.saveLetter(ada, id, {
			title,
			expectedRevision: 1,
			content: {
				...content,
				doc: {
					...content.doc,
					attrs: {
						...content.doc.attrs,
						elements: [
							{
								id: uuidv7(),
								kind: "drawing",
								drawingId: drawing.id,
								side: 0,
								xIn: 1,
								yIn: 1,
								widthIn: 1,
								heightIn: 1,
								rotationDeg: 0,
								tint: "ink-blue",
								wrap: false,
							},
						],
					},
				},
			},
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_letter" });
	expect((await stored(ada, id)).revision).toBe(1);
});

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

async function fontFile(caller: Member): Promise<string> {
	const asset = await testDb.db.assets.create(
		generatedAsset(organizationId(caller), {
			kind: "build-font",
			fontId: uuidv7(),
		}),
	);
	return asset.id;
}

async function handwriting(
	caller: Member,
	assetId: string | null,
	chars = "abc",
) {
	return testDb.db.fonts.create({
		organizationId: organizationId(caller),
		ownerUserId: caller.user.id,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: [] },
		fontAssetId: assetId,
		pendingFontAssetId: null,
		chars,
	});
}

function inHand(
	content: LetterContent,
	fontId: string,
	text = "Hello",
): LetterContent {
	return {
		...content,
		defaults: { ...content.defaults, font: { kind: "own", fontId } },
		doc: {
			...content.doc,
			content: [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [{ type: "text", text }],
				},
			],
		},
	};
}

it("a letter cannot use another organization's font", async () => {
	const ada = await member("ada-foreign-font");
	const bob = await member("bob-foreign-font");
	const font = await handwriting(bob, await fontFile(bob));
	const { id } = await letters.createLetter(ada, {});
	const { content } = await stored(ada, id);
	await expect(
		letters.saveLetter(ada, id, {
			title: "Borrowed",
			content: inHand(content, font.id),
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_letter" });
	expect((await stored(ada, id)).revision).toBe(1);
});

it("a teammate in the same organization cannot write in Karla's font", async () => {
	const karla = await member("karla-letter-owner");
	const sam = await teammate(karla, "sam-letter-owner");
	const font = await handwriting(karla, await fontFile(karla));
	const { id } = await letters.createLetter(karla, {});
	const { content } = await stored(karla, id);
	await expect(
		letters.saveLetter(sam, id, {
			title: "Not mine",
			content: inHand(content, font.id),
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ kind: "forbidden", code: "not_owner" });
	expect((await stored(karla, id)).revision).toBe(1);
});

it("a teammate opens a letter in Karla's hand read-only", async () => {
	const karla = await member("karla-readonly");
	const sam = await teammate(karla, "sam-readonly");
	const assetId = await fontFile(karla);
	const font = await handwriting(karla, assetId);
	const { id } = await letters.createLetter(karla, {});
	const { content } = await stored(karla, id);
	await letters.saveLetter(karla, id, {
		title: "Her hand",
		content: inHand(content, font.id),
		expectedRevision: 1,
	});
	const seen = await letters.getLetter(sam, id);
	expect(seen?.editable).toBe(false);
	expect(seen?.resources.fonts).toEqual({ [font.id]: assetId });
	expect(seen?.sealFonts).toEqual({
		[font.id]: { ownerName: "Karla", chars: "abc" },
	});
});

it("a letter cannot use a font that has never finished a build", async () => {
	const karla = await member("karla-unbuilt");
	const font = await handwriting(karla, null);
	const { id } = await letters.createLetter(karla, {});
	const { content } = await stored(karla, id);
	await expect(
		letters.saveLetter(karla, id, {
			title: "Too soon",
			content: inHand(content, font.id),
			expectedRevision: 1,
		}),
	).rejects.toMatchObject({ kind: "invalid_input", code: "font_not_ready" });
	expect((await stored(karla, id)).revision).toBe(1);
});

it("a deleted font still renders in letters that use it", async () => {
	const karla = await member("karla-deleted-font");
	const assetId = await fontFile(karla);
	const font = await handwriting(karla, assetId);
	const { id } = await letters.createLetter(karla, {});
	const { content } = await stored(karla, id);
	await letters.saveLetter(karla, id, {
		title: "Kept",
		content: inHand(content, font.id),
		expectedRevision: 1,
	});
	const handwritingFonts = new FontService(testDb.db, {
		publish: async () => {},
	});
	await handwritingFonts.deleteFont(karla, font.id);
	const seen = await letters.getLetter(karla, id);
	expect(seen?.resources.fonts).toEqual({ [font.id]: assetId });
	expect(seen?.editable).toBe(true);
});

it("an export of a stale revision is refused", async () => {
	const ada = await member("ada-stale-export");
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const exporting = new LetterService(testDb.db, { publish });
	const { id } = await exporting.createLetter(ada, {});
	await expect(
		exporting.requestExport(ada, id, { revision: 2 }),
	).rejects.toMatchObject({ kind: "conflict", code: "stale_revision" });
	expect(publish).not.toHaveBeenCalled();
});

it("an export carries the letter as it was and one recipient's values", async () => {
	const ada = await member("ada-export-snapshot");
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const exporting = new LetterService(testDb.db, { publish });
	const { id } = await exporting.createLetter(ada, {});
	const created = await stored(ada, id);
	await exporting.saveLetter(ada, id, {
		title: "First",
		content: written(created.content, "Original sentence"),
		expectedRevision: 1,
	});
	const before = await stored(ada, id);
	const { assetIds } = await exporting.requestExport(ada, id, { revision: 2 });
	await exporting.saveLetter(ada, id, {
		title: "Second",
		content: written(before.content, "Edited sentence"),
		expectedRevision: 2,
	});
	const asset = await testDb.db.assets.byId(
		organizationId(ada),
		assetIds[0] ?? "",
	);
	expect(asset?.origin).toMatchObject({
		source: "generated",
		job: {
			kind: "render-letter",
			content: before.content,
			mergeValues: SAMPLE_MERGE_VALUES,
		},
	});
});

it("a letter exports one PDF", async () => {
	const ada = await member("ada-export-pdf");
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const exporting = new LetterService(testDb.db, { publish });
	const { id } = await exporting.createLetter(ada, {});
	const { assetIds } = await exporting.requestExport(ada, id, { revision: 1 });
	expect(assetIds).toHaveLength(1);
	const asset = await testDb.db.assets.byId(
		organizationId(ada),
		assetIds[0] ?? "",
	);
	expect(asset?.origin).toMatchObject({
		source: "generated",
		job: { output: { format: "pdf", duplex: true } },
	});
	expect(publish).toHaveBeenCalledExactlyOnceWith("asset.render-letter", {
		assetId: assetIds[0],
	});
});

it("a teammate cannot export a letter in Karla's hand", async () => {
	const karla = await member("karla-export-owner");
	const sam = await teammate(karla, "sam-export-owner");
	const font = await handwriting(karla, await fontFile(karla));
	const { id } = await letters.createLetter(karla, {});
	const { content } = await stored(karla, id);
	await letters.saveLetter(karla, id, {
		title: "Her hand",
		content: inHand(content, font.id),
		expectedRevision: 1,
	});
	await expect(
		letters.requestExport(sam, id, { revision: 2 }),
	).rejects.toMatchObject({ kind: "forbidden", code: "not_owner" });
});
