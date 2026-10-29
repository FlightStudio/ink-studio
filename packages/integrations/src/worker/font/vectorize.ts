import type { Mask } from "../image/lift.ts";

export type VectorizeParams = { tolerancePx: number };

export const VECTORIZE_DEFAULTS: VectorizeParams = { tolerancePx: 0.8 };

const INK_ALPHA = 128;
const ISO_ALPHA = INK_ALPHA - 0.5;

type Point = [number, number];
type Side = 0 | 1 | 2 | 3;
type Cut = readonly [Side, Side];
type Box = { left: number; top: number; right: number; bottom: number };

const TOP: Side = 0;
const RIGHT: Side = 1;
const BOTTOM: Side = 2;
const LEFT: Side = 3;

const CUT_TOP_LEFT_AND_BOTTOM_RIGHT: readonly Cut[] = [
	[TOP, LEFT],
	[RIGHT, BOTTOM],
];
const CUT_TOP_RIGHT_AND_BOTTOM_LEFT: readonly Cut[] = [
	[TOP, RIGHT],
	[BOTTOM, LEFT],
];

const CUTS: readonly (readonly Cut[])[] = [
	[],
	[[BOTTOM, LEFT]],
	[[RIGHT, BOTTOM]],
	[[RIGHT, LEFT]],
	[[TOP, RIGHT]],
	[],
	[[TOP, BOTTOM]],
	[[TOP, LEFT]],
	[[TOP, LEFT]],
	[[TOP, BOTTOM]],
	[],
	[[TOP, RIGHT]],
	[[RIGHT, LEFT]],
	[[RIGHT, BOTTOM]],
	[[BOTTOM, LEFT]],
	[],
];

class PaddedGrid {
	readonly columns: number;
	readonly rows: number;
	private readonly mask: Mask;

	constructor(mask: Mask) {
		this.mask = mask;
		this.columns = mask.widthPx + 2;
		this.rows = mask.heightPx + 2;
	}

	sample(column: number, row: number): number {
		const x = column - 1;
		const y = row - 1;
		if (x < 0 || y < 0 || x >= this.mask.widthPx || y >= this.mask.heightPx) {
			return 0;
		}
		return this.mask.alpha[y * this.mask.widthPx + x] ?? 0;
	}

	horizontalEdge(column: number, row: number): number {
		return 2 * (row * this.columns + column);
	}

	verticalEdge(column: number, row: number): number {
		return 2 * (row * this.columns + column) + 1;
	}

	crossing(edge: number): Point {
		const sample = edge >> 1;
		const column = sample % this.columns;
		const row = Math.floor(sample / this.columns);
		const vertical = (edge & 1) === 1;
		const nextColumn = vertical ? column : column + 1;
		const nextRow = vertical ? row + 1 : row;
		const from = this.sample(column, row);
		const to = this.sample(nextColumn, nextRow);
		const t = (ISO_ALPHA - from) / (to - from);
		return [
			column - 0.5 + t * (nextColumn - column),
			row - 0.5 + t * (nextRow - row),
		];
	}
}

function cellCuts(
	grid: PaddedGrid,
	column: number,
	row: number,
): readonly Cut[] {
	const corners = [
		grid.sample(column, row),
		grid.sample(column + 1, row),
		grid.sample(column + 1, row + 1),
		grid.sample(column, row + 1),
	] as const;
	const [topLeft, topRight, bottomRight, bottomLeft] = corners.map(
		(value) => value >= ISO_ALPHA,
	);
	const index =
		(topLeft ? 8 : 0) |
		(topRight ? 4 : 0) |
		(bottomRight ? 2 : 0) |
		(bottomLeft ? 1 : 0);
	if (index !== 5 && index !== 10) return CUTS[index] ?? [];
	const centre = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
	const joined = centre >= ISO_ALPHA;
	if (index === 5) {
		return joined
			? CUT_TOP_LEFT_AND_BOTTOM_RIGHT
			: CUT_TOP_RIGHT_AND_BOTTOM_LEFT;
	}
	return joined ? CUT_TOP_RIGHT_AND_BOTTOM_LEFT : CUT_TOP_LEFT_AND_BOTTOM_RIGHT;
}

function cellEdge(
	grid: PaddedGrid,
	column: number,
	row: number,
	side: Side,
): number {
	if (side === TOP) return grid.horizontalEdge(column, row);
	if (side === BOTTOM) return grid.horizontalEdge(column, row + 1);
	if (side === LEFT) return grid.verticalEdge(column, row);
	return grid.verticalEdge(column + 1, row);
}

function segments(grid: PaddedGrid): Map<number, number[]> {
	const neighbours = new Map<number, number[]>();
	const link = (from: number, to: number) => {
		const list = neighbours.get(from);
		if (list) list.push(to);
		else neighbours.set(from, [to]);
	};
	for (let row = 0; row < grid.rows - 1; row += 1) {
		for (let column = 0; column < grid.columns - 1; column += 1) {
			for (const [a, b] of cellCuts(grid, column, row)) {
				const from = cellEdge(grid, column, row, a);
				const to = cellEdge(grid, column, row, b);
				link(from, to);
				link(to, from);
			}
		}
	}
	return neighbours;
}

function chainLoops(grid: PaddedGrid): Point[][] {
	const neighbours = segments(grid);
	const visited = new Set<number>();
	const loops: Point[][] = [];
	for (const start of neighbours.keys()) {
		if (visited.has(start)) continue;
		const loop: Point[] = [];
		let previous = -1;
		let current = start;
		do {
			visited.add(current);
			loop.push(grid.crossing(current));
			const [first, second] = neighbours.get(current) ?? [];
			const next = first === previous ? second : first;
			if (next === undefined) {
				throw new Error("Contour did not close");
			}
			previous = current;
			current = next;
		} while (current !== start);
		loops.push(loop);
	}
	return loops;
}

function bounds(loop: Point[]): Box {
	const box = {
		left: Number.POSITIVE_INFINITY,
		top: Number.POSITIVE_INFINITY,
		right: Number.NEGATIVE_INFINITY,
		bottom: Number.NEGATIVE_INFINITY,
	};
	for (const [x, y] of loop) {
		box.left = Math.min(box.left, x);
		box.top = Math.min(box.top, y);
		box.right = Math.max(box.right, x);
		box.bottom = Math.max(box.bottom, y);
	}
	return box;
}

function encloses(outer: Box, inner: Box): boolean {
	return (
		outer.left <= inner.left &&
		outer.top <= inner.top &&
		outer.right >= inner.right &&
		outer.bottom >= inner.bottom
	);
}

function inside(loop: Point[], [x, y]: Point): boolean {
	let crossings = 0;
	for (let index = 0; index < loop.length; index += 1) {
		const [x0, y0] = loop[index] as Point;
		const [x1, y1] = loop[(index + 1) % loop.length] as Point;
		if (y0 <= y === y1 <= y) continue;
		if (x0 + ((y - y0) * (x1 - x0)) / (y1 - y0) > x) crossings += 1;
	}
	return crossings % 2 === 1;
}

function containmentDepths(loops: Point[][]): number[] {
	const boxes = loops.map(bounds);
	return loops.map((loop, index) => {
		const box = boxes[index] as Box;
		const probe = loop[0] as Point;
		let depth = 0;
		for (let other = 0; other < loops.length; other += 1) {
			if (other === index) continue;
			if (!encloses(boxes[other] as Box, box)) continue;
			if (inside(loops[other] as Point[], probe)) depth += 1;
		}
		return depth;
	});
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
	const dx = end[0] - start[0];
	const dy = end[1] - start[1];
	const length = dx * dx + dy * dy;
	const t =
		length === 0
			? 0
			: Math.max(
					0,
					Math.min(
						1,
						((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length,
					),
				);
	return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplifyChain(chain: Point[], tolerance: number): Point[] {
	const last = chain.length - 1;
	const keep = new Uint8Array(chain.length);
	keep[0] = 1;
	keep[last] = 1;
	const pending: [number, number][] = [[0, last]];
	for (let span = pending.pop(); span; span = pending.pop()) {
		const [first, end] = span;
		let farthest = -1;
		let distance = tolerance;
		for (let index = first + 1; index < end; index += 1) {
			const away = distanceToSegment(
				chain[index] as Point,
				chain[first] as Point,
				chain[end] as Point,
			);
			if (away > distance) {
				distance = away;
				farthest = index;
			}
		}
		if (farthest < 0) continue;
		keep[farthest] = 1;
		pending.push([first, farthest], [farthest, end]);
	}
	return chain.filter((_, index) => keep[index] === 1);
}

function farthestFrom(loop: Point[], from: Point): number {
	let farthest = 0;
	let distance = -1;
	loop.forEach(([x, y], index) => {
		const away = Math.hypot(x - from[0], y - from[1]);
		if (away > distance) {
			distance = away;
			farthest = index;
		}
	});
	return farthest;
}

export function simplifyLoop(loop: Point[], tolerance: number): Point[] {
	const start = farthestFrom(loop, loop[0] as Point);
	const rotated = [...loop.slice(start), ...loop.slice(0, start)];
	const split = farthestFrom(rotated, rotated[0] as Point);
	const there = simplifyChain(rotated.slice(0, split + 1), tolerance);
	const back = simplifyChain(
		[...rotated.slice(split), rotated[0] as Point],
		tolerance,
	);
	return [...there, ...back.slice(1, -1)];
}

function signedArea(loop: Point[]): number {
	let sum = 0;
	for (let index = 0; index < loop.length; index += 1) {
		const [x0, y0] = loop[index] as Point;
		const [x1, y1] = loop[(index + 1) % loop.length] as Point;
		sum += x0 * y1 - x1 * y0;
	}
	return sum / 2;
}

export function vectorize(
	mask: Mask,
	params: VectorizeParams = VECTORIZE_DEFAULTS,
): [number, number][][] {
	if (mask.alpha.length !== mask.widthPx * mask.heightPx) {
		throw new Error("Mask alpha does not match its size");
	}
	if (!(params.tolerancePx >= 0)) {
		throw new Error("tolerancePx must be zero or more");
	}
	const loops = chainLoops(new PaddedGrid(mask));
	const depths = containmentDepths(loops);
	const contours: Point[][] = [];
	loops.forEach((loop, index) => {
		const simplified = simplifyLoop(loop, params.tolerancePx);
		if (simplified.length < 3) return;
		const clockwise = signedArea(simplified) > 0;
		const outer = (depths[index] ?? 0) % 2 === 0;
		contours.push(clockwise === outer ? simplified : simplified.reverse());
	});
	return contours;
}
