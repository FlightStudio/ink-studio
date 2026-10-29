import type { PlacedElement } from "@repo/types";
import { PAGE_SPECS } from "@repo/types";
import { describe, expect, it } from "vitest";
import {
	boundsOf,
	columnBox,
	exclusionFloats,
	overflowIn,
	pageExclusions,
	placementIssues,
	sidesUsed,
	sideTopIn,
	wrapExclusions,
	writingSides,
} from "./geometry.ts";

const letter = PAGE_SPECS["thanksio:letter-windowless"];
const postcard = PAGE_SPECS["thanksio:postcard-6x9"];

describe("pageExclusions", () => {
	it("the band between side 1 and side 2 covers both margins and the gap", () => {
		const [band] = pageExclusions(letter, 0.5);
		expect(band).toEqual({
			xIn: 0,
			yIn: 9.5,
			widthIn: 7,
			heightIn: 2,
			wrap: "both",
		});
	});

	it("with no gap the bands sit on the page seams", () => {
		expect(pageExclusions(letter, 0)).toEqual([
			{ xIn: 0, yIn: 9.5, widthIn: 7, heightIn: 1.5, wrap: "both" },
			{ xIn: 0, yIn: 20.5, widthIn: 7, heightIn: 1.5, wrap: "both" },
			{ xIn: 0, yIn: 31.5, widthIn: 7, heightIn: 1.5, wrap: "both" },
		]);
	});

	it("the letter's barcode corners add no exclusion", () => {
		expect(pageExclusions(letter, 0.5)).toEqual([
			{ xIn: 0, yIn: 9.5, widthIn: 7, heightIn: 2, wrap: "both" },
			{ xIn: 0, yIn: 21, widthIn: 7, heightIn: 2, wrap: "both" },
			{ xIn: 0, yIn: 32.5, widthIn: 7, heightIn: 2, wrap: "both" },
		]);
	});

	it("a band after the last side keeps overflow text off its bottom margin", () => {
		const last = pageExclusions(letter, 0.5).at(-1);
		expect(last).toEqual({
			xIn: 0,
			yIn: sideTopIn(letter, letter.maxPages - 1, 0.5) + 9.5,
			widthIn: 7,
			heightIn: 2,
			wrap: "both",
		});
		expect((last?.yIn ?? 0) + (last?.heightIn ?? 0)).toBe(
			sideTopIn(letter, letter.maxPages, 0.5),
		);
	});

	it("a postcard writes only on its back", () => {
		expect(writingSides(postcard)).toEqual([1]);
		const column = columnBox(postcard, 0.5);
		expect(column.xIn).toBe(0);
		expect(column.yIn).toBe(0);
		expect(column.widthIn).toBeCloseTo(8.377, 3);
		expect(column.heightIn).toBeCloseTo(5.377, 3);
	});

	it("the postcard's address block shapes the back's text", () => {
		const exclusions = pageExclusions(postcard, 0.5).filter(
			(exclusion) => exclusion.wrap !== "both",
		);
		expect(exclusions).toHaveLength(1);
		const [block] = exclusions;
		expect(block?.wrap).toBe("right");
		expect(block?.xIn).toBeCloseTo(4.775, 3);
		expect(block?.yIn).toBeCloseTo(2.675, 3);
		expect(block?.widthIn).toBeCloseTo(3.602, 3);
		expect(block?.heightIn).toBeCloseTo(2.702, 3);
	});
});

describe("boundsOf", () => {
	it("a box turned 90 degrees swaps its footprint about its centre", () => {
		expect(
			boundsOf({
				side: 0,
				xIn: 1,
				yIn: 1,
				widthIn: 2,
				heightIn: 1,
				rotationDeg: 90,
			}),
		).toEqual({ xIn: 1.5, yIn: 0.5, widthIn: 1, heightIn: 2 });
	});

	it("a square turned 45 degrees grows to its diagonal", () => {
		const bounds = boundsOf({
			side: 0,
			xIn: 1,
			yIn: 1,
			widthIn: 1,
			heightIn: 1,
			rotationDeg: 45,
		});
		expect(bounds.widthIn).toBeCloseTo(Math.SQRT2, 6);
		expect(bounds.heightIn).toBeCloseTo(Math.SQRT2, 6);
	});
});

describe("sidesUsed", () => {
	it("text a tenth of an inch onto side 2 uses two sides", () => {
		expect(
			sidesUsed(letter, { textBottomIn: 11.1, boxes: [], minSides: 1 }),
		).toBe(2);
	});

	it("text ending at the bottom of side 1 uses one side", () => {
		expect(
			sidesUsed(letter, { textBottomIn: 9.5, boxes: [], minSides: 1 }),
		).toBe(1);
	});

	it("an added side counts even when empty", () => {
		expect(sidesUsed(letter, { textBottomIn: 2, boxes: [], minSides: 2 })).toBe(
			2,
		);
	});

	it("a doodle alone on the third side makes three sides", () => {
		expect(
			sidesUsed(letter, {
				textBottomIn: 2,
				boxes: [
					{
						side: 2,
						xIn: 2,
						yIn: 2,
						widthIn: 1,
						heightIn: 1,
						rotationDeg: 0,
					},
				],
				minSides: 1,
			}),
		).toBe(3);
	});

	it("text past the last allowed side uses only the allowed sides", () => {
		expect(
			sidesUsed(letter, { textBottomIn: 32, boxes: [], minSides: 1 }),
		).toBe(3);
	});

	it("a postcard's back counts its image front", () => {
		expect(
			sidesUsed(postcard, { textBottomIn: 1, boxes: [], minSides: 1 }),
		).toBe(2);
	});
});

describe("overflowIn", () => {
	it("overflow is how far text runs past the last allowed side", () => {
		expect(overflowIn(letter, { textBottomIn: 32 })).toBe(0.5);
	});
});

describe("placementIssues", () => {
	it("a box in the top-right barcode corner of side 1 is flagged, the same box on side 2 is not", () => {
		const corner = {
			xIn: 7.9,
			yIn: 0.2,
			widthIn: 0.3,
			heightIn: 0.2,
			rotationDeg: 0,
		};
		expect(
			placementIssues(letter, {
				boxes: [
					{ ...corner, id: "front", side: 0 },
					{ ...corner, id: "back", side: 1 },
				],
				sides: 3,
			}),
		).toEqual([{ elementId: "front", kind: "keep-clear" }]);
	});

	it("a box over the postcard's address block is flagged", () => {
		expect(
			placementIssues(postcard, {
				boxes: [
					{
						id: "stamp",
						side: 1,
						xIn: 6,
						yIn: 4,
						widthIn: 1,
						heightIn: 1,
						rotationDeg: 0,
					},
				],
				sides: 2,
			}),
		).toEqual([{ elementId: "stamp", kind: "keep-clear" }]);
	});

	it("a box a tenth of an inch from the paper edge is outside the safe zone", () => {
		expect(
			placementIssues(letter, {
				boxes: [
					{
						id: "edge",
						side: 0,
						xIn: 0.1,
						yIn: 3,
						widthIn: 1,
						heightIn: 1,
						rotationDeg: 0,
					},
				],
				sides: 3,
			}),
		).toEqual([{ elementId: "edge", kind: "outside-safe" }]);
	});

	it("a rotated box is flagged by its footprint", () => {
		expect(
			placementIssues(letter, {
				boxes: [
					{
						id: "turned",
						side: 0,
						xIn: 3,
						yIn: 0.3,
						widthIn: 2,
						heightIn: 0.2,
						rotationDeg: 45,
					},
				],
				sides: 3,
			}),
		).toEqual([{ elementId: "turned", kind: "outside-safe" }]);
	});

	it("a box past the last allowed side is flagged", () => {
		expect(
			placementIssues(letter, {
				boxes: [
					{
						id: "late",
						side: 3,
						xIn: 2,
						yIn: 2,
						widthIn: 1,
						heightIn: 1,
						rotationDeg: 0,
					},
				],
				sides: 3,
			}),
		).toEqual([{ elementId: "late", kind: "beyond-sides" }]);
	});
});

describe("exclusionFloats", () => {
	const column = { xIn: 0, yIn: 0, widthIn: 7, heightIn: 31.5 };

	it("a band becomes a spacer and a clearing full-width float", () => {
		expect(
			exclusionFloats(column, [
				{ xIn: 0, yIn: 9.5, widthIn: 7, heightIn: 1.5, wrap: "both" },
			]),
		).toEqual([
			{ float: "left", clear: "none", widthIn: 0, heightIn: 9.5 },
			{ float: "left", clear: "both", widthIn: 7, heightIn: 1.5 },
		]);
	});

	it("exclusions on both sides keep their own tops", () => {
		expect(
			exclusionFloats(column, [
				{ xIn: 1, yIn: 2, widthIn: 1, heightIn: 2, wrap: "left" },
				{ xIn: 5, yIn: 1, widthIn: 2, heightIn: 2, wrap: "right" },
			]),
		).toEqual([
			{ float: "right", clear: "none", widthIn: 0, heightIn: 1 },
			{ float: "right", clear: "right", widthIn: 2, heightIn: 2 },
			{ float: "left", clear: "none", widthIn: 0, heightIn: 1 },
			{ float: "left", clear: "left", widthIn: 1, heightIn: 2 },
		]);
	});
});

function placed(
	over: Partial<PlacedElement> & Pick<PlacedElement, "xIn" | "yIn">,
): PlacedElement {
	return {
		id: "0190a8d6-5c1e-7b3a-9f00-0000000000d1",
		kind: "drawing",
		drawingId: "0190a8d6-5c1e-7b3a-9f00-0000000000d2",
		side: 0,
		widthIn: 2,
		heightIn: 1,
		rotationDeg: 0,
		tint: "ink-blue",
		wrap: true,
		...over,
	};
}

describe("wrapExclusions", () => {
	it("a doodle in the left half pushes text to its right", () => {
		const [exclusion] = wrapExclusions(
			letter,
			[placed({ xIn: 1, yIn: 2 })],
			0.5,
		);
		expect(exclusion?.wrap).toBe("left");
		expect(exclusion?.xIn).toBe(0);
		expect(exclusion?.widthIn).toBeCloseTo(2.37, 5);
		expect(exclusion?.yIn).toBeCloseTo(1.13, 5);
		expect(exclusion?.heightIn).toBeCloseTo(1.24, 5);
	});

	it("a doodle in the right half pushes text to its left", () => {
		const [exclusion] = wrapExclusions(
			letter,
			[placed({ xIn: 5.5, yIn: 2, widthIn: 1.5 })],
			0.5,
		);
		expect(exclusion?.wrap).toBe("right");
		expect(exclusion?.xIn).toBeCloseTo(4.63, 5);
		expect(exclusion?.widthIn).toBeCloseTo(2.37, 5);
		expect(exclusion?.yIn).toBeCloseTo(1.13, 5);
		expect(exclusion?.heightIn).toBeCloseTo(1.24, 5);
	});

	it("a doodle that does not wrap adds no exclusion", () => {
		expect(
			wrapExclusions(letter, [placed({ xIn: 1, yIn: 2, wrap: false })], 0.5),
		).toEqual([]);
	});

	it("a wrapping doodle on side 2 sits in side 2's stretch of the column", () => {
		const [exclusion] = wrapExclusions(
			letter,
			[placed({ xIn: 1, yIn: 2, side: 2 })],
			0.5,
		);
		expect(exclusion?.wrap).toBe("left");
		expect(exclusion?.xIn).toBe(0);
		expect(exclusion?.yIn).toBeCloseTo(24.13, 5);
		expect(exclusion?.heightIn).toBeCloseTo(1.24, 5);
	});

	it("a wrapping doodle in the bottom margin adds no exclusion", () => {
		expect(
			wrapExclusions(
				letter,
				[placed({ xIn: 2, yIn: 10.5, widthIn: 1, heightIn: 0.3 })],
				0.5,
			),
		).toEqual([]);
	});

	it("two overlapping wrapping doodles on one side become one exclusion", () => {
		expect(
			wrapExclusions(
				letter,
				[
					placed({ xIn: 1, yIn: 2, heightIn: 1.5 }),
					placed({
						id: "0190a8d6-5c1e-7b3a-9f00-0000000000d3",
						xIn: 1.4,
						yIn: 2.8,
						widthIn: 1.6,
						heightIn: 1.5,
					}),
				],
				0.5,
			),
		).toEqual([
			{
				xIn: 0,
				yIn: 1.13,
				widthIn: 2.37,
				heightIn: 2.54,
				wrap: "left",
			},
		]);
	});
});
