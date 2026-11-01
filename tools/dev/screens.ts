import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestBrowser } from "@repo/testing/browser";
import type { BrowserContext, Page } from "playwright-core";

const route = process.argv[2];
if (!route?.startsWith("/")) {
	throw new Error("Pass a path, for example pnpm screens /styleguide");
}

const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const devUser = process.env.SCREENS_DEV_USER;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const folder = resolve(root, ".local/screens");
const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");

async function signIn(context: BrowserContext): Promise<void> {
	if (!devUser) return;
	await context.addCookies([
		{ name: "dev_user", value: devUser, url: baseUrl },
	]);
}

async function settle(page: Page): Promise<void> {
	await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise((done) => setTimeout(done, 100));
		const finite = document
			.getAnimations()
			.filter(
				(animation) => animation.effect?.getTiming().iterations !== Infinity,
			);
		await Promise.all(finite.map((animation) => animation.finished));
	});
}

const browsers = await startTestBrowser({
	chromiumArgs: ["--host-resolver-rules=MAP localhost host.docker.internal"],
});

try {
	await mkdir(folder, { recursive: true });
	const desktop = await browsers.chromium.newContext({
		viewport: { width: 1440, height: 900 },
	});
	await signIn(desktop);
	const desktopPage = await desktop.newPage();
	await settle(desktopPage);
	await desktopPage.screenshot({
		path: resolve(folder, `${name}-1440x900.png`),
	});
	await desktop.close();

	const tablet = await browsers.chromium.newContext({
		viewport: { width: 1024, height: 1366 },
		deviceScaleFactor: 2,
		hasTouch: true,
		isMobile: true,
	});
	await signIn(tablet);
	const tabletPage = await tablet.newPage();
	await settle(tabletPage);
	await tabletPage.screenshot({
		path: resolve(folder, `${name}-ipad.png`),
	});
	await tablet.close();
} finally {
	await browsers.stop();
}
