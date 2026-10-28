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

async function docText(page: Page, letterId: string): Promise<string> {
	return page.evaluate(async (id) => {
		const response = await fetch(`/api/letters/${id}`);
		if (!response.ok) throw new Error("the letter did not load");
		const body = (await response.json()) as {
			content: { doc: unknown };
		};
		return JSON.stringify(body.content.doc);
	}, letterId);
}

async function inkColor(page: Page, snippet: string): Promise<string | null> {
	return page.evaluate((target) => {
		const root = document.querySelector(".letter-text");
		if (!root) return null;
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (!node.textContent?.includes(target)) continue;
			const element = node.parentElement;
			return element ? getComputedStyle(element).color : null;
		}
		return null;
	}, snippet);
}

describe("merge fields", () => {
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

	it("@ opens the field menu and a pick inserts a chip", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("@fir");
		await page.getByRole("option", { name: "First name" }).waitFor();
		const saved = nextSave(page, letterId);
		await page.keyboard.press("Enter");
		await page.locator('[data-field="first_name"]').waitFor();
		await saved;
		await waitForSaved(page);
		const doc = await docText(page, letterId);
		expect(doc).toContain('"first_name"');
		expect(doc).not.toContain("@fir");
		expect(await letterText(page).textContent()).not.toContain("@fir");
	});

	it("the menu filters and Escape leaves the text", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("@last");
		const menu = page.getByRole("listbox", { name: "Fields" });
		await menu.waitFor();
		expect(await menu.getByRole("option").allInnerTexts()).toEqual([
			"Last name",
		]);
		await page.keyboard.press("Escape");
		await menu.waitFor({ state: "hidden" });
		expect(await letterText(page).textContent()).toContain("@last");
		expect(await page.locator("[data-field]").count()).toBe(0);
	});

	it("an @ in an email address stays text", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("alex@example.com ");
		await letterText(page).getByText("alex@example.com").waitFor();
		expect(await page.getByRole("listbox", { name: "Fields" }).count()).toBe(0);
		expect(await page.locator("[data-field]").count()).toBe(0);
	});

	it("backspace after a chip removes the whole chip", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("@fir");
		await page.getByRole("option", { name: "First name" }).waitFor();
		await page.keyboard.press("Enter");
		const chip = page.locator('[data-field="first_name"]');
		await chip.waitFor();
		await page.keyboard.press("Backspace");
		await chip.waitFor({ state: "detached" });
		expect(await letterText(page).textContent()).not.toContain("First");
	});

	it("a chip keeps the ink around it", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page
			.locator('[data-slot="swatch"]')
			.filter({ hasText: "Oxblood" })
			.click();
		await page.keyboard.type("Hello ");
		await page.keyboard.type("@fir");
		await page.getByRole("option", { name: "First name" }).waitFor();
		await page.keyboard.press("Enter");
		await page.locator('[data-field="first_name"]').waitFor();
		await page.keyboard.type(" there");
		const color = rgbOf(INK_COLORS.oxblood.css);
		expect(await inkColor(page, "Hello")).toBe(color);
		expect(await inkColor(page, "First name")).toBe(color);
		expect(await inkColor(page, "there")).toBe(color);
	});

	it("the preview prints the sample", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.keyboard.type("@fir");
		await page.getByRole("option", { name: "First name" }).waitFor();
		await page.keyboard.press("Enter");
		await page.locator(".letter-text [data-field='first_name']").waitFor();
		expect(
			await page
				.locator(".letter-text [data-field='first_name']")
				.textContent(),
		).toBe("First name");
		await page.getByRole("button", { name: "Print preview" }).click();
		const preview = page.frameLocator('iframe[title="Print preview"]');
		await preview.locator("[data-field='first_name']").waitFor();
		expect(
			await preview.locator("[data-field='first_name']").textContent(),
		).toBe("Alex");
	});

	it("Insert field inserts a chip at the caret", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		await page.getByRole("button", { name: "Insert field" }).click();
		await page.getByRole("option", { name: "Last name" }).click();
		await page.locator("[data-field='last_name']").waitFor();
		expect(await page.locator("[data-field='last_name']").textContent()).toBe(
			"Last name",
		);
	});
});
