import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestBrowser } from "@repo/testing/browser";

const route = process.argv[2];
if (!route?.startsWith("/")) {
	throw new Error("Pass a path, for example pnpm screens /styleguide");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const folder = resolve(root, ".local/screens");
const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");

const browsers = await startTestBrowser({
	chromiumArgs: ["--host-resolver-rules=MAP localhost host.docker.internal"],
});

try {
	await mkdir(folder, { recursive: true });
	const desktop = await browsers.chromium.newContext({
		viewport: { width: 1440, height: 900 },
	});
	const desktopPage = await desktop.newPage();
	await desktopPage.goto(`http://localhost:3000${route}`, {
		waitUntil: "domcontentloaded",
	});
	await desktopPage.evaluate(async () => {
		await document.fonts.ready;
	});
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
	const tabletPage = await tablet.newPage();
	await tabletPage.goto(`http://localhost:3000${route}`, {
		waitUntil: "domcontentloaded",
	});
	await tabletPage.evaluate(async () => {
		await document.fonts.ready;
	});
	await tabletPage.screenshot({
		path: resolve(folder, `${name}-ipad.png`),
	});
	await tablet.close();
} finally {
	await browsers.stop();
}
