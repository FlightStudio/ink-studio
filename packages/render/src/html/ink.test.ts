import type { Stroke, StrokeInput } from "@repo/types";
import { describe, expect, it } from "vitest";
import { outlinePath, STROKE_OPTIONS, strokeOutline } from "./ink.ts";

function vertical(input: StrokeInput, pressure: number): Stroke {
	return {
		input,
		points: Array.from(
			{ length: 21 },
			(_, index) => [0, index * 5, pressure, index * 16] as const,
		),
	};
}

function widthOf(outline: [number, number][]): number {
	const xs = outline.map(([x]) => x);
	return Math.max(...xs) - Math.min(...xs);
}

describe("strokeOutline", () => {
	it("a pen's pressure shapes its outline and a mouse's does not", () => {
		expect(widthOf(strokeOutline(vertical("pen", 1), 1))).toBeGreaterThan(
			widthOf(strokeOutline(vertical("pen", 0.1), 1)) + 1,
		);
		expect(strokeOutline(vertical("mouse", 1), 1)).toEqual(
			strokeOutline(vertical("mouse", 0.1), 1),
		);
	});

	it("the scale multiplies the stroke's width", () => {
		expect(widthOf(strokeOutline(vertical("pen", 0.5), 5))).toBeCloseTo(
			STROKE_OPTIONS.size * 5,
			0,
		);
	});
});

describe("outlinePath", () => {
	it("an outline becomes one closed path and no outline an empty one", () => {
		const path = outlinePath(strokeOutline(vertical("pen", 0.5), 1));
		expect(path.startsWith("M")).toBe(true);
		expect(path.endsWith("Z")).toBe(true);
		expect(path.match(/M/g)).toHaveLength(1);
		expect(outlinePath([])).toBe("");
	});
});
