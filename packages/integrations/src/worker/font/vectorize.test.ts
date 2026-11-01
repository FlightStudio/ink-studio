import { describe, expect, it } from "vitest";
import type { Mask } from "../image/lift.ts";
import { handwrittenG } from "../image/synthetic.ts";
import { VECTORIZE_DEFAULTS, vectorize } from "./vectorize.ts";

type Point = [number, number];

function binaryMask(
	widthPx: number,
	heightPx: number,
	ink: (x: number, y: number) => boolean,
): Mask {
	const alpha = new Uint8Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		for (let x = 0; x < widthPx; x += 1) {
			if (ink(x, y)) alpha[y * widthPx + x] = 255;
		}
	}
	return { widthPx, heightPx, alpha };
}

function signedArea(contour: Point[]): number {
	let sum = 0;
	for (let index = 0; index < contour.length; index += 1) {
		const [x0, y0] = contour[index] as Point;
		const [x1, y1] = contour[(index + 1) % contour.length] as Point;
		sum += x0 * y1 - x1 * y0;
	}
	return sum / 2;
}

function windingAt(contours: Point[][], x: number, y: number): number {
	let winding = 0;
	for (const contour of contours) {
		for (let index = 0; index < contour.length; index += 1) {
			const [x0, y0] = contour[index] as Point;
			const [x1, y1] = contour[(index + 1) % contour.length] as Point;
			if (y0 <= y === y1 <= y) continue;
			const crossX = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
			if (crossX > x) winding += y1 > y0 ? 1 : -1;
		}
	}
	return winding;
}

function fillNonzero(
	contours: Point[][],
	widthPx: number,
	heightPx: number,
): Uint8Array {
	const filled = new Uint8Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		for (let x = 0; x < widthPx; x += 1) {
			if (windingAt(contours, x + 0.5, y + 0.5) !== 0) {
				filled[y * widthPx + x] = 1;
			}
		}
	}
	return filled;
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

function nearest(point: Point, corners: Point[]): number {
	return Math.min(
		...corners.map(([x, y]) => Math.hypot(point[0] - x, point[1] - y)),
	);
}

describe("vectorize", () => {
	it("a filled square is one contour with four corners", () => {
		const mask = binaryMask(
			40,
			40,
			(x, y) => x >= 10 && x < 30 && y >= 10 && y < 30,
		);
		const contours = vectorize(mask, VECTORIZE_DEFAULTS);
		expect(contours).toHaveLength(1);
		const square = contours[0] as Point[];
		expect(square).toHaveLength(4);
		const corners: Point[] = [
			[10, 10],
			[30, 10],
			[30, 30],
			[10, 30],
		];
		for (const point of square) expect(nearest(point, corners)).toBeLessThan(1);
		expect(signedArea(square)).toBeGreaterThan(0);
	});

	it("a ring is an outer contour and a hole wound the other way", () => {
		const mask = binaryMask(60, 60, (x, y) => {
			const r = Math.hypot(x + 0.5 - 30, y + 0.5 - 30);
			return r >= 10 && r <= 22;
		});
		const contours = vectorize(mask, VECTORIZE_DEFAULTS);
		expect(contours).toHaveLength(2);
		const [outer, hole] = [...contours].sort(
			(a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)),
		) as [Point[], Point[]];
		expect(signedArea(outer)).toBeGreaterThan(0);
		expect(signedArea(hole)).toBeLessThan(0);
		expect(Math.abs(signedArea(outer))).toBeCloseTo(Math.PI * 22 ** 2, -2);
		expect(Math.abs(signedArea(hole))).toBeCloseTo(Math.PI * 10 ** 2, -2);
		for (const point of hole) {
			expect(windingAt([outer], point[0], point[1])).not.toBe(0);
		}
	});

	it("two blobs are two contours", () => {
		const mask = binaryMask(60, 30, (x, y) => {
			const left = Math.hypot(x + 0.5 - 15, y + 0.5 - 15) <= 8;
			const right = Math.hypot(x + 0.5 - 45, y + 0.5 - 15) <= 8;
			return left || right;
		});
		const contours = vectorize(mask, VECTORIZE_DEFAULTS);
		expect(contours).toHaveLength(2);
		for (const contour of contours) {
			expect(signedArea(contour)).toBeGreaterThan(0);
		}
		const centres = contours
			.map(
				(contour) => contour.reduce((sum, [x]) => sum + x, 0) / contour.length,
			)
			.sort((a, b) => a - b);
		expect(centres[0]).toBeCloseTo(15, 0);
		expect(centres[1]).toBeCloseTo(45, 0);
	});

	it("pixels touching only at a corner stay one shape", () => {
		const mask = binaryMask(30, 30, (x, y) => {
			const first = x >= 5 && x < 15 && y >= 5 && y < 15;
			const second = x >= 15 && x < 25 && y >= 15 && y < 25;
			return first || second;
		});
		const contours = vectorize(mask, VECTORIZE_DEFAULTS);
		expect(contours).toHaveLength(1);
		expect(windingAt(contours, 10, 10)).not.toBe(0);
		expect(windingAt(contours, 20, 20)).not.toBe(0);
		expect(signedArea(contours[0] as Point[])).toBeGreaterThan(180);
	});

	it("the contours fill back to the mask", async () => {
		const mask = await handwrittenG();
		const contours = vectorize(mask, VECTORIZE_DEFAULTS);
		expect(contours.length).toBeGreaterThanOrEqual(2);
		const ink = mask.alpha.map((value) => (value >= 128 ? 1 : 0));
		const filled = fillNonzero(contours, mask.widthPx, mask.heightPx);
		expect(iou(ink, filled)).toBeGreaterThanOrEqual(0.95);
		const points = contours.reduce((sum, contour) => sum + contour.length, 0);
		expect(points).toBeLessThan(200);
	});
});
