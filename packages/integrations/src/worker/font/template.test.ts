import { ServiceError } from "@repo/errors";
import { HANDWRITING_GLYPHS, HANDWRITING_TEMPLATE } from "@repo/types";
import opentype from "opentype.js";
import sharp from "sharp";
import { beforeAll, describe, expect, test } from "vitest";
import { OpentypeFontBuilder } from "./opentype-font.ts";
import { findTemplateMarkers, readTemplate } from "./template.ts";

const PPI = 120;
const { page, marker, grid, printColors } = HANDWRITING_TEMPLATE;

type Point = [number, number];

const radians = (7 * Math.PI) / 180;
const scale = 0.8;
const shear = 0.05;
const affine: [number, number, number, number] = [
	scale * Math.cos(radians),
	shear,
	scale * Math.sin(radians),
	scale * Math.cos(radians),
];

function slotBox(char: string, variant: number) {
	let index = 0;
	for (const glyph of HANDWRITING_GLYPHS) {
		for (let next = 0; next < glyph.variants; next += 1) {
			if (glyph.char === char && next === variant) {
				return {
					x: (grid.xIn + (index % grid.columns) * grid.cellWidthIn) * PPI,
					y:
						(grid.yIn + Math.floor(index / grid.columns) * grid.cellHeightIn) *
						PPI,
					width: grid.cellWidthIn * PPI,
					height: grid.cellHeightIn * PPI,
				};
			}
			index += 1;
		}
	}
	throw new Error(`no cell for ${char}`);
}

function markerSquare(xIn: number, yIn: number, notch: boolean): string {
	const x = xIn * PPI;
	const y = yIn * PPI;
	const size = marker.sizeIn * PPI;
	const bite = marker.notchIn * PPI;
	if (!notch) {
		return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${printColors.marker}"/>`;
	}
	return `<path fill="${printColors.marker}" fill-rule="evenodd" d="M ${x} ${y} h ${size} v ${size} h ${-size} z M ${x + size - bite} ${y + size - bite} h ${bite} v ${bite} h ${-bite} z"/>`;
}

function sheet(options: { corners: boolean; ink: boolean }): string {
	const width = page.widthIn * PPI;
	const height = page.heightIn * PPI;
	const cells: string[] = [];
	let index = 0;
	for (const glyph of HANDWRITING_GLYPHS) {
		for (let variant = 0; variant < glyph.variants; variant += 1) {
			const box = {
				x: (grid.xIn + (index % grid.columns) * grid.cellWidthIn) * PPI,
				y:
					(grid.yIn + Math.floor(index / grid.columns) * grid.cellHeightIn) *
					PPI,
				width: grid.cellWidthIn * PPI,
				height: grid.cellHeightIn * PPI,
			};
			cells.push(
				`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="${printColors.border}" stroke-width="1"/>`,
			);
			for (const line of [0.2, 0.45, 0.7, 0.9]) {
				const y = box.y + box.height * line;
				cells.push(
					`<line x1="${box.x + 2}" y1="${y}" x2="${box.x + box.width - 2}" y2="${y}" stroke="${printColors.guide}" stroke-width="1"/>`,
				);
			}
			const label = glyph.char
				.replaceAll("&", "&amp;")
				.replaceAll("<", "&lt;")
				.replaceAll(">", "&gt;");
			cells.push(
				`<text x="${box.x + 4}" y="${box.y + 12}" fill="${printColors.label}" font-size="10">${label}</text>`,
			);
			index += 1;
		}
	}
	const l = slotBox("l", 0);
	const o = slotBox("o", 0);
	const ink = options.ink
		? `<rect x="${l.x + l.width * 0.46}" y="${l.y + l.height * 0.2}" width="${PPI * 0.035}" height="${l.height * 0.55}" fill="#111"/>
			<path fill="#111" fill-rule="evenodd" d="M ${o.x + o.width / 2} ${o.y + o.height / 2} m -18 0 a 18 18 0 1 0 36 0 a 18 18 0 1 0 -36 0 z M ${o.x + o.width / 2} ${o.y + o.height / 2} m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 z"/>`
		: "";
	const corners = options.corners
		? [
				markerSquare(marker.insetIn, marker.insetIn, true),
				markerSquare(
					page.widthIn - marker.insetIn - marker.sizeIn,
					marker.insetIn,
					false,
				),
				markerSquare(
					page.widthIn - marker.insetIn - marker.sizeIn,
					page.heightIn - marker.insetIn - marker.sizeIn,
					false,
				),
				markerSquare(
					marker.insetIn,
					page.heightIn - marker.insetIn - marker.sizeIn,
					false,
				),
			].join("")
		: markerSquare(marker.insetIn, marker.insetIn, true) +
			markerSquare(
				page.widthIn - marker.insetIn - marker.sizeIn,
				marker.insetIn,
				false,
			) +
			markerSquare(
				marker.insetIn,
				page.heightIn - marker.insetIn - marker.sizeIn,
				false,
			);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
		<defs><linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfcfcf"/></linearGradient></defs>
		<rect width="100%" height="100%" fill="url(#light)"/>
		${cells.join("")}
		${corners}
		${ink}
	</svg>`;
}

async function render(options: { corners: boolean; ink: boolean }) {
	return sharp(Buffer.from(sheet(options)))
		.png()
		.toBuffer();
}

async function distort(png: Buffer) {
	const pad = Math.round(1.8 * PPI);
	const meta = await sharp(png).metadata();
	const width = (meta.width ?? 0) + pad * 2;
	const height = (meta.height ?? 0) + pad * 2;
	const padded = await sharp({
		create: { width, height, channels: 3, background: "#f3f3f3" },
	})
		.composite([{ input: png, left: pad, top: pad }])
		.png()
		.toBuffer();
	const [a, b, c, d] = affine;
	const cx = width / 2;
	const cy = height / 2;
	const odx = cx - (a * cx + b * cy);
	const ody = cy - (c * cx + d * cy);
	const bytes = await sharp(padded)
		.affine(affine, { background: "#f6f6f6", odx, ody })
		.png()
		.toBuffer();
	const map = (x: number, y: number): Point => {
		const px = x + pad;
		const py = y + pad;
		return [a * px + b * py + odx, c * px + d * py + ody];
	};
	return { bytes: new Uint8Array(bytes), map };
}

function markerCentre(column: 0 | 1, row: 0 | 1): Point {
	const x =
		(column === 0
			? marker.insetIn + marker.sizeIn / 2
			: page.widthIn - marker.insetIn - marker.sizeIn / 2) * PPI;
	const y =
		(row === 0
			? marker.insetIn + marker.sizeIn / 2
			: page.heightIn - marker.insetIn - marker.sizeIn / 2) * PPI;
	return [x, y];
}

let photo: Uint8Array;
let expected: Point[];

beforeAll(async () => {
	const warped = await distort(await render({ corners: true, ink: true }));
	photo = warped.bytes;
	expected = (
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		] as const
	).map(([column, row]) => {
		const [x, y] = markerCentre(column, row);
		return warped.map(x, y);
	});
}, 60_000);

function distance(left: Point, right: Point): number {
	return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

describe("readTemplate", () => {
	test("the four markers are found within four pixels", async () => {
		const found = await findTemplateMarkers(photo);
		found.forEach((point, index) => {
			expect(distance(point, expected[index] ?? point)).toBeLessThanOrEqual(4);
		});
	});

	test("cells come back in template order with their ink", async () => {
		const cells = await readTemplate(photo);
		const written = cells.filter((cell) =>
			cell.mask.alpha.some((value) => value >= 128),
		);
		expect(written.map((cell) => [cell.char, cell.variant])).toEqual([
			["l", 0],
			["o", 0],
		]);
	});

	test("a sideways photo without EXIF is read the right way up", async () => {
		const turned = new Uint8Array(
			await sharp(Buffer.from(photo)).rotate(90).png().toBuffer(),
		);
		const cells = await readTemplate(turned);
		const written = cells.filter((cell) =>
			cell.mask.alpha.some((value) => value >= 128),
		);
		expect(written.map((cell) => cell.char)).toEqual(["l", "o"]);
	});

	test("printed borders and labels leave no ink", async () => {
		const built = await new OpentypeFontBuilder().fromTemplatePhoto({
			familyName: "Template Hand",
			photo,
		});
		const font = opentype.parse(
			built.bytes.buffer.slice(
				built.bytes.byteOffset,
				built.bytes.byteOffset + built.bytes.byteLength,
			),
		);
		expect(font.charToGlyph("l").advanceWidth).toBeLessThan(0.2 * 1000);
	});

	test("a photo missing a corner is refused", async () => {
		const incomplete = new Uint8Array(
			await render({ corners: false, ink: true }),
		);
		await expect(readTemplate(incomplete)).rejects.toMatchObject({
			code: "template_markers_not_found",
		});
	});

	test("a photo that is not a template is refused", async () => {
		const blob = new Uint8Array(
			await sharp(
				Buffer.from(
					`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="100%" height="100%" fill="#e8e4dc"/><circle cx="220" cy="180" r="40" fill="#222"/></svg>`,
				),
			)
				.png()
				.toBuffer(),
		);
		await expect(readTemplate(blob)).rejects.toBeInstanceOf(ServiceError);
		await expect(readTemplate(blob)).rejects.toMatchObject({
			code: "template_markers_not_found",
		});
	});

	test("the o has an open counter", async () => {
		const built = await new OpentypeFontBuilder().fromTemplatePhoto({
			familyName: "Template Hand",
			photo,
		});
		const font = opentype.parse(
			built.bytes.buffer.slice(
				built.bytes.byteOffset,
				built.bytes.byteOffset + built.bytes.byteLength,
			),
		);
		const path = font.charToGlyph("o").getPath(0, 800, 1000);
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">${path.toSVG(2)}</svg>`;
		const { data, info } = await sharp(Buffer.from(svg))
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		let minX = info.width;
		let minY = info.height;
		let maxX = 0;
		let maxY = 0;
		let opaque = 0;
		for (let y = 0; y < info.height; y += 1) {
			for (let x = 0; x < info.width; x += 1) {
				const alpha = data[(y * info.width + x) * info.channels + 3] ?? 0;
				if (alpha < 128) continue;
				opaque += 1;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
		}
		expect(opaque).toBeGreaterThan(20);
		const centre =
			data[
				(Math.round((minY + maxY) / 2) * info.width +
					Math.round((minX + maxX) / 2)) *
					info.channels +
					3
			] ?? 255;
		expect(centre).toBeLessThan(20);
	});
});
