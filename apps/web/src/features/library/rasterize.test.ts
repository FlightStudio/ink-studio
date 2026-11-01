import type { Stroke, StrokePoint } from "@repo/types";
import { describe, expect, it } from "vitest";
import { MIN_STROKE_SCALE, type RasterPlan, rasterPlan } from "./rasterize.ts";

const BOX = { widthPx: 640, heightPx: 400 };

function line(x0: number, y0: number, x1: number, y1: number): Stroke {
	const points = Array.from({ length: 12 }, (_, index): StrokePoint => {
		const t = index / 11;
		return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.5, index * 16];
	});
	return { input: "mouse", points };
}

function weight(plan: RasterPlan): number {
	return plan.strokeScale / Math.max(plan.inkWidth, plan.inkHeight);
}

describe("rasterPlan", () => {
	it("ink across the whole box keeps the drawn line weight", () => {
		const plan = rasterPlan([line(10, 200, 630, 200)], BOX);
		expect(plan?.strokeScale).toBeCloseTo(620 / 640, 2);
	});

	it("a small drawing gets a lighter line, so its weight matches once placed", () => {
		const big = rasterPlan([line(0, 0, 600, 300)], BOX);
		const small = rasterPlan([line(0, 0, 150, 75)], BOX);
		if (!big || !small) throw new Error("no plan");
		expect(weight(small) / weight(big)).toBeGreaterThan(0.9);
		expect(weight(small) / weight(big)).toBeLessThan(1.1);
	});

	it("a dot keeps a visible line", () => {
		const plan = rasterPlan([line(100, 100, 100, 100)], BOX);
		expect(plan?.strokeScale).toBe(MIN_STROKE_SCALE);
	});

	it("the picture is the ink's own box at the long side's resolution", () => {
		const plan = rasterPlan([line(100, 100, 200, 150)], BOX);
		if (!plan) throw new Error("no plan");
		expect(Math.max(plan.widthPx, plan.heightPx)).toBe(1200);
		expect(plan.widthPx / plan.heightPx).toBeCloseTo(
			plan.inkWidth / plan.inkHeight,
			1,
		);
	});

	it("no strokes give no plan", () => {
		expect(rasterPlan([], BOX)).toBeNull();
	});
});
