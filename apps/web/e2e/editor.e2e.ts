import { fixtureContent, letterFixture } from "@repo/render/html";
import { generatedAsset } from "@repo/services/assets";
import { LETTER_PAGE_SIZE } from "@repo/services/letters";
import { type Member, PAGE_SPECS } from "@repo/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NEEDED_COUNT } from "../src/features/fonts/font-status.ts";
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
		const stored = await harness.letters.getLetter(member, letterId);
		if (!stored) throw new Error("the letter is not stored");
		await harness.letters.saveLetter(member, letterId, {
			title: "For Sam",
			content: stored.content,
			expectedRevision: 1,
		});
		const page = await harness.open(member, "/letters");
		const card = page.locator(`li[data-letter-id="${letterId}"]`);
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
			.locator(`li[data-letter-id="${letterId}"]`)
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
		await tabB
			.getByText("A different version of this letter is saved")
			.waitFor();
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

	it("a new letter puts the caret on the page", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						document.activeElement?.classList.contains("letter-text") ?? false,
				),
			)
			.toBe(true);
		const saved = nextSave(page, letterId);
		await page.keyboard.type("Dear Sam");
		await saved;
		expect(await letterText(page).textContent()).toBe("Dear Sam");
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	});

	it("typing at the bottom of a long letter keeps the line in view above the title", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		await letterText(page).click();
		for (let line = 1; line <= 30; line += 1) {
			await page.keyboard.type(`Dear Sam, line ${line}`);
			await page.keyboard.press("Enter");
		}
		await page.keyboard.type("The last line");
		const footer = page.locator("main footer");
		await expect
			.poll(async () => {
				const pill = await footer.boundingBox();
				const caret = await page.evaluate(() => {
					const rect = window
						.getSelection()
						?.getRangeAt(0)
						.getBoundingClientRect();
					return rect ? { top: rect.top, bottom: rect.bottom } : null;
				});
				return (
					pill !== null &&
					caret !== null &&
					caret.top >= 0 &&
					caret.bottom <= pill.y
				);
			})
			.toBe(true);
	});

	it("the side controls sit right under the last sheet", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		const add = page.getByRole("button", { name: "Add a side" });
		await add.waitFor();
		await expect
			.poll(async () => {
				const sheet = await page.locator(".letter-sheet").last().boundingBox();
				const button = await add.boundingBox();
				if (!sheet || !button) return Number.POSITIVE_INFINITY;
				return button.y - (sheet.y + sheet.height);
			})
			.toBeLessThan(160);
		const pageHeight = await page.evaluate(
			() => document.documentElement.scrollHeight,
		);
		const sheet = await page.locator(".letter-sheet").last().boundingBox();
		expect(pageHeight).toBeLessThan(
			(sheet?.y ?? 0) + (sheet?.height ?? 0) + 500,
		);
	});

	it("a keep-clear corner says what it is kept clear for", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await letterText(page).waitFor();
		const zone = page.locator("[data-keep-clear-guide]").first();
		await zone.hover();
		await page.getByText("Kept clear for the postal barcode").waitFor();
	});

	it("a blank untitled draft stays out of the list until it has words", async () => {
		const page = await harness.open(member, "/letters");
		await page.getByRole("heading", { name: "Letters" }).waitFor();
		const card = page.locator(`li[data-letter-id="${letterId}"]`);
		expect(await card.count()).toBe(0);
		await page.goto(page.url().replace("/letters", `/letters/${letterId}`));
		await typeAndSettle(page, letterId, "Dear Sam");
		await page.goto(page.url().replace(`/letters/${letterId}`, "/letters"));
		await card.waitFor();
	});

	it("a letter card shows the letter's first side", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await typeAndSettle(page, letterId, "Dear Sam, the bread was lovely.");
		await page.goto(page.url().replace(`/letters/${letterId}`, "/letters"));
		const thumbnail = page
			.locator(`li[data-letter-id="${letterId}"]`)
			.locator("[data-letter-thumbnail]");
		await thumbnail
			.locator(".letter-page")
			.getByText("Dear Sam, the bread was lovely.")
			.waitFor();
		const box = await thumbnail.boundingBox();
		const spec = PAGE_SPECS["thanksio:letter-windowless"];
		expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(
			spec.widthIn / spec.heightIn,
			1,
		);
	});

	it("a postcard card has the postcard's shape", async () => {
		const { id } = await harness.letters.createLetter(member, {
			format: "thanksio:postcard-6x9",
		});
		const page = await harness.open(member, `/letters/${id}`);
		await typeAndSettle(page, id, "Greetings from the pier");
		await page.goto(page.url().replace(`/letters/${id}`, "/letters"));
		const thumbnail = page
			.locator(`li[data-letter-id="${id}"]`)
			.locator("[data-letter-thumbnail]");
		await thumbnail.getByText("Greetings from the pier").waitFor();
		const box = await thumbnail.boundingBox();
		const spec = PAGE_SPECS["thanksio:postcard-6x9"];
		expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(
			spec.widthIn / spec.heightIn,
			1,
		);
	});

	it("Show more brings the next page and moves focus to its first letter", async () => {
		const fresh = await harness.seedIdentity();
		const stored = await harness.letters.getLetter(
			fresh,
			await harness.newLetter(fresh),
		);
		if (!stored) throw new Error("the letter is not stored");
		for (let index = 0; index < LETTER_PAGE_SIZE + 2; index += 1) {
			await harness.db.letters.create({
				organizationId: fresh.userOrganization.organizationId,
				title: `For Sam ${index}`,
				content: {
					...stored.content,
					doc: {
						...stored.content.doc,
						content: [
							{
								type: "paragraph",
								attrs: { align: "left" },
								content: [{ type: "text", text: `Dear Sam, note ${index}` }],
							},
						],
					},
				},
			});
		}
		const page = await harness.open(fresh, "/letters");
		const cards = page.locator("li[data-letter-id]");
		const more = page.getByRole("button", { name: "Show more" });
		await more.waitFor();
		expect(await cards.count()).toBe(LETTER_PAGE_SIZE);
		await more.click();
		await expect.poll(() => cards.count()).toBe(LETTER_PAGE_SIZE + 2);
		await expect
			.poll(() =>
				page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
			)
			.toBe("Open For Sam 1");
		expect(await more.count()).toBe(0);
		await cards
			.nth(LETTER_PAGE_SIZE)
			.locator("[data-letter-thumbnail] .letter-page")
			.getByText("Dear Sam, note 1")
			.waitFor();
		const ids = await cards.evaluateAll((items) =>
			items.map((item) => item.getAttribute("data-letter-id")),
		);
		expect(new Set(ids).size).toBe(LETTER_PAGE_SIZE + 2);
	});

	it("the first letter screen also offers your own handwriting", async () => {
		const fresh = await harness.seedIdentity();
		const page = await harness.open(fresh, "/letters");
		const link = page.getByRole("link", { name: "Make your handwriting" });
		await link.waitFor();
		expect(await link.getAttribute("href")).toBe("/fonts/new");
	});

	it("every studio page has the studio header and marks where you are", async () => {
		const page = await harness.open(member, "/letters");
		const nav = page.getByRole("navigation", { name: "Studio" });
		await nav.waitFor();
		const current = nav.locator("[aria-current='page']");
		expect(await current.textContent()).toBe("Letters");
		expect(
			await nav.getByRole("link", { name: "Handwriting" }).getAttribute("href"),
		).toBe("/fonts");
		await page.goto(page.url().replace("/letters", `/letters/${letterId}`));
		await letterText(page).waitFor();
		expect(await current.textContent()).toBe("Letters");
		await nav.getByRole("link", { name: "Handwriting" }).click();
		await page.waitForURL(/\/fonts$/);
		await expect.poll(() => current.textContent()).toBe("Handwriting");
		await nav.getByRole("link", { name: "Letters" }).click();
		await page.waitForURL(/\/letters$/);
		await page.getByRole("heading", { name: "Letters" }).waitFor();
	});

	it("a missing letter is the studio's own not-found page", async () => {
		const page = await harness.open(member, "/letters");
		const response = await page.goto(
			page
				.url()
				.replace("/letters", "/letters/0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99"),
		);
		expect(response?.status()).toBe(404);
		await page
			.getByRole("heading", { name: "This letter is not here" })
			.waitFor();
		expect(await page.locator(".studio").count()).toBe(1);
		await page.getByRole("link", { name: "Back to letters" }).click();
		await page.waitForURL(/\/letters$/);
	});

	it("an unknown address shows the studio's own page with a way back", async () => {
		const page = await harness.open(member, "/letters");
		const response = await page.goto(page.url().replace("/letters", "/nope"));
		expect(response?.status()).toBe(404);
		await page
			.getByRole("heading", { name: "This page is not here" })
			.waitFor();
		expect(await page.locator(".studio").count()).toBe(1);
		await page.getByRole("link", { name: "Back to letters" }).click();
		await page.waitForURL(/\/letters$/);
	});

	it("the product picker has a way back and names each product once", async () => {
		const page = await harness.open(member, "/letters/new");
		await page.getByRole("heading", { name: "What are you making?" }).waitFor();
		const letter = page.locator('[data-format="thanksio:letter-windowless"]');
		const postcard = page.locator('[data-format="thanksio:postcard-6x9"]');
		expect(await letter.textContent()).toBe("LetterUp to 3 sides of writing");
		expect(await postcard.textContent()).toBe(
			"Postcard 6 × 9A photo on the front, your words on the back",
		);
		await page.getByRole("link", { name: "Back to letters" }).click();
		await page.waitForURL(/\/letters$/);
	});

	it("the font menu lists unfinished handwriting and ends with make and manage", async () => {
		const fresh = await harness.seedIdentity();
		const font = await harness.db.fonts.create({
			organizationId: fresh.userOrganization.organizationId,
			ownerUserId: fresh.user.id,
			ownerName: "Sam",
			source: {
				kind: "drawn",
				glyphs: ["a", "b"].map((char) => ({
					char,
					variant: 0,
					strokes: [{ input: "pen", points: [[400, 500, 0.5, 0]] }],
				})),
			},
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		const id = await harness.newLetter(fresh);
		const page = await harness.open(fresh, `/letters/${id}`);
		await letterText(page).waitFor();
		await page.getByRole("combobox", { name: "Font" }).click();
		const labels = (await page.getByRole("option").allInnerTexts()).map(
			(label) => label.replace(/\s+/g, " ").trim(),
		);
		expect(labels.slice(-3)).toEqual([
			`Sam's handwriting · 2 of ${NEEDED_COUNT} · Continue`,
			"Make your handwriting",
			"Manage handwriting",
		]);
		await page.getByRole("option", { name: /Sam's handwriting/ }).click();
		await page.waitForURL((url) => url.pathname === `/fonts/${font.id}/draw`);
		expect(new URL(page.url()).searchParams.get("from")).toBe(id);
	});

	it("arriving with a usable font offers it once, and Use it writes the whole letter in it", async () => {
		const fresh = await harness.seedIdentity();
		const font = await usableFont(fresh);
		const id = await harness.newLetter(fresh);
		const page = await harness.open(fresh, `/letters/${id}`);
		await typeAndSettle(page, id, "Dear Sam");
		await page.goto(`${page.url()}?font=${font}`);
		const offer = page.getByText("Use Sam's handwriting for this letter?");
		await offer.waitFor();
		const saved = nextSave(page, id);
		await page.getByRole("button", { name: "Use it" }).click();
		await offer.waitFor({ state: "detached" });
		expect(new URL(page.url()).searchParams.has("font")).toBe(false);
		await saved;
		await waitForSaved(page);
		const stored = await harness.letters.getLetter(fresh, id);
		expect(JSON.stringify(stored?.content.doc)).toContain(font);
		const undone = nextSave(page, id);
		await page.keyboard.press("Meta+Z");
		await undone;
		expect(
			JSON.stringify((await harness.letters.getLetter(fresh, id))?.content.doc),
		).not.toContain(font);
	});

	it("Not now leaves the letter as it is", async () => {
		const fresh = await harness.seedIdentity();
		const font = await usableFont(fresh);
		const id = await harness.newLetter(fresh);
		const page = await harness.open(fresh, `/letters/${id}?font=${font}`);
		await page.getByRole("button", { name: "Not now" }).click();
		await page
			.getByText("Use Sam's handwriting for this letter?")
			.waitFor({ state: "detached" });
		expect(new URL(page.url()).searchParams.has("font")).toBe(false);
		expect((await harness.letters.getLetter(fresh, id))?.revision).toBe(1);
	});

	it("a letter that does not fit is not exported, and the reason says what to do", async () => {
		await harness.letters.saveLetter(member, letterId, {
			title: "Too long for Sam",
			content: fixtureContent(letterFixture("overflow")),
			expectedRevision: 1,
		});
		const page = await harness.open(member, `/letters/${letterId}`);
		await page.locator("[data-overflow-notice]").waitFor();
		const exports = await page.evaluate(() => performance.now());
		const header = await page.locator("main").boundingBox();
		await page.getByRole("button", { name: "Export proof" }).click();
		await page
			.getByRole("dialog")
			.getByText(/words won't fit on 3 sides\. Shorten the letter/)
			.waitFor();
		expect(
			await page.evaluate(
				(since) =>
					performance
						.getEntriesByType("resource")
						.filter(
							(entry) =>
								entry.startTime > since && entry.name.includes("/exports"),
						).length,
				exports,
			),
		).toBe(0);
		expect((await page.locator("main").boundingBox())?.y).toBe(header?.y);
	});

	it("an export shows its progress without moving the page, then opens the proof", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		await typeAndSettle(page, letterId, "Dear Sam, the bread was lovely.");
		const before = await page.locator(".letter-page").boundingBox();
		await page.getByRole("button", { name: "Export proof" }).click();
		await page.getByText("Making the proof").waitFor();
		expect((await page.locator(".letter-page").boundingBox())?.y).toBe(
			before?.y,
		);
		const open = page.getByRole("link", { name: "Open the proof" });
		await open.waitFor({ timeout: 90_000 });
		expect(await open.getAttribute("target")).toBe("_blank");
	}, 120_000);

	it("a partly handwritten seal links to the first letter still to draw", async () => {
		const fresh = await harness.seedIdentity();
		const font = await usableFont(fresh);
		const id = await harness.newLetter(fresh);
		const stored = await harness.letters.getLetter(fresh, id);
		if (!stored) throw new Error("the letter is not stored");
		await harness.letters.saveLetter(fresh, id, {
			title: "For Sam",
			content: {
				...stored.content,
				doc: {
					...stored.content.doc,
					content: [
						{
							type: "paragraph",
							attrs: { align: "left" },
							content: [
								{
									type: "text",
									text: "dear Sam",
									marks: [
										{
											type: "ink",
											attrs: {
												font: { kind: "own", fontId: font },
												sizePt: null,
												color: null,
											},
										},
									],
								},
							],
						},
					],
				},
			},
			expectedRevision: 1,
		});
		const page = await harness.open(fresh, `/letters/${id}`);
		await page.getByText("Partly written in Sam's own handwriting").waitFor();
		const link = page.getByRole("link", { name: "Draw missing letters" });
		expect(await link.getAttribute("href")).toBe(
			`/fonts/${font}/draw?from=${id}&glyph=S`,
		);
	});

	async function usableFont(owner: Member): Promise<string> {
		const organizationId = owner.userOrganization.organizationId;
		const font = await harness.db.fonts.create({
			organizationId,
			ownerUserId: owner.user.id,
			ownerName: "Sam",
			source: { kind: "drawn", glyphs: [] },
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		const built = await harness.db.assets.create(
			generatedAsset(organizationId, { kind: "build-font", fontId: font.id }),
		);
		await harness.db.fonts.setPending(organizationId, font.id, built.id);
		await harness.db.fonts.finishBuild(
			organizationId,
			font.id,
			built.id,
			"abcdefghijklmnopqrstuvwxyz",
		);
		return font.id;
	}
});
