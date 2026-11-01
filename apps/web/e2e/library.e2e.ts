import type { Member } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	startHarness,
	waitForSaved,
} from "./harness.ts";

const TOUCH = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };

async function openDraw(page: Page): Promise<void> {
	await letterText(page).waitFor();
	await page.getByRole("button", { name: "Library" }).click();
	await page.getByRole("button", { name: "Draw", exact: true }).click();
	await page.locator("canvas[aria-label='Doodle']").waitFor();
	await page
		.getByRole("dialog", { name: "Draw a doodle" })
		.evaluate((dialog) =>
			Promise.all(dialog.getAnimations().map((each) => each.finished)),
		);
	await page.waitForFunction(() =>
		document.activeElement?.closest("[data-slot='dialog-content']"),
	);
}

async function scribble(page: Page, label = "Doodle"): Promise<void> {
	const canvas = page.locator(`canvas[aria-label='${label}']`);
	const box = await canvas.boundingBox();
	if (!box) throw new Error("the canvas has no box");
	await page.mouse.move(box.x + 24, box.y + 30);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 24, box.y + box.height - 30, {
		steps: 8,
	});
	await page.mouse.up();
}

async function drawAndSave(page: Page): Promise<string> {
	await openDraw(page);
	await scribble(page);
	const name = await page.getByLabel("Name", { exact: true }).inputValue();
	await page.getByRole("button", { name: "Save and place" }).click();
	await page.getByRole("dialog", { name: "Library" }).waitFor({
		state: "hidden",
	});
	return name;
}

async function seedDoodles(page: Page, count: number): Promise<void> {
	await page.evaluate(async (total) => {
		const canvas = new OffscreenCanvas(64, 48);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("no context");
		context.fillRect(8, 8, 48, 32);
		const png = await canvas.convertToBlob({ type: "image/png" });
		for (let index = 1; index <= total; index += 1) {
			const uploaded = await fetch("/api/uploads?purpose=mask", {
				method: "POST",
				headers: {
					"content-type": "application/octet-stream",
					"x-file-name": "seed.png",
				},
				body: png,
			});
			const { id } = (await uploaded.json()) as { id: string };
			const created = await fetch("/api/drawings", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					kind: "doodle",
					name: `Seed ${index}`,
					maskAssetId: id,
					source: {
						kind: "drawn",
						box: { widthPx: 640, heightPx: 400 },
						strokes: [
							{
								input: "mouse",
								points: [
									[40, 40, 0.5, 0],
									[600, 360, 0.5, 16],
								],
							},
						],
					},
				}),
			});
			if (created.status !== 201) throw new Error("the seed was refused");
		}
	}, count);
}

async function askDelete(page: Page, name: string) {
	const confirm = page.getByRole("dialog", { name: `Delete “${name}”?` });
	await page.getByRole("button", { name: `Options for ${name}` }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await confirm.waitFor();
	return confirm;
}

function focusedLabel(page: Page): Promise<string | null> {
	return page.evaluate(
		() => document.activeElement?.getAttribute("aria-label") ?? null,
	);
}

function within(
	inner: { x: number; y: number; width: number; height: number },
	outer: { x: number; y: number; width: number; height: number },
): boolean {
	return (
		inner.x >= outer.x - 0.5 &&
		inner.y >= outer.y - 0.5 &&
		inner.x + inner.width <= outer.x + outer.width + 0.5 &&
		inner.y + inner.height <= outer.y + outer.height + 0.5
	);
}

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
		await page.getByRole("button", { name: "Draw", exact: true }).waitFor();
		expect(
			await page.getByRole("button", { name: "Photograph" }).isVisible(),
		).toBe(true);
	});

	it("an empty signature tab shows no size or ink, and the pad has a signing line", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		await page.getByRole("tab", { name: "Signatures" }).click();
		await page.getByText("No signatures yet.", { exact: false }).waitFor();
		expect(await page.getByRole("group", { name: "Size" }).count()).toBe(0);
		await page.getByRole("button", { name: "Draw", exact: true }).click();
		const pad = page.locator("canvas[aria-label='Signature']");
		const box = await pad.boundingBox();
		if (!box) throw new Error("the signature pad has no box");
		expect(box.width / box.height).toBeCloseTo(640 / 240, 1);
		expect(await page.locator("[data-signing-line]").isVisible()).toBe(true);
		await scribble(page, "Signature");
		expect(await page.getByLabel("Name", { exact: true }).inputValue()).toBe(
			"Signature 1",
		);
		const saved = nextSave(page, letterId);
		await page.getByRole("button", { name: "Save and sign" }).click();
		await saved;
		await page
			.locator('.letter-element[data-element-kind="signature"]')
			.waitFor();
		await page.getByRole("button", { name: "Sign", exact: true }).click();
		await page.getByRole("group", { name: "Size" }).waitFor();
		expect(await page.getByRole("group", { name: "Ink" }).isVisible()).toBe(
			true,
		);
	});

	for (const viewport of [DESK, { width: 1024, height: 600 }, TOUCH]) {
		it(`the draw dialog fits a ${viewport.width}x${viewport.height} screen with its save button in reach`, async () => {
			const page = await harness.open(member, `/letters/${letterId}`, {
				viewport,
			});
			await openDraw(page);
			const dialog = page.getByRole("dialog", { name: "Draw a doodle" });
			const dialogBox = await dialog.boundingBox();
			const canvasBox = await page
				.locator("canvas[aria-label='Doodle']")
				.boundingBox();
			const saveBox = await page
				.getByRole("button", { name: "Save and place" })
				.boundingBox();
			if (!dialogBox || !canvasBox || !saveBox) throw new Error("no box");
			const screen = { x: 0, y: 0, ...viewport };
			expect(within(dialogBox, screen)).toBe(true);
			expect(within(canvasBox, dialogBox)).toBe(true);
			expect(within(saveBox, dialogBox)).toBe(true);
			expect(
				await page.getByRole("button", { name: "Close" }).last().isVisible(),
			).toBe(true);
		});
	}

	it("unsaved ink asks before Escape or a click outside throws it away", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		await openDraw(page);
		await scribble(page);
		const draw = page.getByRole("dialog", { name: "Draw a doodle" });
		const ask = page.getByRole("dialog", { name: "Discard this doodle?" });
		await page.keyboard.press("Escape");
		await ask.waitFor();
		await page.getByRole("button", { name: "Keep drawing" }).click();
		await ask.waitFor({ state: "hidden" });
		expect(
			await page.getByRole("button", { name: "Save and place" }).isEnabled(),
		).toBe(true);
		await page.mouse.click(120, 450);
		await ask.waitFor();
		await page.getByRole("button", { name: "Discard", exact: true }).click();
		await draw.waitFor({ state: "hidden" });
		expect(
			await page.getByRole("dialog", { name: "Library" }).isVisible(),
		).toBe(true);
	});

	it("an empty canvas closes without asking", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		await openDraw(page);
		await page.keyboard.press("Escape");
		await page
			.getByRole("dialog", { name: "Draw a doodle" })
			.waitFor({ state: "hidden" });
		expect(
			await page.getByRole("dialog", { name: "Discard this doodle?" }).count(),
		).toBe(0);
	});

	it("a saved doodle is placed on the current side at once", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: TOUCH,
			hasTouch: true,
		});
		const saved = nextSave(page, letterId);
		const name = await drawAndSave(page);
		expect(name).toMatch(/^Doodle \d+$/);
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

	it("tapping a saved doodle places it again and closes the library", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: TOUCH,
			hasTouch: true,
		});
		const name = await drawAndSave(page);
		await page.locator(".letter-element").waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		const saved = nextSave(page, letterId);
		await page.getByRole("button", { name, exact: true }).click();
		await page.getByRole("dialog", { name: "Library" }).waitFor({
			state: "hidden",
		});
		await saved;
		expect(await page.locator(".letter-element").count()).toBe(2);
	});

	it("the next doodle counts on from the last default name", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		const first = await drawAndSave(page);
		await openDraw(page);
		const next = await page.getByLabel("Name", { exact: true }).inputValue();
		expect(Number(next.split(" ")[1])).toBe(Number(first.split(" ")[1]) + 1);
	});

	it("deleting a doodle asks first, and Keep it keeps it", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		const name = await drawAndSave(page);
		await page.getByRole("button", { name: "Library" }).click();
		const tile = page.getByRole("button", { name, exact: true });
		await tile.waitFor();
		const confirm = await askDelete(page, name);
		await page.getByRole("button", { name: "Keep it" }).click();
		await confirm.waitFor({ state: "hidden" });
		await tile.waitFor();
		await expect.poll(() => focusedLabel(page)).toBe(`Options for ${name}`);
		await askDelete(page, name);
		await page.keyboard.press("Escape");
		await confirm.waitFor({ state: "hidden" });
		await page.getByRole("dialog", { name: "Library" }).waitFor();
		await expect.poll(() => focusedLabel(page)).toBe(`Options for ${name}`);
		await page.getByRole("button", { name: `Options for ${name}` }).click();
		await page.getByRole("menuitem", { name: "Delete" }).click();
		await page.getByRole("button", { name: "Delete doodle" }).click();
		await tile.waitFor({ state: "detached" });
		await page.getByRole("dialog", { name: "Delete" }).waitFor({
			state: "hidden",
		});
		await page.getByRole("dialog", { name: "Library" }).waitFor();
	});

	it("the delete question keeps focus inside it, and a delete moves focus to the next drawing", async () => {
		const own = await harness.seedIdentity();
		const ownLetter = await harness.newLetter(own);
		const page = await harness.open(own, `/letters/${ownLetter}`, {
			viewport: DESK,
		});
		await letterText(page).waitFor();
		await seedDoodles(page, 3);
		await page.reload();
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		const library = page.getByRole("dialog", { name: "Library" });
		await library.getByRole("listitem").nth(2).waitFor();
		const names = await library
			.getByRole("listitem")
			.evaluateAll((items) =>
				items.map(
					(item) =>
						item.querySelector("button")?.getAttribute("aria-label") ?? "",
				),
			);
		const [first = "", second = "", third = ""] = names;
		const confirm = await askDelete(page, first);
		await page.getByRole("menu").waitFor({ state: "hidden" });
		for (let press = 0; press < 4; press += 1) {
			await page.keyboard.press("Tab");
			await expect
				.poll(() =>
					confirm.evaluate((dialog) => dialog.contains(document.activeElement)),
				)
				.toBe(true);
		}
		await page.getByRole("button", { name: "Delete doodle" }).click();
		await confirm.waitFor({ state: "hidden" });
		await expect.poll(() => focusedLabel(page)).toBe(second);
		await askDelete(page, third);
		await page.getByRole("button", { name: "Delete doodle" }).click();
		await expect.poll(() => focusedLabel(page)).toBe(second);
		await askDelete(page, second);
		await page.getByRole("button", { name: "Delete doodle" }).click();
		await expect
			.poll(() => page.evaluate(() => document.activeElement?.textContent))
			.toBe("Draw");
		await library.waitFor();
	});

	it("beside the page the library is full height and only its list scrolls", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		await letterText(page).waitFor();
		await seedDoodles(page, 10);
		await page.reload();
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		const sheet = page.getByRole("dialog", { name: "Library" });
		await sheet.getByRole("button", { name: "Seed 10", exact: true }).waitFor();
		const sheetBox = await sheet.boundingBox();
		expect(sheetBox?.y).toBe(0);
		expect(sheetBox?.height).toBe(DESK.height);
		const panel = page.getByRole("tabpanel");
		expect(
			await panel.evaluate((node) => node.scrollHeight > node.clientHeight),
		).toBe(true);
		const tabs = page.getByRole("tablist");
		const draw = page.getByRole("button", { name: "Draw", exact: true });
		const before = {
			tabs: (await tabs.boundingBox())?.y,
			draw: (await draw.boundingBox())?.y,
		};
		await panel.evaluate((node) => {
			node.scrollTop = node.scrollHeight;
		});
		expect(await panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
		expect((await tabs.boundingBox())?.y).toBe(before.tabs);
		expect((await draw.boundingBox())?.y).toBe(before.draw);
		expect(
			await sheet.evaluate(
				(node) =>
					node.scrollTop === 0 && node.scrollHeight <= node.clientHeight,
			),
		).toBe(true);
	});

	it("renaming a drawing from its menu puts the cursor in the name", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		const name = await drawAndSave(page);
		await page.getByRole("button", { name: "Library" }).click();
		await page.getByRole("button", { name: `Options for ${name}` }).click();
		await page.getByRole("menuitem", { name: "Rename" }).click();
		const input = page.getByRole("textbox", { name: `Rename ${name}` });
		await page.waitForFunction(
			(label) => document.activeElement?.getAttribute("aria-label") === label,
			`Rename ${name}`,
		);
		expect(
			await input.evaluate(
				(node: HTMLInputElement) =>
					node.selectionStart === 0 && node.selectionEnd === node.value.length,
			),
		).toBe(true);
		await page.keyboard.type("Acme cake");
		await page.keyboard.press("Enter");
		const renamed = page.getByRole("button", {
			name: "Acme cake",
			exact: true,
		});
		await renamed.waitFor();
		expect(
			await page.evaluate(() =>
				document.activeElement?.getAttribute("aria-label"),
			),
		).toBe("Options for Acme cake");
		await page.getByRole("button", { name: "Options for Acme cake" }).click();
		await page.getByRole("menuitem", { name: "Rename" }).click();
		await page.waitForFunction(
			() =>
				document.activeElement?.getAttribute("aria-label") ===
				"Rename Acme cake",
		);
		await page.keyboard.type("Never kept");
		await page.keyboard.press("Escape");
		await page
			.getByRole("textbox", { name: "Rename Acme cake" })
			.waitFor({ state: "detached" });
		expect(
			await page.getByRole("dialog", { name: "Library" }).isVisible(),
		).toBe(true);
		expect(await renamed.isVisible()).toBe(true);
		await page.reload();
		await letterText(page).waitFor();
		await page.getByRole("button", { name: "Library" }).click();
		await page
			.getByRole("button", { name: "Acme cake", exact: true })
			.waitFor();
	});

	for (const tab of ["Doodles", "Signatures"]) {
		it(`opening Draw on ${tab} focuses the dialog, not the name field`, async () => {
			const page = await harness.open(member, `/letters/${letterId}`, {
				viewport: { width: 1024, height: 768 },
				hasTouch: true,
			});
			await letterText(page).waitFor();
			await page.getByRole("button", { name: "Library" }).click();
			await page.getByRole("tab", { name: tab }).click();
			await page.getByRole("button", { name: "Draw", exact: true }).click();
			await page.waitForFunction(() =>
				document.activeElement?.closest("[data-slot='dialog-content']"),
			);
			expect(
				await page.evaluate(() =>
					document.activeElement?.getAttribute("data-slot"),
				),
			).toBe("dialog-content");
		});
	}

	it("a save in progress is not thrown away by Escape", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			viewport: DESK,
		});
		await openDraw(page);
		await scribble(page);
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(
			(url) =>
				url.pathname === "/api/uploads" &&
				url.searchParams.get("purpose") === "mask",
			async (route) => {
				await held;
				await route.continue();
			},
		);
		await page.getByRole("button", { name: "Save and place" }).click();
		await page.getByRole("button", { name: "Saving…" }).waitFor();
		await page.keyboard.press("Escape");
		await page.mouse.click(120, 450);
		expect(
			await page.getByRole("dialog", { name: "Discard this doodle?" }).count(),
		).toBe(0);
		expect(
			await page.getByRole("dialog", { name: "Draw a doodle" }).isVisible(),
		).toBe(true);
		release();
		await page.locator(".letter-element").waitFor();
		await page
			.getByRole("dialog", { name: "Draw a doodle" })
			.waitFor({ state: "hidden" });
	});
});
