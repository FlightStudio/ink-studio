import type { Member } from "@repo/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	nextSave,
	saveLine,
	startHarness,
	typeAndSettle,
	waitForSaved,
} from "./harness.ts";

describe("the editor", () => {
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

	it("the empty list offers the first letter", async () => {
		const fresh = await harness.seedIdentity();
		const page = await harness.open(fresh, "/letters");
		await page.getByText("Write your first letter").waitFor();
		const start = page.getByRole("button", { name: "Start a letter" });
		expect(await start.isVisible()).toBe(true);
	});

	it("a deleted letter leaves the list", async () => {
		const page = await harness.open(member, "/letters");
		const card = page.locator(`[data-letter-id="${letterId}"]`);
		await card.getByRole("button", { name: "Letter options" }).click();
		await page.getByRole("menuitem", { name: "Delete" }).click();
		await page.getByRole("button", { name: "Delete letter" }).click();
		await card.waitFor({ state: "detached" });
		await page.reload();
		await page.getByRole("heading", { name: "Letters" }).waitFor();
		expect(await card.count()).toBe(0);
		expect(await harness.letters.getLetter(member, letterId)).toBeNull();
	});

	it("typed text survives a reload", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await typeAndSettle(page, letterId, "Dear Alex, the fern came back.");
		await page.reload();
		await letterText(page)
			.filter({ hasText: "Dear Alex, the fern came back." })
			.waitFor();
	});

	it("the stock font is really loaded", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		const font = await page.evaluate(async () => {
			await document.fonts.ready;
			return {
				check: document.fonts.check("20pt stock-caveat"),
				loaded: [...document.fonts].some(
					(face) =>
						face.family.replaceAll('"', "") === "stock-caveat" &&
						face.status === "loaded",
				),
			};
		});
		expect(font).toEqual({ check: true, loaded: true });
	});

	it("the title saves and shows in the list", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		const title = page.getByRole("textbox", { name: "Title" });
		const saved = nextSave(page, letterId);
		await title.fill("A letter to Alex");
		await title.press("Enter");
		await saved;
		await waitForSaved(page);
		await page.goto(page.url().replace(`/letters/${letterId}`, "/letters"));
		await page
			.locator(`[data-letter-id="${letterId}"]`)
			.getByText("A letter to Alex")
			.waitFor();
	});

	it("the save line reads Saved after typing settles", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).click();
		const saved = nextSave(page, letterId);
		await page.keyboard.type("Settling in.");
		await saveLine(page)
			.filter({ hasText: /^Saving…$/ })
			.waitFor();
		await saved;
		await waitForSaved(page);
		const stored = await harness.letters.getLetter(member, letterId);
		expect(stored?.revision).toBe(2);
		expect(JSON.stringify(stored?.content.doc)).toContain("Settling in.");
	});

	it("the older tab can keep its version", async () => {
		const tabA = await harness.open(member, `/letters/${letterId}`);
		const tabB = await tabA.context().newPage();
		await tabB.goto(tabA.url());
		await letterText(tabB).waitFor();
		await typeAndSettle(tabA, letterId, "Written in tab A.");

		await letterText(tabB).click();
		await tabB.keyboard.type("Written in tab B.");
		await tabB.getByText("This letter changed in another tab").waitFor();
		expect(
			await tabB.getByRole("button", { name: "Load the latest" }).isVisible(),
		).toBe(true);
		const saved = nextSave(tabB, letterId);
		await tabB.getByRole("button", { name: "Keep mine" }).click();
		expect((await saved).status()).toBe(200);
		await waitForSaved(tabB);

		await tabB.reload();
		await letterText(tabB).filter({ hasText: "Written in tab B." }).waitFor();
		expect(await letterText(tabB).textContent()).not.toContain("tab A");
	});

	it("a clean tab reloads a newer version when it comes back into view", async () => {
		const tabA = await harness.open(member, `/letters/${letterId}`);
		await letterText(tabA).waitFor();
		const tabB = await tabA.context().newPage();
		await tabB.goto(tabA.url());
		await typeAndSettle(tabB, letterId, "Newer words from tab B.");

		await tabA.evaluate(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await letterText(tabA)
			.filter({ hasText: "Newer words from tab B." })
			.waitFor();
		await waitForSaved(tabA);
	});
});
