import type { LetterContent } from "@repo/types";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

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
	const letter = await testDb.db.letters.create({
		organizationId,
		title: "Untitled letter",
		content: contentSaying("Dear Ada,"),
	});
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
	expect(await testDb.db.letters.list(otherId)).toEqual([]);
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
	expect(await testDb.db.letters.list(organizationId)).toEqual([]);
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
	const list = await testDb.db.letters.list(organizationId);
	expect(list.map((letter) => letter.id)).toEqual([
		oldest.id,
		newest.id,
		middle.id,
	]);
	expect(list[0]?.title).toBe("Oldest, edited");
	expect(list[0]?.revision).toBe(2);
});
