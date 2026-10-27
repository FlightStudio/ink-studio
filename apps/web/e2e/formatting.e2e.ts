import type { Member } from "@repo/types";
import { INK_COLORS } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	startHarness,
	typeAndSettle,
	waitForSaved,
} from "./harness.ts";

async function selectWord(page: Page, word: string): Promise<void> {
	await page.evaluate((target) => {
		const root = document.querySelector(".letter-text");
		if (!root) throw new Error("No letter text");
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const start = node.textContent?.indexOf(target) ?? -1;
			if (start < 0) continue;
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + target.length);
			const selection = window.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			return;
		}
		throw new Error(`No text "${target}" in the letter`);
	}, word);
	await page.waitForFunction(
		(target) => window.getSelection()?.toString() === target,
		word,
	);
}

async function pickFont(page: Page, label: string): Promise<void> {
	await page.getByRole("combobox", { name: "Font" }).click();
	await page.getByRole("option", { name: label }).click();
}

async function pickInk(page: Page, label: string): Promise<void> {
	await page.locator('[data-slot="swatch"]').filter({ hasText: label }).click();
}

function styleOf(page: Page, text: string) {
	return page.evaluate((target) => {
		const span = [...document.querySelectorAll(".letter-text span")].find(
			(element) => element.textContent === target,
		);
		if (!span) return null;
		const style = getComputedStyle(span);
		return {
			family: style.fontFamily.replaceAll('"', ""),
			color: style.color,
			size: style.fontSize,
		};
	}, text);
}

function rgbOf(hex: string): string {
	const [r, g, b] = [1, 3, 5].map((at) =>
		Number.parseInt(hex.slice(at, at + 2), 16),
	);
	return `rgb(${r}, ${g}, ${b})`;
}

describe("formatting from the toolbar", () => {
	let harness: Harness;
	let member: Member;
	let letterId: string;

	beforeAll(async () => {
		harness = await startHarness();
		member = await harness.seedIdentity();
	});

	afterAll(async () => {
		await harness?.stop();
	});

	beforeEach(async () => {
		letterId = await harness.newLetter(member);
	});

	it("a font applied to a selection survives a reload", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await typeAndSettle(page, letterId, "Dear Alex, the fern came back.");
		await selectWord(page, "Alex");
		const saved = nextSave(page, letterId);
		await pickFont(page, "Homemade Apple");
		await saved;
		await waitForSaved(page);

		await page.reload();
		await letterText(page).filter({ hasText: "Dear Alex" }).waitFor();
		const loaded = await page.evaluate(async () => {
			await document.fonts.ready;
			return document.fonts.check("20pt stock-homemade-apple");
		});
		expect(loaded).toBe(true);
		const style = await styleOf(page, "Alex");
		expect(style?.family.startsWith("stock-homemade-apple")).toBe(true);
	});

	it("changing the colour keeps the font", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await typeAndSettle(page, letterId, "Dear Alex, the fern came back.");
		await selectWord(page, "Alex");
		await pickFont(page, "Homemade Apple");
		await selectWord(page, "Alex");
		const saved = nextSave(page, letterId);
		await pickInk(page, "Oxblood");
		await saved;
		await waitForSaved(page);

		const style = await styleOf(page, "Alex");
		expect(style?.family.startsWith("stock-homemade-apple")).toBe(true);
		expect(style?.color).toBe(rgbOf(INK_COLORS.oxblood.css));
		const stored = await harness.letters.getLetter(member, letterId);
		const alex = stored?.content.doc.content[0]?.content?.find(
			(node) => node.type === "text" && node.text === "Alex",
		);
		expect(alex?.marks).toEqual([
			{
				type: "ink",
				attrs: {
					font: { kind: "stock", id: "homemade-apple" },
					sizePt: null,
					color: "oxblood",
				},
			},
		]);
	});

	it("undo takes back formatting before typing", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("Dear Alex");
		await page.keyboard.press("Shift+Home");
		await page.getByRole("button", { name: "30 pt" }).click();
		expect((await styleOf(page, "Dear Alex"))?.size).toBe("40px");

		await page.keyboard.press("Meta+Z");
		await page.waitForFunction(
			() => document.querySelectorAll(".letter-text span").length === 0,
		);
		expect(await letterText(page).textContent()).toBe("Dear Alex");
		await expect
			.poll(
				async () =>
					(await harness.letters.getLetter(member, letterId))?.content.doc
						.content[0]?.content,
				{ timeout: 10_000 },
			)
			.toEqual([{ type: "text", text: "Dear Alex" }]);
	});

	it("align centers the paragraph", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await typeAndSettle(page, letterId, "With love,");
		const saved = nextSave(page, letterId);
		await page.getByRole("button", { name: "Align centre" }).click();
		await saved;
		await waitForSaved(page);

		const align = await letterText(page)
			.locator("p")
			.first()
			.evaluate((paragraph) => getComputedStyle(paragraph).textAlign);
		expect(align).toBe("center");
		const stored = await harness.letters.getLetter(member, letterId);
		expect(stored?.content.doc.content[0]?.attrs.align).toBe("center");
	});
});
