import { ServiceError } from "@repo/errors";
import { HANDWRITING_GLYPHS, HANDWRITING_TEMPLATE } from "@repo/types";
import { liftMask, type Mask } from "../image/lift.ts";

export type TemplateCell = { char: string; variant: number; mask: Mask };

type Point = [number, number];

const CELL_PPI = 150;
const INK = 128;
const NOTCH_SAMPLES = 5;
const NOTCH_CONTRAST = 0.5;

const marker = HANDWRITING_TEMPLATE.marker;
const page = HANDWRITING_TEMPLATE.page;
const grid = HANDWRITING_TEMPLATE.grid;
const label = HANDWRITING_TEMPLATE.label;

function markerCentres(): [Point, Point, Point, Point] {
	const inset = marker.insetIn + marker.sizeIn / 2;
	return [
		[inset, inset],
		[page.widthIn - inset, inset],
		[page.widthIn - inset, page.heightIn - inset],
		[inset, page.heightIn - inset],
	];
}

type Slot = {
	char: string;
	variant: number;
	xIn: number;
	yIn: number;
	widthIn: number;
	heightIn: number;
};

function slots(): Slot[] {
	const widthIn = grid.cellWidthIn - grid.cellInsetIn * 2;
	const heightIn = grid.cellHeightIn - grid.cellInsetIn * 2;
	const cells: Slot[] = [];
	let index = 0;
	for (const glyph of HANDWRITING_GLYPHS) {
		for (let variant = 0; variant < glyph.variants; variant += 1) {
			const column = index % grid.columns;
			const row = Math.floor(index / grid.columns);
			cells.push({
				char: glyph.char,
				variant,
				xIn: grid.xIn + column * grid.cellWidthIn + grid.cellInsetIn,
				yIn: grid.yIn + row * grid.cellHeightIn + grid.cellInsetIn,
				widthIn,
				heightIn,
			});
			index += 1;
		}
	}
	return cells;
}

function solve(matrix: number[][], values: number[]): number[] {
	const size = values.length;
	const rows = matrix.map((row, index) => [...row, values[index] ?? 0]);
	for (let column = 0; column < size; column += 1) {
		let pivot = column;
		for (let row = column + 1; row < size; row += 1) {
			if (
				Math.abs(rows[row]?.[column] ?? 0) >
				Math.abs(rows[pivot]?.[column] ?? 0)
			) {
				pivot = row;
			}
		}
		const swapped = rows[pivot];
		const current = rows[column];
		if (!swapped || !current || Math.abs(swapped[column] ?? 0) < 1e-12) {
			throw new ServiceError("invalid_input", "template_markers_not_found");
		}
		rows[pivot] = current;
		rows[column] = swapped;
		const scale = swapped[column] ?? 1;
		for (let row = column + 1; row < size; row += 1) {
			const target = rows[row];
			if (!target) continue;
			const factor = (target[column] ?? 0) / scale;
			for (let cursor = column; cursor <= size; cursor += 1) {
				target[cursor] =
					(target[cursor] ?? 0) - factor * (swapped[cursor] ?? 0);
			}
		}
	}
	const answer = new Array<number>(size).fill(0);
	for (let row = size - 1; row >= 0; row -= 1) {
		const line = rows[row];
		if (!line) continue;
		let total = line[size] ?? 0;
		for (let column = row + 1; column < size; column += 1) {
			total -= (line[column] ?? 0) * (answer[column] ?? 0);
		}
		answer[row] = total / (line[row] ?? 1);
	}
	return answer;
}

function homography(from: Point[], to: Point[]): number[] {
	const matrix: number[][] = [];
	const values: number[] = [];
	for (let index = 0; index < from.length; index += 1) {
		const [x, y] = from[index] ?? [0, 0];
		const [u, v] = to[index] ?? [0, 0];
		matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
		values.push(u);
		matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
		values.push(v);
	}
	return [...solve(matrix, values), 1];
}

function apply(h: number[], point: Point): Point {
	const [x, y] = point;
	const weight = (h[6] ?? 0) * x + (h[7] ?? 0) * y + (h[8] ?? 1);
	return [
		((h[0] ?? 0) * x + (h[1] ?? 0) * y + (h[2] ?? 0)) / weight,
		((h[3] ?? 0) * x + (h[4] ?? 0) * y + (h[5] ?? 0)) / weight,
	];
}

type Component = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	count: number;
	sumX: number;
	sumY: number;
};

function neighboursOf(index: number, mask: Mask): number[] {
	const x = index % mask.widthPx;
	const found: number[] = [];
	if (x > 0) found.push(index - 1);
	if (x < mask.widthPx - 1) found.push(index + 1);
	if (index >= mask.widthPx) found.push(index - mask.widthPx);
	if (index + mask.widthPx < mask.alpha.length) {
		found.push(index + mask.widthPx);
	}
	return found;
}

function componentsOf(mask: Mask): Component[] {
	const { widthPx, heightPx, alpha } = mask;
	const seen = new Uint8Array(alpha.length);
	const found: Component[] = [];
	const queue = new Int32Array(alpha.length);
	for (let start = 0; start < alpha.length; start += 1) {
		if (seen[start] === 1 || (alpha[start] ?? 0) < INK) continue;
		let head = 0;
		let tail = 0;
		queue[tail] = start;
		tail += 1;
		seen[start] = 1;
		const component: Component = {
			minX: widthPx,
			minY: heightPx,
			maxX: 0,
			maxY: 0,
			count: 0,
			sumX: 0,
			sumY: 0,
		};
		while (head < tail) {
			const index = queue[head] ?? 0;
			head += 1;
			const x = index % widthPx;
			const y = Math.floor(index / widthPx);
			component.count += 1;
			component.sumX += x;
			component.sumY += y;
			component.minX = Math.min(component.minX, x);
			component.minY = Math.min(component.minY, y);
			component.maxX = Math.max(component.maxX, x);
			component.maxY = Math.max(component.maxY, y);
			for (const next of neighboursOf(index, mask)) {
				if (seen[next] === 1 || (alpha[next] ?? 0) < INK) continue;
				seen[next] = 1;
				queue[tail] = next;
				tail += 1;
			}
		}
		found.push(component);
	}
	return found;
}

function clockwise(centres: Point[]): Point[] {
	const middleX = centres.reduce((sum, [x]) => sum + x, 0) / centres.length;
	const middleY = centres.reduce((sum, [, y]) => sum + y, 0) / centres.length;
	return centres.toSorted(
		(a, b) =>
			Math.atan2(a[1] - middleY, a[0] - middleX) -
			Math.atan2(b[1] - middleY, b[0] - middleX),
	);
}

function innerCornerInk(mask: Mask, h: number[], centre: Point): number {
	const reach = marker.sizeIn / 2 - marker.notchIn / 2;
	const x = centre[0] + Math.sign(page.widthIn / 2 - centre[0]) * reach;
	const y = centre[1] + Math.sign(page.heightIn / 2 - centre[1]) * reach;
	const span = marker.notchIn / 2;
	const step = span / (NOTCH_SAMPLES - 1);
	let ink = 0;
	for (let row = 0; row < NOTCH_SAMPLES; row += 1) {
		for (let column = 0; column < NOTCH_SAMPLES; column += 1) {
			const [photoX, photoY] = apply(h, [
				x - span / 2 + column * step,
				y - span / 2 + row * step,
			]);
			if (sample(mask, photoX, photoY) >= INK) ink += 1;
		}
	}
	return ink / NOTCH_SAMPLES ** 2;
}

function orient(mask: Mask, centres: Point[]): [Point, Point, Point, Point] {
	const ring = clockwise(centres);
	const template = markerCentres();
	let best: { score: number; order: [Point, Point, Point, Point] } | null =
		null;
	for (let start = 0; start < ring.length; start += 1) {
		const [first, second, third, fourth] = [
			...ring.slice(start),
			...ring.slice(0, start),
		];
		if (!first || !second || !third || !fourth) continue;
		const order: [Point, Point, Point, Point] = [first, second, third, fourth];
		const h = homography(template, order);
		const [notch = 1, ...plain] = template.map((centre) =>
			innerCornerInk(mask, h, centre),
		);
		const score = Math.min(...plain) - notch;
		if (!best || score > best.score) best = { score, order };
	}
	if (!best || best.score < NOTCH_CONTRAST) {
		throw new ServiceError("invalid_input", "template_markers_not_found");
	}
	return best.order;
}

function squareEnough(component: Component, mask: Mask): boolean {
	const width = component.maxX - component.minX + 1;
	const height = component.maxY - component.minY + 1;
	const ratio = width / height;
	if (ratio < 0.7 || ratio > 1.45) return false;
	const fill = component.count / (width * height);
	if (fill < 0.45) return false;
	const shortSide = Math.min(mask.widthPx, mask.heightPx);
	if (width < shortSide * 0.015 || width > shortSide * 0.25) return false;
	return true;
}

function centreOf(component: Component): Point {
	return [
		(component.minX + component.maxX) / 2,
		(component.minY + component.maxY) / 2,
	];
}

function inCorner(component: Component, mask: Mask): boolean {
	const x = (component.minX + component.maxX) / 2;
	const y = (component.minY + component.maxY) / 2;
	const nearX = x < mask.widthPx * 0.34 || x > mask.widthPx * 0.66;
	const nearY = y < mask.heightPx * 0.34 || y > mask.heightPx * 0.66;
	return nearX && nearY;
}

async function lifted(photo: Uint8Array): Promise<Mask> {
	try {
		return await liftMask(photo, { removeLines: false, cropToInk: false });
	} catch (error) {
		if (error instanceof ServiceError && error.code === "no_ink_found") {
			throw new ServiceError("invalid_input", "template_markers_not_found");
		}
		throw error;
	}
}

function cornerKey(component: Component, mask: Mask): string | null {
	if (!inCorner(component, mask)) return null;
	const x = (component.minX + component.maxX) / 2;
	const y = (component.minY + component.maxY) / 2;
	const left = x < mask.widthPx * 0.5;
	const top = y < mask.heightPx * 0.5;
	return `${left ? "l" : "r"}${top ? "t" : "b"}`;
}

function markersOf(mask: Mask): [Point, Point, Point, Point] {
	const byCorner = new Map<string, Component>();
	for (const component of componentsOf(mask)) {
		if (!squareEnough(component, mask)) continue;
		const key = cornerKey(component, mask);
		if (!key) continue;
		const current = byCorner.get(key);
		if (!current || component.count > current.count) {
			byCorner.set(key, component);
		}
	}
	const squares = [...byCorner.values()];
	if (squares.length !== 4) {
		throw new ServiceError("invalid_input", "template_markers_not_found");
	}
	return orient(mask, squares.map(centreOf));
}

export async function findTemplateMarkers(
	photo: Uint8Array,
): Promise<[Point, Point, Point, Point]> {
	return markersOf(await lifted(photo));
}

function sample(mask: Mask, x: number, y: number): number {
	if (x < 0 || y < 0 || x > mask.widthPx - 1 || y > mask.heightPx - 1) return 0;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const across = x - x0;
	const down = y - y0;
	const row = y0 * mask.widthPx;
	const next = Math.min(mask.heightPx - 1, y0 + 1) * mask.widthPx;
	const right = Math.min(mask.widthPx - 1, x0 + 1);
	const upper =
		(mask.alpha[row + x0] ?? 0) * (1 - across) +
		(mask.alpha[row + right] ?? 0) * across;
	const lower =
		(mask.alpha[next + x0] ?? 0) * (1 - across) +
		(mask.alpha[next + right] ?? 0) * across;
	return upper * (1 - down) + lower * down;
}

function cellMask(mask: Mask, h: number[], slot: Slot): Mask {
	const widthPx = Math.max(1, Math.round(slot.widthIn * CELL_PPI));
	const heightPx = Math.max(1, Math.round(slot.heightIn * CELL_PPI));
	const alpha = new Uint8Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		for (let x = 0; x < widthPx; x += 1) {
			const inches: Point = [
				slot.xIn + (x + 0.5) / CELL_PPI,
				slot.yIn + (y + 0.5) / CELL_PPI,
			];
			const [photoX, photoY] = apply(h, inches);
			alpha[y * widthPx + x] = sample(mask, photoX, photoY) >= INK ? 255 : 0;
		}
	}
	return { widthPx, heightPx, alpha };
}

function withoutLabel(cell: Mask): Mask {
	const zoneWidth = Math.round(
		(label.zoneWidthIn - grid.cellInsetIn) * CELL_PPI,
	);
	const zoneHeight = Math.round(
		(label.zoneHeightIn - grid.cellInsetIn) * CELL_PPI,
	);
	const alpha = cell.alpha.slice();
	const seen = new Uint8Array(alpha.length);
	for (let y = 0; y < Math.min(zoneHeight, cell.heightPx); y += 1) {
		for (let x = 0; x < Math.min(zoneWidth, cell.widthPx); x += 1) {
			const start = y * cell.widthPx + x;
			if (seen[start] === 1 || (alpha[start] ?? 0) < INK) continue;
			seen[start] = 1;
			const pixels = [start];
			let inside = true;
			for (let head = 0; head < pixels.length; head += 1) {
				const index = pixels[head] ?? 0;
				if (
					index % cell.widthPx >= zoneWidth ||
					Math.floor(index / cell.widthPx) >= zoneHeight
				) {
					inside = false;
				}
				for (const next of neighboursOf(index, cell)) {
					if (seen[next] === 1 || (alpha[next] ?? 0) < INK) continue;
					seen[next] = 1;
					pixels.push(next);
				}
			}
			if (inside) for (const index of pixels) alpha[index] = 0;
		}
	}
	return { ...cell, alpha };
}

export async function readTemplate(photo: Uint8Array): Promise<TemplateCell[]> {
	const mask = await lifted(photo);
	const photoMarkers = markersOf(mask);
	const h = homography(markerCentres(), photoMarkers);
	return slots().map((slot) => ({
		char: slot.char,
		variant: slot.variant,
		mask: withoutLabel(cellMask(mask, h, slot)),
	}));
}
