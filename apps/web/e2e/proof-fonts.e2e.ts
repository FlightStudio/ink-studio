import { readFileSync } from "node:fs";
import type { RequestExportRequest } from "@repo/api";
import { generatedAsset } from "@repo/services/assets";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	startHarness,
	WEB_BASE_URL,
} from "./harness.ts";

let harness: Harness;

beforeAll(async () => {
	harness = await startHarness();
});

afterAll(async () => {
	await harness?.stop();
});

it("export submits the displayed font asset when the server already has a newer build", async () => {
	const member = await harness.seedIdentity();
	const organizationId = member.userOrganization.organizationId;
	const font = await harness.db.fonts.create({
		organizationId,
		ownerUserId: member.user.id,
		ownerName: "Ada",
		source: { kind: "drawn", glyphs: [] },
		fontAssetId: null,
		pendingFontAssetId: null,
		chars: "abcdefghijklmnopqrstuvwxyz",
	});
	async function completeBuild() {
		const asset = await harness.db.assets.create({
			...generatedAsset(organizationId, {
				kind: "build-font",
				fontId: font.id,
			}),
			processing: { status: "done", attempts: 1 },
			mimeType: "font/ttf",
			byteSize: 12,
			checksum: "a".repeat(64),
		});
		await harness.db.fonts.setPending(organizationId, font.id, asset.id);
		await harness.db.fonts.finishBuild(
			organizationId,
			font.id,
			asset.id,
			font.chars,
		);
		return asset.id;
	}
	const displayed = await completeBuild();
	const { id } = await harness.letters.createLetter(member, {
		fontId: font.id,
	});
	const page = await harness.open(member, "/letters");
	await page.route(`**/api/assets/${displayed}`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "font/ttf",
			body: readFileSync(
				new URL(
					"../../../packages/render/fonts/PatrickHand-Regular.ttf",
					import.meta.url,
				),
			),
		}),
	);
	const requests: RequestExportRequest[] = [];
	await page.route("**/api/letters/*/exports", (route) => {
		requests.push(route.request().postDataJSON() as RequestExportRequest);
		return route.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({ assetIds: [crypto.randomUUID()] }),
		});
	});
	await page.route("**/api/assets/*/status", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ status: "done", error: null }),
		}),
	);
	await page.goto(`${WEB_BASE_URL}/letters/${id}`);
	await letterText(page).waitFor();
	await page.evaluate(() => document.fonts.ready);
	expect(
		(await page.locator(".letter-page style").allTextContents()).join("\n"),
	).toContain(displayed);
	const newer = await completeBuild();
	expect(newer).not.toBe(displayed);
	await page.getByRole("button", { name: "Export proof" }).click();
	await page.getByRole("link", { name: "Open the proof" }).waitFor();
	expect(requests).toEqual([{ revision: 1, fonts: { [font.id]: displayed } }]);
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Export proof" }).click();
	await page.getByRole("link", { name: "Open the proof" }).waitFor();
	expect(requests).toHaveLength(1);
});

it("interrupted and denied proof checks recover on the same processing job", async () => {
	const member = await harness.seedIdentity();
	const id = await harness.newLetter(member);
	const page = await harness.open(member, `/letters/${id}`);
	await letterText(page).waitFor();
	let exports = 0;
	let reads = 0;
	let reading: "offline" | "running" | "denied" | "done" = "offline";
	const assetId = crypto.randomUUID();
	await page.route("**/api/letters/*/exports", (route) => {
		exports += 1;
		return route.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({ assetIds: [assetId] }),
		});
	});
	await page.route("**/api/assets/*/status", (route) => {
		reads += 1;
		if (reading === "offline") return route.abort("failed");
		return route.fulfill({
			status: reading === "denied" ? 403 : 200,
			contentType: "application/json",
			body: JSON.stringify(
				reading === "denied"
					? { code: "forbidden", message: "Forbidden" }
					: { status: reading, error: null },
			),
		});
	});
	await page.getByRole("button", { name: "Export proof" }).click();
	const interrupted = page.getByText(
		"Connection interrupted. Checking progress again…",
	);
	await interrupted.waitFor();
	expect(await page.getByText("Making the proof").isVisible()).toBe(true);
	expect(await page.getByRole("button", { name: "Try again" }).count()).toBe(0);
	reading = "running";
	await interrupted.waitFor({ state: "hidden" });
	reading = "denied";
	await page.getByText("You no longer have access to this item.").waitFor();
	const stoppedAt = reads;
	await page.waitForTimeout(3200);
	expect(reads).toBe(stoppedAt);
	reading = "running";
	await page.getByRole("button", { name: "Check again" }).click();
	await page
		.getByText("You no longer have access to this item.")
		.waitFor({ state: "hidden" });
	reading = "done";
	await page.getByRole("link", { name: "Open the proof" }).waitFor();
	expect(exports).toBe(1);
});
