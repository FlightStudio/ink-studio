import {
	fixtureContent,
	letterFixture,
	measureInputFor,
	measureLetter,
} from "@repo/render/html";
import { DEFAULT_FORMAT, type Member, PAGE_SPECS } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	startHarness,
	waitForSaved,
} from "./harness.ts";

const spec = PAGE_SPECS[DEFAULT_FORMAT];

function sidesCopy(sides: number): string {
	return `${sides} of ${spec.maxPages} sides`;
}

function sidesLine(page: Page) {
	return page.locator("[data-sides]");
}

async function openFixture(
	harness: Harness,
	member: Member,
	name: "one-and-a-half" | "overflow",
): Promise<{ page: Page; letterId: string }> {
	const fixture = letterFixture(name);
	const letterId = await harness.newLetter(member);
	await harness.letters.saveLetter(member, letterId, {
		title: fixture.name,
		content: fixtureContent(fixture),
		expectedRevision: 1,
	});
	const page = await harness.open(member, `/letters/${letterId}`);
	await letterText(page).waitFor();
	await page.evaluate(() => document.fonts.ready);
	return { page, letterId };
}

async function clearLetter(page: Page): Promise<void> {
	await letterText(page).click();
	await page.keyboard.press("Control+a");
	const selected = await page.evaluate(
		() => window.getSelection()?.toString().length ?? 0,
	);
	if (selected < 1) {
		await page.evaluate(() => {
			const root = document.querySelector(".letter-text");
			if (!root) throw new Error("No letter text");
			const range = document.createRange();
			range.selectNodeContents(root);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		});
	}
	await page.keyboard.press("Backspace");
}

async function pageScale(page: Page): Promise<number> {
	const transform = await page.locator(".letter-page").evaluate((element) => {
		const scaled = element.parentElement;
		return scaled ? getComputedStyle(scaled).transform : "none";
	});
	const match = /matrix\(([^,]+)/.exec(transform);
	return match?.[1] === undefined ? 1 : Number(match[1]);
}

describe("sides, overflow, an added side and the seal", () => {
	let harness: Harness;
	let member: Member;

	beforeAll(async () => {
		harness = await startHarness();
		member = await harness.seedIdentity();
	});

	afterAll(async () => {
		await harness?.stop();
	});

	it("a long letter reports its sides", async () => {
		const { page } = await openFixture(harness, member, "one-and-a-half");
		const expected = sidesCopy(letterFixture("one-and-a-half").sides);
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect.poll(async () => sidesLine(page).textContent()).toBe(expected);
		await expect.poll(() => pageScale(page)).toBe(1.25);
		await page.setViewportSize({ width: 900, height: 900 });
		await expect.poll(async () => sidesLine(page).textContent()).toBe(expected);
	});

	it("text past the last allowed side shows on a ghost sheet with a count", async () => {
		const { page } = await openFixture(harness, member, "overflow");
		const notice = page.locator("[data-overflow-notice]");
		const ghost = page.locator(`.letter-sheet[data-side="${spec.maxPages}"]`);
		await ghost.waitFor();
		await expect
			.poll(async () => {
				const measured = await page
					.locator(".letter-column")
					.evaluate(measureLetter, measureInputFor(spec, "edit"));
				const text = await notice.textContent().catch(() => "");
				return (
					measured.wordsPastLimit > 0 &&
					text ===
						`About ${measured.wordsPastLimit} words won't fit on ${spec.maxPages} sides. Shorten the letter or pick a smaller text size.`
				);
			})
			.toBe(true);
		const onGhost = await page.evaluate((side) => {
			const sheet = document.querySelector(
				`.letter-sheet[data-side="${side}"]`,
			);
			const text = document.querySelector(".letter-text");
			if (!sheet || !text) return false;
			const sheetBox = sheet.getBoundingClientRect();
			const range = document.createRange();
			range.selectNodeContents(text);
			return [...range.getClientRects()].some(
				(rect) =>
					rect.height > 0 &&
					rect.bottom > sheetBox.top &&
					rect.top < sheetBox.bottom,
			);
		}, spec.maxPages);
		expect(onGhost).toBe(true);
	});

	it("Add a side stops at the limit", async () => {
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/letters/${letterId}`);
		await sidesLine(page).waitFor();
		const add = page.getByRole("button", { name: "Add a side" });
		for (let added = 1; added < spec.maxPages; added += 1) {
			await add.click();
			await expect
				.poll(async () => sidesLine(page).textContent())
				.toBe(sidesCopy(added + 1));
		}
		await expect.poll(async () => add.count()).toBe(0);
	});

	it("Add a side is not offered when the text already fills every side", async () => {
		const { page } = await openFixture(harness, member, "overflow");
		await page.locator("[data-overflow-notice]").waitFor();
		await expect
			.poll(() => page.getByRole("button", { name: "Add a side" }).count())
			.toBe(0);
	});

	it("Add a side adds a blank side after the ones the text uses", async () => {
		const { page } = await openFixture(harness, member, "one-and-a-half");
		await expect
			.poll(async () => sidesLine(page).textContent())
			.toBe(sidesCopy(2));
		await page.getByRole("button", { name: "Add a side" }).click();
		await expect
			.poll(async () => sidesLine(page).textContent())
			.toBe(sidesCopy(3));
		await page.locator('.letter-sheet[data-side="2"]').waitFor();
		await expect
			.poll(() => page.getByRole("button", { name: "Add a side" }).count())
			.toBe(0);
	});

	it("deleting the extra text clears the notice", async () => {
		const { page } = await openFixture(harness, member, "overflow");
		const notice = page.locator("[data-overflow-notice]");
		await notice.waitFor();
		await clearLetter(page);
		await expect.poll(async () => notice.count(), { timeout: 10_000 }).toBe(0);
	});

	it("undo brings it back", async () => {
		const { page } = await openFixture(harness, member, "overflow");
		const notice = page.locator("[data-overflow-notice]");
		await notice.waitFor();
		const before = await notice.textContent();
		await clearLetter(page);
		await expect.poll(async () => notice.count(), { timeout: 10_000 }).toBe(0);
		await page.keyboard.press("Meta+Z");
		await expect.poll(async () => notice.textContent()).toBe(before);
	});

	it("an added side stays after reload and undo removes it", async () => {
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/letters/${letterId}`);
		await expect
			.poll(async () => sidesLine(page).textContent())
			.toBe(sidesCopy(1));
		const add = page.getByRole("button", { name: "Add a side" });
		await add.click();
		await expect
			.poll(async () => sidesLine(page).textContent())
			.toBe(sidesCopy(2));
		await letterText(page).click();
		await page.keyboard.press("Meta+Z");
		await expect
			.poll(async () => sidesLine(page).textContent())
			.toBe(sidesCopy(1));
		const saved = nextSave(page, letterId);
		await add.click();
		await saved;
		await waitForSaved(page);
		await page.reload();
		await expect
			.poll(async () => sidesLine(page).textContent())
			.toBe(sidesCopy(2));
		const stored = await harness.letters.getLetter(member, letterId);
		expect(stored?.content.doc.attrs.minSides).toBe(2);
	});

	it("the seal reads the letter", async () => {
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("Dear Alex, in Caveat, with no doodles.");
		await sidesLine(page).waitFor();
		expect(await page.locator("[data-human-seal]").count()).toBe(0);
		expect(
			await page.getByText(/own handwriting|doodles hand-drawn/).count(),
		).toBe(0);
	});
});
