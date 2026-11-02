import { randomUUID } from "node:crypto";
import {
	fixtureContent,
	LETTER_FIXTURES,
	type LetterFixtureName,
	letterFixture,
	measureInputFor,
	measureLetter,
} from "@repo/render/html";
import { DEFAULT_FORMAT, type Member, PAGE_SPECS } from "@repo/types";
import type { Locator, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, letterText, startHarness } from "./harness.ts";

const LETTERS = LETTER_FIXTURES.filter(
	(fixture) => fixture.format === DEFAULT_FORMAT,
).map((fixture) => fixture.name);

function lineDelta(
	left: readonly number[],
	right: readonly number[],
): string | null {
	if (left.length !== right.length) {
		return `${left.length} editor lines, ${right.length} preview lines`;
	}
	let worst = 0;
	let at = 0;
	for (const [index, top] of left.entries()) {
		const delta = Math.abs(top - (right[index] ?? top));
		if (delta > worst) {
			worst = delta;
			at = index;
		}
	}
	if (worst <= 0.01) return null;
	return `worst ${worst.toFixed(4)}in at line ${at}: editor ${left[at]} preview ${right[at]}`;
}

async function openFixture(
	harness: Harness,
	member: Member,
	name: LetterFixtureName,
): Promise<Page> {
	const fixture = letterFixture(name);
	const letterId = await harness.newLetter(member);
	await harness.letters.saveLetter(member, letterId, {
		title: fixture.name,
		content: fixtureContent(fixture),
		expectedRevision: 1,
	});
	const page = await harness.open(member, `/letters/${letterId}`);
	await letterText(page).waitFor();
	await page.evaluate(() => document.fonts.ready);
	return page;
}

async function settle(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise((done) => setTimeout(done, 50));
		const running = document
			.getAnimations()
			.filter(
				(animation) =>
					animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
			);
		await Promise.all(running.map((animation) => animation.finished));
	});
}

async function lineTops(column: Locator, mode: "edit" | "print") {
	const spec = PAGE_SPECS[DEFAULT_FORMAT];
	return column.evaluate(measureLetter, measureInputFor(spec, mode));
}

describe("the print preview", () => {
	let harness: Harness;
	let member: Member;

	beforeAll(async () => {
		harness = await startHarness();
		member = await harness.seedIdentity();
	}, 240_000);

	afterAll(async () => {
		await harness?.stop();
	});

	it("the preview breaks lines where the editor does", async () => {
		expect(LETTERS).toHaveLength(6);
		for (const name of LETTERS) {
			const page = await openFixture(harness, member, name);
			await settle(page);
			const editor = await lineTops(page.locator(".letter-column"), "edit");
			await page.getByRole("button", { name: "Print preview" }).click();
			const frame = page.frameLocator('iframe[title="Print preview"]');
			const previewColumn = frame.locator(".letter-column");
			await previewColumn.waitFor();
			await frame.locator(".letter-text").evaluate(async () => {
				await document.fonts.ready;
			});
			const preview = await lineTops(previewColumn, "print");
			expect(lineDelta(editor.lineTopsIn, preview.lineTopsIn), name).toBeNull();
		}
	}, 180_000);

	it("the preview is a dialog: Escape closes it and focus goes back", async () => {
		const page = await openFixture(harness, member, "note");
		const open = page.getByRole("button", { name: "Print preview" });
		await open.click();
		const dialog = page.getByRole("dialog", { name: "Print preview" });
		await dialog.waitFor();
		expect(
			await dialog.evaluate((node) => node.contains(document.activeElement)),
		).toBe(true);
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "hidden" });
		await expect
			.poll(() => open.evaluate((node) => document.activeElement === node))
			.toBe(true);
	});

	it("the preview shows only the sides in use, each with its edge", async () => {
		const page = await openFixture(harness, member, "note");
		await page.getByRole("button", { name: "Print preview" }).click();
		const frame = page.frameLocator('iframe[title="Print preview"]');
		await frame.locator(".letter-page").waitFor();
		expect(await frame.locator(".letter-sheet").count()).toBe(
			Number(await page.locator("[data-sides]").getAttribute("data-sides")),
		);
		const sheet = page.locator("[data-preview-sheet]").first();
		const box = await sheet.boundingBox();
		const shadow = await sheet.evaluate(
			(node) => getComputedStyle(node).boxShadow,
		);
		expect(shadow).not.toBe("none");
		const spec = PAGE_SPECS[DEFAULT_FORMAT];
		expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(
			spec.widthIn / spec.heightIn,
			2,
		);
		expect(await page.locator("[data-preview-sheet]").count()).toBe(
			await frame.locator(".letter-sheet").count(),
		);
	});

	it("the preview has no desk and no guides", async () => {
		const page = await openFixture(harness, member, "note");
		await expect
			.poll(async () => page.locator("[data-keep-clear]").count())
			.toBe(PAGE_SPECS[DEFAULT_FORMAT].keepClear.length);
		await page.getByRole("button", { name: "Print preview" }).click();
		const frame = page.frameLocator('iframe[title="Print preview"]');
		await frame.locator(".letter-page").waitFor();
		expect(await frame.locator("[data-keep-clear]").count()).toBe(0);
		expect(await frame.locator(".studio").count()).toBe(0);
		const sheet = await frame
			.locator(".letter-sheet")
			.first()
			.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					image: style.backgroundImage,
					mode: element.closest(".letter-page")?.getAttribute("data-mode"),
				};
			});
		expect(sheet.mode).toBe("print");
		expect(sheet.image).toBe("none");
		const markup = await frame.locator("body").innerHTML();
		expect(markup.includes("paper.png")).toBe(false);
		expect(markup.includes("data-keep-clear")).toBe(false);
	});

	it("a proof still being made after a minute says so, and Try again asks again", async () => {
		const page = await openFixture(harness, member, "note");
		await page.clock.install();
		let exports = 0;
		await page.route("**/api/letters/*/exports", (route) => {
			exports += 1;
			return route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ assetIds: [randomUUID()] }),
			});
		});
		await page.route("**/api/assets/*/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ status: "running", error: null }),
			}),
		);
		const polled = page.waitForRequest((request) =>
			request.url().includes("/status"),
		);
		await page.getByRole("button", { name: "Export proof" }).click();
		await page.getByText("Making the proof").waitFor();
		await polled;
		await page
			.getByText("Usually under a minute. You can keep writing.")
			.waitFor();
		expect(
			await page.getByText("This is taking longer than usual.").count(),
		).toBe(0);
		await page.clock.fastForward(61_000);
		await page.getByText("This is taking longer than usual.").waitFor();
		await page.getByRole("button", { name: "Try again" }).click();
		await expect.poll(() => exports).toBe(2);
		await page
			.getByText("Usually under a minute. You can keep writing.")
			.waitFor();
	});

	it("once one proof fails, the other proofs stop being asked about", async () => {
		const page = await openFixture(harness, member, "note");
		await page.clock.install();
		const failing = randomUUID();
		const waiting = randomUUID();
		await page.route("**/api/letters/*/exports", (route) =>
			route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({ assetIds: [failing, waiting] }),
			}),
		);
		let asked = 0;
		await page.route("**/api/assets/*/status", (route) => {
			const failed = route.request().url().includes(failing);
			if (!failed) asked += 1;
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(
					failed
						? { status: "failed", error: "processing_failed" }
						: { status: "running", error: null },
				),
			});
		});
		await page.getByRole("button", { name: "Export proof" }).click();
		await page.getByRole("button", { name: "Try again" }).waitFor();
		const wait = async () => {
			for (let step = 0; step < 3; step += 1) {
				await page.clock.fastForward(4000);
				await page.waitForTimeout(150);
			}
		};
		await wait();
		const before = asked;
		await wait();
		expect(asked).toBe(before);
	});
});
