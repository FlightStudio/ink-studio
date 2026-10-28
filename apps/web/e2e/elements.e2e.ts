import { INK_COLORS, type Member } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	startHarness,
	waitForSaved,
} from "./harness.ts";

function rgbOf(hex: string): string {
	const [r, g, b] = [1, 3, 5].map((at) =>
		Number.parseInt(hex.slice(at, at + 2), 16),
	);
	return `rgb(${r}, ${g}, ${b})`;
}

async function drawAndPlace(page: Page, letterId: string): Promise<void> {
	await page.getByRole("button", { name: "Library" }).click();
	await page.getByRole("button", { name: "Draw" }).click();
	const canvas = page.getByLabel("Doodle", { exact: true });
	const box = await canvas.boundingBox();
	if (!box) throw new Error("the doodle canvas has no box");
	await page.mouse.move(box.x + 24, box.y + 36);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 24, box.y + box.height - 36);
	await page.mouse.up();
	await page.getByRole("button", { name: "Save doodle" }).click();
	await page
		.getByRole("button", { name: "Doodle", exact: true })
		.first()
		.waitFor();
	const saved = nextSave(page, letterId);
	await page
		.getByRole("button", { name: "Doodle", exact: true })
		.first()
		.click();
	await saved;
	await page
		.getByRole("dialog", { name: "Library" })
		.waitFor({ state: "hidden" });
	await page.locator(".letter-element").waitFor();
}

async function elementStyle(page: Page): Promise<{
	left: string;
	top: string;
	color: string;
}> {
	return page.evaluate(() => {
		const element = document.querySelector<HTMLElement>(".letter-element");
		if (!element) throw new Error("no doodle");
		return {
			left: element.style.left,
			top: element.style.top,
			color: getComputedStyle(element).backgroundColor,
		};
	});
}

async function drag(page: Page, name: string, dx: number, dy: number) {
	const handle = page.getByRole("button", { name });
	const box = await handle.boundingBox();
	if (!box) throw new Error(`${name} has no box`);
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps: 12 });
	await page.mouse.up();
}

describe("placed doodles", () => {
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

	it("one undo moves a moved doodle back", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const before = await elementStyle(page);
		await drag(page, "Move doodle", 90, 40);
		await expect
			.poll(async () => (await elementStyle(page)).left)
			.not.toBe(before.left);
		await letterText(page).focus();
		await page.keyboard.press("Meta+Z");
		await expect
			.poll(async () => elementStyle(page))
			.toMatchObject({
				left: before.left,
				top: before.top,
			});
	});

	it("a moved doodle survives a reload", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const saved = nextSave(page, letterId);
		await drag(page, "Move doodle", 70, -30);
		await saved;
		await waitForSaved(page);
		const moved = await elementStyle(page);
		await page.reload();
		await page.locator(".letter-element").waitFor();
		expect(await elementStyle(page)).toMatchObject({
			left: moved.left,
			top: moved.top,
		});
	});

	it("recolour paints the doodle in the picked ink, and undo restores it", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await page.getByRole("button", { name: "Move doodle" }).click();
		await page
			.getByRole("group", { name: "Doodle" })
			.locator('[data-slot="swatch"]')
			.filter({ hasText: "Oxblood" })
			.click();
		const oxblood = rgbOf(INK_COLORS.oxblood.css);
		const inkBlue = rgbOf(INK_COLORS["ink-blue"].css);
		await expect
			.poll(async () => (await elementStyle(page)).color)
			.toBe(oxblood);
		await letterText(page).focus();
		await page.keyboard.press("Meta+Z");
		await expect
			.poll(async () => (await elementStyle(page)).color)
			.toBe(inkBlue);
		await page.getByRole("button", { name: "Move doodle" }).click();
		const saved = nextSave(page, letterId);
		await page
			.getByRole("group", { name: "Doodle" })
			.locator('[data-slot="swatch"]')
			.filter({ hasText: "Oxblood" })
			.click();
		await saved;
		await waitForSaved(page);
		await page.reload();
		await page.locator(".letter-element").waitFor();
		expect((await elementStyle(page)).color).toBe(oxblood);
	});

	it("a doodle in the barcode corner warns", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const sheet = page.locator(".letter-sheet").first();
		const handle = page.getByRole("button", { name: "Move doodle" });
		const sheetBox = await sheet.boundingBox();
		const handleBox = await handle.boundingBox();
		if (!sheetBox || !handleBox) throw new Error("the page has no box");
		const dx =
			sheetBox.x + sheetBox.width - 6 - (handleBox.x + handleBox.width);
		const dy = sheetBox.y + 6 - handleBox.y;
		await drag(page, "Move doodle", dx, dy);
		await page
			.getByText("Keep this corner clear for the postal barcode.")
			.waitFor();
	});
});
