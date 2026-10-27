import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import type { LetterContent, Member } from "@repo/types";
import { afterAll, beforeAll, expect, it } from "vitest";
import { LetterService } from "./letters.service.ts";

const ownFontId = "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10";

let testDb: TestDb;
let letters: LetterService;

beforeAll(async () => {
	testDb = await startTestDb();
	letters = new LetterService(testDb.db);
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
