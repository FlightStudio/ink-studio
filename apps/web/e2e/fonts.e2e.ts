import { variantFeatureSettings } from "@repo/render/html";
import { HANDWRITING_GLYPHS, type Member } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	startHarness,
	typeAndSettle,
} from "./harness.ts";

let harness: Harness;

beforeAll(async () => {
	harness = await startHarness();
});

afterAll(async () => {
	await harness?.stop();
});

async function openLetter(member: Member): Promise<{ page: Page; id: string }> {
	const id = await harness.newLetter(member);
	const page = await harness.open(member, `/letters/${id}`, {
		viewport: { width: 1280, height: 900 },
	});
	await letterText(page).waitFor();
	return { page, id };
}

async function drawChar(page: Page, char: string): Promise<void> {
	const canvas = page.getByLabel(`Draw ${char}`, { exact: true });
	await canvas.scrollIntoViewIfNeeded();
	const box = await canvas.boundingBox();
	if (!box) throw new Error(`no cell for ${char}`);
	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === "PUT" &&
			response.url().includes("/glyphs") &&
			response.status() === 204,
	);
	await page.mouse.move(box.x + 18, box.y + 22);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 18, box.y + box.height - 22, {
		steps: 8,
	});
	await page.mouse.up();
	await saved;
}

describe("handwriting fonts", () => {
	it("the toolbar offers to make a handwriting font when there is none", async () => {
		const member = await harness.seedIdentity();
		const { page } = await openLetter(member);
		await page.getByRole("combobox", { name: "Font" }).click();
		const link = page.getByRole("link", { name: "Make a handwriting font" });
		await link.waitFor();
		expect(await link.getAttribute("href")).toBe("/fonts/new");
		expect(await page.getByText("My handwriting").isVisible()).toBe(true);
	});

	it("the draw page lists what is still missing", async () => {
		const member = await harness.seedIdentity();
		const page = await harness.open(member, "/fonts/new");
		await page.getByLabel("What name should the seal use?").fill("Karla");
		await page.getByRole("button", { name: "Draw it here" }).click();
		await page.waitForURL(/\/fonts\/[^/]+\/draw$/);
		const missing = page.getByText(/Still to draw/);
		await missing.waitFor();
		expect(await missing.textContent()).toContain(" x ");
		expect(await page.getByRole("button", { name: "Build" }).isDisabled()).toBe(
			true,
		);
	});

	it("a drawn font becomes a choice in the toolbar and in the seal", async () => {
		const member = await harness.seedIdentity();
		const page = await harness.open(member, "/fonts/new", {
			viewport: { width: 1280, height: 900 },
		});
		await page.getByLabel("What name should the seal use?").fill("Karla");
		await page.getByRole("button", { name: "Draw it here" }).click();
		await page.waitForURL(/\/fonts\/[^/]+\/draw$/);
		const fontId = new URL(page.url()).pathname.split("/")[2] ?? "";
		for (const entry of HANDWRITING_GLYPHS) {
			if (!entry.required) continue;
			await drawChar(page, entry.char);
		}
		await page.getByRole("button", { name: "Build" }).click();
		await page
			.locator("[data-font-preview][data-built]")
			.waitFor({ timeout: 120_000 });
		const { page: letter, id } = await openLetter(member);
		await typeAndSettle(letter, id, "hello");
		await letter.keyboard.press("Control+A");
		await letter.getByRole("combobox", { name: "Font" }).click();
		await letter.getByRole("option", { name: "Karla's handwriting" }).click();
		await letter.waitForFunction(
			(family) => document.fonts.check(`20pt "${family}"`),
			`own-${fontId}`,
		);
		await letter.getByText("Written in Karla's own handwriting").waitFor();
	}, 180_000);

	it("variants show while editing", async () => {
		const member = await harness.seedIdentity();
		const { page, id } = await openLetter(member);
		await typeAndSettle(page, id, "a");
		const expected = variantFeatureSettings(id).replaceAll('"', "");
		const applied = await page
			.locator(".letter-text")
			.evaluate((node) => getComputedStyle(node).fontFeatureSettings);
		expect(applied.replaceAll('"', "")).toContain(expected.split(" ")[0]);
	});

	it("a deleted font leaves the fonts page", async () => {
		const member = await harness.seedIdentity();
		const page = await harness.open(member, "/fonts/new");
		await page.getByLabel("What name should the seal use?").fill("Karla");
		await page.getByRole("button", { name: "Draw it here" }).click();
		await page.waitForURL(/\/fonts\/[^/]+\/draw$/);
		await page.goto(`${page.url().split("/fonts/")[0]}/fonts`);
		await page.getByText("Karla's handwriting").waitFor();
		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByText("No handwriting fonts yet.").waitFor();
		expect(await page.getByText("Karla's handwriting").count()).toBe(0);
	});
});
