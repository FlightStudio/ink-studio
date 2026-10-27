import type {
	LetterMeasure,
	MeasureParams,
	PrintRenderer,
	PrintResource,
	RenderParams,
} from "@repo/services/letters";
import { type Browser, chromium, type Page } from "playwright-core";

const LETTER_ORIGIN = "https://letter.invalid/";
const PRINT_DPI = 300;
const CSS_DPI = 96;
const DEVICE_SCALE_FACTOR = PRINT_DPI / CSS_DPI;

type Sheet = RenderParams["sheet"];

function sideUrl(side: number): string {
	return `${LETTER_ORIGIN}print/side-${side}.png`;
}

function printHtml(sheet: Sheet, sides: number, pages: number): string {
	const size = `${sheet.widthIn}in ${sheet.heightIn}in`;
	const style = `@page { size: ${size}; margin: 0 } html, body { margin: 0; padding: 0; background: white } .side { display: block; width: ${sheet.widthIn}in; height: ${sheet.heightIn}in; overflow: hidden; break-after: page } .side:last-child { break-after: auto }`;
	const body = Array.from({ length: pages }, (_, side) =>
		side < sides
			? `<img class="side" src="${sideUrl(side)}" alt="">`
			: `<div class="side"></div>`,
	).join("");
	return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
}

export class PlaywrightPrintRenderer implements PrintRenderer {
	private constructor(private readonly browser: Browser) {}

	static async connect(params: {
		wsEndpoint: string;
	}): Promise<PlaywrightPrintRenderer> {
		return new PlaywrightPrintRenderer(
			await chromium.connect(params.wsEndpoint),
		);
	}

	static async launch(): Promise<PlaywrightPrintRenderer> {
		return new PlaywrightPrintRenderer(await chromium.launch());
	}

	async close(): Promise<void> {
		await this.browser.close();
	}

	async measure(params: MeasureParams): Promise<LetterMeasure> {
		return this.withPage(params.resources, (page) => this.load(page, params));
	}

	async render(params: RenderParams): Promise<Uint8Array> {
		return this.withPage(params.resources, async (page, serve) => {
			const measure = await this.load(page, params);
			if (params.output.format === "png") {
				return this.screenshotSide(page, params.sheet, params.output.side);
			}
			const sides = params.sides(measure);
			const pictures = new Map<string, PrintResource>();
			for (let side = 0; side < sides; side += 1) {
				pictures.set(sideUrl(side), {
					bytes: await this.screenshotSide(page, params.sheet, side),
					contentType: "image/png",
				});
			}
			const pages = params.output.duplex && sides % 2 === 1 ? sides + 1 : sides;
			serve(pictures);
			await page.setContent(printHtml(params.sheet, sides, pages), {
				waitUntil: "load",
			});
			return new Uint8Array(
				await page.pdf({ preferCSSPageSize: true, printBackground: true }),
			);
		});
	}

	private async withPage<T>(
		resources: ReadonlyMap<string, PrintResource>,
		run: (
			page: Page,
			serve: (next: ReadonlyMap<string, PrintResource>) => void,
		) => Promise<T>,
	): Promise<T> {
		const context = await this.browser.newContext({
			javaScriptEnabled: false,
			deviceScaleFactor: DEVICE_SCALE_FACTOR,
		});
		let served = resources;
		try {
			await context.route("**/*", async (route) => {
				const resource = served.get(route.request().url());
				if (!resource) {
					await route.abort("blockedbyclient");
					return;
				}
				await route.fulfill({
					status: 200,
					contentType: resource.contentType,
					headers: { "Access-Control-Allow-Origin": "*" },
					body: Buffer.from(resource.bytes),
				});
			});
			const page = await context.newPage();
			return await run(page, (next) => {
				served = next;
			});
		} finally {
			await context.close();
		}
	}

	private async load(
		page: Page,
		params: MeasureParams,
	): Promise<LetterMeasure> {
		await page.setContent(params.html, { waitUntil: "load" });
		await page.evaluate(() => document.fonts.ready.then(() => undefined));
		const column = page.locator(".letter-column");
		const count = await column.count();
		if (count !== 1) {
			throw new Error(
				`The print HTML has ${count} .letter-column elements instead of one.`,
			);
		}
		return column.evaluate(params.measure, params.input);
	}

	private async screenshotSide(
		page: Page,
		sheet: Sheet,
		side: number,
	): Promise<Uint8Array> {
		const width = Math.round(sheet.widthIn * PRINT_DPI);
		const height = Math.round(sheet.heightIn * PRINT_DPI);
		const css = (devicePx: number) => devicePx / DEVICE_SCALE_FACTOR;
		const reach = `body::after { content: ""; position: absolute; left: ${css(width) + 1}px; top: ${css((side + 1) * height) + 1}px; width: 1px; height: 1px }`;
		return new Uint8Array(
			await page.screenshot({
				type: "png",
				fullPage: true,
				animations: "disabled",
				caret: "hide",
				style: reach,
				clip: {
					x: 0,
					y: css(side * height),
					width: css(width),
					height: css(height),
				},
			}),
		);
	}
}
