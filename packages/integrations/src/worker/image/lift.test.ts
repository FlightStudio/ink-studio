import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
	LIFT_LIMITS,
	type LiftMaskOptions,
	liftInk,
	liftMask,
	type Mask,
} from "./lift.ts";
import {
	type Box,
	headerOnlyPng,
	type PageSpec,
	type SyntheticPage,
	sidewaysL,
	syntheticPage,
	transparentInk,
} from "./synthetic.ts";

const uncropped: LiftMaskOptions = { removeLines: true, cropToInk: false };

const writing = {
	color: "#141414",
	widthUnits: 5,
	lineSpacingUnits: 60,
	area: { x: 80, y: 60, width: 840, height: 600 },
	seed: 1,
};

const darkOnWhite: PageSpec = {
	widthPx: 1600,
	heightPx: 1200,
	paper: "#ffffff",
	ink: writing,
	blurPx: 0.8,
	noise: 3,
};

const rulings = {
	color: "#9cc0e6",
	widthUnits: 1.2,
	spacingUnits: 40,
	margin: "#e88f8f",
};

const pen = {
	color: "#1c2c78",
	widthUnits: 3,
	lineSpacingUnits: 40,
	area: { x: 120, y: 10, width: 820, height: 700 },
	seed: 3,
};

const writingOnLines = {
	color: "#141414",
	widthUnits: 3,
	lineSpacingUnits: 50,
	area: { x: 120, y: 30, width: 800, height: 600 },
	seed: 11,
};

const plainPaper: PageSpec = {
	widthPx: 1600,
	heightPx: 1200,
	paper: "#fbfbf8",
	ink: { ...writingOnLines, seed: 1 },
	blurPx: 0.8,
	noise: 3,
};

const graphPaper: PageSpec = {
	...plainPaper,
	grid: { color: "#777777", widthUnits: 1.4, spacingUnits: 25 },
};

function opaque(mask: Mask, level = 128): Uint8Array {
	return mask.alpha.map((value) => (value >= level ? 1 : 0));
}

function count(bits: Uint8Array): number {
	let total = 0;
	for (const bit of bits) total += bit;
	return total;
}

function iou(a: Uint8Array, b: Uint8Array): number {
	let both = 0;
	let either = 0;
	for (let index = 0; index < a.length; index += 1) {
		const x = a[index] ?? 0;
		const y = b[index] ?? 0;
		both += x & y;
		either += x | y;
	}
	return either === 0 ? 1 : both / either;
}

function recall(truth: Uint8Array, found: Uint8Array): number {
	let hit = 0;
	for (let index = 0; index < truth.length; index += 1) {
		if (truth[index] === 1 && found[index] === 1) hit += 1;
	}
	return hit / count(truth);
}

function awayFromInk(page: SyntheticPage): Uint8Array {
	const away = new Uint8Array(page.ink.length).fill(1);
	for (let y = 0; y < page.heightPx; y += 1) {
		for (let x = 0; x < page.widthPx; x += 1) {
			if (page.ink[y * page.widthPx + x] !== 1) continue;
			for (let dy = Math.max(0, y - 1); dy <= y + 1; dy += 1) {
				for (let dx = Math.max(0, x - 1); dx <= x + 1; dx += 1) {
					if (dx < page.widthPx && dy < page.heightPx) {
						away[dy * page.widthPx + dx] = 0;
					}
				}
			}
		}
	}
	return away;
}

function opaqueOutside(away: Uint8Array, found: Uint8Array): number {
	let outside = 0;
	let wrong = 0;
	for (let index = 0; index < away.length; index += 1) {
		if (away[index] !== 1) continue;
		outside += 1;
		if (found[index] === 1) wrong += 1;
	}
	return wrong / outside;
}

function shareBelow(
	part: Uint8Array,
	away: Uint8Array,
	mask: Mask,
	level: number,
): number {
	let seen = 0;
	let below = 0;
	for (let index = 0; index < part.length; index += 1) {
		if (part[index] !== 1 || away[index] !== 1) continue;
		seen += 1;
		if ((mask.alpha[index] ?? 0) < level) below += 1;
	}
	expect(seen).toBeGreaterThan(0);
	return below / seen;
}

function components(bits: Uint8Array, widthPx: number): number {
	const heightPx = bits.length / widthPx;
	const seen = new Uint8Array(bits.length);
	const stack: number[] = [];
	let found = 0;
	for (let start = 0; start < bits.length; start += 1) {
		if (bits[start] !== 1 || seen[start] === 1) continue;
		found += 1;
		seen[start] = 1;
		stack.push(start);
		while (stack.length > 0) {
			const at = stack.pop() ?? 0;
			const x = at % widthPx;
			const y = Math.floor(at / widthPx);
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= widthPx || ny >= heightPx) continue;
					const next = ny * widthPx + nx;
					if (bits[next] !== 1 || seen[next] === 1) continue;
					seen[next] = 1;
					stack.push(next);
				}
			}
		}
	}
	return found;
}

function inkIn(mask: Mask, box: Box): number {
	let total = 0;
	for (let y = box.y; y < box.y + box.height; y += 1) {
		for (let x = box.x; x < box.x + box.width; x += 1) {
			if ((mask.alpha[y * mask.widthPx + x] ?? 0) >= 128) total += 1;
		}
	}
	return total;
}

function inkBounds(bits: Uint8Array, widthPx: number): Box {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = -1;
	let bottom = -1;
	for (let index = 0; index < bits.length; index += 1) {
		if (bits[index] !== 1) continue;
		const x = index % widthPx;
		const y = Math.floor(index / widthPx);
		left = Math.min(left, x);
		top = Math.min(top, y);
		right = Math.max(right, x);
		bottom = Math.max(bottom, y);
	}
	return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function resample(mask: Mask, widthPx: number, heightPx: number): Uint8Array {
	const bits = opaque(mask);
	const out = new Uint8Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		const sourceY = Math.floor(((y + 0.5) * mask.heightPx) / heightPx);
		for (let x = 0; x < widthPx; x += 1) {
			const sourceX = Math.floor(((x + 0.5) * mask.widthPx) / widthPx);
			out[y * widthPx + x] = bits[sourceY * mask.widthPx + sourceX] ?? 0;
		}
	}
	return out;
}

async function decodePng(png: Uint8Array) {
	const { data, info } = await sharp(png)
		.raw()
		.toBuffer({ resolveWithObject: true });
	return { data: new Uint8Array(data), info };
}

describe("liftMask and liftInk", () => {
	it("dark strokes on white become ink and paper becomes clear", async () => {
		const page = await syntheticPage(darkOnWhite);
		const mask = await liftMask(page.photo, uncropped);
		expect([mask.widthPx, mask.heightPx]).toEqual([1600, 1200]);
		expect(iou(page.ink, opaque(mask))).toBeGreaterThanOrEqual(0.9);
	});

	it("a shadow across the page does not become ink", async () => {
		const page = await syntheticPage({ ...darkOnWhite, shadow: 0.4 });
		const mask = await liftMask(page.photo, uncropped);
		expect(opaqueOutside(awayFromInk(page), opaque(mask))).toBeLessThan(0.005);
	});

	it("light blue rulings and a red margin vanish", async () => {
		const page = await syntheticPage({
			...darkOnWhite,
			paper: "#fbfaf6",
			rulings,
			ink: { ...pen, color: "#141414" },
		});
		const mask = await liftMask(page.photo, uncropped);
		const away = awayFromInk(page);
		let ruling = 0;
		let clear = 0;
		for (let index = 0; index < page.rulings.length; index += 1) {
			if (page.rulings[index] !== 1 || away[index] !== 1) continue;
			ruling += 1;
			if ((mask.alpha[index] ?? 0) < 30) clear += 1;
		}
		expect(ruling).toBeGreaterThan(0);
		expect(clear / ruling).toBeGreaterThanOrEqual(0.99);
	});

	it("blue ballpoint on blue rulings is kept", async () => {
		const page = await syntheticPage({
			...darkOnWhite,
			paper: "#fbfaf6",
			rulings,
			ink: pen,
		});
		const mask = await liftMask(page.photo, uncropped);
		expect(recall(page.ink, opaque(mask))).toBeGreaterThanOrEqual(0.9);
	});

	it("EXIF orientation 6 is applied", async () => {
		const mask = await liftMask(await sidewaysL(), uncropped);
		expect([mask.widthPx, mask.heightPx]).toEqual([800, 1200]);
		const foot = { x: 400, y: 1000, width: 400, height: 100 };
		const topRight = { x: 400, y: 0, width: 400, height: 980 };
		const stem = { x: 100, y: 100, width: 100, height: 900 };
		expect(inkIn(mask, foot)).toBeGreaterThan(2000);
		expect(inkIn(mask, stem)).toBeGreaterThan(2000);
		expect(inkIn(mask, topRight)).toBe(0);
	});

	it("a transparent PNG is read as if on white", async () => {
		const page = await transparentInk(darkOnWhite);
		const mask = await liftMask(page.photo, uncropped);
		const found = opaque(mask);
		expect(iou(page.ink, found)).toBeGreaterThanOrEqual(0.9);
		expect(opaqueOutside(awayFromInk(page), found)).toBeLessThan(0.005);
	});

	it("a photo over the pixel cap is refused before decoding", async () => {
		const widthPx = 8000;
		const heightPx = Math.ceil(LIFT_LIMITS.maxInputPixels / widthPx) + 1;
		const photo = headerOnlyPng(widthPx, heightPx);
		await expect(liftInk(photo)).rejects.toMatchObject({
			kind: "invalid_input",
			code: "photo_too_large",
		});
		await expect(liftMask(photo, uncropped)).rejects.toMatchObject({
			kind: "invalid_input",
			code: "photo_too_large",
		});
	});

	it("bytes that are not an image are refused", async () => {
		const bytes = new TextEncoder().encode("this is a letter, not a photo");
		await expect(liftInk(bytes)).rejects.toMatchObject({
			kind: "invalid_input",
			code: "photo_unreadable",
		});
		await expect(liftInk(headerOnlyPng(800, 600))).rejects.toMatchObject({
			kind: "invalid_input",
			code: "photo_unreadable",
		});
	});

	it("a blank page has no ink", async () => {
		const page = await syntheticPage({
			widthPx: 1600,
			heightPx: 1200,
			paper: "#f6f2e8",
			shadow: 0.3,
			rulings,
			blurPx: 0.8,
			noise: 3,
		});
		await expect(liftInk(page.photo)).rejects.toMatchObject({
			kind: "invalid_input",
			code: "no_ink_found",
		});
	});

	it("the output is cropped to the ink with a small margin", async () => {
		const page = await syntheticPage({
			...darkOnWhite,
			ink: { ...writing, area: { x: 350, y: 250, width: 300, height: 200 } },
		});
		const full = await liftMask(page.photo, uncropped);
		const { data, info } = await decodePng(await liftInk(page.photo));
		expect(info.channels).toBe(4);
		const alpha = new Uint8Array(info.width * info.height);
		for (let index = 0; index < alpha.length; index += 1) {
			expect(data[index * 4]).toBe(0);
			expect(data[index * 4 + 1]).toBe(0);
			expect(data[index * 4 + 2]).toBe(0);
			alpha[index] = data[index * 4 + 3] ?? 0;
		}
		const cropped: Mask = { widthPx: info.width, heightPx: info.height, alpha };
		expect(count(opaque(cropped))).toBe(count(opaque(full)));
		const ink = inkBounds(opaque(cropped), info.width);
		const margin = 0.02 * 1600;
		for (const gap of [
			ink.x,
			ink.y,
			info.width - ink.x - ink.width,
			info.height - ink.y - ink.height,
		]) {
			expect(gap).toBeGreaterThanOrEqual(margin - 4);
			expect(gap).toBeLessThanOrEqual(margin + 4);
		}
		expect(info.width).toBeLessThan(800);
		expect(info.height).toBeLessThan(600);
	});

	it("edges are soft", async () => {
		const page = await syntheticPage(darkOnWhite);
		const mask = await liftMask(page.photo, uncropped);
		let visible = 0;
		let soft = 0;
		for (const value of mask.alpha) {
			if (value === 0) continue;
			visible += 1;
			if (value >= 30 && value <= 225) soft += 1;
		}
		expect(soft / visible).toBeGreaterThan(0.01);
	});

	it("the threshold window scales with the image", async () => {
		const bold = (widthPx: number): PageSpec => ({
			widthPx,
			heightPx: (widthPx * 3) / 4,
			paper: "#ffffff",
			ink: {
				color: "#141414",
				widthUnits: 12,
				lineSpacingUnits: 110,
				area: { x: 60, y: 40, width: 880, height: 660 },
				seed: 5,
			},
			blurPx: (0.8 * widthPx) / 1000,
			noise: 3,
		});
		const small = await liftMask(
			(await syntheticPage(bold(1000))).photo,
			uncropped,
		);
		const large = await liftMask(
			(await syntheticPage(bold(3000))).photo,
			uncropped,
		);
		expect([small.widthPx, small.heightPx]).toEqual([1000, 750]);
		expect([large.widthPx, large.heightPx]).toEqual([
			LIFT_LIMITS.workingLongSidePx,
			(LIFT_LIMITS.workingLongSidePx * 3) / 4,
		]);
		expect(
			iou(opaque(small), resample(large, small.widthPx, small.heightPx)),
		).toBeGreaterThanOrEqual(0.85);
	});
});

describe("removing lines, specks and table edges", () => {
	it("a grey graph-paper grid is removed and the writing kept", async () => {
		const page = await syntheticPage(graphPaper);
		const mask = await liftMask(page.photo, uncropped);
		const found = opaque(mask);
		expect(
			shareBelow(page.grid, awayFromInk(page), mask, 30),
		).toBeGreaterThanOrEqual(0.97);
		expect(recall(page.ink, found)).toBeGreaterThanOrEqual(0.85);
		const plain = await liftMask(
			(await syntheticPage(plainPaper)).photo,
			uncropped,
		);
		expect(
			Math.abs(
				components(found, mask.widthPx) -
					components(opaque(plain), plain.widthPx),
			),
		).toBeLessThanOrEqual(1);
	});

	it("dark notebook rulings are removed", async () => {
		const page = await syntheticPage({
			widthPx: 1600,
			heightPx: 1200,
			paper: "#fbfaf6",
			rulings: {
				color: "#4e5a78",
				widthUnits: 1.4,
				spacingUnits: 40,
				margin: "#7a2e38",
			},
			ink: {
				...writingOnLines,
				lineSpacingUnits: 40,
				area: { x: 120, y: 10, width: 820, height: 700 },
			},
			blurPx: 0.8,
			noise: 3,
		});
		const away = awayFromInk(page);
		const kept = await liftMask(page.photo, {
			removeLines: false,
			cropToInk: false,
		});
		expect(shareBelow(page.rulings, away, kept, 128)).toBeLessThan(0.1);
		const mask = await liftMask(page.photo, uncropped);
		expect(shareBelow(page.rulings, away, mask, 30)).toBeGreaterThanOrEqual(
			0.97,
		);
		expect(recall(page.ink, opaque(mask))).toBeGreaterThanOrEqual(0.85);
	});

	it("a wavy hand-drawn underline is kept", async () => {
		const page = await syntheticPage({
			widthPx: 1600,
			heightPx: 1200,
			paper: "#ffffff",
			ink: {
				...writingOnLines,
				area: { x: 120, y: 60, width: 760, height: 260 },
			},
			underline: {
				color: "#141414",
				widthUnits: 1.8,
				x: 140,
				y: 380,
				lengthUnits: 700,
				riseUnits: 12,
				amplitudeUnits: 3,
				wavelengthUnits: 80,
			},
			blurPx: 0.8,
			noise: 3,
		});
		const mask = await liftMask(page.photo, uncropped);
		expect(recall(page.underline, opaque(mask))).toBeGreaterThanOrEqual(0.9);
		expect(recall(page.ink, opaque(mask))).toBeGreaterThanOrEqual(0.9);
	});

	it("specks are dropped and the dot on an i is kept", async () => {
		const page = await syntheticPage({
			widthPx: 1600,
			heightPx: 1200,
			paper: "#fbfaf6",
			ink: {
				...writingOnLines,
				area: { x: 120, y: 40, width: 760, height: 260 },
			},
			letterI: {
				color: "#141414",
				widthUnits: 3,
				heightUnits: 14,
				baselines: [200, 300, 400, 500, 600, 700, 800].map((x) => ({
					x,
					y: 420,
				})),
			},
			specks: {
				color: "#2a2a2a",
				count: 200,
				radiusUnits: 0.7,
				area: { x: 40, y: 460, width: 920, height: 260 },
				seed: 9,
			},
			blurPx: 0.8,
			noise: 3,
		});
		const away = awayFromInk(page);
		const kept = await liftMask(page.photo, {
			removeLines: false,
			cropToInk: false,
		});
		expect(shareBelow(page.specks, away, kept, 128)).toBeLessThan(0.2);
		const mask = await liftMask(page.photo, uncropped);
		expect(shareBelow(page.specks, away, mask, 30)).toBeGreaterThanOrEqual(
			0.99,
		);
		expect(recall(page.dots, opaque(mask))).toBeGreaterThanOrEqual(0.9);
		expect(recall(page.ink, opaque(mask))).toBeGreaterThanOrEqual(0.9);
	});

	it("a dark table edge around the paper is dropped", async () => {
		const page = await syntheticPage({
			widthPx: 1600,
			heightPx: 1200,
			paper: "#f8f6f0",
			table: { color: "#3b2b20", insetUnits: 20, tiltDeg: 1.5 },
			ink: {
				...writingOnLines,
				area: { x: 160, y: 120, width: 680, height: 460 },
			},
			blurPx: 0.8,
			noise: 3,
		});
		const mask = await liftMask(page.photo, uncropped);
		expect(
			shareBelow(page.table, awayFromInk(page), mask, 30),
		).toBeGreaterThanOrEqual(0.99);
		expect(recall(page.ink, opaque(mask))).toBeGreaterThanOrEqual(0.9);
		const cropped = await liftMask(page.photo, {
			removeLines: true,
			cropToInk: true,
		});
		const ink = inkBounds(page.ink, 1600);
		const margin = 2 * 0.02 * 1600 + 8;
		expect(cropped.widthPx).toBeLessThanOrEqual(ink.width + margin);
		expect(cropped.heightPx).toBeLessThanOrEqual(ink.height + margin);
	});

	it("line removal can be turned off", async () => {
		const page = await syntheticPage(graphPaper);
		const mask = await liftMask(page.photo, {
			removeLines: false,
			cropToInk: false,
		});
		expect([mask.widthPx, mask.heightPx]).toEqual([1600, 1200]);
		expect(
			shareBelow(page.grid, awayFromInk(page), mask, 128),
		).toBeLessThanOrEqual(0.1);
	});
});
