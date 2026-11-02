import { createRequire } from "node:module";
import { type Browser, chromium, webkit } from "playwright-core";
import { GenericContainer, Wait } from "testcontainers";

const require = createRequire(import.meta.url);
const playwrightVersion = (
	require("playwright-core/package.json") as { version: string }
).version;

export type StartTestBrowserParams = { chromiumArgs?: string[] };

export type TestBrowsers = {
	wsEndpoint: string;
	chromium: Browser;
	webkit: Browser;
	stop: () => Promise<void>;
};

export async function startTestBrowser(
	params?: StartTestBrowserParams,
): Promise<TestBrowsers> {
	const container = await new GenericContainer(
		`mcr.microsoft.com/playwright:v${playwrightVersion}-noble`,
	)
		.withCommand([
			"npx",
			"-y",
			`playwright@${playwrightVersion}`,
			"run-server",
			"--port",
			"3000",
			"--host",
			"0.0.0.0",
			"--unsafe",
		])
		.withExposedPorts(3000)
		.withExtraHosts([
			{ host: "host.docker.internal", ipAddress: "host-gateway" },
		])
		.withStartupTimeout(180_000)
		.withWaitStrategy(Wait.forListeningPorts())
		.start();

	const wsEndpoint = `ws://${container.getHost()}:${container.getMappedPort(3000)}/`;
	const chromiumHeaders = params?.chromiumArgs
		? {
				"x-playwright-launch-options": JSON.stringify({
					args: params.chromiumArgs,
				}),
			}
		: undefined;
	const chromiumBrowser = await chromium.connect(wsEndpoint, {
		headers: chromiumHeaders,
	});
	const webkitBrowser = await webkit.connect(wsEndpoint);
	return {
		wsEndpoint,
		chromium: chromiumBrowser,
		webkit: webkitBrowser,
		async stop() {
			await chromiumBrowser.close();
			await webkitBrowser.close();
			await container.stop();
		},
	};
}
