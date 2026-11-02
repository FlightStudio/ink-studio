import { describe, expect, it } from "vitest";
import { INK_ALPHA, inkBox } from "./ink-bounds.ts";

function alphaImage(
	width: number,
	height: number,
	inked: [number, number][],
	alpha = 255,
): Uint8ClampedArray {
	const data = new Uint8ClampedArray(width * height * 4);
	for (const [x, y] of inked) data[(y * width + x) * 4 + 3] = alpha;
	return data;
}

describe("inkBox", () => {
	it("a blank image has no ink", () => {
		expect(inkBox(alphaImage(8, 8, []), 8, 8, 0)).toBeNull();
	});

	it("wraps the inked pixels exactly with no pad", () => {
		const data = alphaImage(20, 10, [
			[4, 3],
			[9, 6],
			[6, 4],
		]);
		expect(inkBox(data, 20, 10, 0)).toEqual({
			x: 4,
			y: 3,
			width: 6,
			height: 4,
		});
	});

	it("pads by a share of the ink's long side and stays inside the image", () => {
		const data = alphaImage(40, 40, [
			[1, 10],
			[20, 12],
		]);
		expect(inkBox(data, 40, 40, 0.1)).toEqual({
			x: 0,
			y: 8,
			width: 23,
			height: 7,
		});
	});

	it("faint speckles below the ink alpha are not ink", () => {
		const data = alphaImage(
			30,
			30,
			[
				[0, 0],
				[29, 29],
			],
			INK_ALPHA - 1,
		);
		data[(12 * 30 + 14) * 4 + 3] = INK_ALPHA;
		expect(inkBox(data, 30, 30, 0)).toEqual({
			x: 14,
			y: 12,
			width: 1,
			height: 1,
		});
	});

	it("an image of only faint speckles has no ink", () => {
		const data = alphaImage(
			10,
			10,
			[
				[2, 2],
				[7, 5],
			],
			INK_ALPHA - 1,
		);
		expect(inkBox(data, 10, 10, 0)).toBeNull();
	});
});
