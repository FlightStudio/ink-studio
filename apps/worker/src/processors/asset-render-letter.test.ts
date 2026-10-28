import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import type { AssetStorage } from "@repo/services/assets";
import { AssetService, generatedAsset } from "@repo/services/assets";
import {
	type LetterMeasure,
	LetterService,
	type PrintRenderer,
} from "@repo/services/letters";
import type { Publisher } from "@repo/services/queue";
import type { LetterContent, Member } from "@repo/types";
import { SAMPLE_MERGE_VALUES } from "@repo/types";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AssetRenderLetterProcessor } from "./asset-render-letter.ts";

const stockFontsDir = new URL(
	"../../../../packages/render/fonts/",
	import.meta.url,
);

let testDb: TestDb;
let files: Map<string, Uint8Array>;
let storage: AssetStorage;
let assets: AssetService;

beforeAll(async () => {
	testDb = await startTestDb();
	files = new Map();
	storage = {
		put: vi.fn<AssetStorage["put"]>(async ({ key, bytes }) => {
			files.set(key, bytes);
		}),
		get: vi.fn<AssetStorage["get"]>(
			async (key) => files.get(key) ?? new Uint8Array(),
		),
		signedReadUrl: vi.fn<AssetStorage["signedReadUrl"]>(
			async () => "https://signed",
		),
	};
	assets = new AssetService(testDb.db, storage, {
		publish: async () => {},
	});
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

function rendererReturning(
	measure: LetterMeasure,
	bytes = Uint8Array.from([1]),
): {
	renderer: PrintRenderer;
	render: ReturnType<typeof vi.fn<PrintRenderer["render"]>>;
} {
	const render = vi.fn<PrintRenderer["render"]>(async () => bytes);
	return {
		render,
		renderer: {
			measure: async () => measure,
			render,
		},
	};
}

function processorFor(renderer: PrintRenderer): AssetRenderLetterProcessor {
	return new AssetRenderLetterProcessor({
		db: testDb.db,
		assets,
		storage,
		renderer,
		stockFontsDir,
	});
}

function message(processor: AssetRenderLetterProcessor, assetId: string) {
	return {
		id: assetId,
		type: processor.type,
		data: { assetId },
		attributes: {},
	};
}

async function exportLetter(
	caller: Member,
	content: LetterContent,
	title: string,
) {
	const publish = vi.fn<Publisher["publish"]>(async () => {});
	const letters = new LetterService(testDb.db, { publish });
	const { id } = await letters.createLetter(caller, {
		format: content.format,
	});
	await letters.saveLetter(caller, id, {
		title,
		content,
		expectedRevision: 1,
	});
	const { assetIds } = await letters.requestExport(caller, id, { revision: 2 });
	return { letters, id, assetId: assetIds[0] ?? "" };
}

it("later edits do not reach the export", async () => {
	const ada = await member("ada-export-later");
	const letters = new LetterService(testDb.db, { publish: async () => {} });
	const { id } = await letters.createLetter(ada, {});
	const created = await testDb.db.letters.byId(
		ada.userOrganization.organizationId,
		id,
	);
	if (!created) throw new Error("the letter is not stored");
	await letters.saveLetter(ada, id, {
		title: "Hello",
		content: written(created.content, "Original sentence"),
		expectedRevision: 1,
	});
	const { assetIds } = await letters.requestExport(ada, id, { revision: 2 });
	const saved = await testDb.db.letters.byId(
		ada.userOrganization.organizationId,
		id,
	);
	if (!saved) throw new Error("the letter is not stored");
	await letters.saveLetter(ada, id, {
		title: "Hello",
		content: written(saved.content, "Edited sentence"),
		expectedRevision: 2,
	});
	const { renderer, render } = rendererReturning({
		lineTopsIn: [1],
		textBottomIn: 2,
		wordsPastLimit: 0,
	});
	const processor = processorFor(renderer);
	await processor.process(message(processor, assetIds[0] ?? ""));
	const html = render.mock.calls[0]?.[0].html ?? "";
	expect(html).toContain("Original sentence");
	expect(html.includes("Edited sentence")).toBe(false);
});

it("a letter that fits with Alex but not with the longest name fails the export", async () => {
	const ada = await member("ada-export-longest");
	const base = await freshContent(ada);
	const content: LetterContent = {
		...base,
		doc: {
			...base.doc,
			content: [
				{
					type: "paragraph",
					attrs: { align: "left" },
					content: [
						{ type: "text", text: "Dear " },
						{ type: "mergeField", attrs: { field: "first_name" } },
					],
				},
			],
		},
	};
	const { assetId } = await exportLetter(ada, content, "Dear friend");
	const measure = vi.fn<PrintRenderer["measure"]>(async ({ html }) => ({
		lineTopsIn: [1],
		textBottomIn: html.includes("Maximiliana") ? 40 : 2,
		wordsPastLimit: html.includes("Maximiliana") ? 12 : 0,
	}));
	const render = vi.fn<PrintRenderer["render"]>(async () =>
		Uint8Array.from([1]),
	);
	const processor = processorFor({ measure, render });
	await processor.process(message(processor, assetId));
	expect(measure.mock.calls[0]?.[0].html).toContain("Maximiliana");
	expect(render).not.toHaveBeenCalled();
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		assetId,
	);
	expect(stored?.processing).toMatchObject({
		status: "failed",
		error: "letter_overflow",
	});
});

it("text that does not fit fails the export with its reason", async () => {
	const ada = await member("ada-export-overflow");
	const { assetId } = await exportLetter(
		ada,
		await freshContent(ada),
		"Too long",
	);
	const { renderer } = rendererReturning({
		lineTopsIn: [1],
		textBottomIn: 40,
		wordsPastLimit: 12,
	});
	const processor = processorFor(renderer);
	await processor.process(message(processor, assetId));
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		assetId,
	);
	expect(stored?.processing).toMatchObject({
		status: "failed",
		error: "letter_overflow",
	});
});

it("a signed letter's export loads the signature mask", async () => {
	const ada = await member("ada-export-signature");
	const maskId = crypto.randomUUID();
	const key = `organizations/${ada.userOrganization.organizationId}/assets/${maskId}`;
	const bytes = Uint8Array.from([4, 5, 6]);
	await testDb.db.assets.create({
		id: maskId,
		organizationId: ada.userOrganization.organizationId,
		storageKey: key,
		mimeType: "image/png",
		byteSize: bytes.byteLength,
		checksum: "d".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "sign.png",
			uploadedByUserId: ada.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	await storage.put({ key, bytes, contentType: "image/png" });
	const drawing = await testDb.db.drawings.create({
		organizationId: ada.userOrganization.organizationId,
		ownerUserId: ada.user.id,
		kind: "signature",
		name: "Ada",
		source: {
			kind: "drawn",
			box: { widthPx: 30, heightPx: 10 },
			strokes: [],
		},
		maskAssetId: maskId,
		aspect: 3,
	});
	const base = await freshContent(ada);
	const content: LetterContent = {
		...base,
		doc: {
			...base.doc,
			content: [
				...base.doc.content,
				{
					type: "signature",
					attrs: {
						drawingId: drawing.id,
						widthIn: 2.25,
						align: "right",
						color: "ink-blue",
					},
				},
			],
		},
	};
	const { assetId } = await exportLetter(ada, content, "Signed");
	const measure = vi.fn<PrintRenderer["measure"]>(async () => ({
		lineTopsIn: [1],
		textBottomIn: 2,
		wordsPastLimit: 0,
	}));
	const render = vi.fn<PrintRenderer["render"]>(async () =>
		Uint8Array.from([1]),
	);
	const processor = processorFor({ measure, render });
	await processor.process(message(processor, assetId));
	const resources = measure.mock.calls[0]?.[0].resources;
	expect(
		resources?.get(`https://letter.invalid/assets/${maskId}`)?.bytes,
	).toEqual(bytes);
	expect(render).toHaveBeenCalled();
});

it("a doodle in the barcode corner fails the export", async () => {
	const ada = await member("ada-export-barcode");
	const maskId = crypto.randomUUID();
	await testDb.db.assets.create({
		id: maskId,
		organizationId: ada.userOrganization.organizationId,
		storageKey: `organizations/${ada.userOrganization.organizationId}/assets/${maskId}`,
		mimeType: "image/png",
		byteSize: 8,
		checksum: "a".repeat(64),
		origin: {
			source: "uploaded",
			purpose: "mask",
			filename: "star.png",
			uploadedByUserId: ada.user.id,
		},
		processing: { status: "done", attempts: 0 },
	});
	const drawing = await testDb.db.drawings.create({
		organizationId: ada.userOrganization.organizationId,
		ownerUserId: ada.user.id,
		kind: "doodle",
		name: "Star",
		source: {
			kind: "drawn",
			box: { widthPx: 10, heightPx: 10 },
			strokes: [],
		},
		maskAssetId: maskId,
		aspect: 1,
	});
	const base = await freshContent(ada);
	const content: LetterContent = {
		...base,
		doc: {
			...base.doc,
			attrs: {
				...base.doc.attrs,
				elements: [
					{
						id: crypto.randomUUID(),
						kind: "drawing",
						drawingId: drawing.id,
						side: 0,
						xIn: 8.1,
						yIn: 0.02,
						widthIn: 0.35,
						heightIn: 0.35,
						rotationDeg: 0,
						tint: "ink-blue",
						wrap: false,
					},
				],
			},
		},
	};
	const { assetId } = await exportLetter(ada, content, "Barcode");
	const { renderer, render } = rendererReturning({
		lineTopsIn: [1],
		textBottomIn: 2,
		wordsPastLimit: 0,
	});
	const processor = processorFor(renderer);
	await processor.process(message(processor, assetId));
	expect(render).not.toHaveBeenCalled();
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		assetId,
	);
	expect(stored?.processing).toMatchObject({
		status: "failed",
		error: "letter_placement",
	});
});

it("a postcard side has its own download name", async () => {
	const ada = await member("ada-postcard-name");
	const letters = new LetterService(testDb.db, { publish: async () => {} });
	const { id } = await letters.createLetter(ada, {
		format: "thanksio:postcard-6x9",
	});
	const letter = await testDb.db.letters.byId(
		ada.userOrganization.organizationId,
		id,
	);
	if (!letter) throw new Error("the letter is not stored");
	const asset = await testDb.db.assets.create(
		generatedAsset(ada.userOrganization.organizationId, {
			kind: "render-letter",
			letterId: id,
			title: "Hello from the pier",
			content: letter.content,
			mergeValues: SAMPLE_MERGE_VALUES,
			output: { format: "png", side: 1 },
		}),
	);
	const { renderer } = rendererReturning(
		{ lineTopsIn: [1], textBottomIn: 2, wordsPastLimit: 0 },
		Uint8Array.from([9, 9]),
	);
	const processor = processorFor(renderer);
	await processor.process(message(processor, asset.id));
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		asset.id,
	);
	expect(stored?.mimeType).toBe("image/png");
	await assets.getAssetReadUrl(ada.userOrganization, asset.id);
	expect(storage.signedReadUrl).toHaveBeenCalledWith({
		key: stored?.storageKey,
		expiresInSeconds: 300,
		downloadName: "hello-from-the-pier-proof-side-1.png",
	});
});

it("the export is a PDF proof with a safe download name", async () => {
	const ada = await member("ada-export-name");
	const content = await freshContent(ada);
	const asset = await testDb.db.assets.create(
		generatedAsset(ada.userOrganization.organizationId, {
			kind: "render-letter",
			letterId: crypto.randomUUID(),
			title: 'Dear "Alex"\n',
			content,
			mergeValues: SAMPLE_MERGE_VALUES,
			output: { format: "pdf", duplex: true },
		}),
	);
	const assetId = asset.id;
	const { renderer } = rendererReturning(
		{ lineTopsIn: [1], textBottomIn: 2, wordsPastLimit: 0 },
		Uint8Array.from([9, 9]),
	);
	const processor = processorFor(renderer);
	await processor.process(message(processor, assetId));
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		assetId,
	);
	expect(stored?.mimeType).toBe("application/pdf");
	await assets.getAssetReadUrl(ada.userOrganization, assetId);
	expect(storage.signedReadUrl).toHaveBeenCalledWith({
		key: stored?.storageKey,
		expiresInSeconds: 300,
		downloadName: "dear-alex-proof.pdf",
	});
});

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

async function freshContent(caller: Member): Promise<LetterContent> {
	const letters = new LetterService(testDb.db, { publish: async () => {} });
	const { id } = await letters.createLetter(caller, {});
	const letter = await testDb.db.letters.byId(
		caller.userOrganization.organizationId,
		id,
	);
	if (!letter) throw new Error("the letter is not stored");
	await letters.deleteLetter(caller, id);
	return letter.content;
}
