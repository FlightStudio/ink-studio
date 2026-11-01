import { requestExportRequestSchema } from "@repo/api";
import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import type { AssetProcessing, FontSource, Member } from "@repo/types";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { generatedAsset } from "../assets/assets.service.ts";
import { LetterService } from "./letters.service.ts";

let testDb: TestDb;

beforeAll(async () => {
	testDb = await startTestDb();
});

afterAll(async () => {
	await testDb?.stop();
});

async function setup(
	name: string,
	source: FontSource = { kind: "drawn", glyphs: [] },
) {
	const member = await seedDevIdentity(testDb.db, {
		email: `${name}@example.com`,
		organizationName: name,
	});
	const organizationId = member.userOrganization.organizationId;
	const font = await testDb.db.fonts.create({
		organizationId,
		ownerUserId: member.user.id,
		ownerName: name,
		source,
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "abcdefghijklmnopqrstuvwxyz",
	});
	const asset = await build(member, font.id);
	await testDb.db.fonts.finishBuild(
		organizationId,
		font.id,
		asset.id,
		font.chars,
	);
	const publish = vi.fn(async () => {});
	const letters = new LetterService(testDb.db, { publish });
	const { id } = await letters.createLetter(member, {
		format: "thanksio:postcard-6x9",
	});
	const letter = await letters.getLetter(member, id);
	if (!letter) throw new Error("letter missing");
	await letters.saveLetter(member, id, {
		title: "Bound handwriting",
		content: {
			...letter.content,
			defaults: {
				...letter.content.defaults,
				font: { kind: "own", fontId: font.id },
			},
		},
		expectedRevision: letter.revision,
	});
	return { member, organizationId, font, asset, letters, publish, id };
}

async function build(
	member: Member,
	fontId: string,
	processing: AssetProcessing = { status: "done", attempts: 1 },
) {
	return testDb.db.assets.create({
		...generatedAsset(member.userOrganization.organizationId, {
			kind: "build-font",
			fontId,
		}),
		processing,
		mimeType: "font/otf",
		byteSize: 12,
		checksum: "a".repeat(64),
	});
}

it("every side keeps the displayed build even when a newer build is current", async () => {
	const { member, organizationId, font, asset, letters, id } =
		await setup("proof-snapshot");
	const newer = await build(member, font.id);
	await testDb.db.fonts.setPending(organizationId, font.id, newer.id);
	await testDb.db.fonts.finishBuild(
		organizationId,
		font.id,
		newer.id,
		font.chars,
	);
	const fonts = { [font.id]: asset.id };
	const { assetIds } = await letters.requestExport(member, id, {
		revision: 2,
		fonts,
	});
	expect(assetIds).toHaveLength(2);
	for (const assetId of assetIds) {
		const proof = await testDb.db.assets.byId(organizationId, assetId);
		expect(proof?.origin).toMatchObject({
			source: "generated",
			job: { fonts },
		});
	}
	expect(
		(await testDb.db.fonts.byId(organizationId, font.id))?.fontAssetId,
	).toBe(newer.id);
});

it("missing, foreign, unrelated, unfinished, and raw uploaded assets cannot bind a proof", async () => {
	const { member, font, asset, letters, publish, id } =
		await setup("proof-validation");
	const outsider = await setup("proof-outsider");
	const unrelated = await build(member, crypto.randomUUID());
	const pending = await build(member, font.id, {
		status: "pending",
		attempts: 0,
		lastError: null,
	});
	const failed = await build(member, font.id, {
		status: "failed",
		attempts: 1,
		error: "font_unreadable",
	});
	const uploaded = await testDb.db.assets.create({
		...asset,
		id: crypto.randomUUID(),
		origin: {
			source: "uploaded",
			purpose: "font-file",
			filename: "raw.ttf",
			uploadedByUserId: member.user.id,
		},
	});
	for (const fonts of [
		{},
		...[
			outsider.asset.id,
			unrelated.id,
			pending.id,
			failed.id,
			uploaded.id,
			crypto.randomUUID(),
		].map((assetId) => ({ [font.id]: assetId })),
	]) {
		await expect(
			letters.requestExport(member, id, { revision: 2, fonts }),
		).rejects.toMatchObject({
			kind: "invalid_input",
			code: "proof_fonts_unavailable",
		});
	}
	expect(publish).not.toHaveBeenCalled();
});

it("uploaded handwriting binds its completed build, including after the font is deleted", async () => {
	const { member, organizationId, font, asset, letters, id } = await setup(
		"proof-upload",
		{ kind: "upload", fileAssetId: crypto.randomUUID() },
	);
	await testDb.db.fonts.softDelete(organizationId, font.id);
	const { assetIds } = await letters.requestExport(member, id, {
		revision: 2,
		fonts: { [font.id]: asset.id },
	});
	expect(assetIds).toHaveLength(2);
});

it("font marks require their own bindings and unused cached fonts are not persisted", async () => {
	const { member, organizationId, font, asset, letters, id } =
		await setup("proof-marks");
	const marked = await testDb.db.fonts.create({
		...font,
		fontAssetId: null,
	});
	const markedAsset = await build(member, marked.id);
	await testDb.db.fonts.finishBuild(
		organizationId,
		marked.id,
		markedAsset.id,
		marked.chars,
	);
	const letter = await letters.getLetter(member, id);
	if (!letter) throw new Error("letter missing");
	await letters.saveLetter(member, id, {
		title: letter.title,
		content: {
			...letter.content,
			doc: {
				...letter.content.doc,
				content: [
					{
						type: "paragraph",
						attrs: { align: "left" },
						content: [
							{
								type: "text",
								text: "Hello",
								marks: [
									{
										type: "ink",
										attrs: {
											font: { kind: "own", fontId: marked.id },
											sizePt: null,
											color: null,
										},
									},
								],
							},
						],
					},
				],
			},
		},
		expectedRevision: 2,
	});
	await expect(
		letters.requestExport(member, id, {
			revision: 3,
			fonts: { [font.id]: asset.id },
		}),
	).rejects.toMatchObject({ code: "proof_fonts_unavailable" });
	const fonts = { [font.id]: asset.id, [marked.id]: markedAsset.id };
	const { assetIds } = await letters.requestExport(member, id, {
		revision: 3,
		fonts: { ...fonts, [crypto.randomUUID()]: crypto.randomUUID() },
	});
	const proof = await testDb.db.assets.byId(organizationId, assetIds[0] ?? "");
	expect(proof?.origin).toMatchObject({ source: "generated", job: { fonts } });
	if (
		proof?.origin.source !== "generated" ||
		proof.origin.job.kind !== "render-letter"
	)
		throw new Error("proof missing");
	expect(proof.origin.job.fonts).toEqual(fonts);
});

it("export requests require an explicit UUID binding map and never accept URLs", () => {
	expect(requestExportRequestSchema.safeParse({ revision: 1 }).success).toBe(
		false,
	);
	expect(
		requestExportRequestSchema.safeParse({ revision: 1, fonts: {} }).success,
	).toBe(true);
	const fontId = crypto.randomUUID();
	expect(
		requestExportRequestSchema.safeParse({
			revision: 1,
			fonts: { [fontId]: crypto.randomUUID() },
		}).success,
	).toBe(true);
	expect(
		requestExportRequestSchema.safeParse({
			revision: 1,
			fonts: { [fontId]: "https://example.com/font.otf" },
		}).success,
	).toBe(false);
	expect(
		requestExportRequestSchema.safeParse({
			revision: 1,
			fonts: { arbitrary: crypto.randomUUID() },
		}).success,
	).toBe(false);
});
