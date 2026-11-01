import type { SaveGlyphRequest } from "@repo/api";
import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import {
	type DrawnGlyph,
	GLYPH_LIMITS,
	HANDWRITING_GLYPHS,
	isUsableFont,
	type Member,
	type Stroke,
} from "@repo/types";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AssetService, generatedAsset } from "../assets/assets.service.ts";
import type { AssetStorage } from "../assets/assets.types.ts";
import type { Publisher } from "../queue/index.ts";
import { FontService } from "./fonts.service.ts";

let testDb: TestDb;
let fonts: FontService;

const publisher: Publisher = { publish: async () => {} };

const REQUIRED = HANDWRITING_GLYPHS.filter((entry) => entry.required).length;

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
	for (const ownerName of ["", "   ", "\t\n", "Karla\u0007"]) {
		await expect(fonts.createFont(karla, { ownerName })).rejects.toMatchObject({
			kind: "invalid_input",
			code: "invalid_owner_name",
		});
	}
});

it("a pasted tab or line break in a name becomes one space", async () => {
	const karla = await member("karla-pasted-name");
	for (const [ownerName, saved] of [
		["Sam\tLee", "Sam Lee"],
		["Ka\nrla", "Ka rla"],
		[" Sam \r\n  Lee ", "Sam Lee"],
	] as const) {
		const { id } = await fonts.createFont(karla, { ownerName });
		expect((await fonts.getFont(karla, id))?.ownerName).toBe(saved);
	}
});

it("a name over the limit says it is too long", async () => {
	const karla = await member("karla-long-name");
	for (const ownerName of [
		"a".repeat(41),
		"Bartholomew Montgomery-Featherstonehaugh III",
	]) {
		await expect(fonts.createFont(karla, { ownerName })).rejects.toMatchObject({
			kind: "invalid_input",
			code: "owner_name_too_long",
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
			source: "drawn",
			status: "drawing",
			assetId: null,
			pendingAssetId: null,
			error: null,
			chars: "",
			missingRequired: REQUIRED - 1,
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
		source: "drawn",
		status: "drawing",
		glyphs: [first, alternate],
		assetId: null,
		pendingAssetId: null,
		error: null,
		chars: "",
		missingRequired: REQUIRED - 1,
	});
	expect(await fonts.getFont(sam, id)).toBeNull();
});

it("a variant is kept beside the first, and one past the letter's count is refused", async () => {
	const karla = await member("karla-variants");
	const { id } = await fonts.createFont(karla, { ownerName: "Karla" });
	const second = glyph("e", 1, strokeAt(30, 40));
	const third = glyph("e", 2, strokeAt(50, 60));
	await fonts.saveGlyph(karla, id, second);
	await fonts.saveGlyph(karla, id, third);
	await fonts.saveGlyph(karla, id, { char: "e", variant: 1, strokes: [] });
	expect((await fonts.getFont(karla, id))?.glyphs).toEqual([
		{ char: "e", variant: 1, strokes: [] },
		third,
	]);
	for (const refused of [glyph("e", 3), glyph("b", 1)]) {
		await expect(fonts.saveGlyph(karla, id, refused)).rejects.toMatchObject({
			kind: "invalid_input",
			code: "invalid_glyphs",
		});
	}
});

const cellStroke: Stroke = { input: "pen", points: [[100, 200, 0.5, 0]] };

function requiredGlyphs(): DrawnGlyph[] {
	return HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
		(entry): DrawnGlyph => ({
			char: entry.char,
			variant: 0,
			strokes: [cellStroke],
		}),
	);
}

it("the lowercase letters are enough to build", async () => {
	const karla = await member("karla-letters");
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const building = new FontService(testDb.db, { publish });
	const { id } = await building.createFont(karla, { ownerName: "Karla" });
	for (const char of "abcdefghijklmnopqrstuvwxyz") {
		await building.saveGlyph(karla, id, glyph(char));
	}
	const { assetId } = await building.requestBuild(karla, id);
	expect(assetId).toEqual(expect.any(String));
	expect(publish).toHaveBeenCalledExactlyOnceWith("asset.build-font", {
		assetId,
	});
});

it("a build needs every required character", async () => {
	const karla = await member("karla-incomplete");
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const building = new FontService(testDb.db, { publish });
	const { id } = await building.createFont(karla, { ownerName: "Karla" });
	await expect(building.requestBuild(karla, id)).rejects.toMatchObject({
		kind: "invalid_input",
		code: "font_incomplete",
	});
	expect(publish).not.toHaveBeenCalled();
});

it("a build request is a pending asset beside the current build", async () => {
	const karla = await member("karla-build");
	const organizationId = karla.userOrganization.organizationId;
	const current = await testDb.db.assets.create(
		generatedAsset(organizationId, {
			kind: "build-font",
			fontId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10",
		}),
	);
	const font = await testDb.db.fonts.create({
		organizationId,
		ownerUserId: karla.user.id,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: requiredGlyphs() },
		fontAssetId: current.id,
		pendingFontAssetId: null,
		chars: "a",
	});
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const building = new FontService(testDb.db, { publish });
	const { assetId } = await building.requestBuild(karla, font.id);
	const stored = await testDb.db.fonts.byId(organizationId, font.id);
	expect(stored?.fontAssetId).toBe(current.id);
	expect(stored?.pendingFontAssetId).toBe(assetId);
	expect(publish).toHaveBeenCalledExactlyOnceWith("asset.build-font", {
		assetId,
	});
});

it("another organization's photo cannot make a template font", async () => {
	const karla = await member("karla-template");
	const sam = await member("sam-template");
	const photoId = crypto.randomUUID();
	await testDb.db.assets.create({
		id: photoId,
		organizationId: sam.userOrganization.organizationId,
		storageKey: `organizations/${sam.userOrganization.organizationId}/assets/${photoId}`,
		mimeType: "image/png",
		byteSize: 12,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "template.png",
			uploadedByUserId: sam.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	await expect(
		fonts.createFont(karla, {
			ownerName: "Karla",
			source: {
				kind: "template-photo",
				templateVersion: 1,
				photoAssetId: photoId,
			},
		}),
	).rejects.toMatchObject({ kind: "not_found", code: "not_found" });
});

it("only a font file can make an upload font", async () => {
	const karla = await member("karla-upload-photo");
	const photoId = crypto.randomUUID();
	await testDb.db.assets.create({
		id: photoId,
		organizationId: karla.userOrganization.organizationId,
		storageKey: `organizations/${karla.userOrganization.organizationId}/assets/${photoId}`,
		mimeType: "image/png",
		byteSize: 12,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "desk.png",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	await expect(
		fonts.createFont(karla, {
			ownerName: "Karla",
			source: { kind: "upload", fileAssetId: photoId },
		}),
	).rejects.toMatchObject({
		kind: "invalid_input",
		code: "unsupported_file",
	});
});

it("another organization's font file cannot make an upload font", async () => {
	const karla = await member("karla-upload");
	const sam = await member("sam-upload");
	const fileId = crypto.randomUUID();
	await testDb.db.assets.create({
		id: fileId,
		organizationId: sam.userOrganization.organizationId,
		storageKey: `organizations/${sam.userOrganization.organizationId}/assets/${fileId}`,
		mimeType: "font/ttf",
		byteSize: 12,
		checksum: "c".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "font-file",
			filename: "hand.ttf",
			uploadedByUserId: sam.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	await expect(
		fonts.createFont(karla, {
			ownerName: "Karla",
			source: { kind: "upload", fileAssetId: fileId },
		}),
	).rejects.toMatchObject({ kind: "not_found", code: "not_found" });
});

it("the uploaded file is never read back", async () => {
	const karla = await member("karla-upload-read");
	const fileId = crypto.randomUUID();
	const organizationId = karla.userOrganization.organizationId;
	await testDb.db.assets.create({
		id: fileId,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${fileId}`,
		mimeType: "font/otf",
		byteSize: 12,
		checksum: "d".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "font-file",
			filename: "hand.otf",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const signedReadUrl = vi.fn<AssetStorage["signedReadUrl"]>(
		async () => "https://secret",
	);
	const storage: AssetStorage = {
		put: async () => {},
		get: async () => new Uint8Array(),
		signedReadUrl,
	};
	const assets = new AssetService(testDb.db, storage, publisher);
	const created = await fonts.createFont(karla, {
		ownerName: "Karla",
		source: { kind: "upload", fileAssetId: fileId },
	});
	expect(created.assetId).toEqual(expect.any(String));
	expect(
		await assets.getAssetReadUrl(karla.userOrganization, fileId),
	).toBeNull();
	expect(signedReadUrl).not.toHaveBeenCalled();
});

async function drawnFontWith(
	caller: Member,
	fields: { fontAssetId?: string | null; chars?: string } = {},
) {
	return testDb.db.fonts.create({
		organizationId: caller.userOrganization.organizationId,
		ownerUserId: caller.user.id,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: requiredGlyphs() },
		fontAssetId: fields.fontAssetId ?? null,
		pendingFontAssetId: null,
		chars: fields.chars ?? "",
	});
}

it("the font list says how many required letters a drawn font still misses", async () => {
	const karla = await member("karla-missing-required");
	const started = await fonts.createFont(karla, { ownerName: "Karla" });
	await fonts.saveGlyph(karla, started.id, glyph("a"));
	await fonts.saveGlyph(karla, started.id, glyph("A"));
	const complete = await drawnFontWith(karla);
	const listed = new Map(
		(await fonts.listFonts(karla)).map((font) => [
			font.id,
			font.missingRequired,
		]),
	);
	expect(listed.get(started.id)).toBe(REQUIRED - 1);
	expect(listed.get(complete.id)).toBe(0);
});

async function finishedBuild(caller: Member, fontId: string) {
	const asset = await testDb.db.assets.create(
		generatedAsset(caller.userOrganization.organizationId, {
			kind: "build-font",
			fontId,
		}),
	);
	await testDb.db.assets.claim(asset.id, new Date(0));
	await testDb.db.assets.complete(asset.id, 1, {
		storageKey: `${asset.storageKey}/attempts/1`,
		mimeType: "font/otf",
		byteSize: 4,
		checksum: "f".repeat(64),
	});
	return asset.id;
}

async function failBuild(assetId: string, code: string) {
	await testDb.db.assets.claim(assetId, new Date(0));
	await testDb.db.assets.fail(assetId, 1, code);
}

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";

it("a requested build reads as building with its pending asset", async () => {
	const karla = await member("karla-status-building");
	const font = await drawnFontWith(karla);
	const { assetId } = await fonts.requestBuild(karla, font.id);
	expect(await fonts.getFont(karla, font.id)).toMatchObject({
		status: "building",
		pendingAssetId: assetId,
		assetId: null,
		error: null,
	});
	expect(await fonts.listFonts(karla)).toEqual([
		expect.objectContaining({
			id: font.id,
			source: "drawn",
			status: "building",
			pendingAssetId: assetId,
		}),
	]);
	await testDb.db.assets.claim(assetId, new Date(0));
	expect((await fonts.getFont(karla, font.id))?.status).toBe("building");
});

it("a failed build reads as failed with its code, and can be requested again", async () => {
	const karla = await member("karla-status-failed");
	const font = await drawnFontWith(karla);
	const first = await fonts.requestBuild(karla, font.id);
	await failBuild(first.assetId, "processing_failed");
	expect(await fonts.getFont(karla, font.id)).toMatchObject({
		status: "failed",
		pendingAssetId: first.assetId,
		error: "processing_failed",
	});
	const again = await fonts.requestBuild(karla, font.id);
	expect(again.assetId).not.toBe(first.assetId);
	expect(await fonts.getFont(karla, font.id)).toMatchObject({
		status: "building",
		pendingAssetId: again.assetId,
		error: null,
	});
});

it("a failure that is not an error code reads as internal_error", async () => {
	const karla = await member("karla-status-unknown");
	const font = await drawnFontWith(karla);
	const { assetId } = await fonts.requestBuild(karla, font.id);
	await failBuild(assetId, "disk full");
	expect((await fonts.getFont(karla, font.id))?.error).toBe("internal_error");
});

it("a built font is ready when it has every lowercase letter", async () => {
	const karla = await member("karla-status-ready");
	const font = await drawnFontWith(karla);
	const assetId = await finishedBuild(karla, font.id);
	await testDb.db.fonts.finishBuild(
		karla.userOrganization.organizationId,
		font.id,
		assetId,
		`${LOWERCASE}.,!?'`,
	);
	expect(await fonts.getFont(karla, font.id)).toMatchObject({
		status: "ready",
		assetId,
		pendingAssetId: null,
		error: null,
		chars: `${LOWERCASE}.,!?'`,
	});
});

it("a built font missing lowercase letters reads as incomplete", async () => {
	const karla = await member("karla-status-incomplete");
	const photoId = crypto.randomUUID();
	const organizationId = karla.userOrganization.organizationId;
	await testDb.db.assets.create({
		id: photoId,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${photoId}`,
		mimeType: "image/png",
		byteSize: 12,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "template.png",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const created = await fonts.createFont(karla, {
		ownerName: "Karla",
		source: {
			kind: "template-photo",
			templateVersion: 1,
			photoAssetId: photoId,
		},
	});
	if (!created.assetId) throw new Error("no build was requested");
	expect(await fonts.getFont(karla, created.id)).toMatchObject({
		source: "template-photo",
		status: "building",
		pendingAssetId: created.assetId,
		glyphs: [],
	});
	await testDb.db.assets.claim(created.assetId, new Date(0));
	await testDb.db.assets.complete(created.assetId, 1, {
		storageKey: `organizations/${karla.userOrganization.organizationId}/assets/${created.assetId}/attempts/1`,
		mimeType: "font/otf",
		byteSize: 4,
		checksum: "f".repeat(64),
	});
	await testDb.db.fonts.finishBuild(
		organizationId,
		created.id,
		created.assetId,
		LOWERCASE.replace("q", "").replace("z", ""),
	);
	expect(await fonts.getFont(karla, created.id)).toMatchObject({
		status: "incomplete",
		assetId: created.assetId,
		pendingAssetId: null,
	});
});

it("a rebuild that fails keeps the last build and reads as failed", async () => {
	const karla = await member("karla-status-rebuild");
	const font = await drawnFontWith(karla);
	const good = await finishedBuild(karla, font.id);
	await testDb.db.fonts.finishBuild(
		karla.userOrganization.organizationId,
		font.id,
		good,
		LOWERCASE,
	);
	const { assetId } = await fonts.requestBuild(karla, font.id);
	await failBuild(assetId, "processing_failed");
	expect(await fonts.getFont(karla, font.id)).toMatchObject({
		status: "failed",
		assetId: good,
		pendingAssetId: assetId,
		error: "processing_failed",
	});
});

async function templateFont(caller: Member) {
	const photoId = crypto.randomUUID();
	const organizationId = caller.userOrganization.organizationId;
	await testDb.db.assets.create({
		id: photoId,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${photoId}`,
		mimeType: "image/png",
		byteSize: 12,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "template.png",
			uploadedByUserId: caller.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const created = await fonts.createFont(caller, {
		ownerName: "Karla",
		source: {
			kind: "template-photo",
			templateVersion: 1,
			photoAssetId: photoId,
		},
	});
	if (!created.assetId) throw new Error("no build was requested");
	return { id: created.id, assetId: created.assetId };
}

it("an incomplete paper font whose rebuild fails is still not usable", async () => {
	const karla = await member("karla-status-incomplete-retry");
	const created = await templateFont(karla);
	await testDb.db.assets.claim(created.assetId, new Date(0));
	await testDb.db.assets.complete(created.assetId, 1, {
		storageKey: `organizations/${karla.userOrganization.organizationId}/assets/${created.assetId}/attempts/1`,
		mimeType: "font/otf",
		byteSize: 4,
		checksum: "f".repeat(64),
	});
	await testDb.db.fonts.finishBuild(
		karla.userOrganization.organizationId,
		created.id,
		created.assetId,
		LOWERCASE.replace("q", ""),
	);
	const retry = await fonts.requestBuild(karla, created.id);
	await failBuild(retry.assetId, "template_markers_not_found");
	const font = await fonts.getFont(karla, created.id);
	expect(font).toMatchObject({
		status: "failed",
		assetId: created.assetId,
		error: "template_markers_not_found",
	});
	if (!font) throw new Error("the font is gone");
	expect(isUsableFont(font)).toBe(false);
	const [listed] = await fonts.listFonts(karla);
	if (!listed) throw new Error("the font is not listed");
	expect(isUsableFont(listed)).toBe(false);
});

it("a paper font with no build at all reads as failed", async () => {
	const karla = await member("karla-status-paper-orphan");
	const font = await testDb.db.fonts.create({
		organizationId: karla.userOrganization.organizationId,
		ownerUserId: karla.user.id,
		ownerName: "Karla",
		source: {
			kind: "template-photo",
			templateVersion: 1,
			photoAssetId: crypto.randomUUID(),
		},
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	expect(await fonts.getFont(karla, font.id)).toMatchObject({
		status: "failed",
		error: "internal_error",
		assetId: null,
		pendingAssetId: null,
	});
});

it("a paper font is built again from the same photo", async () => {
	const karla = await member("karla-status-paper-retry");
	const photoId = crypto.randomUUID();
	const organizationId = karla.userOrganization.organizationId;
	await testDb.db.assets.create({
		id: photoId,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${photoId}`,
		mimeType: "image/png",
		byteSize: 12,
		checksum: "b".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "photo",
			filename: "template.png",
			uploadedByUserId: karla.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const service = new FontService(testDb.db, { publish });
	const created = await service.createFont(karla, {
		ownerName: "Karla",
		source: {
			kind: "template-photo",
			templateVersion: 1,
			photoAssetId: photoId,
		},
	});
	if (!created.assetId) throw new Error("no build was requested");
	await failBuild(created.assetId, "processing_failed");
	const again = await service.requestBuild(karla, created.id);
	expect(publish).toHaveBeenLastCalledWith("asset.build-font", {
		assetId: again.assetId,
	});
	expect(await service.getFont(karla, created.id)).toMatchObject({
		source: "template-photo",
		status: "building",
		pendingAssetId: again.assetId,
	});
});
