import { sideTopIn } from "@repo/render/html";
import type { PageSpec, PlacedElement } from "@repo/types";

export type Handle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type PointIn = { xIn: number; yIn: number };
export type PointerParams = { pointer: PointIn; spec: PageSpec; gapIn: number };

export const MIN_ELEMENT_IN = 0.25;
export const SNAP_DEG = 4;

function firstSide(spec: PageSpec): number {
	return spec.front === "image" ? 1 : 0;
}

function centreOf(
	element: PlacedElement,
	spec: PageSpec,
	gapIn: number,
): PointIn {
	return {
		xIn: element.xIn + element.widthIn / 2,
		yIn:
			sideTopIn(spec, element.side, gapIn) + element.yIn + element.heightIn / 2,
	};
}

function turn(rotationDeg: number): { cos: number; sin: number } {
	const radians = (rotationDeg * Math.PI) / 180;
	return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

function toWorld(
	element: PlacedElement,
	local: PointIn,
	spec: PageSpec,
	gapIn: number,
): PointIn {
	const centre = centreOf(element, spec, gapIn);
	const { cos, sin } = turn(element.rotationDeg);
	const ox = local.xIn - element.widthIn / 2;
	const oy = local.yIn - element.heightIn / 2;
	return {
		xIn: centre.xIn + ox * cos + oy * sin,
		yIn: centre.yIn - ox * sin + oy * cos,
	};
}

function toLocal(
	element: PlacedElement,
	pointer: PointIn,
	spec: PageSpec,
	gapIn: number,
): PointIn {
	const centre = centreOf(element, spec, gapIn);
	const { cos, sin } = turn(element.rotationDeg);
	const dx = pointer.xIn - centre.xIn;
	const dy = pointer.yIn - centre.yIn;
	return {
		xIn: dx * cos - dy * sin + element.widthIn / 2,
		yIn: dx * sin + dy * cos + element.heightIn / 2,
	};
}

function originFor(
	element: PlacedElement,
	size: { widthIn: number; heightIn: number },
	anchor: PointIn,
	anchorWorld: PointIn,
	spec: PageSpec,
	gapIn: number,
): Pick<PlacedElement, "xIn" | "yIn"> {
	const { cos, sin } = turn(element.rotationDeg);
	const ox = anchor.xIn - size.widthIn / 2;
	const oy = anchor.yIn - size.heightIn / 2;
	const centreX = anchorWorld.xIn - ox * cos - oy * sin;
	const centreY = anchorWorld.yIn + ox * sin - oy * cos;
	return {
		xIn: centreX - size.widthIn / 2,
		yIn: centreY - sideTopIn(spec, element.side, gapIn) - size.heightIn / 2,
	};
}

function stackPoint(
	spec: PageSpec,
	yIn: number,
	gapIn: number,
): { side: number; yOnSide: number } {
	const first = firstSide(spec);
	const last = spec.maxPages - 1;
	if (yIn <= 0) return { side: first, yOnSide: 0 };
	const pitch = spec.heightIn + gapIn;
	const index = Math.floor(yIn / pitch);
	const side = first + index;
	if (side > last) return { side: last, yOnSide: spec.heightIn };
	const local = yIn - index * pitch;
	if (local <= spec.heightIn) return { side, yOnSide: local };
	const intoGap = local - spec.heightIn;
	if (side >= last || intoGap * 2 < gapIn) {
		return { side, yOnSide: spec.heightIn };
	}
	return { side: side + 1, yOnSide: 0 };
}

export function moveTo(
	element: PlacedElement,
	params: PointerParams,
): Pick<PlacedElement, "side" | "xIn" | "yIn"> {
	const centre = stackPoint(params.spec, params.pointer.yIn, params.gapIn);
	return {
		side: centre.side,
		xIn: params.pointer.xIn - element.widthIn / 2,
		yIn: centre.yOnSide - element.heightIn / 2,
	};
}

function opposite(handle: Handle): Handle {
	if (handle === "top-left") return "bottom-right";
	if (handle === "top-right") return "bottom-left";
	if (handle === "bottom-left") return "top-right";
	return "top-left";
}

function corner(handle: Handle, widthIn: number, heightIn: number): PointIn {
	return {
		xIn: handle.endsWith("right") ? widthIn : 0,
		yIn: handle.startsWith("bottom") ? heightIn : 0,
	};
}

export function resizeFrom(
	element: PlacedElement,
	handle: Handle,
	params: PointerParams,
): Pick<PlacedElement, "xIn" | "yIn" | "widthIn" | "heightIn"> {
	const anchorHandle = opposite(handle);
	const anchor = corner(anchorHandle, element.widthIn, element.heightIn);
	const anchorWorld = toWorld(element, anchor, params.spec, params.gapIn);
	const pointer = toLocal(element, params.pointer, params.spec, params.gapIn);
	const signX = handle.endsWith("right") ? 1 : -1;
	const signY = handle.startsWith("bottom") ? 1 : -1;
	const rawWidth = signX * (pointer.xIn - anchor.xIn);
	const rawHeight = signY * (pointer.yIn - anchor.yIn);
	const fitted = Math.min(
		Math.max(0, rawWidth) / element.widthIn,
		Math.max(0, rawHeight) / element.heightIn,
	);
	const minScale = Math.max(
		MIN_ELEMENT_IN / element.widthIn,
		MIN_ELEMENT_IN / element.heightIn,
	);
	const scale = Math.max(fitted, minScale);
	const widthIn = element.widthIn * scale;
	const heightIn = element.heightIn * scale;
	const nextAnchor = corner(anchorHandle, widthIn, heightIn);
	return {
		...originFor(
			element,
			{ widthIn, heightIn },
			nextAnchor,
			anchorWorld,
			params.spec,
			params.gapIn,
		),
		widthIn,
		heightIn,
	};
}

export function rotateToward(
	element: PlacedElement,
	params: PointerParams,
): number {
	const centre = centreOf(element, params.spec, params.gapIn);
	const dx = params.pointer.xIn - centre.xIn;
	const dy = params.pointer.yIn - centre.yIn;
	const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
	const nearest = Math.round(degrees / 90) * 90;
	return Math.abs(degrees - nearest) <= SNAP_DEG ? nearest : degrees;
}
