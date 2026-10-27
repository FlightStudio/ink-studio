import { randomUUID } from "node:crypto";
import { createDb, type Db } from "@repo/db";
import { seedDevIdentity } from "@repo/db/testing";
import { LetterService } from "@repo/services/letters";
import { startTestBrowser, type TestBrowsers } from "@repo/testing/browser";
import type { Member } from "@repo/types";
import type { BrowserContext, Page } from "playwright-core";

export const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3000";

export type Harness = {
	browsers: TestBrowsers;
	db: Db;
	letters: LetterService;
	seedIdentity: () => Promise<Member>;
	open: (member: Member, path: string) => Promise<Page>;
	newLetter: (member: Member) => Promise<string>;
	stop: () => Promise<void>;
};

export async function startHarness(): Promise<Harness> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is required for the e2e harness");
	const db = createDb(url);
	const letters = new LetterService(db);
	const browsers = await startTestBrowser({
		chromiumArgs: ["--host-resolver-rules=MAP localhost host.docker.internal"],
	});
	const contexts: BrowserContext[] = [];

	return {
		browsers,
		db,
		letters,
		seedIdentity: () =>
			seedDevIdentity(db, {
				email: `e2e-${randomUUID()}@inkstudio.local`,
				organizationName: "E2E studio",
			}),
		async open(member, path) {
			const context = await browsers.chromium.newContext({
				viewport: { width: 1440, height: 900 },
			});
			contexts.push(context);
			await context.addCookies([
				{ name: "dev_user", value: member.user.email, url: WEB_BASE_URL },
			]);
			const page = await context.newPage();
			await page.goto(`${WEB_BASE_URL}${path}`);
			return page;
		},
		async newLetter(member) {
			const { id } = await letters.createLetter(member, {});
			return id;
		},
		async stop() {
			for (const context of contexts) await context.close();
			await browsers.stop();
			await db.close();
		},
	};
}

export function saveLine(page: Page) {
	return page.getByRole("status");
}

export function letterText(page: Page) {
	return page.locator(".letter-text");
}

export function nextSave(page: Page, letterId: string) {
	return page.waitForResponse(
		(response) =>
			response.request().method() === "PUT" &&
			new URL(response.url()).pathname === `/api/letters/${letterId}`,
	);
}

export async function waitForSaved(page: Page): Promise<void> {
	await page
		.getByRole("status")
		.filter({ hasText: /^Saved$/ })
		.waitFor();
}

export async function typeAndSettle(
	page: Page,
	letterId: string,
	text: string,
): Promise<void> {
	const saved = nextSave(page, letterId);
	await letterText(page).click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type(text);
	await saved;
	await waitForSaved(page);
}
