import type { Member } from "@repo/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	startHarness,
	waitForSaved,
} from "./harness.ts";

const TOUCH = { width: 390, height: 844 };

describe("the doodle library", () => {
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

	it("an empty library offers Draw and Photograph", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: TOUCH,
			hasTouch: true,
		});
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		await page.getByRole("button", { name: "Draw" }).waitFor();
		expect(
			await page.getByRole("button", { name: "Photograph" }).isVisible(),
		).toBe(true);
	});

	it("a drawn doodle appears in the library", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: TOUCH,
			hasTouch: true,
		});
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		await page.getByRole("button", { name: "Draw" }).click();
		const canvas = page.getByLabel("Doodle", { exact: true });
		const box = await canvas.boundingBox();
		if (!box) throw new Error("the doodle canvas has no box");
		await page.mouse.move(box.x + 24, box.y + 30);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width - 24, box.y + box.height - 30);
		await page.mouse.up();
		await page.getByRole("button", { name: "Save doodle" }).click();
		await page.getByRole("button", { name: "Doodle", exact: true }).waitFor();
	});

	it("tapping a doodle places it on the current side and closes the library", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: TOUCH,
			hasTouch: true,
		});
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		await page.getByRole("button", { name: "Draw" }).click();
		const canvas = page.getByLabel("Doodle", { exact: true });
		const box = await canvas.boundingBox();
		if (!box) throw new Error("the doodle canvas has no box");
		await page.mouse.move(box.x + 20, box.y + 20);
		await page.mouse.down();
		await page.mouse.move(box.x + 80, box.y + 70);
		await page.mouse.up();
		await page.getByRole("button", { name: "Save doodle" }).click();
		const saved = nextSave(page, letterId);
		await page
			.getByRole("button", { name: "Doodle", exact: true })
			.first()
			.click();
		await page.getByRole("dialog", { name: "Library" }).waitFor({
			state: "hidden",
		});
		const element = page.locator(".letter-element");
		await element.waitFor();
		const centres = await page.evaluate(() => {
			const view = window.visualViewport;
			const left = view?.offsetLeft ?? 0;
			const top = view?.offsetTop ?? 0;
			const right = left + (view?.width ?? window.innerWidth);
			const bottom = top + (view?.height ?? window.innerHeight);
			const sheets = [
				...document.querySelectorAll<HTMLElement>(".letter-sheet"),
			];
			let best: { area: number; rect: DOMRect; sheet: HTMLElement } | null =
				null;
			for (const sheet of sheets) {
				const rect = sheet.getBoundingClientRect();
				const width = Math.max(
					0,
					Math.min(rect.right, right) - Math.max(rect.left, left),
				);
				const height = Math.max(
					0,
					Math.min(rect.bottom, bottom) - Math.max(rect.top, top),
				);
				const area = width * height;
				if (!best || area > best.area) best = { area, rect, sheet };
			}
			if (!best) throw new Error("no side");
			const placed = document.querySelector<HTMLElement>(".letter-element");
			if (!placed) throw new Error("no doodle");
			const sheetWidthIn = Number.parseFloat(best.sheet.style.width);
			const sheetHeightIn = Number.parseFloat(best.sheet.style.height);
			const visLeft = Math.max(best.rect.left, left);
			const visRight = Math.min(best.rect.right, right);
			const visTop = Math.max(best.rect.top, top);
			const visBottom = Math.min(best.rect.bottom, bottom);
			const visibleX =
				(((visLeft + visRight) / 2 - best.rect.left) / best.rect.width) *
				sheetWidthIn;
			const visibleY =
				(((visTop + visBottom) / 2 - best.rect.top) / best.rect.height) *
				sheetHeightIn;
			const xIn = Number.parseFloat(placed.style.left);
			const yIn = Number.parseFloat(placed.style.top);
			const widthIn = Number.parseFloat(placed.style.width);
			const heightIn = Number.parseFloat(placed.style.height);
			return {
				dx: xIn + widthIn / 2 - visibleX,
				dy: yIn + heightIn / 2 - visibleY,
			};
		});
		expect(Math.abs(centres.dx)).toBeLessThanOrEqual(0.1);
		expect(Math.abs(centres.dy)).toBeLessThanOrEqual(0.1);
		await saved;
		await waitForSaved(page);
		await page.reload();
		await page.locator(".letter-element").waitFor();
		const stored = await harness.letters.getLetter(member, letterId);
		expect(stored?.content.doc.attrs.elements).toHaveLength(1);
	});
});
