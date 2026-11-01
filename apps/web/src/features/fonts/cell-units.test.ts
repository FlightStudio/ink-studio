import type { Stroke } from "@repo/types";
import { describe, expect, test } from "vitest";
import { toCellUnits } from "./cell-units.ts";

const wide: Stroke = {
	input: "pen",
	points: [
		[20, 40, 0.5, 0],
		[100, 160, 0.4, 12],
	],
};

const narrow: Stroke = {
	input: "pen",
	points: [
		[12, 24, 0.5, 0],
		[60, 96, 0.4, 12],
	],
};

describe("toCellUnits", () => {
	test("the same stroke on a 200 px cell and a 120 px cell saves the same points", () => {
		expect(toCellUnits(wide, 200)).toEqual(toCellUnits(narrow, 120));
	});
});
