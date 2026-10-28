import type { TestDb } from "@repo/db";
import { seedDevIdentity, startTestDb } from "@repo/db/testing";
import { PlaywrightPrintRenderer } from "@repo/integrations/worker/chromium";
import { fixtureContent, letterFixture } from "@repo/render/html";
import type { AssetStorage } from "@repo/services/assets";
import { AssetService } from "@repo/services/assets";
import { LetterService } from "@repo/services/letters";
import { startTestBrowser, type TestBrowsers } from "@repo/testing/browser";
import type { Member } from "@repo/types";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { AssetRenderLetterProcessor } from "./asset-render-letter.ts";

const stockFontsDir = new URL(
	"../../../../packages/render/fonts/",
	import.meta.url,
);

let testDb: TestDb;
let browsers: TestBrowsers;
let renderer: PlaywrightPrintRenderer;
let files: Map<string, Uint8Array>;
let storage: AssetStorage;
let assets: AssetService;

beforeAll(async () => {
	testDb = await startTestDb();
	browsers = await startTestBrowser();
	renderer = await PlaywrightPrintRenderer.connect({
		wsEndpoint: browsers.wsEndpoint,
	});
	files = new Map();
	storage = {
		put: vi.fn<AssetStorage["put"]>(async ({ key, bytes }) => {
			files.set(key, bytes);
		}),
		get: async (key) => files.get(key) ?? new Uint8Array(),
		signedReadUrl: async () => "https://signed",
	};
	assets = new AssetService(testDb.db, storage, { publish: async () => {} });
});

afterAll(async () => {
	await renderer?.close();
	await browsers?.stop();
	await testDb?.stop();
});

function member(name: string): Promise<Member> {
	return seedDevIdentity(testDb.db, {
		email: `${name}@example.com`,
		organizationName: `${name} Studio`,
	});
}

it("the overflow fixture fails as overflow and the one-and-a-half fixture prints two pages", async () => {
	const ada = await member("ada-render-browser");
	const letters = new LetterService(testDb.db, { publish: async () => {} });
	const processor = new AssetRenderLetterProcessor({
		db: testDb.db,
		assets,
		storage,
		renderer,
		stockFontsDir,
	});

	const overflow = await letters.createLetter(ada, {});
	const overflowLetter = await testDb.db.letters.byId(
		ada.userOrganization.organizationId,
		overflow.id,
	);
	if (!overflowLetter) throw new Error("the letter is not stored");
	await letters.saveLetter(ada, overflow.id, {
		title: "Overflow",
		content: {
			...fixtureContent(letterFixture("overflow")),
			format: overflowLetter.content.format,
		},
		expectedRevision: 1,
	});
	const overflowExport = await letters.requestExport(ada, overflow.id, {
		revision: 2,
	});
	const overflowAssetId = overflowExport.assetIds[0] ?? "";
	await processor.process({
		id: overflowAssetId,
		type: processor.type,
		data: { assetId: overflowAssetId },
		attributes: {},
	});
	const failed = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		overflowAssetId,
	);
	expect(failed?.processing).toMatchObject({
		status: "failed",
		error: "letter_overflow",
	});

	const fitted = await letters.createLetter(ada, {});
	await letters.saveLetter(ada, fitted.id, {
		title: "A page and a half",
		content: fixtureContent(letterFixture("one-and-a-half")),
		expectedRevision: 1,
	});
	const fittedExport = await letters.requestExport(ada, fitted.id, {
		revision: 2,
	});
	const fittedAssetId = fittedExport.assetIds[0] ?? "";
	await processor.process({
		id: fittedAssetId,
		type: processor.type,
		data: { assetId: fittedAssetId },
		attributes: {},
	});
	const stored = await testDb.db.assets.byId(
		ada.userOrganization.organizationId,
		fittedAssetId,
	);
	const pdf = stored ? files.get(stored.storageKey) : undefined;
	if (!pdf) throw new Error("the proof was not stored");
	const text = Buffer.from(pdf).toString("latin1");
	expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
});

it("a postcard's back renders as a 2738×1838 PNG with no ink in the address block", async () => {
	const ada = await member("ada-postcard-back");
	const letters = new LetterService(testDb.db, { publish: async () => {} });
	const created = await letters.createLetter(ada, {
		format: "thanksio:postcard-6x9",
	});
	await letters.saveLetter(ada, created.id, {
		title: "From the pier",
		content: fixtureContent(letterFixture("postcard-back")),
		expectedRevision: 1,
	});
	const exported = await letters.requestExport(ada, created.id, {
		revision: 2,
	});
	const organizationId = ada.userOrganization.organizationId;
	let backId = "";
	for (const assetId of exported.assetIds) {
		const asset = await testDb.db.assets.byId(organizationId, assetId);
		if (
			asset?.origin.source === "generated" &&
			asset.origin.job.kind === "render-letter" &&
			asset.origin.job.output.format === "png" &&
			asset.origin.job.output.side === 1
		) {
			backId = assetId;
		}
	}
	const processor = new AssetRenderLetterProcessor({
		db: testDb.db,
		assets,
		storage,
		renderer,
		stockFontsDir,
	});
	await processor.process({
		id: backId,
		type: processor.type,
		data: { assetId: backId },
		attributes: {},
	});
	const stored = await testDb.db.assets.byId(organizationId, backId);
	const png = stored ? files.get(stored.storageKey) : undefined;
	if (!png) throw new Error("the proof was not stored");
	const meta = await sharp(png).metadata();
	expect(meta.width).toBe(2738);
	expect(meta.height).toBe(1838);
	const block = await sharp(png)
		.extract({ left: 2738 - 1193, top: 1838 - 923, width: 1193, height: 923 })
		.removeAlpha()
		.raw()
		.toBuffer();
	let darkest = 255;
	for (const value of block) {
		if (value < darkest) darkest = value;
	}
	expect(darkest).toBeGreaterThanOrEqual(250);
});
