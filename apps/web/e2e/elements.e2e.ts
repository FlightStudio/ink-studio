import { INK_COLORS, type Member, PAGE_SPECS } from "@repo/types";
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
	const saved = nextSave(page, letterId);
	await page.getByRole("button", { name: "Save and place" }).click();
	await saved;
	await page
		.getByRole("dialog", { name: "Library" })
		.waitFor({ state: "hidden" });
	await page.locator(".letter-element").waitFor();
}

async function drawAndSign(page: Page, letterId: string): Promise<void> {
	await page.getByRole("button", { name: "Sign" }).click();
	await page.getByRole("button", { name: "Draw" }).click();
	const canvas = page.getByLabel("Signature", { exact: true });
	const box = await canvas.boundingBox();
	if (!box) throw new Error("the signature canvas has no box");
	await page.mouse.move(box.x + 24, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 24, box.y + box.height / 3, {
		steps: 8,
	});
	await page.mouse.up();
	const signed = nextSave(page, letterId);
	await page.getByRole("button", { name: "Save and sign" }).click();
	await signed;
	await page
		.getByRole("dialog", { name: "Library" })
		.waitFor({ state: "hidden" });
	await signatureMark(page).waitFor();
}

function signatureMark(page: Page) {
	return page.locator('.letter-element[data-element-kind="signature"]');
}

async function signatureOf(harness: Harness, member: Member, letterId: string) {
	const stored = await harness.letters.getLetter(member, letterId);
	return stored?.content.doc.attrs.elements.find(
		(element) => element.kind === "signature",
	);
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

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(page: Page, selector: string): Promise<Box> {
	const box = await page.locator(selector).first().boundingBox();
	if (!box) throw new Error(`${selector} has no box`);
	return box;
}

function centreOf(box: Box): { x: number; y: number } {
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function handleCentre(
	page: Page,
	name: string,
): Promise<{ x: number; y: number }> {
	const box = await page.getByRole("button", { name }).boundingBox();
	if (!box) throw new Error(`${name} has no box`);
	return centreOf(box);
}

async function rotateTo(page: Page, degrees: number): Promise<void> {
	const knob = await handleCentre(page, "Rotate doodle");
	const centre = centreOf(
		await boxOf(page, ".letter-handles > [data-element-id]"),
	);
	const radius = Math.hypot(knob.x - centre.x, knob.y - centre.y);
	const radians = (degrees * Math.PI) / 180;
	await page.mouse.move(knob.x, knob.y);
	await page.mouse.down();
	await page.mouse.move(
		centre.x + radius * Math.sin(radians),
		centre.y - radius * Math.cos(radians),
		{ steps: 12 },
	);
	await page.mouse.up();
}

function inchesOf(value: string): number {
	return Number.parseFloat(value.replace("in", ""));
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

	it("one undo moves a moved doodle back, wherever focus is", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const before = await elementStyle(page);
		await drag(page, "Move doodle", 90, 40);
		await expect
			.poll(async () => (await elementStyle(page)).left)
			.not.toBe(before.left);
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

	it("a placed doodle is selected, with focus on it, and a second copy lands beside the first", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await page.getByRole("button", { name: "Rotate doodle" }).waitFor();
		await expect
			.poll(() =>
				page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
			)
			.toBe("Move doodle");
		const first = await elementStyle(page);
		await page.getByRole("button", { name: "Library" }).click();
		const saved = nextSave(page, letterId);
		await page
			.getByRole("dialog", { name: "Library" })
			.getByRole("listitem")
			.first()
			.getByRole("button")
			.first()
			.click();
		await saved;
		await expect.poll(() => page.locator(".letter-element").count()).toBe(2);
		const second = await page
			.locator(".letter-element")
			.nth(1)
			.evaluate((node: HTMLElement) => ({
				left: node.style.left,
				top: node.style.top,
			}));
		expect(inchesOf(second.left)).toBeCloseTo(inchesOf(first.left) + 0.25);
		expect(inchesOf(second.top)).toBeCloseTo(inchesOf(first.top) + 0.25);
	});

	it("a turned doodle is drawn turned, as it prints", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const level = await boxOf(page, ".letter-element");
		await rotateTo(page, 40);
		await expect
			.poll(async () => {
				const drawn = await boxOf(page, ".letter-element");
				const frame = await boxOf(page, ".letter-handles > [data-element-id]");
				return (
					Math.abs(drawn.width - frame.width) < 1.5 &&
					Math.abs(drawn.height - frame.height) < 1.5 &&
					drawn.height > level.height + 20
				);
			})
			.toBe(true);
	});

	it("dragging a turned doodle's corner outward grows it and the opposite corner stays put", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await rotateTo(page, 40);
		await page
			.getByRole("button", { name: "Resize from the bottom right" })
			.waitFor();
		const anchor = await handleCentre(page, "Resize from the top left");
		const handle = await handleCentre(page, "Resize from the bottom right");
		const before = inchesOf(
			await page
				.locator(".letter-element")
				.evaluate((node: HTMLElement) => node.style.width),
		);
		await drag(
			page,
			"Resize from the bottom right",
			(handle.x - anchor.x) * 0.3,
			(handle.y - anchor.y) * 0.3,
		);
		await expect
			.poll(async () =>
				inchesOf(
					await page
						.locator(".letter-element")
						.evaluate((node: HTMLElement) => node.style.width),
				),
			)
			.toBeGreaterThan(before * 1.2);
		const after = await handleCentre(page, "Resize from the top left");
		expect(Math.abs(after.x - anchor.x)).toBeLessThan(2);
		expect(Math.abs(after.y - anchor.y)).toBeLessThan(2);
	});

	it("a doodle dragged past the edge of the sheet stays on the paper", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await drag(page, "Move doodle", 2000, -2000);
		const sheet = await boxOf(page, ".letter-sheet");
		await expect
			.poll(async () => {
				const drawn = await boxOf(page, ".letter-element");
				return (
					drawn.x + drawn.width <= sheet.x + sheet.width + 1 &&
					drawn.y >= sheet.y - 1
				);
			})
			.toBe(true);
	});

	it("arrow keys move the selected doodle, Shift moves it further, and Escape puts it down", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const before = inchesOf((await elementStyle(page)).left);
		await page.keyboard.press("ArrowRight");
		await expect
			.poll(async () => inchesOf((await elementStyle(page)).left))
			.toBeCloseTo(before + 0.05);
		await page.keyboard.press("Shift+ArrowRight");
		await expect
			.poll(async () => inchesOf((await elementStyle(page)).left))
			.toBeCloseTo(before + 0.3);
		await page.keyboard.press("Meta+Z");
		await expect
			.poll(async () => inchesOf((await elementStyle(page)).left))
			.toBeCloseTo(before + 0.05);
		await page.keyboard.press("Escape");
		await expect
			.poll(() => page.getByRole("button", { name: "Rotate doodle" }).count())
			.toBe(0);
	});

	it("a click on blank paper puts the doodle down", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await page.getByRole("button", { name: "Rotate doodle" }).waitFor();
		const sheet = await boxOf(page, ".letter-sheet");
		await page.mouse.click(sheet.x + sheet.width / 2, sheet.y + 40);
		await expect
			.poll(() => page.getByRole("button", { name: "Rotate doodle" }).count())
			.toBe(0);
	});

	it("doodle handles are a finger wide on a touch screen", async () => {
		const page = await harness.open(member, `/letters/${letterId}`, {
			hasTouch: true,
		});
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		expect(
			await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
		).toBe(true);
		const corner = await page
			.getByRole("button", { name: "Resize from the bottom right" })
			.boundingBox();
		expect(corner?.width).toBeGreaterThanOrEqual(43.5);
		expect(corner?.height).toBeGreaterThanOrEqual(43.5);
		const knob = await page
			.getByRole("button", { name: "Rotate doodle" })
			.boundingBox();
		expect(knob?.width).toBeGreaterThanOrEqual(43.5);
	});

	it("a doodle pushed into the top corner can still be turned and resized", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await drag(page, "Move doodle", -2000, -2000);
		const sheet = await boxOf(page, ".letter-sheet");
		await expect
			.poll(async () => {
				const drawn = await boxOf(page, ".letter-element");
				return (
					Math.abs(drawn.y - sheet.y) < 1 && Math.abs(drawn.x - sheet.x) < 1
				);
			})
			.toBe(true);
		await page
			.getByRole("button", { name: "Resize from the top left" })
			.click({ trial: true, position: { x: 2, y: 2 }, timeout: 3000 });
		const knob = page.getByRole("button", { name: "Rotate doodle" });
		await knob.click({ trial: true, timeout: 3000 });
		const at = await handleCentre(page, "Rotate doodle");
		const centre = centreOf(
			await boxOf(page, ".letter-handles > [data-element-id]"),
		);
		const radius = Math.hypot(at.x - centre.x, at.y - centre.y);
		await page.mouse.move(at.x, at.y);
		await page.mouse.down();
		await page.mouse.move(centre.x + radius, centre.y, { steps: 12 });
		await page.mouse.up();
		await expect
			.poll(() =>
				page
					.locator(".letter-element")
					.evaluate((node: HTMLElement) =>
						Math.abs(Number.parseFloat(node.style.rotate)),
					),
			)
			.toBeCloseTo(90);
	});

	it("a doodle placed with no sheet in view lands inside the margins and is scrolled into view", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await page.setViewportSize({ width: 1440, height: 160 });
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight }),
		);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						document.querySelector(".letter-sheet")?.getBoundingClientRect()
							.bottom ?? 0,
				),
			)
			.toBeLessThan(0);
		await page.getByRole("button", { name: "Library" }).click();
		const saved = nextSave(page, letterId);
		await page
			.getByRole("dialog", { name: "Library" })
			.getByRole("listitem")
			.first()
			.getByRole("button")
			.first()
			.click();
		await saved;
		await expect.poll(() => page.locator(".letter-element").count()).toBe(2);
		const placed = page.locator(".letter-handles > [data-element-id]").nth(1);
		await expect.poll(() => placed.getAttribute("data-selected")).toBe("true");
		await expect
			.poll(async () => {
				const box = await placed.boundingBox();
				return box !== null && box.y < 160 && box.y + box.height > 0;
			})
			.toBe(true);
		await expect
			.poll(() =>
				page.getByText("Keep this doodle inside the safe area.").count(),
			)
			.toBe(0);
		await waitForSaved(page);
		const stored = await harness.letters.getLetter(member, letterId);
		const second = stored?.content.doc.attrs.elements[1];
		if (!stored || !second) throw new Error("the second doodle was not saved");
		const spec = PAGE_SPECS[stored.content.format];
		expect(second.xIn).toBeGreaterThanOrEqual(spec.marginIn - 1e-9);
		expect(second.yIn).toBeGreaterThanOrEqual(spec.marginIn - 1e-9);
		expect(second.xIn + second.widthIn).toBeLessThanOrEqual(
			spec.widthIn - spec.marginIn + 1e-9,
		);
		expect(second.yIn + second.heightIn).toBeLessThanOrEqual(
			spec.heightIn - spec.marginIn + 1e-9,
		);
	});

	it("Tab from the first of two doodles reaches its menu before the second doodle", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		await page.getByRole("button", { name: "Library" }).click();
		const saved = nextSave(page, letterId);
		await page
			.getByRole("dialog", { name: "Library" })
			.getByRole("listitem")
			.first()
			.getByRole("button")
			.first()
			.click();
		await saved;
		await expect.poll(() => page.locator(".letter-element").count()).toBe(2);
		const moves = page.getByRole("button", { name: "Move doodle" });
		await moves.first().focus();
		await expect
			.poll(() =>
				page
					.locator(".letter-handles > [data-element-id]")
					.first()
					.getAttribute("data-selected"),
			)
			.toBe("true");
		await page.keyboard.press("Tab");
		expect(
			await page.evaluate(() =>
				Boolean(document.activeElement?.closest("[data-element-menu]")),
			),
		).toBe(true);
		await expect
			.poll(() =>
				page
					.locator(".letter-handles > [data-element-id]")
					.first()
					.getAttribute("data-selected"),
			)
			.toBe("true");
	});

	it("signing from the Sign button puts the signature under the text, selected and in view", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await page.keyboard.type("Love,");
		await page.evaluate(() =>
			window.scrollTo({ top: document.documentElement.scrollHeight }),
		);
		await drawAndSign(page, letterId);
		await page.getByRole("group", { name: "Signature" }).waitFor();
		await expect
			.poll(() =>
				page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
			)
			.toBe("Move signature");
		const mark = signatureMark(page);
		await expect
			.poll(async () => {
				const placed = await mark.boundingBox();
				const height = await page.evaluate(() => window.innerHeight);
				return (
					placed !== null && placed.y >= 0 && placed.y + placed.height <= height
				);
			})
			.toBe(true);
		const line = await boxOf(page, ".letter-text p");
		const placed = await boxOf(
			page,
			'.letter-element[data-element-kind="signature"]',
		);
		expect(placed.y).toBeGreaterThan(line.y + line.height - 1);
		const text = await letterText(page).textContent();
		await page.keyboard.type("x");
		await expect.poll(() => mark.count()).toBe(1);
		expect(await letterText(page).textContent()).toBe(text);
	});

	it("arrow keys carry a doodle onto the next side and keep it in view", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndPlace(page, letterId);
		const move = page.getByRole("button", { name: "Move doodle" });
		await expect
			.poll(() =>
				page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
			)
			.toBe("Move doodle");
		const top = inchesOf((await elementStyle(page)).top);
		for (let press = 0; press < 48; press += 1) {
			await page.keyboard.press("Shift+ArrowDown");
		}
		await expect
			.poll(async () => inchesOf((await elementStyle(page)).top))
			.toBeGreaterThan(top + 11);
		await expect
			.poll(async () => {
				const box = await move.boundingBox();
				const height = await page.evaluate(() => window.innerHeight);
				return box !== null && box.y >= 0 && box.y + box.height <= height;
			})
			.toBe(true);
	});

	it("a signature moves, turns, resizes and recolours like a doodle, and Remove takes it off", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await drawAndSign(page, letterId);
		const before = (await signatureOf(harness, member, letterId)) ?? null;
		if (!before) throw new Error("the letter was not signed");
		const moved = nextSave(page, letterId);
		await drag(page, "Move signature", -120, 60);
		await moved;
		const turned = nextSave(page, letterId);
		await page.getByRole("button", { name: "Move signature" }).focus();
		await page.keyboard.press("Shift+]");
		await page.keyboard.press("+");
		await turned;
		const menu = page.getByRole("group", { name: "Signature" });
		const recoloured = nextSave(page, letterId);
		await menu
			.locator('[data-slot="swatch"]')
			.filter({ hasText: "Forest" })
			.click();
		await recoloured;
		await waitForSaved(page);
		await expect
			.poll(async () => signatureOf(harness, member, letterId))
			.toMatchObject({ tint: "forest" });
		const after = await signatureOf(harness, member, letterId);
		expect(after?.id).toBe(before.id);
		expect(after?.xIn).toBeLessThan(before.xIn);
		expect(after?.rotationDeg).not.toBe(0);
		expect(after?.widthIn).toBeGreaterThan(before.widthIn);
		await page.reload();
		await signatureMark(page).waitFor();
		await page.getByRole("button", { name: "Move signature" }).click();
		await page
			.getByRole("group", { name: "Signature" })
			.getByRole("button", { name: "Remove" })
			.click();
		await expect.poll(() => signatureMark(page).count()).toBe(0);
	});
});
