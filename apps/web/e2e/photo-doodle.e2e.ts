import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STROKE_OPTIONS } from "@repo/render/html";
import type { Member } from "@repo/types";
import type { Page } from "playwright-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Harness, letterText, startHarness } from "./harness.ts";

const FIXTURE = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures/doodle-on-ruled-paper.jpg",
);
const PHOTO = {
	name: "doodle-on-ruled-paper.jpg",
	mimeType: "image/jpeg",
	buffer: readFileSync(FIXTURE),
};
const LIFTED = {
	width: 1200,
	height: 900,
	lines: [264, 432, 600, 768, 936],
	lineWidth: 16,
	top: 88,
	bottom: 778,
};

describe("a photographed doodle", () => {
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

	it("the file picker does not offer HEIC", async () => {
		const page = await openPhoto(harness, member, letterId);
		expect(await page.getByLabel("Choose a photo").getAttribute("accept")).toBe(
			"image/jpeg,image/png,image/webp",
		);
	});

	it("the photo shows while it uploads and while the ink lifts", async () => {
		const page = await openPhoto(harness, member, letterId);
		await page.route("**/api/assets/*/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ status: "pending", error: null }),
			}),
		);
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(
			(url) =>
				url.pathname === "/api/uploads" &&
				url.searchParams.get("purpose") === "photo",
			async (route) => {
				await held;
				await route.continue();
			},
		);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		const dialog = page.getByRole("dialog", { name: "Photograph a doodle" });
		await dialog.getByRole("img", { name: "The chosen photo" }).waitFor();
		await dialog.getByText("Uploading the photo").waitFor();
		release();
		await dialog.getByText("Lifting the ink").waitFor();
		expect(
			await dialog.getByRole("img", { name: "The chosen photo" }).isVisible(),
		).toBe(true);
	});

	it("a lift still pending after a minute says so and can be asked again", async () => {
		const page = await openPhoto(harness, member, letterId);
		await page.clock.install({ time: new Date("2026-10-28T00:00:00Z") });
		await page.route("**/api/assets/*/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ status: "pending", error: null }),
			}),
		);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		await page.locator("[data-polling='true']").waitFor();
		await page.clock.fastForward(61_000);
		const dialog = page.getByRole("dialog", { name: "Photograph a doodle" });
		await dialog.getByText("This is taking longer than usual").waitFor();
		const asked = page.waitForRequest(
			(request) =>
				request.method() === "POST" &&
				new URL(request.url()).pathname === "/api/drawings/lifts",
		);
		await dialog.getByRole("button", { name: "Try again" }).click();
		await asked;
		expect(
			await dialog
				.getByRole("button", { name: "Choose another photo" })
				.count(),
		).toBe(0);
	});

	it("Try again ignores the lift it replaced", async () => {
		const page = await openPhoto(harness, member, letterId);
		await page.clock.install({ time: new Date("2026-10-28T00:00:00Z") });
		const lifts: string[] = [];
		page.on("response", async (response) => {
			if (new URL(response.url()).pathname !== "/api/drawings/lifts") return;
			lifts.push(((await response.json()) as { assetId: string }).assetId);
		});
		let firstDone = false;
		let holdFirst = false;
		let releaseFirst: () => void = () => {};
		const firstHeld = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		await page.route("**/api/assets/*/status", async (route) => {
			const first = route.request().url().includes(`/${lifts[0]}/`);
			if (first && holdFirst) await firstHeld;
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					status: first && firstDone ? "done" : "pending",
					error: null,
				}),
			});
		});
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		await page.locator("[data-polling='true']").waitFor();
		await page.clock.fastForward(61_000);
		const dialog = page.getByRole("dialog", { name: "Photograph a doodle" });
		await dialog.getByText("This is taking longer than usual").waitFor();
		holdFirst = true;
		const inFlight = page.waitForRequest((request) =>
			request.url().includes(`/api/assets/${lifts[0]}/status`),
		);
		await page.clock.fastForward(1_000);
		await inFlight;
		let releaseLift: () => void = () => {};
		const liftHeld = new Promise<void>((resolve) => {
			releaseLift = resolve;
		});
		await page.route("**/api/drawings/lifts", async (route) => {
			await liftHeld;
			await route.continue();
		});
		await dialog.getByRole("button", { name: "Try again" }).click();
		firstDone = true;
		const answered = page.waitForResponse((response) =>
			response.url().includes(`/api/assets/${lifts[0]}/status`),
		);
		releaseFirst();
		await answered;
		await page.clock.fastForward(2_000);
		await page.waitForTimeout(300);
		expect(await page.getByLabel("Eraser", { exact: true }).count()).toBe(0);
		expect(await dialog.getByText("Lifting the ink").isVisible()).toBe(true);
		releaseLift();
		await page.waitForFunction(() =>
			document.querySelector("[data-polling='true']"),
		);
		await page.clock.fastForward(2_000);
		await page.waitForTimeout(300);
		expect(lifts).toHaveLength(2);
		expect(await page.getByLabel("Eraser", { exact: true }).count()).toBe(0);
		expect(
			await dialog.getByText("That ink could not be opened.").count(),
		).toBe(0);
		expect(await dialog.getByText("Lifting the ink").isVisible()).toBe(true);
	});

	it("the eraser cursor is the size of the band it erases at every width", async () => {
		for (const viewport of [
			{ width: 1440, height: 900 },
			{ width: 390, height: 844 },
		]) {
			const page = await openPhoto(harness, member, letterId, viewport);
			await fakeLift(page);
			await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
			const eraser = page.getByLabel("Eraser", { exact: true });
			await eraser.waitFor();
			const mismatch = await page
				.locator("[data-mask-editor]")
				.evaluate((frame: HTMLElement, size) => {
					const shown = frame.getBoundingClientRect().width;
					const cursor = getComputedStyle(frame).cursor;
					const svg = decodeURIComponent(
						cursor.slice(cursor.indexOf(",") + 1, cursor.indexOf('")')),
					);
					const width = Number(/width="([\d.]+)"/.exec(svg)?.[1]);
					const band =
						(size * Number(frame.dataset.eraserScale) * shown) /
						Number(frame.dataset.viewWidth);
					return Math.abs(width - 2 - band);
				}, STROKE_OPTIONS.size);
			expect(mismatch).toBeLessThanOrEqual(1);
		}
	});

	it("a photographed doodle is saved and placed on the letter", async () => {
		const page = await openPhoto(harness, member, letterId);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		await page.getByLabel("Eraser", { exact: true }).waitFor();
		await page.getByRole("button", { name: "Save and place" }).click();
		await page.locator(".letter-element").waitFor();
	});

	it("the crop frame sits exactly on the photo at every width", async () => {
		for (const viewport of [
			{ width: 1440, height: 900 },
			{ width: 390, height: 844 },
		]) {
			const page = await openPhoto(harness, member, letterId, viewport);
			await fakeLift(page);
			await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
			const eraser = page.getByLabel("Eraser", { exact: true });
			await eraser.waitFor();
			const frame = await page.locator("[data-mask-editor]").boundingBox();
			const canvas = await eraser.boundingBox();
			const crop = await page.locator("[data-crop-box]").boundingBox();
			const dialog = await page
				.getByRole("dialog", { name: "Photograph a doodle" })
				.boundingBox();
			if (!frame || !canvas || !crop || !dialog) throw new Error("no box");
			expect(frame.width).toBeCloseTo(canvas.width, 0);
			expect(crop.x).toBeCloseTo(canvas.x, 0);
			expect(crop.width).toBeCloseTo(canvas.width, 0);
			expect(canvas.x + canvas.width).toBeLessThanOrEqual(
				dialog.x + dialog.width,
			);
			const handle = await page
				.getByRole("button", { name: "Crop from the top right" })
				.boundingBox();
			expect(handle?.width).toBeGreaterThanOrEqual(32);
		}
	});

	it("dragging a corner from its centre saves only what was framed, trimmed to the ink", async () => {
		const page = await openPhoto(harness, member, letterId);
		await fakeLift(page);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		const eraser = page.getByLabel("Eraser", { exact: true });
		await eraser.waitFor();
		const canvas = await eraser.boundingBox();
		const handle = await page
			.getByRole("button", { name: "Crop from the top right" })
			.boundingBox();
		if (!canvas || !handle) throw new Error("no box");
		const startX = handle.x + handle.width / 2;
		const startY = handle.y + handle.height / 2;
		const cutX = canvas.x + (850 / LIFTED.width) * canvas.width;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(cutX, startY, { steps: 12 });
		await page.mouse.up();
		const maskId = await saveAndCatchMask(page);
		const mask = await readMask(page, maskId);
		expect(mask.runs).toBe(4);
		expect(mask.width).toBeLessThan(LIFTED.width);
		expect(mask.height).toBeLessThan(LIFTED.height);
	});

	it("erasing through the ink clears exactly what was erased", async () => {
		const page = await openPhoto(harness, member, letterId);
		await fakeLift(page);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		const eraser = page.getByLabel("Eraser", { exact: true });
		await eraser.waitFor();
		const box = await eraser.boundingBox();
		if (!box) throw new Error("the eraser has no box");
		const y = box.y + box.height / 2;
		await page.mouse.move(box.x + 12, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width - 12, y, { steps: 16 });
		await page.mouse.up();
		const maskId = await saveAndCatchMask(page);
		const mask = await readMask(page, maskId);
		expect(mask.runs).toBe(LIFTED.lines.length);
		expect(mask.middleColumn.top).toBeGreaterThan(200);
		expect(mask.middleColumn.gap).toBe(0);
		expect(mask.middleColumn.bottom).toBeGreaterThan(200);
	});

	it("closing with a lifted photo asks first", async () => {
		const page = await openPhoto(harness, member, letterId);
		await fakeLift(page);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		await page.getByLabel("Eraser", { exact: true }).waitFor();
		await page.keyboard.press("Escape");
		await page.getByRole("dialog", { name: "Discard this doodle?" }).waitFor();
		await page.getByRole("button", { name: "Keep editing" }).click();
		await page.getByLabel("Eraser", { exact: true }).waitFor();
	});
});

async function openPhoto(
	harness: Harness,
	member: Member,
	letterId: string,
	viewport = { width: 1280, height: 900 },
) {
	const page = await harness.open(member, `/letters/${letterId}`, {
		viewport,
	});
	await letterText(page).waitFor();
	await page.getByRole("button", { name: "Library" }).click();
	await page.getByRole("button", { name: "Photograph" }).click();
	const dialog = page.getByRole("dialog", { name: "Photograph a doodle" });
	await dialog.waitFor();
	await dialog.evaluate((node) =>
		Promise.all(node.getAnimations().map((each) => each.finished)),
	);
	return page;
}

async function fakeLift(page: Page): Promise<void> {
	const png = await page.evaluate(async (lifted) => {
		const canvas = new OffscreenCanvas(lifted.width, lifted.height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("no context");
		context.fillStyle = "#000000";
		for (const x of lifted.lines) {
			context.fillRect(
				x - lifted.lineWidth / 2,
				lifted.top,
				lifted.lineWidth,
				lifted.bottom - lifted.top,
			);
		}
		const blob = await canvas.convertToBlob({ type: "image/png" });
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let text = "";
		for (const byte of bytes) text += String.fromCharCode(byte);
		return btoa(text);
	}, LIFTED);
	let liftId: string | null = null;
	page.on("response", async (response) => {
		if (new URL(response.url()).pathname !== "/api/drawings/lifts") return;
		liftId = ((await response.json()) as { assetId: string }).assetId;
	});
	await page.route("**/api/assets/*/status", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ status: "done", error: null }),
		}),
	);
	await page.route(
		(url) => liftId !== null && url.pathname === `/api/assets/${liftId}`,
		(route) =>
			route.fulfill({
				status: 200,
				contentType: "image/png",
				body: Buffer.from(png, "base64"),
			}),
	);
}

async function saveAndCatchMask(page: Page): Promise<string> {
	const saved = page.waitForResponse(
		(response) =>
			response.request().method() === "POST" &&
			new URL(response.url()).pathname === "/api/uploads" &&
			new URL(response.url()).searchParams.get("purpose") === "mask",
	);
	await page.getByRole("button", { name: "Save and place" }).click();
	return ((await (await saved).json()) as { id: string }).id;
}

async function readMask(page: Page, id: string) {
	return page.evaluate(
		async ({ maskId, erasedBelowTop }) => {
			const response = await fetch(`/api/assets/${maskId}`);
			const bitmap = await createImageBitmap(await response.blob());
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("no context");
			context.drawImage(bitmap, 0, 0);
			const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
			const alpha = (x: number, y: number) =>
				data[(y * bitmap.width + x) * 4 + 3] ?? 0;
			const row = Math.round(bitmap.height / 4);
			let runs = 0;
			let inside = false;
			for (let x = 0; x < bitmap.width; x += 1) {
				const ink = alpha(x, row) > 128;
				if (ink && !inside) runs += 1;
				inside = ink;
			}
			const middle = Math.round(bitmap.width / 2);
			let firstInk = 0;
			while (firstInk < bitmap.height && alpha(middle, firstInk) <= 128) {
				firstInk += 1;
			}
			return {
				width: bitmap.width,
				height: bitmap.height,
				runs,
				middleColumn: {
					top: alpha(middle, Math.round(bitmap.height / 4)),
					gap: alpha(middle, firstInk + erasedBelowTop),
					bottom: alpha(middle, Math.round((bitmap.height * 3) / 4)),
				},
			};
		},
		{ maskId: id, erasedBelowTop: LIFTED.height / 2 - LIFTED.top },
	);
}
