import { fixtureContent, letterFixture } from "@repo/render/html";
import { type Member, PAGE_SPECS } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	startHarness,
	waitForSaved,
} from "./harness.ts";

const POSTCARD = "thanksio:postcard-6x9" as const;
const spec = PAGE_SPECS[POSTCARD];

const PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

function pngSize(bytes: Buffer): { width: number; height: number } {
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function pickPostcard(harness: Harness, member: Member): Promise<Page> {
	const page = await harness.open(member, "/letters/new");
	await page.getByRole("heading", { name: "What are you making?" }).waitFor();
	await page.locator(`[data-format="${POSTCARD}"]`).click();
	await page.locator(".letter-front").waitFor();
	return page;
}

async function glyphHits(
	page: Page,
): Promise<{ hits: number; beside: number }> {
	return page.evaluate(() => {
		const zone = document.querySelector("[data-keep-clear]");
		const root = document.querySelector(".letter-text");
		if (!zone || !root) return { hits: -1, beside: 0 };
		const zoneRect = zone.getBoundingClientRect();
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let hits = 0;
		let beside = 0;
		let node = walker.nextNode();
		while (node) {
			const text = node.textContent ?? "";
			for (let index = 0; index < text.length; index += 1) {
				const character = text[index] ?? "";
				if (/\s/u.test(character)) continue;
				const range = document.createRange();
				range.setStart(node, index);
				range.setEnd(node, index + 1);
				const rect = range.getClientRects()[0];
				if (!rect || rect.width === 0 || rect.height === 0) continue;
				const overlaps =
					rect.left < zoneRect.right - 0.5 &&
					zoneRect.left < rect.right - 0.5 &&
					rect.top < zoneRect.bottom - 0.5 &&
					zoneRect.top < rect.bottom - 0.5;
				if (overlaps) hits += 1;
				if (
					rect.right <= zoneRect.left + 0.5 &&
					rect.bottom > zoneRect.top &&
					rect.top < zoneRect.bottom
				) {
					beside += 1;
				}
			}
			node = walker.nextNode();
		}
		return { hits, beside };
	});
}

describe("postcards", () => {
	let harness: Harness;
	let member: Member;

	beforeAll(async () => {
		harness = await startHarness();
		member = await harness.seedIdentity();
	});

	afterAll(async () => {
		await harness?.stop();
	});

	it("a new postcard shows a front to fill and a back to write on", async () => {
		const page = await pickPostcard(harness, member);
		await page.locator(".letter-front-empty").waitFor();
		expect(await page.locator(".letter-front-empty").textContent()).toBe(
			"Choose a front image",
		);
		expect(await page.locator("[data-sides]").textContent()).toBe(
			`2 of ${spec.maxPages} sides`,
		);
		await letterText(page).waitFor();
	});

	it("the chosen front image fills the front edge to edge, and undo removes it", async () => {
		const page = await pickPostcard(harness, member);
		await page.getByLabel("Front image").setInputFiles({
			name: "pier.png",
			mimeType: "image/png",
			buffer: PNG,
		});
		const front = page.locator(".letter-front");
		await expect
			.poll(
				async () =>
					front.evaluate(
						(element) => (element as HTMLElement).style.backgroundSize,
					),
				{ timeout: 15_000 },
			)
			.toBe("cover");
		const painted = await front.evaluate((element) => {
			const sheet = element as HTMLElement;
			return {
				backgroundSize: sheet.style.backgroundSize,
				backgroundRepeat: sheet.style.backgroundRepeat,
				widthIn: Number.parseFloat(sheet.style.width),
				heightIn: Number.parseFloat(sheet.style.height),
				empty: element.querySelector(".letter-front-empty") !== null,
			};
		});
		expect(painted.backgroundSize).toBe("cover");
		expect(painted.backgroundRepeat).toBe("no-repeat");
		expect(painted.empty).toBe(false);
		expect(painted.widthIn).toBeCloseTo(spec.widthIn);
		expect(painted.heightIn).toBeCloseTo(spec.heightIn);
		await letterText(page).focus();
		await page.keyboard.press("Meta+Z");
		await page.locator(".letter-front-empty").waitFor();
		expect(
			await front.evaluate(
				(element) => (element as HTMLElement).style.backgroundImage,
			),
		).toBe("");
	});

	it("the front box is the image picker, and a chosen image can be replaced or removed", async () => {
		const page = await pickPostcard(harness, member);
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "Choose a front image" }).click();
		await (await chooser).setFiles({
			name: "pier.png",
			mimeType: "image/png",
			buffer: PNG,
		});
		await page.locator(".letter-front-empty").waitFor({ state: "detached" });
		await page.getByRole("button", { name: "Replace front image" }).waitFor();
		await page.getByRole("button", { name: "Remove front image" }).click();
		await page.locator(".letter-front-empty").waitFor();
		expect(
			await page.getByRole("button", { name: "Remove front image" }).count(),
		).toBe(0);
	});

	it("a click on the empty front opens the image picker", async () => {
		const page = await pickPostcard(harness, member);
		const box = await page.locator(".letter-front-empty").boundingBox();
		if (!box) throw new Error("the front has no empty box");
		const chooser = page.waitForEvent("filechooser", { timeout: 5_000 });
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		expect((await chooser).isMultiple()).toBe(false);
	});

	it("text on the back never enters the address block", async () => {
		const { id } = await harness.letters.createLetter(member, {
			format: POSTCARD,
		});
		await harness.letters.saveLetter(member, id, {
			title: "From the pier",
			content: fixtureContent(letterFixture("postcard-back")),
			expectedRevision: 1,
		});
		const page = await harness.open(member, `/letters/${id}`);
		await letterText(page).waitFor();
		await page.evaluate(() => document.fonts.ready);
		await expect
			.poll(() => glyphHits(page), { timeout: 15_000 })
			.toMatchObject({ hits: 0 });
		const placed = await glyphHits(page);
		expect(placed.beside).toBeGreaterThan(0);
	});

	it("there is no Add a side on a postcard", async () => {
		const page = await pickPostcard(harness, member);
		expect(await page.getByRole("button", { name: "Add a side" }).count()).toBe(
			0,
		);
	});

	it("a postcard without a front image is not exported and says what to do", async () => {
		const page = await pickPostcard(harness, member);
		await waitForSaved(page);
		const since = await page.evaluate(() => performance.now());
		await page.getByRole("button", { name: "Export proof" }).click();
		await page
			.getByRole("dialog")
			.getByText("Choose a front image, then export again.")
			.waitFor();
		expect(
			await page.evaluate(
				(start) =>
					performance
						.getEntriesByType("resource")
						.filter(
							(entry) =>
								entry.startTime > start && entry.name.includes("/exports"),
						).length,
				since,
			),
		).toBe(0);
	});

	it("a postcard proof downloads two PNGs", async () => {
		const page = await pickPostcard(harness, member);
		await page.waitForURL(/\/letters\/[^/]+$/);
		const letterId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
		const saved = nextSave(page, letterId);
		await page.getByLabel("Front image").setInputFiles({
			name: "pier.png",
			mimeType: "image/png",
			buffer: PNG,
		});
		await saved;
		await waitForSaved(page);
		await page.getByRole("button", { name: "Export proof" }).click();
		const links = page.getByRole("link", { name: /^Open the (front|back)$/ });
		await expect.poll(() => links.count(), { timeout: 90_000 }).toBe(2);
		expect(await links.allInnerTexts()).toEqual([
			"Open the front",
			"Open the back",
		]);
		const sizes = [];
		for (const link of await links.all()) {
			const href = await link.getAttribute("href");
			if (!href) throw new Error("the proof has no address");
			const viewer = await page.context().newPage();
			const response = await viewer.goto(new URL(href, page.url()).href);
			if (!response) throw new Error("the proof did not load");
			expect(response.ok()).toBe(true);
			const bytes = Buffer.from(await response.body());
			await viewer.close();
			expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
			sizes.push(pngSize(bytes));
		}
		expect(sizes).toEqual([
			{ width: 2738, height: 1838 },
			{ width: 2738, height: 1838 },
		]);
	}, 120_000);
});
