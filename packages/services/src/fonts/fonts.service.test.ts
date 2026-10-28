import type { SaveGlyphRequest } from "@repo/api";
import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import { GLYPH_LIMITS, type Member } from "@repo/types";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Publisher } from "../queue/index.ts";
import { FontService } from "./fonts.service.ts";

let testDb: TestDb;
let fonts: FontService;

const publisher: Publisher = { publish: async () => {} };

beforeAll(async () => {
	testDb = await startTestDb();
	fonts = new FontService(testDb.db, publisher);
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

function strokeAt(x: number, y: number) {
	return { input: "pen" as const, points: [[x, y, 0.5, 0]] };
}

function glyph(
	char: string,
	variant = 0,
	stroke: ReturnType<typeof strokeAt> = strokeAt(100, 200),
): SaveGlyphRequest {
	return { char, variant, strokes: [stroke] };
}

it("an owner name is trimmed and checked", async () => {
	const karla = await member("karla-name");
	const { id } = await fonts.createFont(karla, { ownerName: " Karla " });
	expect((await fonts.getFont(karla, id))?.ownerName).toBe("Karla");
	const forty = "✉".repeat(40);
	const longName = await fonts.createFont(karla, { ownerName: `  ${forty}  ` });
	expect((await fonts.getFont(karla, longName.id))?.ownerName).toBe(forty);
	for (const ownerName of [
		"",
		"   ",
		"a".repeat(41),
		"Karla\u0007",
		"Ka\nrla",
	]) {
		await expect(fonts.createFont(karla, { ownerName })).rejects.toMatchObject({
			kind: "invalid_input",
			code: "invalid_owner_name",
		});
	}
});

it("a glyph outside the cell is refused", async () => {
	const karla = await member("karla-cell");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	await expect(
		fonts.saveGlyph(karla, id, glyph("a", 0, strokeAt(1001, 10))),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_glyphs" });
	await fonts.saveGlyph(karla, id, glyph("a", 0, strokeAt(0, 1000)));
	expect((await fonts.getFont(karla, id))?.glyphs).toEqual([
		glyph("a", 0, strokeAt(0, 1000)),
	]);
});

it("more strokes or points than the limits are refused", async () => {
	const karla = await member("karla-limits");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	const tooManyStrokes = {
		char: "a",
		variant: 0,
		strokes: Array.from({ length: GLYPH_LIMITS.strokes + 1 }, () =>
			strokeAt(1, 1),
		),
	};
	const tooManyPoints = {
		char: "b",
		variant: 0,
		strokes: [
			{
				input: "pen" as const,
				points: Array.from(
					{ length: GLYPH_LIMITS.pointsPerStroke + 1 },
					(_, index) => [1, 1, 0.5, index],
				),
			},
		],
	};
	await expect(
		fonts.saveGlyph(karla, id, tooManyStrokes),
	).rejects.toMatchObject({ kind: "invalid_input", code: "invalid_glyphs" });
	await expect(fonts.saveGlyph(karla, id, tooManyPoints)).rejects.toMatchObject(
		{ kind: "invalid_input", code: "invalid_glyphs" },
	);
	expect((await fonts.getFont(karla, id))?.glyphs).toEqual([]);
});

it("another organization cannot save a glyph or delete the font", async () => {
	const karla = await member("karla-private");
	const sam = await member("sam-private");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	await expect(fonts.saveGlyph(sam, id, glyph("a"))).rejects.toMatchObject({
		kind: "not_found",
		code: "not_found",
	});
	await expect(fonts.deleteFont(sam, id)).rejects.toMatchObject({
		kind: "not_found",
		code: "not_found",
	});
	expect(await fonts.getFont(karla, id)).not.toBeNull();
	await fonts.deleteFont(karla, id);
	expect(await fonts.getFont(karla, id)).toBeNull();
	expect(await fonts.listFonts(karla)).toEqual([]);
	await expect(fonts.deleteFont(karla, id)).rejects.toMatchObject({
		kind: "not_found",
		code: "not_found",
	});
});

it("a teammate in the same organization cannot use Karla's font", async () => {
	const karla = await member("karla-team");
	const sam = await teammate(karla, "sam-team");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	await fonts.saveGlyph(karla, id, glyph("a"));
	expect((await fonts.listFonts(sam)).map((font) => font.id)).not.toContain(id);
	expect(await fonts.listFonts(karla)).toEqual([
		{
			id,
			ownerName: "Karla",
			assetId: null,
			building: false,
			chars: "",
		},
	]);
	await expect(fonts.saveGlyph(sam, id, glyph("b"))).rejects.toMatchObject({
		kind: "forbidden",
		code: "not_owner",
	});
	await expect(fonts.deleteFont(sam, id)).rejects.toMatchObject({
		kind: "forbidden",
		code: "not_owner",
	});
	expect(
		(await fonts.getFont(karla, id))?.glyphs.map((item) => item.char),
	).toEqual(["a"]);
});

it("the characters . and / save like any other", async () => {
	const karla = await member("karla-punct");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	const dot = glyph(".", 0, strokeAt(400, 700));
	const slash = glyph("/", 0, strokeAt(200, 150));
	await fonts.saveGlyph(karla, id, dot);
	await fonts.saveGlyph(karla, id, slash);
	const replaced = glyph(".", 0, strokeAt(410, 710));
	await fonts.saveGlyph(karla, id, replaced);
	expect((await fonts.getFont(karla, id))?.glyphs).toEqual([replaced, slash]);
});

it("the owner reads back the glyphs she drew, a teammate reads nothing", async () => {
	const karla = await member("karla-read");
	const sam = await teammate(karla, "sam-read");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	const first = glyph("a", 0, strokeAt(10, 20));
	const alternate = glyph("a", 1, strokeAt(30, 40));
	await fonts.saveGlyph(karla, id, first);
	await fonts.saveGlyph(karla, id, alternate);
	expect(await fonts.getFont(karla, id)).toEqual({
		id,
		ownerName: "Karla",
		glyphs: [first, alternate],
		assetId: null,
		building: false,
	});
	expect(await fonts.getFont(sam, id)).toBeNull();
});
