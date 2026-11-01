import type { LetterContent, Member } from "@repo/types";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	type Harness,
	letterText,
	startHarness,
	waitForSaved,
} from "./harness.ts";

type SaveBody = {
	title: string;
	content: LetterContent;
	expectedRevision: number;
};

function signal() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("letter save recovery", () => {
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

	it("drains newer edits after internal navigation and restores them on Back", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		const started = signal();
		const release = signal();
		const sent: SaveBody[] = [];
		await page.route(`**/api/letters/${letterId}`, async (route) => {
			if (route.request().method() === "PUT") {
				sent.push(route.request().postDataJSON() as SaveBody);
				if (sent.length === 1) {
					started.resolve();
					await release.promise;
				}
			}
			await route.continue();
		});
		try {
			await letterText(page).click();
			await page.keyboard.type("First request.");
			await started.promise;
			await page.keyboard.type(" Newer words.");
			await page
				.getByRole("navigation", { name: "Studio" })
				.getByRole("link", { name: "Handwriting" })
				.click();
			await page.waitForURL(/\/fonts$/);
			await page
				.getByRole("complementary", { name: "Unsaved letters" })
				.waitFor();
			release.resolve();
			await expect
				.poll(
					async () =>
						(await harness.letters.getLetter(member, letterId))?.revision,
					{ timeout: 10_000 },
				)
				.toBe(3);
			const stored = await harness.letters.getLetter(member, letterId);
			expect(JSON.stringify(stored?.content.doc)).toContain(
				"First request. Newer words.",
			);
			expect(sent.map((body) => body.expectedRevision)).toEqual([1, 2]);
			await page
				.getByRole("complementary", { name: "Unsaved letters" })
				.waitFor({ state: "detached" });
			await page.goBack();
			await page.waitForURL(new RegExp(`/letters/${letterId}$`));
			await letterText(page)
				.filter({ hasText: "First request. Newer words." })
				.waitFor();
			await waitForSaved(page);
		} finally {
			release.resolve();
		}
	});

	it("reconciles a committed PUT whose reply is lost before sending newer edits", async () => {
		const page = await harness.open(member, `/letters/${letterId}`);
		const committed = signal();
		const release = signal();
		const sent: SaveBody[] = [];
		await page.route(`**/api/letters/${letterId}`, async (route) => {
			if (route.request().method() === "PUT") {
				sent.push(route.request().postDataJSON() as SaveBody);
				if (sent.length === 1) {
					const response = await route.fetch();
					expect(response.status()).toBe(200);
					expect(await response.json()).toMatchObject({ revision: 2 });
					await response.dispose();
					committed.resolve();
					await release.promise;
					await route.abort("failed");
					return;
				}
			}
			await route.continue();
		});
		try {
			await letterText(page).click();
			await page.keyboard.type("Committed first.");
			await committed.promise;
			await page.keyboard.type(" Still pending.");
			release.resolve();
			await waitForSaved(page);
			const stored = await harness.letters.getLetter(member, letterId);
			expect(stored?.revision).toBe(3);
			expect(JSON.stringify(stored?.content.doc)).toContain(
				"Committed first. Still pending.",
			);
			expect(sent.map((body) => body.expectedRevision)).toEqual([1, 2]);
			expect(
				await page.getByRole("button", { name: "Keep mine" }).count(),
			).toBe(0);
		} finally {
			release.resolve();
		}
	});

	it("owns conflict actions, preserves typing during a load, and resets a recovered editor at the same route revision", async () => {
		const font = await harness.db.fonts.create({
			organizationId: member.userOrganization.organizationId,
			ownerUserId: member.user.id,
			ownerName: "Recovery",
			source: { kind: "drawn", glyphs: [] },
			fontAssetId: null,
			pendingFontAssetId: null,
			chars: "",
		});
		const page = await harness.open(member, `/letters/${letterId}`);
		const started = signal();
		const releaseSave = signal();
		const reading = signal();
		const releaseRead = signal();
		let writes = 0;
		let holdRead = false;
		await page.route(`**/api/letters/${letterId}`, async (route) => {
			if (route.request().method() === "PUT" && ++writes === 1) {
				started.resolve();
				await releaseSave.promise;
			} else if (route.request().method() === "GET" && holdRead) {
				holdRead = false;
				reading.resolve();
				await releaseRead.promise;
			}
			await route.continue();
		});
		try {
			await letterText(page).click();
			await page.keyboard.type("Local pending.");
			await started.promise;
			const stored = await harness.letters.getLetter(member, letterId);
			if (!stored) throw new Error("the letter is not stored");
			await harness.letters.saveLetter(member, letterId, {
				title: "Remote title",
				content: {
					...stored.content,
					doc: {
						...stored.content.doc,
						content: [
							{
								type: "paragraph",
								attrs: { align: "left" },
								content: [{ type: "text", text: "Remote branch." }],
							},
						],
					},
				},
				expectedRevision: 1,
			});
			await page.getByRole("combobox", { name: "Font" }).click();
			await page
				.getByRole("option", { name: /Recovery's handwriting/ })
				.click();
			await page.waitForURL((url) => url.pathname === `/fonts/${font.id}/draw`);
			await page.getByRole("link", { name: "Back to your letter" }).click();
			await page.waitForURL(
				(url) =>
					url.pathname === `/letters/${letterId}` &&
					url.searchParams.get("font") === font.id,
			);
			await letterText(page).filter({ hasText: "Local pending." }).waitFor();
			await expect
				.poll(() => page.title(), { timeout: 10_000 })
				.toBe("Remote title · Ink Studio");
			releaseSave.resolve();
			await page
				.getByText("A different version of this letter is saved")
				.waitFor();
			const load = page.getByRole("button", { name: "Load the latest" });
			const keep = page.getByRole("button", { name: "Keep mine" });
			holdRead = true;
			await load.click();
			await reading.promise;
			expect(await load.isDisabled()).toBe(true);
			expect(await keep.isDisabled()).toBe(true);
			await letterText(page).click();
			await page.keyboard.press("Control+End");
			await page.keyboard.type(" Typed during load.");
			releaseRead.resolve();
			await page
				.getByText(
					"Your new changes are still here. Choose again when you are ready.",
				)
				.waitFor();
			expect(await letterText(page).textContent()).toBe(
				"Local pending. Typed during load.",
			);
			expect(await load.isEnabled()).toBe(true);
			expect(await keep.isEnabled()).toBe(true);
			await load.click();
			await letterText(page).filter({ hasText: "Remote branch." }).waitFor();
			await waitForSaved(page);
			expect(await letterText(page).textContent()).toBe("Remote branch.");
			expect(
				await page.getByRole("textbox", { name: "Title" }).inputValue(),
			).toBe("Remote title");
			expect(writes).toBe(1);
			expect(
				(await harness.letters.getLetter(member, letterId))?.revision,
			).toBe(2);
		} finally {
			releaseSave.resolve();
			releaseRead.resolve();
		}
	});
});
