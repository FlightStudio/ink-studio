import type { LetterContent, PageFormatId } from "@repo/types";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";
import type { BlankDraft, LetterListQuery } from "./letters.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

const everything: LetterListQuery = { limit: 100, after: null, hideBlank: [] };

const blankDrafts: BlankDraft[] = [
	{
		format: "thanksio:letter-windowless",
		title: "Untitled letter",
		minSides: 1,
	},
	{ format: "thanksio:postcard-6x9", title: "Untitled postcard", minSides: 2 },
];

function contentSaying(text: string): LetterContent {
	return {
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

async function newOrganization(name: string): Promise<string> {
	const organization = await testDb.db.organizations.create({ name });
	return organization.id;
}

it("a new letter starts at revision 1", async () => {
	const organizationId = await newOrganization("Fresh studio");
	const content = contentSaying("Dear Ada,");
	const letter = await testDb.db.letters.create({
		organizationId,
		title: "Untitled letter",
		content,
	});
	expect(letter.revision).toBe(1);
	expect(letter.organizationId).toBe(organizationId);
	expect(letter.title).toBe("Untitled letter");
	expect(letter.content).toEqual(content);
	expect(await testDb.db.letters.byId(organizationId, letter.id)).toEqual(
		letter,
	);
});

it("a save at the current revision stores the change and bumps the revision", async () => {
	const organizationId = await newOrganization("Saving studio");
	const letterId = await letterAt(
		organizationId,
		"Untitled letter",
		"2026-01-01T00:00:00.000000Z",
		contentSaying("Dear Ada,"),
	);
	const letter = await testDb.db.letters.byId(organizationId, letterId);
	if (letter === null) throw new Error("the letter is not stored");
	const content = contentSaying("Dear Ada, thank you.");
	const revision = await testDb.db.letters.save(organizationId, letter.id, {
		title: "Thank you",
		content,
		expectedRevision: 1,
	});
	expect(revision).toBe(2);
	const saved = await testDb.db.letters.byId(organizationId, letter.id);
	expect(saved?.revision).toBe(2);
	expect(saved?.title).toBe("Thank you");
	expect(saved?.content).toEqual(content);
	expect(saved?.createdAt).toEqual(letter.createdAt);
	expect(saved?.updatedAt.getTime()).toBeGreaterThan(
		letter.updatedAt.getTime(),
	);
});

it("a save at an old revision changes nothing", async () => {
	const organizationId = await newOrganization("Stale studio");
	const letter = await testDb.db.letters.create({
		organizationId,
		title: "Untitled letter",
		content: contentSaying("Dear Ada,"),
	});
	const first = contentSaying("First save");
	await testDb.db.letters.save(organizationId, letter.id, {
		title: "First",
		content: first,
		expectedRevision: 1,
	});
	const stale = await testDb.db.letters.save(organizationId, letter.id, {
		title: "Second",
		content: contentSaying("Second save"),
		expectedRevision: 1,
	});
	expect(stale).toBeNull();
	const stored = await testDb.db.letters.byId(organizationId, letter.id);
	expect(stored?.revision).toBe(2);
	expect(stored?.title).toBe("First");
	expect(stored?.content).toEqual(first);
});

it("another organization finds nothing, saves nothing and deletes nothing", async () => {
	const organizationId = await newOrganization("Owning studio");
	const otherId = await newOrganization("Other studio");
	const content = contentSaying("Dear Ada,");
	const letter = await testDb.db.letters.create({
		organizationId,
		title: "Private",
		content,
	});
	expect(await testDb.db.letters.byId(otherId, letter.id)).toBeNull();
	expect((await testDb.db.letters.list(otherId, everything)).letters).toEqual(
		[],
	);
	expect(
		await testDb.db.letters.save(otherId, letter.id, {
			title: "Taken",
			content: contentSaying("Taken"),
			expectedRevision: 1,
		}),
	).toBeNull();
	expect(await testDb.db.letters.softDelete(otherId, letter.id)).toBe(false);
	const stored = await testDb.db.letters.byId(organizationId, letter.id);
	expect(stored?.revision).toBe(1);
	expect(stored?.title).toBe("Private");
	expect(stored?.content).toEqual(content);
});

it("a deleted letter is gone from byId, from the list and from save", async () => {
	const organizationId = await newOrganization("Deleting studio");
	const letter = await testDb.db.letters.create({
		organizationId,
		title: "Doomed",
		content: contentSaying("Dear Ada,"),
	});
	expect(await testDb.db.letters.softDelete(organizationId, letter.id)).toBe(
		true,
	);
	expect(await testDb.db.letters.byId(organizationId, letter.id)).toBeNull();
	expect(
		(await testDb.db.letters.list(organizationId, everything)).letters,
	).toEqual([]);
	expect(
		await testDb.db.letters.save(organizationId, letter.id, {
			title: "Revived",
			content: contentSaying("Revived"),
			expectedRevision: 1,
		}),
	).toBeNull();
	expect(await testDb.db.letters.softDelete(organizationId, letter.id)).toBe(
		false,
	);
});

it("the list holds the organization's live letters, newest first", async () => {
	const organizationId = await newOrganization("Listing studio");
	const otherId = await newOrganization("Neighbour studio");
	const create = (title: string) =>
		testDb.db.letters.create({
			organizationId,
			title,
			content: contentSaying(title),
		});
	const oldest = await create("Oldest");
	const middle = await create("Middle");
	const deleted = await create("Deleted");
	const newest = await create("Newest");
	await testDb.db.letters.create({
		organizationId: otherId,
		title: "Elsewhere",
		content: contentSaying("Elsewhere"),
	});
	await testDb.db.letters.softDelete(organizationId, deleted.id);
	await testDb.db.letters.save(organizationId, oldest.id, {
		title: "Oldest, edited",
		content: contentSaying("Oldest, edited"),
		expectedRevision: 1,
	});
	const { letters: list, next } = await testDb.db.letters.list(
		organizationId,
		everything,
	);
	expect(next).toBeNull();
	expect(list.map((letter) => letter.id)).toEqual([
		oldest.id,
		newest.id,
		middle.id,
	]);
	expect(list[0]?.title).toBe("Oldest, edited");
	expect(list[0]?.revision).toBe(2);
});

async function letterAt(
	organizationId: string,
	title: string,
	updatedAt: string,
	content: LetterContent = contentSaying(title),
): Promise<string> {
	const letter = await testDb.db.letters.create({
		organizationId,
		title,
		content,
	});
	await testDb.execute("update letters set updated_at = $1 where id = $2", [
		updatedAt,
		letter.id,
	]);
	return letter.id;
}

async function allPages(
	organizationId: string,
	query: Omit<LetterListQuery, "after">,
): Promise<string[][]> {
	const pages: string[][] = [];
	let after: LetterListQuery["after"] = null;
	do {
		const page = await testDb.db.letters.list(organizationId, {
			...query,
			after,
		});
		pages.push(page.letters.map((letter) => letter.title));
		after = page.next;
	} while (after !== null);
	return pages;
}

it("the list pages newest first, breaking a tie on the same update time by id", async () => {
	const organizationId = await newOrganization("Paging studio");
	const tied = "2026-03-02T10:00:00.000000Z";
	const first = await letterAt(organizationId, "Tied first", tied);
	const second = await letterAt(organizationId, "Tied second", tied);
	await letterAt(organizationId, "Newest", "2026-03-03T10:00:00.000000Z");
	await letterAt(organizationId, "Oldest", "2026-03-01T10:00:00.000000Z");
	const [higher, lower] =
		second > first
			? ["Tied second", "Tied first"]
			: ["Tied first", "Tied second"];
	expect(await allPages(organizationId, { limit: 2, hideBlank: [] })).toEqual([
		["Newest", higher],
		[lower, "Oldest"],
	]);
});

it("the cursor keeps the database's own microseconds, so letters in one millisecond are neither skipped nor repeated", async () => {
	const organizationId = await newOrganization("Microsecond studio");
	await letterAt(organizationId, "Third", "2026-04-01T09:00:00.123401Z");
	await letterAt(organizationId, "First", "2026-04-01T09:00:00.123403Z");
	await letterAt(organizationId, "Second", "2026-04-01T09:00:00.123402Z");
	expect(await allPages(organizationId, { limit: 1, hideBlank: [] })).toEqual([
		["First"],
		["Second"],
		["Third"],
	]);
});

it("the last full page has no next cursor", async () => {
	const organizationId = await newOrganization("Exact studio");
	await letterAt(organizationId, "One", "2026-05-01T09:00:00.000000Z");
	await letterAt(organizationId, "Two", "2026-05-02T09:00:00.000000Z");
	const page = await testDb.db.letters.list(organizationId, {
		limit: 2,
		after: null,
		hideBlank: [],
	});
	expect(page.letters.map((letter) => letter.title)).toEqual(["Two", "One"]);
	expect(page.next).toBeNull();
});

function blankPage(format: PageFormatId, minSides: number): LetterContent {
	const content = contentSaying("");
	return {
		...content,
		format,
		doc: {
			...content.doc,
			attrs: { ...content.doc.attrs, minSides },
			content: [{ type: "paragraph", attrs: { align: "left" } }],
		},
	};
}

function withDoc(
	content: LetterContent,
	doc: Partial<LetterContent["doc"]>,
): LetterContent {
	return { ...content, doc: { ...content.doc, ...doc } };
}

it("blank untitled drafts are left out by the query, so a page is still full", async () => {
	const organizationId = await newOrganization("Drafty studio");
	const letter = blankPage("thanksio:letter-windowless", 1);
	const postcard = blankPage("thanksio:postcard-6x9", 2);
	const element = {
		id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a20",
		kind: "drawing",
		drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a21",
		side: 0,
		xIn: 1,
		yIn: 1,
		widthIn: 1,
		heightIn: 1,
		rotationDeg: 0,
		tint: "ink-blue",
		wrap: false,
	} as const;
	const hidden = [
		["Untitled letter", letter],
		["Untitled postcard", postcard],
		[
			"Untitled letter",
			withDoc(letter, {
				content: [{ type: "paragraph", attrs: { align: "center" } }],
			}),
		],
	] as const;
	const kept = [
		["For Sam", letter],
		["Untitled letter", contentSaying("Dear Sam")],
		["Untitled letter", blankPage("thanksio:letter-windowless", 2)],
		["Untitled postcard", blankPage("thanksio:postcard-6x9", 3)],
		[
			"Untitled letter",
			withDoc(letter, { attrs: { ...letter.doc.attrs, elements: [element] } }),
		],
		[
			"Untitled letter",
			withDoc(letter, {
				content: [
					{ type: "paragraph", attrs: { align: "left" } },
					{ type: "paragraph", attrs: { align: "left" } },
				],
			}),
		],
		[
			"Untitled postcard",
			withDoc(postcard, {
				attrs: {
					...postcard.doc.attrs,
					frontImageAssetId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a22",
				},
			}),
		],
		["Untitled postcard", blankPage("thanksio:letter-windowless", 1)],
	] as const;
	for (const [title, content] of hidden) {
		await letterAt(
			organizationId,
			title,
			"2026-06-09T09:00:00.000000Z",
			content,
		);
	}
	const keptIds: string[] = [];
	for (const [index, [title, content]] of kept.entries()) {
		keptIds.push(
			await letterAt(
				organizationId,
				title,
				`2026-06-0${8 - index}T09:00:00.000000Z`,
				content,
			),
		);
	}
	const page = await testDb.db.letters.list(organizationId, {
		limit: kept.length,
		after: null,
		hideBlank: blankDrafts,
	});
	expect(page.letters.map((stored) => stored.id)).toEqual(keptIds);
	expect(page.next).toBeNull();
});
