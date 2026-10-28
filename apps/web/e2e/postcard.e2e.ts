import { fixtureContent, letterFixture } from "@repo/render/html";
import { type Member, PAGE_SPECS } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, letterText, startHarness } from "./harness.ts";

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
						(element) => getComputedStyle(element).backgroundImage,
					),
				{ timeout: 15_000 },
			)
			.toContain("url(");
		const painted = await front.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				backgroundSize: style.backgroundSize,
				backgroundRepeat: style.backgroundRepeat,
				width: (element as HTMLElement).style.width,
				height: (element as HTMLElement).style.height,
				empty: element.querySelector(".letter-front-empty") !== null,
			};
		});
		expect(painted).toEqual({
			backgroundSize: "cover",
			backgroundRepeat: "no-repeat",
			width: `${spec.widthIn}in`,
			height: `${spec.heightIn}in`,
			empty: false,
		});
		await letterText(page).focus();
		await page.keyboard.press("Meta+Z");
		await page.locator(".letter-front-empty").waitFor();
		expect(
			await front.evaluate(
				(element) => getComputedStyle(element).backgroundImage,
			),
		).toBe("none");
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

	it("a postcard proof downloads two PNGs", async () => {
		const page = await pickPostcard(harness, member);
		await page
			.getByRole("status")
			.filter({ hasText: /^Saved$/ })
			.waitFor();
		await page.getByRole("button", { name: "Export proof" }).click();
		const links = page.getByRole("link", { name: "Download the proof" });
		await expect.poll(() => links.count(), { timeout: 90_000 }).toBe(2);
		const sizes = [];
		for (const link of await links.all()) {
			const href = await link.getAttribute("href");
			if (!href) throw new Error("the proof has no address");
			const response = await page.request.get(href);
			expect(response.ok()).toBe(true);
			const bytes = Buffer.from(await response.body());
			expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
			sizes.push(pngSize(bytes));
		}
		expect(sizes).toEqual([
			{ width: 2738, height: 1838 },
			{ width: 2738, height: 1838 },
		]);
	}, 120_000);
});
