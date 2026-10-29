import type { DrawnGlyph, Stroke } from "@repo/types";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../testing/start-test-db.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

const stroke: Stroke = {
	input: "pen",
	points: [[10, 20, 0.5, 0]],
};

function cell(char: string, variant: number): DrawnGlyph {
	return { char, variant, strokes: [stroke] };
}

async function studio(name: string) {
	const organization = await testDb.db.organizations.create({ name });
	const { user } = await testDb.db.users.getOrCreate({
		externalId: `dev:${name}`,
		email: `${name}@example.com`,
		name,
	});
	return { organizationId: organization.id, ownerUserId: user.id };
}

it("a new font is an empty drawing owned by its creator", async () => {
	const { organizationId, ownerUserId } = await studio("Fresh letters");
	const font = await testDb.db.fonts.create({
		organizationId,
		ownerUserId,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: [] },
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	expect(font.organizationId).toBe(organizationId);
	expect(font.ownerUserId).toBe(ownerUserId);
	expect(font.ownerName).toBe("Karla");
	expect(font.source).toEqual({ kind: "drawn", glyphs: [] });
	expect(font.fontAssetId).toBeNull();
	expect(font.pendingFontAssetId).toBeNull();
	expect(font.chars).toBe("");
	expect(font.deletedAt).toBeNull();
	expect(await testDb.db.fonts.byId(organizationId, font.id)).toEqual({
		...font,
		pendingBuild: null,
	});
	expect(
		await testDb.db.fonts.listByOwner(organizationId, ownerUserId),
	).toEqual([{ ...font, pendingBuild: null }]);
});

it("a font reads the processing of its pending build", async () => {
	const { organizationId, ownerUserId } = await studio("Building letters");
	const font = await testDb.db.fonts.create({
		organizationId,
		ownerUserId,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: [cell("a", 0)] },
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	const assetId = uuidv7();
	await testDb.db.assets.create({
		id: assetId,
		organizationId,
		storageKey: `organizations/${organizationId}/assets/${assetId}`,
		mimeType: "application/octet-stream",
		byteSize: null,
		checksum: null,
		origin: {
			source: "generated",
			job: { kind: "build-font", fontId: font.id },
		},
		processing: { status: "pending", attempts: 0, lastError: null },
	});
	await testDb.db.fonts.setPending(organizationId, font.id, assetId);
	expect(
		(await testDb.db.fonts.byId(organizationId, font.id))?.pendingBuild,
	).toEqual({ status: "pending", attempts: 0, lastError: null });
	await testDb.db.assets.claim(assetId, new Date(0));
	await testDb.db.assets.fail(assetId, "template_markers_not_found");
	const failed = {
		status: "failed",
		attempts: 1,
		error: "template_markers_not_found",
	};
	expect(
		(await testDb.db.fonts.byId(organizationId, font.id))?.pendingBuild,
	).toEqual(failed);
	expect(
		(await testDb.db.fonts.listByOwner(organizationId, ownerUserId)).map(
			(listed) => listed.pendingBuild,
		),
	).toEqual([failed]);
});

it("replacing one cell keeps the other, including while the row is locked", async () => {
	const { organizationId, ownerUserId } = await studio("Locked letters");
	const font = await testDb.db.fonts.create({
		organizationId,
		ownerUserId,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: [] },
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let holding = false;
	const first = testDb.db.transaction(async (tx) => {
		const locked = await tx.fonts.lockById(organizationId, font.id);
		if (locked?.source.kind !== "drawn") {
			throw new Error("the font is not locked");
		}
		holding = true;
		await held;
		await tx.fonts.saveSource(organizationId, font.id, {
			kind: "drawn",
			glyphs: [cell("a", 0)],
		});
	});
	const started = Date.now();
	while (!holding) {
		if (Date.now() - started > 5_000) throw new Error("the lock was not taken");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	let read = false;
	const second = testDb.db.transaction(async (tx) => {
		const locked = await tx.fonts.lockById(organizationId, font.id);
		read = true;
		if (locked?.source.kind !== "drawn") {
			throw new Error("the font is not locked");
		}
		await tx.fonts.saveSource(organizationId, font.id, {
			kind: "drawn",
			glyphs: [...locked.source.glyphs, cell("b", 0)],
		});
	});
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(read).toBe(false);
	release();
	await first;
	await second;
	const stored = await testDb.db.fonts.byId(organizationId, font.id);
	expect(stored?.source).toEqual({
		kind: "drawn",
		glyphs: [cell("a", 0), cell("b", 0)],
	});
});

it("another organization finds nothing and a deleted font is gone", async () => {
	const owner = await studio("Owning letters");
	const other = await studio("Other letters");
	const font = await testDb.db.fonts.create({
		organizationId: owner.organizationId,
		ownerUserId: owner.ownerUserId,
		ownerName: "Karla",
		source: { kind: "drawn", glyphs: [cell("a", 0)] },
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	expect(await testDb.db.fonts.byId(other.organizationId, font.id)).toBeNull();
	expect(
		await testDb.db.fonts.listByOwner(other.organizationId, other.ownerUserId),
	).toEqual([]);
	expect(await testDb.db.fonts.softDelete(other.organizationId, font.id)).toBe(
		false,
	);
	expect(await testDb.db.fonts.softDelete(owner.organizationId, font.id)).toBe(
		true,
	);
	expect(await testDb.db.fonts.byId(owner.organizationId, font.id)).toBeNull();
	expect(
		await testDb.db.fonts.listByOwner(owner.organizationId, owner.ownerUserId),
	).toEqual([]);
	expect(
		await testDb.db.fonts.lockById(owner.organizationId, font.id),
	).toBeNull();
});
