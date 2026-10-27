import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { inflateSync } from "node:zlib";
import type {
	LetterMeasure,
	MeasureInput,
	MeasureParams,
	PrintResource,
} from "@repo/services/letters";
import { startTestBrowser, type TestBrowsers } from "@repo/testing/browser";
import sharp from "sharp";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PlaywrightPrintRenderer } from "./playwright-print-renderer.ts";

type Sheet = { widthIn: number; heightIn: number };
type PdfImage = { width: number; height: number; data: Buffer };
type PdfPage = { mediaBox: string; images: PdfImage[] };

const letterSheet: Sheet = { widthIn: 8.5, heightIn: 11 };
const postcardSheet: Sheet = { widthIn: 2738 / 300, heightIn: 1838 / 300 };
const input: MeasureInput = {
	heightIn: 11,
	marginIn: 0.75,
	gapIn: 0,
	limitIn: 9.5,
};
const sideColours = [
	[30, 30, 30],
	[20, 60, 200],
	[200, 40, 40],
];
const fontUrl = "https://letter.invalid/fonts/square-a.ttf";
const noResources: ReadonlyMap<string, PrintResource> = new Map();

let browsers: TestBrowsers;
let renderer: PlaywrightPrintRenderer;
let fontResources: ReadonlyMap<string, PrintResource>;
let server: Server;
let serverHits = 0;
let serverPort = 0;

function measureBlocks(root: HTMLElement): LetterMeasure {
	return {
		lineTopsIn: [],
		textBottomIn: root.offsetHeight / 96,
		wordsPastLimit: 0,
	};
}

function sidesOf(measure: LetterMeasure): number {
	return Math.ceil(measure.textBottomIn / letterSheet.heightIn - 0.001);
}

function blocksHtml(params: {
	sheet: Sheet;
	sides: number;
	coloured?: boolean;
	inside?: string;
	style?: string;
}): string {
	const blocks = Array.from({ length: params.sides }, (_, side) => {
		const colour = sideColours[side % sideColours.length] ?? [0, 0, 0];
		const fill = params.coloured === false ? "" : `rgb(${colour.join(", ")})`;
		return `<div class="block" style="background: ${fill}">${side === 0 ? (params.inside ?? "") : ""}</div>`;
	}).join("");
	const style = `html, body { margin: 0; padding: 0; background: white } .block { position: relative; width: ${params.sheet.widthIn}in; height: ${params.sheet.heightIn}in } ${params.style ?? ""}`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body><main class="letter-sheet"><div class="letter-column">${blocks}</div></main></body></html>`;
}

const fontFace = `@font-face { font-family: square-a; src: url(${fontUrl}) } .square { position: absolute; left: 0; top: 0; font: 96px/1 square-a, serif; color: black }`;
const squareText = `<div class="square">a</div>`;

function pdfPages(pdf: Uint8Array): PdfPage[] {
	const text = Buffer.from(pdf).toString("latin1");
	const objects = new Map<string, { dict: string; stream: Buffer | null }>();
	for (const match of text.matchAll(/(\d+) 0 obj\b([\s\S]*?)\bendobj/g)) {
		const body = match[2] ?? "";
		const start = body.search(/\bstream\r?\n/);
		if (start < 0) {
			objects.set(match[1] ?? "", { dict: body, stream: null });
			continue;
		}
		const dataStart = body.indexOf("\n", start) + 1;
		const raw = body
			.slice(dataStart, body.lastIndexOf("endstream"))
			.replace(/\r?\n$/, "");
		objects.set(match[1] ?? "", {
			dict: body.slice(0, start),
			stream: Buffer.from(raw, "latin1"),
		});
	}
	const refs = (dict: string) =>
		[
			...dict.replace(/\/(Parent|SMask)\s+\d+ 0 R/g, "").matchAll(/(\d+) 0 R/g),
		].map((match) => match[1] ?? "");
	const root = [...objects.values()].find((object) =>
		/\/Type\s*\/Pages\b/.test(object.dict),
	);
	const kids = /\/Kids\s*\[([^\]]*)\]/.exec(root?.dict ?? "")?.[1] ?? "";
	return refs(kids).map((id) => {
		const page = objects.get(id)?.dict ?? "";
		const images: PdfImage[] = [];
		const seen = new Set<string>([id]);
		const queue = refs(page);
		while (queue.length > 0) {
			const next = queue.shift() ?? "";
			if (seen.has(next)) continue;
			seen.add(next);
			const object = objects.get(next);
			if (!object) continue;
			if (/\/Subtype\s*\/Image\b/.test(object.dict) && object.stream) {
				images.push({
					width: Number(/\/Width\s+(\d+)/.exec(object.dict)?.[1]),
					height: Number(/\/Height\s+(\d+)/.exec(object.dict)?.[1]),
					data: /\/FlateDecode\b/.test(object.dict)
						? inflateSync(object.stream)
						: object.stream,
				});
			}
			queue.push(...refs(object.dict));
		}
		return {
			mediaBox: /\/MediaBox\s*\[([^\]]*)\]/.exec(page)?.[1]?.trim() ?? "",
			images,
		};
	});
}

async function pixel(png: Uint8Array, x: number, y: number): Promise<number[]> {
	const data = await sharp(png)
		.extract({ left: x, top: y, width: 1, height: 1 })
		.removeAlpha()
		.raw()
		.toBuffer();
	return [...data];
}

async function regionMean(
	png: Uint8Array,
	region: { left: number; top: number; width: number; height: number },
): Promise<number> {
	const data = await sharp(png).extract(region).removeAlpha().raw().toBuffer();
	return data.reduce((sum, value) => sum + value, 0) / data.length;
}

beforeAll(async () => {
	const black = await sharp({
		create: { width: 8, height: 8, channels: 3, background: "black" },
	})
		.png()
		.toBuffer();
	server = createServer((_request, response) => {
		serverHits += 1;
		response.writeHead(200, {
			"Content-Type": "image/png",
			"Access-Control-Allow-Origin": "*",
		});
		response.end(black);
	});
	await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
	serverPort = (server.address() as AddressInfo).port;
	const font = await readFile(
		new URL("./fixtures/square-a.ttf", import.meta.url),
	);
	fontResources = new Map([
		[fontUrl, { bytes: new Uint8Array(font), contentType: "font/ttf" }],
	]);
	browsers = await startTestBrowser();
	renderer = await PlaywrightPrintRenderer.connect({
		wsEndpoint: browsers.wsEndpoint,
	});
});

afterAll(async () => {
	await renderer?.close();
	await browsers?.stop();
	await new Promise((resolve) => server?.close(resolve));
});

it("a one-side letter is two pages of full-size rasters", async () => {
	const pdf = await renderer.render({
		html: blocksHtml({ sheet: letterSheet, sides: 1 }),
		resources: noResources,
		measure: measureBlocks,
		input,
		sheet: letterSheet,
		output: { format: "pdf", duplex: true },
		sides: sidesOf,
	});
	const text = Buffer.from(pdf).toString("latin1");
	expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
	const pages = pdfPages(pdf);
	expect(pages.map((page) => page.mediaBox)).toEqual([
		"0 0 612 792",
		"0 0 612 792",
	]);
	expect(
		pages[0]?.images.map(({ width, height }) => ({ width, height })),
	).toEqual([{ width: 2550, height: 3300 }]);
});

it("a three-side letter is four pages", async () => {
	const pdf = await renderer.render({
		html: blocksHtml({ sheet: letterSheet, sides: 3 }),
		resources: noResources,
		measure: measureBlocks,
		input,
		sheet: letterSheet,
		output: { format: "pdf", duplex: true },
		sides: () => 3,
	});
	const pages = pdfPages(pdf);
	expect(pages).toHaveLength(4);
	expect(pages.map((page) => page.images.length)).toEqual([1, 1, 1, 0]);
});

it("one side renders as a PNG of the whole canvas", async () => {
	const png = await renderer.render({
		html: blocksHtml({ sheet: postcardSheet, sides: 2 }),
		resources: noResources,
		measure: measureBlocks,
		input,
		sheet: postcardSheet,
		output: { format: "png", side: 1 },
		sides: sidesOf,
	});
	const metadata = await sharp(png).metadata();
	expect(metadata.format).toBe("png");
	expect([metadata.width, metadata.height]).toEqual([2738, 1838]);
	expect(await pixel(png, 1369, 919)).toEqual(sideColours[1]);
	expect(await pixel(png, 2, 2)).toEqual(sideColours[1]);
	expect(await pixel(png, 2735, 1835)).toEqual(sideColours[1]);
});

it("measure runs on the column element", async () => {
	const className = await renderer.measure({
		html: blocksHtml({ sheet: letterSheet, sides: 1 }),
		resources: noResources,
		measure: ((root: HTMLElement) =>
			root.className) as unknown as MeasureParams["measure"],
		input,
	});
	expect(className).toBe("letter-column");
});

it("an outside URL is never fetched", async () => {
	const local = `http://host.docker.internal:${serverPort}/x.png`;
	const control = await browsers.chromium.newPage();
	await control.goto(local);
	await control.close();
	expect(serverHits).toBe(1);
	const backgrounds = `<div style="position: absolute; left: 0; top: 0; width: 2in; height: 2in; background: url(https://example.com/x.png)"></div><div style="position: absolute; left: 3in; top: 0; width: 2in; height: 2in; background: url(${local})"></div>`;
	const png = await renderer.render({
		html: blocksHtml({
			sheet: letterSheet,
			sides: 1,
			coloured: false,
			inside: backgrounds,
		}),
		resources: noResources,
		measure: measureBlocks,
		input,
		sheet: letterSheet,
		output: { format: "png", side: 0 },
		sides: sidesOf,
	});
	expect(serverHits).toBe(1);
	expect(
		await regionMean(png, { left: 0, top: 0, width: 600, height: 600 }),
	).toBe(255);
	expect(
		await regionMean(png, { left: 900, top: 0, width: 600, height: 600 }),
	).toBe(255);
});

it("the font is loaded before the picture is taken", async () => {
	const png = await renderer.render({
		html: blocksHtml({
			sheet: letterSheet,
			sides: 1,
			coloured: false,
			inside: squareText,
			style: fontFace,
		}),
		resources: fontResources,
		measure: measureBlocks,
		input,
		sheet: letterSheet,
		output: { format: "png", side: 0 },
		sides: sidesOf,
	});
	expect(
		await regionMean(png, { left: 15, top: 15, width: 210, height: 210 }),
	).toBeLessThan(16);
});

it("the same letter renders the same pages", async () => {
	const params = {
		html: blocksHtml({
			sheet: letterSheet,
			sides: 3,
			inside: squareText,
			style: fontFace,
		}),
		resources: fontResources,
		measure: measureBlocks,
		input,
		sheet: letterSheet,
		output: { format: "pdf", duplex: true } as const,
		sides: sidesOf,
	};
	const first = pdfPages(await renderer.render(params));
	const second = pdfPages(await renderer.render(params));
	expect(first).toHaveLength(4);
	expect(second).toHaveLength(first.length);
	for (const [index, page] of first.entries()) {
		const other = second[index];
		expect(other?.images.length).toBe(page.images.length);
		for (const [imageIndex, image] of page.images.entries()) {
			expect(other?.images[imageIndex]?.data.equals(image.data)).toBe(true);
		}
	}
	expect(first[0]?.images[0]?.data.length).toBeGreaterThan(0);
});
