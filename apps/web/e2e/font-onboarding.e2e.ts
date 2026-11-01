import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { seedDevIdentity } from "@repo/db/testing";
import { errorMessages } from "@repo/errors";
import { generatedAsset } from "@repo/services/assets";
import {
	type FontSource,
	HANDWRITING_GLYPHS,
	LOWERCASE_LETTERS,
	type Member,
	type Stroke,
} from "@repo/types";
import type { Locator, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE_NOTE } from "../src/features/fonts/font-status.ts";
import { type Harness, startHarness } from "./harness.ts";

let harness: Harness;

beforeAll(async () => {
	harness = await startHarness();
});

afterAll(async () => {
	await harness?.stop();
});

const here = dirname(fileURLToPath(import.meta.url));

const PHOTO = resolve(here, "fixtures/doodle-on-ruled-paper.jpg");

const FONT_FILE = resolve(
	here,
	"../../../packages/render/fonts/PatrickHand-Regular.ttf",
);

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

const WORKER_MS = 120_000;

const LETTER_FAILED = "That letter could not be started, so try again.";

async function seedNamed(name: string): Promise<Member> {
	const email = `e2e-${randomUUID()}@inkstudio.local`;
	await harness.db.users.getOrCreate({
		externalId: `dev:${email}`,
		email,
		name,
	});
	return seedDevIdentity(harness.db, { email, organizationName: "E2E studio" });
}

function pdfContent(pdf: Buffer): string {
	const text = pdf.toString("latin1");
	const streams: string[] = [];
	for (const match of text.matchAll(/stream\r?\n/g)) {
		const start = match.index + match[0].length;
		const end = text.indexOf("endstream", start);
		const bytes = pdf.subarray(start, end);
		try {
			streams.push(inflateSync(bytes).toString("latin1"));
		} catch {
			streams.push(bytes.toString("latin1"));
		}
	}
	return streams.join("\n");
}

function blackFills(pdf: Buffer): number {
	const tokens = pdfContent(pdf).split(/\s+/);
	const saved: boolean[] = [];
	let black = false;
	let fills = 0;
	tokens.forEach((token, index) => {
		const operands = tokens.slice(Math.max(0, index - 3), index).map(Number);
		if (token === "q") saved.push(black);
		if (token === "Q") black = saved.pop() ?? false;
		if (token === "rg") black = operands.every((value) => value === 0);
		if (token === "g") black = operands.at(-1) === 0;
		if ((token === "f" || token === "f*") && black) fills += 1;
	});
	return fills;
}

function drawn(chars: readonly string[]): FontSource {
	return {
		kind: "drawn",
		glyphs: chars.map((char) => ({ char, variant: 0, strokes: INK })),
	};
}

const PAPER: FontSource = {
	kind: "template-photo",
	templateVersion: 1,
	photoAssetId: randomUUID(),
};

const FILE: FontSource = { kind: "upload", fileAssetId: randomUUID() };

async function seedFont(
	member: Member,
	source: FontSource,
	ownerName = "Karla",
): Promise<string> {
	const font = await harness.db.fonts.create({
		organizationId: member.userOrganization.organizationId,
		ownerUserId: member.user.id,
		ownerName,
		source,
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "",
	});
	return font.id;
}

type Outcome = "pending" | { failed: string } | { built: string };

async function seedBuild(
	member: Member,
	fontId: string,
	outcome: Outcome,
): Promise<string> {
	const organizationId = member.userOrganization.organizationId;
	const build = await harness.db.assets.create(
		generatedAsset(organizationId, { kind: "build-font", fontId }),
	);
	await harness.db.fonts.setPending(organizationId, fontId, build.id);
	if (outcome === "pending") return build.id;
	await harness.db.assets.claim(build.id, new Date(0));
	if ("failed" in outcome) {
		await harness.db.assets.fail(build.id, 1, outcome.failed);
		return build.id;
	}
	await harness.db.assets.complete(build.id, 1, {
		storageKey: `${build.storageKey}/attempts/1`,
		mimeType: "font/ttf",
		byteSize: 1,
		checksum: "e2e",
	});
	await harness.db.fonts.finishBuild(
		organizationId,
		fontId,
		build.id,
		outcome.built,
	);
	return build.id;
}

async function liveFonts(member: Member) {
	return harness.db.fonts.listByOwner(
		member.userOrganization.organizationId,
		member.user.id,
	);
}

function fontIdOf(page: Page): string {
	return new URL(page.url()).pathname.split("/")[2] ?? "";
}

function method(page: Page, name: string) {
	return page.getByRole("button", { name, exact: true });
}

function upload(scope: Page | Locator, label: string) {
	return scope.locator(`input[data-upload="${label}"]`);
}

function isFontHome(url: URL): boolean {
	return /^\/fonts\/[0-9a-f-]{36}$/.test(url.pathname);
}

async function focusedHeading(page: Page): Promise<string | null> {
	return page.evaluate(() =>
		document.activeElement?.tagName === "H1"
			? document.activeElement.textContent
			: null,
	);
}

describe("making a handwriting font", () => {
	it("the start page takes the creator's first name and passes from on", async () => {
		const member = await seedNamed("Karla Example");
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/fonts/new?from=${letterId}`);
		await page
			.getByRole("heading", { name: "Make your handwriting" })
			.waitFor();
		const name = page.getByLabel("Your name on the seal");
		expect(await name.inputValue()).toBe("Karla");
		expect(await name.getAttribute("maxlength")).toBe("40");
		await page
			.getByText("Letters will say “Written in Karla's own handwriting”")
			.waitFor();
		await name.fill("");
		await page.getByText("Add a name first").waitFor();
		for (const title of [
			"Write it here",
			"Write on paper",
			"Use a font file",
		]) {
			expect(await method(page, title).isDisabled()).toBe(true);
		}
		await name.fill("Sam");
		await page
			.getByText("Letters will say “Written in Sam's own handwriting”")
			.waitFor();
		expect(
			await method(page, "Write it here").getAttribute("aria-describedby"),
		).toBeTruthy();
		await method(page, "Write it here")
			.getByText("Recommended", { exact: true })
			.waitFor();
		await method(page, "Write it here").click();
		await page.waitForURL(
			(url) =>
				/^\/fonts\/[^/]+\/draw$/.test(url.pathname) &&
				url.searchParams.get("from") === letterId,
		);
		const [font] = await liveFonts(member);
		expect(font?.ownerName).toBe("Sam");
	});

	it("a name the server refuses says why", async () => {
		const member = await seedNamed("Karla");
		const page = await harness.open(member, "/fonts/new");
		await page.route("**/api/fonts", (route) =>
			route.fulfill({
				status: 400,
				contentType: "application/json",
				body: JSON.stringify({
					code: "owner_name_too_long",
					message: errorMessages.owner_name_too_long,
				}),
			}),
		);
		await method(page, "Write it here").click();
		await page
			.getByRole("alert")
			.filter({ hasText: errorMessages.owner_name_too_long })
			.waitFor();
		expect(await method(page, "Write it here").isEnabled()).toBe(true);
	});

	it("Write on paper opens the template in three steps with the name", async () => {
		const member = await seedNamed("Karla");
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/fonts/new?from=${letterId}`);
		await method(page, "Write on paper").click();
		await page.waitForURL(
			(url) =>
				url.pathname === "/fonts/template" &&
				url.searchParams.get("from") === letterId &&
				url.searchParams.get("name") === "Karla",
		);
		for (const step of ["Print", "Write", "Photograph"]) {
			await page.getByRole("heading", { name: step, exact: true }).waitFor();
		}
		expect(await page.getByLabel("Your name on the seal").inputValue()).toBe(
			"Karla",
		);
		expect(
			await upload(page, "Choose a photo").getAttribute("capture"),
		).toBeNull();
		expect(await upload(page, "Take photo").count()).toBe(0);
		const tablet = await harness.open(member, "/fonts/template", {
			viewport: { width: 1024, height: 1366 },
			hasTouch: true,
		});
		await tablet.getByRole("button", { name: "Take photo" }).waitFor();
		expect(await upload(tablet, "Take photo").getAttribute("capture")).toBe(
			"environment",
		);
		expect(
			await upload(tablet, "Choose a photo").getAttribute("capture"),
		).toBeNull();
		expect(await page.locator('[data-template-cell="a·2"]').count()).toBe(1);
		expect(await page.locator('[data-template-cell="a·3"]').count()).toBe(1);
		expect(await page.locator("[data-baseline]").count()).toBeGreaterThan(30);
	});

	it("Write on paper keeps the whole name the creator typed", async () => {
		const member = await seedNamed("Karla Example");
		const page = await harness.open(member, "/fonts/new");
		await page.getByLabel("Your name on the seal").fill("Mary  Ann");
		await method(page, "Write on paper").click();
		await page.waitForURL(
			(url) =>
				url.pathname === "/fonts/template" &&
				url.searchParams.get("name") === "Mary Ann",
		);
		expect(await page.getByLabel("Your name on the seal").inputValue()).toBe(
			"Mary Ann",
		);
		await page
			.getByText("Letters will say “Written in Mary Ann's own handwriting”")
			.waitFor();
		const origin = new URL(page.url()).origin;
		await page.goto(
			`${origin}/fonts/template?name=${encodeURIComponent(" Sam\tBaker ")}`,
		);
		expect(await page.getByLabel("Your name on the seal").inputValue()).toBe(
			"Sam Baker",
		);
		await page.goto(`${origin}/fonts/template?name=`);
		expect(await page.getByLabel("Your name on the seal").inputValue()).toBe(
			"Karla",
		);
	});

	it("the template fits a narrow screen and prints as one sheet", async () => {
		const member = await seedNamed("Karla");
		for (const width of [768, 390]) {
			const page = await harness.open(member, "/fonts/template", {
				viewport: { width, height: 1000 },
			});
			await page.locator(".template-sheet").waitFor();
			await page.waitForFunction(
				() =>
					document.documentElement.scrollWidth <=
					document.documentElement.clientWidth,
			);
			const sheet = await page.locator(".template-sheet").boundingBox();
			expect(sheet?.width ?? 0).toBeLessThanOrEqual(width);
		}
		const page = await harness.open(member, "/fonts/template");
		await page.emulateMedia({ media: "print" });
		const sheet = await page.locator(".template-sheet").boundingBox();
		expect(sheet).toEqual({ x: 0, y: 0, width: 816, height: 1056 });
		expect(
			await page.getByRole("heading", { name: "Write on paper" }).isVisible(),
		).toBe(false);
	});

	it("the printed template has its four black corner markers without background graphics", async () => {
		const member = await seedNamed("Karla");
		const page = await harness.open(member, "/fonts/template");
		await page.locator(".template-sheet").waitFor();
		const pdf = await page.pdf({ preferCSSPageSize: true });
		expect(blackFills(pdf)).toBe(4);
	});

	it("a photo the worker cannot read says how to fix it, and a new photo replaces the font", async () => {
		const member = await seedNamed("Karla");
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/fonts/template?from=${letterId}`);
		await upload(page, "Choose a photo").setInputFiles(PHOTO);
		await page.waitForURL(
			(url) => isFontHome(url) && url.searchParams.get("from") === letterId,
		);
		const first = fontIdOf(page);
		await page
			.getByText(errorMessages.template_markers_not_found)
			.waitFor({ timeout: WORKER_MS });
		await page.getByRole("button", { name: "Photograph again" }).waitFor();
		await upload(page, "Photograph again").setInputFiles(PHOTO);
		await page.waitForURL(
			(url) => isFontHome(url) && !url.pathname.endsWith(first),
		);
		const fonts = await liveFonts(member);
		expect(fonts.map((font) => font.id)).toEqual([fontIdOf(page)]);
		expect(new URL(page.url()).searchParams.get("from")).toBe(letterId);
	}, 180_000);

	it("the font file asks for the handwriting promise, explains a bad file and takes the same file again", async () => {
		const member = await seedNamed("Karla");
		const page = await harness.open(member, "/fonts/new");
		await method(page, "Use a font file").click();
		const dialog = page.getByRole("dialog", { name: "Use a font file" });
		await dialog.getByText("A .ttf or .otf with at least a to z.").waitFor();
		const choose = dialog.getByRole("button", { name: "Choose a font file" });
		expect(await choose.isDisabled()).toBe(true);
		await dialog
			.getByLabel("This font is made from my own handwriting.")
			.check();
		expect(await choose.isEnabled()).toBe(true);
		let uploads = 0;
		page.on("request", (request) => {
			if (request.url().includes("/api/uploads")) uploads += 1;
		});
		const input = upload(dialog, "Choose a font file");
		const fake = {
			name: "fake.ttf",
			mimeType: "font/ttf",
			buffer: Buffer.from("not a font at all"),
		};
		await input.setInputFiles(fake);
		await dialog
			.getByRole("alert")
			.filter({
				hasText: "That is not a .ttf or .otf file, so choose another one.",
			})
			.waitFor();
		expect(await input.inputValue()).toBe("");
		await input.setInputFiles(fake);
		await expect.poll(() => uploads).toBe(2);
		expect(await liveFonts(member)).toHaveLength(0);
	});

	it("an uploaded font rebuilds and its home says it is ready", async () => {
		const member = await seedNamed("Karla");
		const letterId = await harness.newLetter(member);
		const page = await harness.open(member, `/fonts/new?from=${letterId}`);
		await method(page, "Use a font file").click();
		const dialog = page.getByRole("dialog", { name: "Use a font file" });
		await dialog
			.getByLabel("This font is made from my own handwriting.")
			.check();
		await upload(dialog, "Choose a font file").setInputFiles({
			name: "PatrickHand-Regular.ttf",
			mimeType: "font/ttf",
			buffer: readFileSync(FONT_FILE),
		});
		await page.waitForURL(isFontHome);
		const fontId = fontIdOf(page);
		await page
			.getByRole("heading", { name: "Karla's handwriting is ready" })
			.waitFor({ timeout: WORKER_MS });
		await page.waitForFunction(
			(family) => document.fonts.check(`20pt "${family}"`),
			`own-${fontId}`,
		);
		await page.getByText("Written in Karla's own handwriting").waitFor();
		expect(
			await page
				.getByRole("link", { name: "Back to your letter" })
				.getAttribute("href"),
		).toBe(`/letters/${letterId}?font=${fontId}`);
	}, 180_000);

	it("a build in progress resumes after a reload, offers a retry when slow, and lands on ready", async () => {
		const member = await seedNamed("Karla");
		const fontId = await seedFont(member, drawn(REQUIRED));
		await seedBuild(member, fontId, "pending");
		const page = await harness.open(member, `/fonts/${fontId}`);
		await page
			.getByRole("status")
			.filter({ hasText: "Building your font…" })
			.waitFor();
		await page
			.getByText(
				"Usually under a minute. You can leave this page; it carries on.",
			)
			.waitFor();
		await page.clock.install();
		const polled = page.waitForRequest((request) =>
			request.url().includes("/status"),
		);
		await page.reload();
		await polled;
		expect(await page.getByText("Taking longer than usual.").count()).toBe(0);
		await page.clock.fastForward(61_000);
		await page
			.getByText("Taking longer than usual.", { exact: false })
			.waitFor();
		await page.getByRole("button", { name: "Try again" }).click();
		await page
			.getByRole("heading", { name: "Karla's handwriting is ready" })
			.waitFor({ timeout: WORKER_MS });
	}, 180_000);

	it("a failed build explains itself and offers the right fix", async () => {
		const member = await seedNamed("Karla");
		const paper = await seedFont(member, PAPER);
		await seedBuild(member, paper, { failed: "template_markers_not_found" });
		const page = await harness.open(member, `/fonts/${paper}`);
		await page
			.getByRole("heading", { name: "Karla's handwriting didn't work" })
			.waitFor();
		await page.getByText(errorMessages.template_markers_not_found).waitFor();
		await page.getByRole("button", { name: "Photograph again" }).waitFor();

		const file = await seedFont(member, FILE);
		await seedBuild(member, file, { failed: "font_unreadable" });
		await page.goto(page.url().replace(paper, file));
		await page.getByText(errorMessages.font_unreadable).waitFor();
		await page.getByRole("button", { name: "Choose another file" }).click();
		await page.getByRole("dialog", { name: "Use a font file" }).waitFor();
		await page.keyboard.press("Escape");

		const hand = await seedFont(member, drawn(REQUIRED));
		await seedBuild(member, hand, { failed: "processing_failed" });
		await page.goto(page.url().replace(file, hand));
		await page.getByText(errorMessages.processing_failed).waitFor();
		const requested = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/api/fonts/${hand}/builds`) &&
				response.status() === 201,
		);
		await page.getByRole("button", { name: "Try again" }).click();
		await requested;
		await page
			.getByRole("heading", { name: /^Karla's handwriting( is ready)?$/ })
			.waitFor();
	});

	it("a font missing lowercase letters names them", async () => {
		const member = await seedNamed("Karla");
		const fontId = await seedFont(member, PAPER);
		await seedBuild(member, fontId, {
			built: LOWERCASE_LETTERS.filter(
				(char) => char !== "q" && char !== "z",
			).join(""),
		});
		const page = await harness.open(member, `/fonts/${fontId}`);
		await page
			.getByText(
				"q and z were blank. Your font needs them before you can write with it.",
			)
			.waitFor();
		await page.getByRole("button", { name: "Photograph again" }).waitFor();
	});

	it("a ready font says what Caveat fills in and opens a new letter in that hand", async () => {
		const member = await seedNamed("Karla");
		const fontId = await seedFont(member, drawn(REQUIRED));
		await seedBuild(member, fontId, { built: REQUIRED.join("") });
		const page = await harness.open(member, `/fonts/${fontId}`);
		await page
			.getByRole("heading", { name: "Karla's handwriting is ready" })
			.waitFor();
		await page.getByText("Written in Karla's own handwriting").waitFor();
		await page
			.getByText("Caveat fills in: capitals, numbers and symbols")
			.waitFor();
		expect(
			await page.getByRole("link", { name: "Draw them" }).getAttribute("href"),
		).toBe(`/fonts/${fontId}/draw?glyph=A`);
		await page.getByRole("button", { name: "Write a letter in it" }).click();
		await page.waitForURL(
			(url) =>
				/^\/letters\/[^/]+$/.test(url.pathname) &&
				!url.searchParams.has("font"),
		);
		const openedId = new URL(page.url()).pathname.split("/").pop() ?? "";
		const opened = await harness.letters.getLetter(member, openedId);
		expect(opened?.content.defaults.font).toEqual({ kind: "own", fontId });
		expect(
			await page.getByText("Use Karla's handwriting for this letter?").count(),
		).toBe(0);
		const letterId = await harness.newLetter(member);
		const back = await harness.open(
			member,
			`/fonts/${fontId}?from=${letterId}`,
		);
		expect(
			await back
				.getByRole("link", { name: "Back to your letter" })
				.getAttribute("href"),
		).toBe(`/letters/${letterId}?font=${fontId}`);
	});

	it("a letter that cannot be started says so", async () => {
		const member = await seedNamed("Karla");
		const fontId = await seedFont(member, drawn(REQUIRED));
		await seedBuild(member, fontId, { built: REQUIRED.join("") });
		const page = await harness.open(member, `/fonts/${fontId}`);
		await page.route("**/api/letters", (route) =>
			route.request().method() === "POST"
				? route.fulfill({
						status: 500,
						contentType: "application/json",
						body: JSON.stringify({ code: "internal_error", message: "" }),
					})
				: route.continue(),
		);
		const write = page.getByRole("button", { name: "Write a letter in it" });
		await write.click();
		await page.getByRole("alert").filter({ hasText: LETTER_FAILED }).waitFor();
		expect(await write.isEnabled()).toBe(true);
		expect(new URL(page.url()).pathname).toBe(`/fonts/${fontId}`);
	});

	it(
		"a drawn font with every needed letter builds from its home",
		async () => {
			const member = await seedNamed("Karla");
			const letterId = await harness.newLetter(member);
			const fontId = await seedFont(member, drawn(REQUIRED));
			const page = await harness.open(
				member,
				`/fonts/${fontId}?from=${letterId}`,
			);
			await page
				.getByText(`${REQUIRED.length} of ${REQUIRED.length} letters drawn.`, {
					exact: false,
				})
				.waitFor();
			expect(
				await page
					.getByRole("link", { name: "Keep drawing" })
					.getAttribute("href"),
			).toBe(`/fonts/${fontId}/draw?from=${letterId}`);
			const status = page.getByRole("status");
			expect(await status.count()).toBe(1);
			await status.evaluate((node) => node.setAttribute("data-kept", ""));
			await page.getByRole("button", { name: "Build my font" }).focus();
			await page.keyboard.press("Enter");
			await page
				.getByRole("heading", { name: "Karla's handwriting is ready" })
				.or(status.filter({ hasText: "Building your font…" }))
				.first()
				.waitFor();
			const [font] = await liveFonts(member);
			expect(font?.pendingFontAssetId ?? font?.fontAssetId).toBeTruthy();
			await expect
				.poll(() => focusedHeading(page))
				.toMatch(/^Karla's handwriting( is ready)?$/);
			await status
				.filter({ hasText: "Karla's handwriting is ready" })
				.waitFor({ timeout: WORKER_MS });
			expect(await status.count()).toBe(1);
			expect(await status.getAttribute("data-kept")).toBe("");
			await expect
				.poll(() => focusedHeading(page))
				.toBe("Karla's handwriting is ready");
		},
		WORKER_MS + 30_000,
	);

	it("a drawn font that still needs letters only offers to keep drawing", async () => {
		const member = await seedNamed("Karla");
		const fontId = await seedFont(member, drawn(REQUIRED.slice(1)));
		const page = await harness.open(member, `/fonts/${fontId}`);
		await page
			.getByText(
				`${REQUIRED.length - 1} of ${REQUIRED.length} letters drawn.`,
				{ exact: false },
			)
			.waitFor();
		await page.getByRole("link", { name: "Keep drawing" }).waitFor();
		expect(
			await page.getByRole("button", { name: "Build my font" }).count(),
		).toBe(0);
	});

	it("Delete on the font home asks first", async () => {
		const member = await seedNamed("Karla");
		const fontId = await seedFont(member, drawn(["a", "b"]));
		const page = await harness.open(member, `/fonts/${fontId}`);
		await page
			.getByText(`2 of ${REQUIRED.length} letters drawn.`, { exact: false })
			.waitFor();
		await page.getByRole("button", { name: "Delete" }).click();
		const confirm = page.getByRole("dialog", {
			name: "Delete Karla's handwriting?",
		});
		await confirm.getByText(DELETE_NOTE).waitFor();
		await confirm.getByRole("button", { name: "Keep it" }).click();
		await confirm.waitFor({ state: "hidden" });
		expect(await liveFonts(member)).toHaveLength(1);
		await page.getByRole("button", { name: "Delete" }).click();
		await confirm.getByRole("button", { name: "Delete" }).click();
		await page.waitForURL((url) => url.pathname === "/fonts");
		expect(await liveFonts(member)).toHaveLength(0);
	});

	it("the list shows each font's method and status, and Delete asks first", async () => {
		const member = await seedNamed("Karla");
		const dana = await seedFont(member, drawn(REQUIRED.slice(0, 12)), "Dana");
		const bea = await seedFont(member, drawn(REQUIRED), "Bea");
		await seedBuild(member, bea, "pending");
		const ines = await seedFont(member, PAPER, "Ines");
		await seedBuild(member, ines, { built: "abc" });
		const fay = await seedFont(member, FILE, "Fay");
		await seedBuild(member, fay, { failed: "font_unreadable" });
		const rae = await seedFont(member, drawn(REQUIRED), "Rae");
		await seedBuild(member, rae, { built: REQUIRED.join("") });
		const page = await harness.open(member, "/fonts");
		const row = (id: string) => page.locator(`[data-font-id="${id}"]`);
		const expected = [
			[
				dana,
				"Dana's handwriting",
				`Drawing 12/${REQUIRED.length}`,
				"Written here",
			],
			[bea, "Bea's handwriting", "Building", "Written here"],
			[ines, "Ines's handwriting", "Needs attention", "Written on paper"],
			[fay, "Fay's handwriting", "Didn't work", "From a font file"],
			[rae, "Rae's handwriting", "Ready", "Written here"],
		] as const;
		for (const [id, name, status, how] of expected) {
			const text = await row(id).textContent();
			expect(text).toContain(name);
			expect(text).toContain(status);
			expect(text).toContain(how);
			expect(
				await row(id).getByRole("link", { name }).getAttribute("href"),
			).toBe(`/fonts/${id}`);
		}
		expect(await row(rae).locator("[data-font-preview]").count()).toBe(1);
		expect(await row(dana).locator("[data-font-preview]").count()).toBe(0);
		await page
			.getByRole("button", { name: "Delete Dana's handwriting" })
			.click();
		const confirm = page.getByRole("dialog", {
			name: "Delete Dana's handwriting?",
		});
		await confirm.getByText(DELETE_NOTE).waitFor();
		await confirm.getByRole("button", { name: "Delete" }).click();
		await row(dana).waitFor({ state: "detached" });
		expect((await liveFonts(member)).map((font) => font.id)).not.toContain(
			dana,
		);
	});
});
