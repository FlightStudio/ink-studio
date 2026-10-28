import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Member } from "@repo/types";
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

	it("a lift that takes too long says so", async () => {
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
		await page.clock.fastForward(125_000);
		const dialog = page.getByRole("dialog", { name: "Photograph a doodle" });
		await dialog.getByText("This is taking longer than usual").waitFor();
		expect(
			await dialog.getByRole("button", { name: "Try again" }).isVisible(),
		).toBe(true);
	});

	it("a photographed doodle becomes a library drawing", async () => {
		const page = await openPhoto(harness, member, letterId);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		await page.getByLabel("Eraser", { exact: true }).waitFor();
		await page.getByRole("button", { name: "Save doodle" }).click();
		await page.getByRole("button", { name: "Doodle", exact: true }).waitFor();
	});

	it("erasing through the ink clears exactly what was erased", async () => {
		const page = await openPhoto(harness, member, letterId);
		await page.getByLabel("Choose a photo").setInputFiles(PHOTO);
		const eraser = page.getByLabel("Eraser", { exact: true });
		await eraser.waitFor();
		const editor = page.locator("[data-mask-editor]");
		const imageWidth = Number(await editor.getAttribute("data-image-width"));
		const imageHeight = Number(await editor.getAttribute("data-image-height"));
		const box = await eraser.boundingBox();
		if (!box) throw new Error("the eraser has no box");
		const y = box.y + box.height / 2;
		await page.mouse.move(box.x + 12, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width - 12, y, { steps: 16 });
		await page.mouse.up();
		const away = Math.round(0.3 * 96 * (imageHeight / box.height));
		const saved = page.waitForResponse(
			(response) =>
				response.request().method() === "POST" &&
				new URL(response.url()).pathname === "/api/uploads" &&
				new URL(response.url()).searchParams.get("purpose") === "mask",
		);
		await page.getByRole("button", { name: "Save doodle" }).click();
		const maskId = (await (await saved).json()).id as string;
		const alphas = await page.evaluate(
			async ({ id, offset }) => {
				const response = await fetch(`/api/assets/${id}`);
				const bitmap = await createImageBitmap(await response.blob());
				const canvas = document.createElement("canvas");
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("no context");
				context.drawImage(bitmap, 0, 0);
				const data = context.getImageData(
					0,
					0,
					bitmap.width,
					bitmap.height,
				).data;
				const alpha = (x: number, y: number) =>
					data[(y * bitmap.width + x) * 4 + 3] ?? 0;
				const x = Math.round(bitmap.width / 2);
				const mid = Math.round(bitmap.height / 2);
				return {
					width: bitmap.width,
					height: bitmap.height,
					erased: alpha(x, mid),
					kept: alpha(x, Math.max(0, mid - offset)),
				};
			},
			{ id: maskId, offset: away },
		);
		expect(alphas.width).toBe(imageWidth);
		expect(alphas.height).toBe(imageHeight);
		expect(alphas.erased).toBe(0);
		expect(alphas.kept).toBeGreaterThan(200);
	});
});

async function openPhoto(harness: Harness, member: Member, letterId: string) {
	const page = await harness.open(member, `/letters/${letterId}`, {
		viewport: { width: 1280, height: 900 },
	});
	await letterText(page).waitFor();
	await page.getByRole("button", { name: "Library" }).click();
	await page.getByRole("button", { name: "Photograph" }).click();
	await page.getByRole("dialog", { name: "Photograph a doodle" }).waitFor();
	return page;
}
