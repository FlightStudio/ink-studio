import { randomUUID } from "node:crypto";
import { errorMessages } from "@repo/errors";
import { variantFeatureSettings } from "@repo/render/html";
import { generatedAsset } from "@repo/services/assets";
import {
	GLYPH_LIMITS,
	HANDWRITING_GLYPHS,
	type Member,
	type Stroke,
} from "@repo/types";
import type { CDPSession, Locator, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SPECIMEN_TEXT } from "../src/features/fonts/specimen.ts";
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

const REQUIRED = HANDWRITING_GLYPHS.filter((entry) => entry.required).map(
	(entry) => entry.char,
);

const INK: Stroke[] = [
	{
		input: "pen",
		points: [
			[400, 500, 0.5, 0],
			[600, 700, 0.5, 10],
		],
	},
];

const TABLET = { viewport: { width: 1024, height: 1366 }, hasTouch: true };

async function openLetter(member: Member): Promise<{ page: Page; id: string }> {
	const id = await harness.newLetter(member);
	const page = await harness.open(member, `/letters/${id}`, {
		viewport: { width: 1280, height: 900 },
	});
	await letterText(page).waitFor();
	return { page, id };
}

async function seedDrawnFont(
	member: Member,
	chars: readonly string[],
): Promise<string> {
	const font = await harness.db.fonts.create({
		organizationId: member.userOrganization.organizationId,
		ownerUserId: member.user.id,
		ownerName: "Karla",
		source: {
			kind: "drawn",
			glyphs: chars.map((char) => ({ char, variant: 0, strokes: INK })),
		},
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	return font.id;
}

async function savedStrokes(
	member: Member,
	fontId: string,
	char: string,
): Promise<number> {
	const font = await harness.db.fonts.byId(
		member.userOrganization.organizationId,
		fontId,
	);
	if (font?.source.kind !== "drawn") throw new Error("not a drawn font");
	return (
		font.source.glyphs.find(
			(glyph) => glyph.char === char && glyph.variant === 0,
		)?.strokes.length ?? 0
	);
}

function cell(page: Page, key: string): Locator {
	return page.locator(`[data-cell="${key}"]`);
}

async function strokes(page: Page, key: string): Promise<number> {
	return Number(await cell(page, key).getAttribute("data-strokes"));
}

async function waitForStrokes(
	page: Page,
	key: string,
	count: number,
): Promise<void> {
	await page.locator(`[data-cell="${key}"][data-strokes="${count}"]`).waitFor();
}

async function waitForSavedGlyphs(page: Page): Promise<void> {
	await page
		.getByRole("status")
		.filter({ hasText: /^Saved$/ })
		.waitFor();
}

async function drawStroke(page: Page, char: string): Promise<void> {
	const canvas = page.getByLabel(`Draw ${char}`, { exact: true });
	await canvas.scrollIntoViewIfNeeded();
	const box = await canvas.boundingBox();
	if (!box) throw new Error(`no cell for ${char}`);
	await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
		steps: 8,
	});
	await page.mouse.up();
}

async function drawChar(page: Page, char: string): Promise<void> {
	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === "PUT" &&
			response.url().includes("/glyphs") &&
			response.status() === 204,
	);
	await drawStroke(page, char);
	await saved;
}

async function center(
	locator: Locator,
	dx = 0,
): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();
	if (!box) throw new Error("not on screen");
	return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 };
}

async function penStroke(cdp: CDPSession, at: { x: number; y: number }) {
	const event = (
		type: "mousePressed" | "mouseMoved" | "mouseReleased",
		x: number,
		y: number,
	) =>
		cdp.send("Input.dispatchMouseEvent", {
			type,
			x,
			y,
			button: "left",
			buttons: type === "mouseReleased" ? 0 : 1,
			clickCount: 1,
			pointerType: "pen",
			force: 0.5,
		});
	await event("mousePressed", at.x - 20, at.y);
	for (let step = 1; step <= 8; step += 1) {
		await event("mouseMoved", at.x - 20 + step * 5, at.y + step * 3);
	}
	await event("mouseReleased", at.x + 20, at.y + 24);
}

async function fingerStroke(cdp: CDPSession, at: { x: number; y: number }) {
	await cdp.send("Input.dispatchTouchEvent", {
		type: "touchStart",
		touchPoints: [{ x: at.x - 20, y: at.y, id: 1 }],
	});
	for (let step = 1; step <= 8; step += 1) {
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchMove",
			touchPoints: [{ x: at.x - 20 + step * 5, y: at.y + step * 3, id: 1 }],
		});
	}
	await cdp.send("Input.dispatchTouchEvent", {
		type: "touchEnd",
		touchPoints: [],
	});
}

describe("handwriting fonts", () => {
	it("a missing font is the studio's own not-found page", async () => {
		const member = await harness.seedIdentity();
		const page = await harness.open(member, "/fonts");
		const response = await page.goto(
			page
				.url()
				.replace("/fonts", "/fonts/0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99"),
		);
		expect(response?.status()).toBe(404);
		await page
			.getByRole("heading", { name: "This handwriting is not here" })
			.waitFor();
		expect(await page.locator(".studio").count()).toBe(1);
		const draw = await page.goto(
			page
				.url()
				.replace(
					/\/fonts\/[^/]+$/,
					"/fonts/0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a98/draw",
				),
		);
		expect(draw?.status()).toBe(404);
		await page
			.getByRole("heading", { name: "This handwriting is not here" })
			.waitFor();
		expect(await page.locator(".studio").count()).toBe(1);
	});

	it("the toolbar offers to make a handwriting font when there is none", async () => {
		const member = await harness.seedIdentity();
		const { page, id } = await openLetter(member);
		await page.getByRole("combobox", { name: "Font" }).click();
		expect(await page.getByText("My handwriting").isVisible()).toBe(true);
		await page.getByRole("option", { name: "Make your handwriting" }).click();
		await page.waitForURL((url) => url.pathname === "/fonts/new");
		expect(new URL(page.url()).searchParams.get("from")).toBe(id);
	});

	it("the draw page counts the needed letters and opens at the first blank one", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(
			member,
			REQUIRED.filter((char) => char !== "x"),
		);
		const page = await harness.open(member, `/fonts/${fontId}/draw`, {
			viewport: { width: 1280, height: 720 },
		});
		await page.getByText("30 of 31 letters").waitFor();
		const build = page.getByRole("button", { name: "Build my font" });
		expect(await build.isDisabled()).toBe(true);
		expect(await cell(page, "x:0").getAttribute("data-highlighted")).toBe(
			"true",
		);
		await page.waitForFunction(() => {
			const box = document
				.querySelector('[data-cell="x:0"]')
				?.getBoundingClientRect();
			return box !== undefined && box.top >= 0 && box.bottom <= innerHeight;
		});
		expect(
			await page
				.getByRole("heading", { name: "Make it look more natural" })
				.count(),
		).toBe(0);
		await drawChar(page, "x");
		await page.getByText("31 of 31 letters").waitFor();
		expect(await build.isEnabled()).toBe(true);
		await page
			.getByRole("heading", { name: "Make it look more natural" })
			.waitFor();
		await drawChar(page, "e·2");
		expect(await strokes(page, "e:1")).toBe(1);
	});

	it("undo and redo walk back strokes and clears across cells, and the server keeps the last state", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, []);
		const page = await harness.open(member, `/fonts/${fontId}/draw`, {
			viewport: { width: 1280, height: 900 },
		});
		const undo = page.getByRole("button", { name: "Undo" });
		const redo = page.getByRole("button", { name: "Redo" });
		expect(await undo.isDisabled()).toBe(true);
		await drawChar(page, "b");
		await drawChar(page, "c");
		expect(await cell(page, "c:0").getAttribute("data-highlighted")).toBe(
			"true",
		);
		await page.getByRole("button", { name: "Clear b" }).click();
		await waitForStrokes(page, "b:0", 0);
		await page.keyboard.press("Control+z");
		await waitForStrokes(page, "b:0", 1);
		await undo.click();
		await waitForStrokes(page, "c:0", 0);
		expect(await cell(page, "b:0").getAttribute("data-highlighted")).toBe(
			"true",
		);
		await redo.click();
		await waitForStrokes(page, "c:0", 1);
		await page.keyboard.press("Control+z");
		await page.keyboard.press("Control+Shift+z");
		await waitForStrokes(page, "c:0", 1);
		expect(await strokes(page, "b:0")).toBe(1);
		expect(await redo.isEnabled()).toBe(true);
		await waitForSavedGlyphs(page);
		expect(await savedStrokes(member, fontId, "b")).toBe(1);
		expect(await savedStrokes(member, fontId, "c")).toBe(1);
		for (let step = 0; step < 6; step += 1) {
			await page.keyboard.press("Control+z");
		}
		await waitForStrokes(page, "b:0", 0);
		await waitForStrokes(page, "c:0", 0);
		await page.keyboard.press("Control+y");
		await waitForStrokes(page, "b:0", 1);
		await waitForSavedGlyphs(page);
		expect(await savedStrokes(member, fontId, "b")).toBe(1);
		expect(await savedStrokes(member, fontId, "c")).toBe(0);
		await page.reload();
		await waitForStrokes(page, "b:0", 1);
		expect(await strokes(page, "c:0")).toBe(0);
	});

	it("a save that fails rolls the cell back and says so under the cell", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, ["a"]);
		const page = await harness.open(member, `/fonts/${fontId}/draw`);
		await page.route("**/api/fonts/*/glyphs", (route) => route.abort());
		await drawStroke(page, "d");
		const alert = cell(page, "d:0").locator("..").getByRole("alert");
		await alert.waitFor();
		expect(await alert.textContent()).toBe(
			"Not saved. Check your connection and draw it again.",
		);
		await waitForStrokes(page, "d:0", 0);
		expect(await page.getByRole("button", { name: "Undo" }).isDisabled()).toBe(
			true,
		);
		await page.unroute("**/api/fonts/*/glyphs");
		await drawChar(page, "d");
		expect(await alert.count()).toBe(0);
	});

	it("a full cell takes no more strokes and says how to start again", async () => {
		const member = await harness.seedIdentity();
		const font = await harness.db.fonts.create({
			organizationId: member.userOrganization.organizationId,
			ownerUserId: member.user.id,
			ownerName: "Karla",
			source: {
				kind: "drawn",
				glyphs: [
					{
						char: "w",
						variant: 0,
						strokes: Array.from(
							{ length: GLYPH_LIMITS.strokes },
							() => INK,
						).flat(),
					},
				],
			},
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		const page = await harness.open(member, `/fonts/${font.id}/draw`);
		const puts: string[] = [];
		page.on("request", (request) => {
			if (request.method() === "PUT") puts.push(request.url());
		});
		const note = cell(page, "w:0").locator("..").getByRole("status");
		await note.waitFor();
		expect(await note.textContent()).toBe(
			"This box is full. Use × to clear it and start again.",
		);
		await drawStroke(page, "w");
		expect(await strokes(page, "w:0")).toBe(GLYPH_LIMITS.strokes);
		await page.getByRole("button", { name: "Clear w" }).click();
		await waitForStrokes(page, "w:0", 0);
		expect(await note.count()).toBe(0);
		await waitForSavedGlyphs(page);
		expect(puts).toHaveLength(1);
	});

	it("Build waits for the last save, then opens the font page", async () => {
		const member = await harness.seedIdentity();
		const letterId = await harness.newLetter(member);
		const fontId = await seedDrawnFont(
			member,
			REQUIRED.filter((char) => char !== "'"),
		);
		const page = await harness.open(
			member,
			`/fonts/${fontId}/draw?from=${letterId}`,
		);
		const events: string[] = [];
		await page.route("**/api/fonts/*/glyphs", async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 1200));
			await route.continue();
		});
		page.on("response", (response) => {
			if (response.url().includes("/glyphs")) events.push("glyph saved");
		});
		page.on("request", (request) => {
			if (request.url().includes("/builds")) events.push("build asked");
		});
		await harness.open(member, `/fonts/${fontId}`);
		await drawStroke(page, "'");
		const build = page.getByRole("button", { name: "Build my font" });
		await build.click();
		await page.waitForURL(
			(url) =>
				url.pathname === `/fonts/${fontId}` &&
				url.searchParams.get("from") === letterId,
		);
		expect(events).toEqual(["glyph saved", "build asked"]);
		const font = await harness.db.fonts.byId(
			member.userOrganization.organizationId,
			fontId,
		);
		expect(font?.pendingFontAssetId ?? font?.fontAssetId).toBeTruthy();
	});

	it("a build request that never arrives says so and Build my font works again", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, REQUIRED);
		const page = await harness.open(member, `/fonts/${fontId}/draw`);
		await page.route("**/api/fonts/*/builds", (route) =>
			route.abort("internetdisconnected"),
		);
		const build = page.getByRole("button", { name: "Build my font" });
		await build.click();
		await page
			.getByRole("alert")
			.filter({ hasText: errorMessages.processing_failed })
			.waitFor();
		expect(await build.isEnabled()).toBe(true);
		await page.unroute("**/api/fonts/*/builds");
		await page.route("**/api/fonts/*/builds", (route) =>
			route.fulfill({
				status: 502,
				contentType: "text/html",
				body: "<html>Bad gateway</html>",
			}),
		);
		await build.click();
		await page
			.getByRole("alert")
			.filter({ hasText: errorMessages.processing_failed })
			.waitFor();
		expect(await build.isEnabled()).toBe(true);
		expect(new URL(page.url()).pathname).toBe(`/fonts/${fontId}/draw`);
	});

	it("a glyph as dense as the limits allow still opens the draw page", async () => {
		const member = await harness.seedIdentity();
		const scribble: Stroke[] = Array.from(
			{ length: GLYPH_LIMITS.strokes },
			(_, stroke) => ({
				input: "pen",
				points: Array.from(
					{ length: GLYPH_LIMITS.pointsPerStroke },
					(_, index): [number, number, number, number] => [
						300 + ((index * 37 + stroke * 11) % 400),
						300 + ((index * 53 + stroke * 7) % 500),
						0.5,
						index,
					],
				),
			}),
		);
		const font = await harness.db.fonts.create({
			organizationId: member.userOrganization.organizationId,
			ownerUserId: member.user.id,
			ownerName: "Karla",
			source: {
				kind: "drawn",
				glyphs: [
					{ char: "a", variant: 0, strokes: INK },
					{ char: "e", variant: 0, strokes: scribble },
				],
			},
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		const page = await harness.open(member, `/fonts/${font.id}/draw`);
		await page.getByText("2 of 31 letters").waitFor();
		expect(await strokes(page, "e:0")).toBe(GLYPH_LIMITS.strokes);
	});

	it("Back to your letter returns to the letter that sent the creator", async () => {
		const member = await harness.seedIdentity();
		const letterId = await harness.newLetter(member);
		const fontId = await seedDrawnFont(member, []);
		const page = await harness.open(
			member,
			`/fonts/${fontId}/draw?from=${letterId}`,
		);
		const back = page.getByRole("link", { name: "Back to your letter" });
		expect(await back.getAttribute("href")).toBe(
			`/letters/${letterId}?font=${fontId}`,
		);
		const plain = await harness.open(member, `/fonts/${fontId}/draw`);
		await plain.getByText("0 of 31 letters").waitFor();
		expect(
			await plain.getByRole("link", { name: "Back to your letter" }).count(),
		).toBe(0);
	});

	it("a glyph in the link opens the page at that cell", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, REQUIRED);
		const page = await harness.open(
			member,
			`/fonts/${fontId}/draw?glyph=${encodeURIComponent("S")}`,
			{ viewport: { width: 1280, height: 720 } },
		);
		const target = cell(page, "S:0");
		await target.waitFor();
		expect(await target.getAttribute("data-highlighted")).toBe("true");
		await page.waitForFunction(() => {
			const box = document
				.querySelector('[data-cell="S:0"]')
				?.getBoundingClientRect();
			return box !== undefined && box.top >= 0 && box.bottom <= innerHeight;
		});
	});

	it("a font that was not drawn opens its font page instead", async () => {
		const member = await harness.seedIdentity();
		const font = await harness.db.fonts.create({
			organizationId: member.userOrganization.organizationId,
			ownerUserId: member.user.id,
			ownerName: "Karla",
			source: { kind: "upload", fileAssetId: randomUUID() },
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		const page = await harness.open(member, `/fonts/${font.id}/draw`);
		await page.waitForURL((url) => url.pathname === `/fonts/${font.id}`);
	});

	it("the live line writes each drawn letter in the creator's ink", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, []);
		const page = await harness.open(member, `/fonts/${fontId}/draw`);
		const specimen = page.locator("[data-specimen]");
		const times = [...SPECIMEN_TEXT].filter((char) => char === "o").length;
		expect(times).toBeGreaterThan(1);
		await specimen
			.locator('[data-undrawn="o"]')
			.nth(times - 1)
			.waitFor();
		expect(await specimen.locator('[data-drawn="o"]').count()).toBe(0);
		expect(await specimen.locator('[data-undrawn="o"]').count()).toBe(times);
		await drawChar(page, "o");
		await specimen
			.locator('[data-drawn="o"]')
			.nth(times - 1)
			.waitFor();
		expect(await specimen.locator('[data-undrawn="o"]').count()).toBe(0);
		await page.getByRole("button", { name: "Undo" }).click();
		await specimen
			.locator('[data-undrawn="o"]')
			.nth(times - 1)
			.waitFor();
		expect(await specimen.locator('[data-drawn="o"]').count()).toBe(0);
	});

	it("after the first Pencil stroke, fingers no longer draw in any cell", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, []);
		const page = await harness.open(member, `/fonts/${fontId}/draw`, TABLET);
		const cdp = await page.context().newCDPSession(page);
		const a = page.getByLabel("Draw a", { exact: true });
		const b = page.getByLabel("Draw b", { exact: true });
		expect(await b.getAttribute("class")).toContain("touch-none");
		await penStroke(cdp, await center(a));
		await waitForStrokes(page, "a:0", 1);
		await page.waitForFunction(() =>
			[...document.querySelectorAll("[data-cell] canvas")].every((canvas) =>
				canvas.classList.contains("touch-pan-y"),
			),
		);
		const start = await center(b);
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: start.x, y: start.y, id: 1 }],
		});
		for (let step = 1; step <= 6; step += 1) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: start.x, y: start.y - step * 8, id: 1 }],
			});
		}
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await penStroke(cdp, await center(b));
		await waitForStrokes(page, "b:0", 1);
	});

	it("a two-finger tap undoes the last stroke", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, []);
		const page = await harness.open(member, `/fonts/${fontId}/draw`, TABLET);
		const cdp = await page.context().newCDPSession(page);
		await penStroke(
			cdp,
			await center(page.getByLabel("Draw a", { exact: true })),
		);
		await waitForStrokes(page, "a:0", 1);
		const b = page.getByLabel("Draw b", { exact: true });
		const left = await center(b, -16);
		const right = await center(b, 16);
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [
				{ x: left.x, y: left.y, id: 1 },
				{ x: right.x, y: right.y, id: 2 },
			],
		});
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await waitForStrokes(page, "a:0", 0);
		expect(await strokes(page, "b:0")).toBe(0);
		await page.getByRole("button", { name: "Redo" }).click();
		await waitForStrokes(page, "a:0", 1);
	});

	it("a two-finger tap across two cells draws nothing for a finger-only creator", async () => {
		const member = await harness.seedIdentity();
		const fontId = await seedDrawnFont(member, []);
		const page = await harness.open(member, `/fonts/${fontId}/draw`, TABLET);
		const cdp = await page.context().newCDPSession(page);
		const box = (char: string) =>
			page.getByLabel(`Draw ${char}`, { exact: true });
		await fingerStroke(cdp, await center(box("a")));
		await waitForStrokes(page, "a:0", 1);
		await fingerStroke(cdp, await center(box("b")));
		await waitForStrokes(page, "b:0", 1);
		await waitForSavedGlyphs(page);
		await page.getByRole("button", { name: "Undo" }).click();
		await waitForStrokes(page, "b:0", 0);
		const d = await center(box("d"));
		const e = await center(box("e"));
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: d.x, y: d.y, id: 1 }],
		});
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [
				{ x: d.x, y: d.y, id: 1 },
				{ x: e.x, y: e.y, id: 2 },
			],
		});
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
		await waitForStrokes(page, "a:0", 0);
		expect(await strokes(page, "d:0")).toBe(0);
		expect(await strokes(page, "e:0")).toBe(0);
		const redo = page.getByRole("button", { name: "Redo" });
		await redo.click();
		await waitForStrokes(page, "a:0", 1);
		await redo.click();
		await waitForStrokes(page, "b:0", 1);
		await expect.poll(() => savedStrokes(member, fontId, "b")).toBe(1);
		await expect.poll(() => savedStrokes(member, fontId, "a")).toBe(1);
		expect(await savedStrokes(member, fontId, "d")).toBe(0);
		expect(await savedStrokes(member, fontId, "e")).toBe(0);
	});

	it("a drawn font becomes a choice in the toolbar and in the seal", async () => {
		const member = await harness.seedIdentity();
		const last = REQUIRED.at(-1) ?? "";
		const fontId = await seedDrawnFont(
			member,
			REQUIRED.filter((char) => char !== last),
		);
		const page = await harness.open(member, `/fonts/${fontId}/draw`, {
			viewport: { width: 1280, height: 900 },
		});
		await drawChar(page, last);
		await page.getByRole("button", { name: "Build my font" }).click();
		await page.waitForURL((url) => url.pathname === `/fonts/${fontId}`);
		const deadline = Date.now() + 120_000;
		for (;;) {
			const font = await harness.db.fonts.byId(
				member.userOrganization.organizationId,
				fontId,
			);
			if (font?.fontAssetId) break;
			if (Date.now() > deadline) throw new Error("the font never built");
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
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

	it("a font whose build failed can be built again after a reload", async () => {
		const member = await harness.seedIdentity();
		const organizationId = member.userOrganization.organizationId;
		const fontId = await seedDrawnFont(member, REQUIRED);
		const build = await harness.db.assets.create(
			generatedAsset(organizationId, { kind: "build-font", fontId }),
		);
		await harness.db.fonts.setPending(organizationId, fontId, build.id);
		await harness.db.assets.claim(build.id, new Date(0));
		await harness.db.assets.fail(build.id, "processing_failed");
		const page = await harness.open(member, `/fonts/${fontId}/draw`);
		const button = page.getByRole("button", { name: "Build my font" });
		await button.waitFor();
		expect(await button.isEnabled()).toBe(true);
	});

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
		await page.getByLabel("Your name on the seal").fill("Karla");
		await page.getByRole("button", { name: /^Write it here/ }).click();
		await page.waitForURL(/\/fonts\/[^/]+\/draw$/);
		await page.goto(`${page.url().split("/fonts/")[0]}/fonts`);
		await page.getByText("Karla's handwriting").waitFor();
		await page
			.getByRole("button", { name: "Delete Karla's handwriting" })
			.click();
		await page
			.getByRole("dialog", { name: "Delete Karla's handwriting?" })
			.getByRole("button", { name: "Delete" })
			.click();
		await page.getByText("No handwriting yet.").waitFor();
		expect(await page.getByText("Karla's handwriting").count()).toBe(0);
	});
});
