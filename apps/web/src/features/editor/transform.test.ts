import {
	boundsOf,
	keepClearRect,
	placementIssues,
	sideTopIn,
} from "@repo/render/html";
import type { PageSpec, PlacedElement } from "@repo/types";
import { PAGE_SPECS } from "@repo/types";
import { describe, expect, it } from "vitest";
import {
	knobSide,
	menuPlacement,
	moveTo,
	nudge,
	placementFor,
	resizeBy,
	resizeCursor,
	resizeFrom,
	rotateBy,
	rotateToward,
	SIGNATURE_GAP_IN,
	selectionBounds,
	signaturePlacement,
} from "./transform.ts";

const spec = PAGE_SPECS["thanksio:letter-windowless"];
const postcard = PAGE_SPECS["thanksio:postcard-6x9"];
const gapIn = 0.5;

const element: PlacedElement = {
	id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a12",
	kind: "drawing",
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a13",
	side: 0,
	xIn: 1,
	yIn: 1,
	widthIn: 2,
	heightIn: 1,
	rotationDeg: 0,
	tint: "ink-blue",
	wrap: false,
};

function expectNear(
	actual: Record<string, number>,
	expected: Record<string, number>,
): void {
	expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
	for (const [key, value] of Object.entries(expected)) {
		expect(actual[key]).toBeCloseTo(value);
	}
}

function pointerAt(
	degrees: number,
	from: PlacedElement,
	page: PageSpec,
): {
	xIn: number;
	yIn: number;
} {
	const radians = (degrees * Math.PI) / 180;
	const centreX = from.xIn + from.widthIn / 2;
	const centreY =
		sideTopIn(page, from.side, gapIn) + from.yIn + from.heightIn / 2;
	return {
		xIn: centreX + Math.sin(radians) * 2,
		yIn: centreY - Math.cos(radians) * 2,
	};
}

function screenCorner(
	box: PlacedElement,
	local: { xIn: number; yIn: number },
): { xIn: number; yIn: number } {
	const radians = (box.rotationDeg * Math.PI) / 180;
	const ox = local.xIn - box.widthIn / 2;
	const oy = local.yIn - box.heightIn / 2;
	return {
		xIn:
			box.xIn +
			box.widthIn / 2 +
			ox * Math.cos(radians) -
			oy * Math.sin(radians),
		yIn:
			sideTopIn(spec, box.side, gapIn) +
			box.yIn +
			box.heightIn / 2 +
			ox * Math.sin(radians) +
			oy * Math.cos(radians),
	};
}

function onSheet(box: PlacedElement, page: PageSpec): boolean {
	const bounds = boundsOf(box);
	const slack = 1e-9;
	return (
		bounds.xIn >= -slack &&
		bounds.yIn >= -slack &&
		bounds.xIn + bounds.widthIn <= page.widthIn + slack &&
		bounds.yIn + bounds.heightIn <= page.heightIn + slack
	);
}

describe("resize", () => {
	it("dragging the bottom-right handle keeps the ratio and the top-left corner", () => {
		expect(
			resizeFrom(element, "bottom-right", {
				pointer: { xIn: 5, yIn: 3 },
				spec,
				gapIn,
			}),
		).toEqual({ xIn: 1, yIn: 1, widthIn: 4, heightIn: 2 });
	});

	it("on an element turned a quarter the bottom-right handle sits down and to the left, as CSS draws it", () => {
		const turned = { ...element, rotationDeg: 90 };
		expectNear(
			resizeFrom(turned, "bottom-right", {
				pointer: { xIn: 0.5, yIn: 4.5 },
				spec,
				gapIn,
			}),
			{ xIn: -0.5, yIn: 1.5, widthIn: 4, heightIn: 2 },
		);
	});

	it("dragging a turned corner outward grows the element and the opposite corner stays put", () => {
		const turned = { ...element, xIn: 3, yIn: 4, rotationDeg: 40 };
		const anchor = screenCorner(turned, { xIn: 0, yIn: 0 });
		const handle = screenCorner(turned, {
			xIn: turned.widthIn,
			yIn: turned.heightIn,
		});
		const outward = {
			xIn: handle.xIn + (handle.xIn - anchor.xIn) * 0.5,
			yIn: handle.yIn + (handle.yIn - anchor.yIn) * 0.5,
		};
		const resized = {
			...turned,
			...resizeFrom(turned, "bottom-right", { pointer: outward, spec, gapIn }),
		};
		expect(resized.widthIn).toBeCloseTo(3);
		expect(resized.heightIn).toBeCloseTo(1.5);
		expectNear(screenCorner(resized, { xIn: 0, yIn: 0 }), anchor);
	});

	it("a straight sideways drag on a corner grows the element", () => {
		expectNear(
			resizeFrom(element, "bottom-right", {
				pointer: { xIn: 4, yIn: 2 },
				spec,
				gapIn,
			}),
			{ xIn: 1, yIn: 1, widthIn: 2.8, heightIn: 1.4 },
		);
	});

	it("an element cannot shrink below a quarter inch", () => {
		expect(
			resizeFrom(element, "bottom-right", {
				pointer: { xIn: 1.02, yIn: 1.02 },
				spec,
				gapIn,
			}),
		).toEqual({ xIn: 1, yIn: 1, widthIn: 0.5, heightIn: 0.25 });
	});

	it("an element cannot grow past the sheet", () => {
		const resized = resizeFrom(element, "bottom-right", {
			pointer: { xIn: 40, yIn: 20 },
			spec,
			gapIn,
		});
		expectNear(resized, {
			xIn: 1,
			yIn: 1,
			widthIn: spec.widthIn - 1,
			heightIn: (spec.widthIn - 1) / 2,
		});
	});

	it("a corner dragged past the edge grows the element only up to that edge, from its anchor", () => {
		const nearEdge = { ...element, xIn: 6, yIn: 1 };
		expectNear(
			resizeFrom(nearEdge, "bottom-right", {
				pointer: { xIn: 30, yIn: 20 },
				spec,
				gapIn,
			}),
			{ xIn: 6, yIn: 1, widthIn: 2.5, heightIn: 1.25 },
		);
		const nearTop = { ...element, xIn: 4, yIn: 0.5 };
		expectNear(
			resizeFrom(nearTop, "top-left", {
				pointer: { xIn: -30, yIn: -20 },
				spec,
				gapIn,
			}),
			{ xIn: 3, yIn: 0, widthIn: 3, heightIn: 1.5 },
		);
	});

	it("a turned element grown from a corner keeps its whole footprint on the paper", () => {
		for (const rotationDeg of [30, 90, -135]) {
			const turned = { ...element, xIn: 5.5, yIn: 8, rotationDeg };
			for (const handle of [
				"top-left",
				"top-right",
				"bottom-left",
				"bottom-right",
			] as const) {
				const resized = {
					...turned,
					...resizeFrom(turned, handle, {
						pointer: { xIn: 60, yIn: 80 },
						spec,
						gapIn,
					}),
				};
				expect(onSheet(resized, spec)).toBe(true);
			}
		}
	});

	it("resizing an element on side 2 works in side 2's coordinates", () => {
		const onSide = { ...element, side: 1, xIn: 1, yIn: 2 };
		const top = sideTopIn(spec, onSide.side, gapIn) + onSide.yIn;
		expect(
			resizeFrom(onSide, "bottom-right", {
				pointer: { xIn: onSide.xIn + 3, yIn: top + 1.5 },
				spec,
				gapIn,
			}),
		).toEqual({ xIn: 1, yIn: 2, widthIn: 3, heightIn: 1.5 });
	});

	it("a key press resizes about the centre and keeps the element on the paper", () => {
		expectNear(resizeBy(element, 1.5, spec), {
			xIn: 0.5,
			yIn: 0.75,
			widthIn: 3,
			heightIn: 1.5,
		});
		const corner = { ...element, xIn: 0, yIn: 0 };
		expect(onSheet({ ...corner, ...resizeBy(corner, 2, spec) }, spec)).toBe(
			true,
		);
		expect(resizeBy(element, 0.01, spec).heightIn).toBeCloseTo(0.25);
	});
});

describe("rotate", () => {
	it("rotation snaps within four degrees and is free elsewhere", () => {
		expect(
			rotateToward(
				element,
				{ pointer: pointerAt(88, element, spec), spec, gapIn },
				"top",
			),
		).toBe(90);
		expect(
			rotateToward(
				element,
				{ pointer: pointerAt(80, element, spec), spec, gapIn },
				"top",
			),
		).toBeCloseTo(80);
	});

	it("a knob below the element turns its foot toward the pointer", () => {
		expect(
			rotateToward(
				element,
				{ pointer: pointerAt(180, element, spec), spec, gapIn },
				"bottom",
			),
		).toBeCloseTo(0);
		expect(
			rotateToward(
				element,
				{ pointer: pointerAt(90, element, spec), spec, gapIn },
				"bottom",
			),
		).toBe(-90);
		expect(
			rotateToward(
				element,
				{ pointer: pointerAt(150, element, spec), spec, gapIn },
				"bottom",
			),
		).toBeCloseTo(-30);
	});

	it("the knob sits above the element, and below it when above would leave the paper", () => {
		expect(knobSide(element, spec, gapIn, 0.4)).toBe("top");
		const flush = { ...element, yIn: 0.1 };
		expect(knobSide(flush, spec, gapIn, 0.4)).toBe("bottom");
		const onSecond = { ...flush, side: 1 };
		expect(knobSide(onSecond, spec, gapIn, 0.4)).toBe("bottom");
		const quarterAtRight = {
			...element,
			xIn: spec.widthIn - 1.6,
			yIn: 4,
			rotationDeg: 90,
		};
		expect(knobSide(quarterAtRight, spec, gapIn, 0.4)).toBe("bottom");
		const tall = { ...element, yIn: 0.1, heightIn: spec.heightIn - 0.2 };
		expect(knobSide(tall, spec, gapIn, 0.4)).toBe("top");
	});

	it("the resize cursor follows the corner as the element turns", () => {
		expect(resizeCursor("top-left", 0)).toBe("nwse-resize");
		expect(resizeCursor("top-right", 0)).toBe("nesw-resize");
		expect(resizeCursor("bottom-left", 0)).toBe("nesw-resize");
		expect(resizeCursor("top-left", 90)).toBe("nesw-resize");
		expect(resizeCursor("top-left", 45)).toBe("ns-resize");
		expect(resizeCursor("top-right", 45)).toBe("ew-resize");
		expect(resizeCursor("bottom-right", -88)).toBe("nesw-resize");
		expect(resizeCursor("top-right", 180)).toBe("nesw-resize");
	});

	it("a key press turns by its step and wraps past a half turn", () => {
		expect(rotateBy({ ...element, rotationDeg: 10 }, 15)).toBe(25);
		expect(rotateBy({ ...element, rotationDeg: 175 }, 15)).toBe(-170);
		expect(rotateBy({ ...element, rotationDeg: -179 }, -1)).toBe(180);
	});
});

describe("move", () => {
	it("a drag into the next side moves the element to that side", () => {
		expectNear(
			moveTo(element, {
				pointer: { xIn: 3, yIn: spec.heightIn + gapIn + 1 },
				spec,
				gapIn,
			}),
			{ side: 1, xIn: 2, yIn: 0.5 },
		);
	});

	it("a drag past the last side stays on the last side, on the paper", () => {
		const last = spec.maxPages - 1;
		const moved = moveTo(element, {
			pointer: {
				xIn: 4,
				yIn: sideTopIn(spec, last, gapIn) + spec.heightIn + 4,
			},
			spec,
			gapIn,
		});
		expect(moved.side).toBe(last);
		expect(moved.yIn).toBeCloseTo(spec.heightIn - element.heightIn);
	});

	it("a drag past any edge of the sheet keeps the whole element on the paper", () => {
		for (const pointer of [
			{ xIn: 40, yIn: 3 },
			{ xIn: -40, yIn: 3 },
			{ xIn: 4, yIn: -40 },
		]) {
			const moved = {
				...element,
				...moveTo(element, { pointer, spec, gapIn }),
			};
			expect(moved.side).toBe(0);
			expect(onSheet(moved, spec)).toBe(true);
		}
		expect(
			moveTo(element, { pointer: { xIn: 40, yIn: 3 }, spec, gapIn }).xIn,
		).toBeCloseTo(spec.widthIn - element.widthIn);
	});

	it("a turned element is kept on the paper by its turned footprint", () => {
		const turned = { ...element, rotationDeg: 90 };
		expect(
			moveTo(turned, { pointer: { xIn: -40, yIn: 3 }, spec, gapIn }).xIn,
		).toBeCloseTo(-0.5);
	});

	it("arrow keys nudge the element and stay on the paper", () => {
		expectNear(nudge(element, { dxIn: 0.25, dyIn: 0 }, spec, gapIn), {
			side: 0,
			xIn: 1.25,
			yIn: 1,
		});
		const edge = { ...element, xIn: spec.widthIn - element.widthIn };
		expect(nudge(edge, { dxIn: 0.25, dyIn: 0 }, spec, gapIn).xIn).toBeCloseTo(
			spec.widthIn - element.widthIn,
		);
	});

	it("an arrow key at the foot of a side carries the element onto the next side", () => {
		const foot = { ...element, yIn: spec.heightIn - element.heightIn };
		expectNear(nudge(foot, { dxIn: 0, dyIn: 0.05 }, spec, gapIn), {
			side: 1,
			xIn: 1,
			yIn: 0,
		});
		const head = { ...element, side: 1, yIn: 0 };
		expectNear(nudge(head, { dxIn: 0, dyIn: -0.05 }, spec, gapIn), {
			side: 0,
			xIn: 1,
			yIn: spec.heightIn - element.heightIn,
		});
		const last = { ...foot, side: spec.maxPages - 1 };
		expect(nudge(last, { dxIn: 0, dyIn: 0.05 }, spec, gapIn).side).toBe(
			spec.maxPages - 1,
		);
	});

	it("an arrow key at the head of the first writing side stays there", () => {
		const head = { ...element, side: 1, yIn: 0 };
		expectNear(nudge(head, { dxIn: 0, dyIn: -0.05 }, postcard, gapIn), {
			side: 1,
			xIn: 1,
			yIn: 0,
		});
	});
});

describe("placement", () => {
	const size = { widthIn: 2, heightIn: 1 };

	it("a new element is centred on the point it is given", () => {
		expectNear(placementFor(spec, { side: 1, xIn: 4, yIn: 5 }, size, []), {
			side: 1,
			xIn: 3,
			yIn: 4.5,
		});
	});

	function issuesOf(page: PageSpec, placed: ReturnType<typeof placementFor>) {
		return placementIssues(page, {
			boxes: [{ ...element, ...size, ...placed }],
			sides: page.maxPages,
		});
	}

	it("a point off the paper places the element inside the margins", () => {
		const placed = placementFor(spec, { side: 0, xIn: 4, yIn: 30 }, size, []);
		expectNear(placed, {
			side: 0,
			xIn: 3,
			yIn: spec.heightIn - spec.marginIn - size.heightIn,
		});
		expect(issuesOf(spec, placed)).toEqual([]);
	});

	it("a point at the corner of the sheet places the element inside the margins", () => {
		const placed = placementFor(spec, { side: 0, xIn: 0, yIn: 0 }, size, []);
		expectNear(placed, { side: 0, xIn: spec.marginIn, yIn: spec.marginIn });
		expect(issuesOf(spec, placed)).toEqual([]);
	});

	it("a point in a keep-clear zone moves the element just out of it", () => {
		const zone = postcard.keepClear[0];
		if (!zone) throw new Error("the postcard has no keep-clear zone");
		const clear = keepClearRect(postcard, zone);
		const placed = placementFor(
			postcard,
			{
				side: zone.side,
				xIn: postcard.widthIn - 1,
				yIn: postcard.heightIn - 1,
			},
			size,
			[],
		);
		expectNear(placed, {
			side: zone.side,
			xIn: postcard.widthIn - postcard.marginIn - size.widthIn,
			yIn: clear.yIn - size.heightIn,
		});
		expect(issuesOf(postcard, placed)).toEqual([]);
	});

	it("a copy stepped into a keep-clear zone is moved out of it", () => {
		const zone = postcard.keepClear[0];
		if (!zone) throw new Error("the postcard has no keep-clear zone");
		const clear = keepClearRect(postcard, zone);
		const centre = {
			side: zone.side,
			xIn: clear.xIn + 1,
			yIn: clear.yIn - size.heightIn / 2,
		};
		const first = placementFor(postcard, centre, size, []);
		const second = placementFor(postcard, centre, size, [
			{ ...element, ...size, ...first },
		]);
		expect(second).not.toEqual(first);
		expect(issuesOf(postcard, first)).toEqual([]);
		expect(issuesOf(postcard, second)).toEqual([]);
	});

	it("a second copy steps down and to the right of the first", () => {
		const centre = { side: 0, xIn: 4, yIn: 5 };
		const first = placementFor(spec, centre, size, []);
		const existing = [{ ...element, ...size, ...first }];
		const second = placementFor(spec, centre, size, existing);
		expect(second.xIn).toBeCloseTo(first.xIn + 0.25);
		expect(second.yIn).toBeCloseTo(first.yIn + 0.25);
		const third = placementFor(spec, centre, size, [
			...existing,
			{ ...element, ...size, ...second },
		]);
		expect(third.xIn).toBeCloseTo(first.xIn + 0.5);
	});

	it("a copy on another side does not push the new one", () => {
		const existing = [{ ...element, side: 1, xIn: 3, yIn: 4.5 }];
		expectNear(
			placementFor(spec, { side: 0, xIn: 4, yIn: 5 }, size, existing),
			{ side: 0, xIn: 3, yIn: 4.5 },
		);
	});
});

describe("the element menu", () => {
	const sheet = { widthIn: spec.widthIn, topIn: 0, heightIn: spec.heightIn };
	const menu = { widthIn: 3, heightIn: 0.5 };

	it("sits centred under the selection", () => {
		expectNear(
			menuPlacement({
				bounds: { xIn: 2, yIn: 2, widthIn: 2, heightIn: 1 },
				sheet,
				menu,
				gapIn: 0.1,
			}),
			{ leftIn: 1.5, topIn: 3.1 },
		);
	});

	it("stays inside the sheet near the right edge", () => {
		const placed = menuPlacement({
			bounds: { xIn: 7.5, yIn: 0.2, widthIn: 1, heightIn: 1 },
			sheet,
			menu,
			gapIn: 0.1,
		});
		expect(placed.leftIn).toBeCloseTo(spec.widthIn - menu.widthIn);
	});

	it("goes above the selection when there is no room below", () => {
		expectNear(
			menuPlacement({
				bounds: { xIn: 2, yIn: 10, widthIn: 2, heightIn: 0.8 },
				sheet,
				menu,
				gapIn: 0.1,
			}),
			{ leftIn: 1.5, topIn: 9.4 },
		);
	});

	it("the selection of a turned element covers its corners and the rotate knob", () => {
		const turned = { ...element, xIn: 3, yIn: 3, rotationDeg: 180 };
		expectNear(
			selectionBounds(turned, spec, gapIn, {
				knobIn: 0.3,
				padIn: 0,
				knob: "top",
			}),
			{ xIn: 3, yIn: 3, widthIn: 2, heightIn: 1.3 },
		);
	});

	it("the selection covers a knob that sits below the element", () => {
		expectNear(
			selectionBounds(element, spec, gapIn, {
				knobIn: 0.3,
				padIn: 0,
				knob: "bottom",
			}),
			{ xIn: 1, yIn: 1, widthIn: 2, heightIn: 1.3 },
		);
	});
});

describe("signature placement", () => {
	const size = { widthIn: 2, heightIn: 0.75 };
	const textHeightIn = spec.heightIn - 2 * spec.marginIn;

	function issuesOf(page: PageSpec, placed: ReturnType<typeof placementFor>) {
		return placementIssues(page, {
			boxes: [{ ...element, ...size, ...placed }],
			sides: page.maxPages,
		});
	}

	it("a new signature lands under the last line, at the right margin", () => {
		expectNear(signaturePlacement(spec, 2, size, []), {
			side: 0,
			xIn: spec.widthIn - spec.marginIn - size.widthIn,
			yIn: spec.marginIn + 2 + SIGNATURE_GAP_IN,
		});
	});

	it("text that ends on the second side signs on the second side", () => {
		expectNear(signaturePlacement(spec, spec.heightIn + 1, size, []), {
			side: 1,
			xIn: spec.widthIn - spec.marginIn - size.widthIn,
			yIn: spec.marginIn + 1 + SIGNATURE_GAP_IN,
		});
	});

	it("with no room under the text, the signature starts the next side", () => {
		expectNear(signaturePlacement(spec, textHeightIn - 0.2, size, []), {
			side: 1,
			xIn: spec.widthIn - spec.marginIn - size.widthIn,
			yIn: spec.marginIn,
		});
	});

	it("a full last side keeps the signature inside its margins", () => {
		const last = spec.maxPages - 1;
		const placed = signaturePlacement(
			spec,
			last * spec.heightIn + textHeightIn,
			size,
			[],
		);
		expectNear(placed, {
			side: last,
			xIn: spec.widthIn - spec.marginIn - size.widthIn,
			yIn: spec.heightIn - spec.marginIn - size.heightIn,
		});
		expect(issuesOf(spec, placed)).toEqual([]);
	});

	it("on a postcard it signs the back and keeps clear of the address", () => {
		const placed = signaturePlacement(postcard, 2.5, size, []);
		expect(placed.side).toBe(1);
		expect(issuesOf(postcard, placed)).toEqual([]);
	});
});
