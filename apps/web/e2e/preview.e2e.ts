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
});
