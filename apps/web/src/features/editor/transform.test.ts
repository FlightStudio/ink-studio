import { sideTopIn } from "@repo/render/html";
import type { PageSpec, PlacedElement } from "@repo/types";
import { PAGE_SPECS } from "@repo/types";
import { expect, it } from "vitest";
import { moveTo, resizeFrom, rotateToward } from "./transform.ts";

const spec = PAGE_SPECS["thanksio:letter-windowless"];
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

it("dragging the bottom-right handle keeps the ratio and the top-left corner", () => {
	expect(
		resizeFrom(element, "bottom-right", {
			pointer: { xIn: 5, yIn: 4 },
			spec,
			gapIn,
		}),
	).toEqual({ xIn: 1, yIn: 1, widthIn: 4, heightIn: 2 });
});

it("on a turned element the opposite corner stays put", () => {
	const turned = { ...element, rotationDeg: 90 };
	const resized = resizeFrom(turned, "bottom-right", {
		pointer: { xIn: 3.5, yIn: -1.5 },
		spec,
		gapIn,
	});
	expect(resized.widthIn).toBeCloseTo(4);
	expect(resized.heightIn).toBeCloseTo(2);
	expect(resized.xIn).toBeCloseTo(0.5);
	expect(resized.yIn).toBeCloseTo(-0.5);
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

it("rotation snaps within four degrees and is free elsewhere", () => {
	expect(
		rotateToward(element, {
			pointer: pointerAt(88, element, spec),
			spec,
			gapIn,
		}),
	).toBe(90);
	expect(
		rotateToward(element, {
			pointer: pointerAt(80, element, spec),
			spec,
			gapIn,
		}),
	).toBeCloseTo(80);
});

it("a drag into the next side moves the element to that side", () => {
	const moved = moveTo(element, {
		pointer: { xIn: 3, yIn: spec.heightIn + gapIn + 1 },
		spec,
		gapIn,
	});
	expect(moved.side).toBe(1);
	expect(moved.xIn).toBeCloseTo(3 - element.widthIn / 2);
	expect(moved.yIn).toBeCloseTo(1 - element.heightIn / 2);
});

it("a drag past the last side stays on the last side", () => {
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
	expect(moved.yIn + element.heightIn / 2).toBeCloseTo(spec.heightIn);
});

it("resizing an element on side 2 works in side 2's coordinates", () => {
	const onSide = { ...element, side: 1, xIn: 1, yIn: 2 };
	const top = sideTopIn(spec, onSide.side, gapIn) + onSide.yIn;
	expect(
		resizeFrom(onSide, "bottom-right", {
			pointer: { xIn: onSide.xIn + 3, yIn: top + 2 },
			spec,
			gapIn,
		}),
	).toEqual({ xIn: 1, yIn: 2, widthIn: 3, heightIn: 1.5 });
});
