import {
	boundsOf,
	keepClearRect,
	type Rect,
	sideTopIn,
} from "@repo/render/html";
import type { PageSpec, PlacedElement } from "@repo/types";

export type Handle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type KnobSide = "top" | "bottom";
export type PointIn = { xIn: number; yIn: number };
export type PointerParams = { pointer: PointIn; spec: PageSpec; gapIn: number };
export type Placement = Pick<PlacedElement, "side" | "xIn" | "yIn">;
type Frame = Pick<
	PlacedElement,
	"xIn" | "yIn" | "widthIn" | "heightIn" | "rotationDeg"
>;

export const MIN_ELEMENT_IN = 0.25;
export const SNAP_DEG = 4;
export const PLACE_OFFSET_IN = 0.25;
export const SIGNATURE_GAP_IN = 0.15;
const SAME_SPOT_IN = 0.01;
const STUCK_IN = 1e-6;
const RESIZE_CURSORS = [
	"ew-resize",
	"nwse-resize",
	"ns-resize",
	"nesw-resize",
] as const;

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

function rotated(offset: PointIn, rotationDeg: number): PointIn {
	const { cos, sin } = turn(rotationDeg);
	return {
		xIn: offset.xIn * cos - offset.yIn * sin,
		yIn: offset.xIn * sin + offset.yIn * cos,
	};
}

function toWorld(
	element: PlacedElement,
	local: PointIn,
	spec: PageSpec,
	gapIn: number,
): PointIn {
	const centre = centreOf(element, spec, gapIn);
	const offset = rotated(
		{
			xIn: local.xIn - element.widthIn / 2,
			yIn: local.yIn - element.heightIn / 2,
		},
		element.rotationDeg,
	);
	return { xIn: centre.xIn + offset.xIn, yIn: centre.yIn + offset.yIn };
}

function toLocal(
	element: PlacedElement,
	pointer: PointIn,
	spec: PageSpec,
	gapIn: number,
): PointIn {
	const centre = centreOf(element, spec, gapIn);
	const offset = rotated(
		{ xIn: pointer.xIn - centre.xIn, yIn: pointer.yIn - centre.yIn },
		-element.rotationDeg,
	);
	return {
		xIn: offset.xIn + element.widthIn / 2,
		yIn: offset.yIn + element.heightIn / 2,
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
	const offset = rotated(
		{ xIn: anchor.xIn - size.widthIn / 2, yIn: anchor.yIn - size.heightIn / 2 },
		element.rotationDeg,
	);
	return {
		xIn: anchorWorld.xIn - offset.xIn - size.widthIn / 2,
		yIn:
			anchorWorld.yIn -
			offset.yIn -
			sideTopIn(spec, element.side, gapIn) -
			size.heightIn / 2,
	};
}

function fit(startIn: number, sizeIn: number, limitIn: number): number {
	if (sizeIn >= limitIn) return (limitIn - sizeIn) / 2;
	return Math.min(Math.max(startIn, 0), limitIn - sizeIn);
}

function onPaper(
	frame: Frame,
	spec: PageSpec,
): Pick<PlacedElement, "xIn" | "yIn"> {
	const bounds = boundsOf({ ...frame, side: 0 });
	return {
		xIn: frame.xIn + fit(bounds.xIn, bounds.widthIn, spec.widthIn) - bounds.xIn,
		yIn:
			frame.yIn + fit(bounds.yIn, bounds.heightIn, spec.heightIn) - bounds.yIn,
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
): Placement {
	const centre = stackPoint(params.spec, params.pointer.yIn, params.gapIn);
	return {
		side: centre.side,
		...onPaper(
			{
				...element,
				xIn: params.pointer.xIn - element.widthIn / 2,
				yIn: centre.yOnSide - element.heightIn / 2,
			},
			params.spec,
		),
	};
}

export function nudge(
	element: PlacedElement,
	by: { dxIn: number; dyIn: number },
	spec: PageSpec,
	gapIn: number,
): Placement {
	const centre = centreOf(element, spec, gapIn);
	const moved = moveTo(element, {
		pointer: { xIn: centre.xIn + by.dxIn, yIn: centre.yIn + by.dyIn },
		spec,
		gapIn,
	});
	const stuck =
		moved.side === element.side && Math.abs(moved.yIn - element.yIn) < STUCK_IN;
	const next = element.side + Math.sign(by.dyIn);
	if (
		!stuck ||
		by.dyIn === 0 ||
		next < firstSide(spec) ||
		next > spec.maxPages - 1
	) {
		return moved;
	}
	const edge = by.dyIn > 0 ? -spec.heightIn : spec.heightIn;
	return {
		side: next,
		...onPaper({ ...element, xIn: moved.xIn, yIn: element.yIn + edge }, spec),
	};
}

function overlaps(a: Rect, b: Rect): boolean {
	return (
		a.xIn < b.xIn + b.widthIn &&
		b.xIn < a.xIn + a.widthIn &&
		a.yIn < b.yIn + b.heightIn &&
		b.yIn < a.yIn + a.heightIn
	);
}

function inSafeArea(
	spec: PageSpec,
	side: number,
	box: Rect,
): Pick<PlacedElement, "xIn" | "yIn"> {
	const area: Rect = {
		xIn: spec.marginIn,
		yIn: spec.marginIn,
		widthIn: spec.widthIn - 2 * spec.marginIn,
		heightIn: spec.heightIn - 2 * spec.marginIn,
	};
	const inside = {
		...box,
		xIn: area.xIn + fit(box.xIn - area.xIn, box.widthIn, area.widthIn),
		yIn: area.yIn + fit(box.yIn - area.yIn, box.heightIn, area.heightIn),
	};
	const zones = spec.keepClear
		.filter((zone) => zone.side === side)
		.map((zone) => keepClearRect(spec, zone));
	const clear = (at: Rect) => !zones.some((zone) => overlaps(zone, at));
	if (clear(inside)) return { xIn: inside.xIn, yIn: inside.yIn };
	const fits = (at: Rect) =>
		at.xIn >= area.xIn &&
		at.yIn >= area.yIn &&
		at.xIn + at.widthIn <= area.xIn + area.widthIn &&
		at.yIn + at.heightIn <= area.yIn + area.heightIn;
	const moves = zones
		.flatMap((zone) => [
			{ ...inside, xIn: zone.xIn - inside.widthIn },
			{ ...inside, xIn: zone.xIn + zone.widthIn },
			{ ...inside, yIn: zone.yIn - inside.heightIn },
			{ ...inside, yIn: zone.yIn + zone.heightIn },
		])
		.filter((at) => fits(at) && clear(at));
	const distance = (at: Rect) =>
		Math.hypot(at.xIn - inside.xIn, at.yIn - inside.yIn);
	const nearest = moves.sort((a, b) => distance(a) - distance(b))[0] ?? inside;
	return { xIn: nearest.xIn, yIn: nearest.yIn };
}

export function placementFor(
	spec: PageSpec,
	centre: { side: number; xIn: number; yIn: number },
	size: { widthIn: number; heightIn: number },
	existing: readonly PlacedElement[],
): Placement {
	let spot = inSafeArea(spec, centre.side, {
		...size,
		xIn: centre.xIn - size.widthIn / 2,
		yIn: centre.yIn - size.heightIn / 2,
	});
	const taken = (at: Pick<PlacedElement, "xIn" | "yIn">) =>
		existing.some(
			(element) =>
				element.side === centre.side &&
				Math.abs(element.xIn - at.xIn) < SAME_SPOT_IN &&
				Math.abs(element.yIn - at.yIn) < SAME_SPOT_IN,
		);
	for (let step = 0; step < existing.length && taken(spot); step += 1) {
		spot = inSafeArea(spec, centre.side, {
			...size,
			xIn: spot.xIn + PLACE_OFFSET_IN,
			yIn: spot.yIn + PLACE_OFFSET_IN,
		});
	}
	return { side: centre.side, ...spot };
}

export function signaturePlacement(
	spec: PageSpec,
	textBottomIn: number,
	size: { widthIn: number; heightIn: number },
	existing: readonly PlacedElement[],
): Placement {
	const lastSide = spec.maxPages - 1;
	const index = Math.max(0, Math.floor(textBottomIn / spec.heightIn));
	let side = Math.min(lastSide, firstSide(spec) + index);
	let topIn =
		spec.marginIn + textBottomIn - index * spec.heightIn + SIGNATURE_GAP_IN;
	if (
		topIn + size.heightIn > spec.heightIn - spec.marginIn &&
		side < lastSide
	) {
		side += 1;
		topIn = spec.marginIn;
	}
	return placementFor(
		spec,
		{
			side,
			xIn: spec.widthIn - spec.marginIn - size.widthIn / 2,
			yIn: topIn + size.heightIn / 2,
		},
		size,
		existing,
	);
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

function minScale(element: PlacedElement): number {
	return Math.max(
		MIN_ELEMENT_IN / element.widthIn,
		MIN_ELEMENT_IN / element.heightIn,
	);
}

function clampScale(scale: number, min: number, max: number): number {
	return Math.min(Math.max(min, max), Math.max(scale, min));
}

function room(startIn: number, offsetIn: number, limitIn: number): number {
	if (offsetIn > 0) return (limitIn - startIn) / offsetIn;
	if (offsetIn < 0) return startIn / -offsetIn;
	return Number.POSITIVE_INFINITY;
}

function anchoredMaxScale(
	element: PlacedElement,
	anchor: PointIn,
	anchorWorld: PointIn,
	spec: PageSpec,
	gapIn: number,
): number {
	const start = {
		xIn: anchorWorld.xIn,
		yIn: anchorWorld.yIn - sideTopIn(spec, element.side, gapIn),
	};
	return [
		{ xIn: 0, yIn: 0 },
		{ xIn: element.widthIn, yIn: 0 },
		{ xIn: 0, yIn: element.heightIn },
		{ xIn: element.widthIn, yIn: element.heightIn },
	]
		.map((local) =>
			rotated(
				{ xIn: local.xIn - anchor.xIn, yIn: local.yIn - anchor.yIn },
				element.rotationDeg,
			),
		)
		.reduce(
			(max, offset) =>
				Math.min(
					max,
					room(start.xIn, offset.xIn, spec.widthIn),
					room(start.yIn, offset.yIn, spec.heightIn),
				),
			Number.POSITIVE_INFINITY,
		);
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
	const projected =
		(rawWidth * element.widthIn + rawHeight * element.heightIn) /
		(element.widthIn ** 2 + element.heightIn ** 2);
	const scale = clampScale(
		projected,
		minScale(element),
		anchoredMaxScale(element, anchor, anchorWorld, params.spec, params.gapIn),
	);
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

export function resizeBy(
	element: PlacedElement,
	factor: number,
	spec: PageSpec,
): Pick<PlacedElement, "xIn" | "yIn" | "widthIn" | "heightIn"> {
	const bounds = boundsOf(element);
	const scale = clampScale(
		factor,
		minScale(element),
		Math.min(spec.widthIn / bounds.widthIn, spec.heightIn / bounds.heightIn),
	);
	const widthIn = element.widthIn * scale;
	const heightIn = element.heightIn * scale;
	const frame = {
		...element,
		xIn: element.xIn + (element.widthIn - widthIn) / 2,
		yIn: element.yIn + (element.heightIn - heightIn) / 2,
		widthIn,
		heightIn,
	};
	return { ...onPaper(frame, spec), widthIn, heightIn };
}

function halfTurn(degrees: number): number {
	const turned = ((degrees % 360) + 360) % 360;
	return turned > 180 ? turned - 360 : turned;
}

function knobPoint(
	element: PlacedElement,
	knob: KnobSide,
	knobIn: number,
): PointIn {
	return {
		xIn: element.widthIn / 2,
		yIn: knob === "top" ? -knobIn : element.heightIn + knobIn,
	};
}

export function knobSide(
	element: PlacedElement,
	spec: PageSpec,
	gapIn: number,
	knobIn: number,
): KnobSide {
	const top = sideTopIn(spec, element.side, gapIn);
	const onSheet = (knob: KnobSide) => {
		const point = toWorld(
			element,
			knobPoint(element, knob, knobIn),
			spec,
			gapIn,
		);
		return (
			point.xIn >= 0 &&
			point.xIn <= spec.widthIn &&
			point.yIn >= top &&
			point.yIn <= top + spec.heightIn
		);
	};
	return onSheet("top") || !onSheet("bottom") ? "top" : "bottom";
}

export function rotateToward(
	element: PlacedElement,
	params: PointerParams,
	knob: KnobSide,
): number {
	const centre = centreOf(element, params.spec, params.gapIn);
	const dx = params.pointer.xIn - centre.xIn;
	const dy = params.pointer.yIn - centre.yIn;
	const degrees = halfTurn(
		(Math.atan2(dx, -dy) * 180) / Math.PI + (knob === "top" ? 0 : 180),
	);
	const nearest = Math.round(degrees / 90) * 90;
	return Math.abs(degrees - nearest) <= SNAP_DEG ? nearest : degrees;
}

export function rotateBy(element: PlacedElement, stepDeg: number): number {
	return halfTurn(element.rotationDeg + stepDeg);
}

export function resizeCursor(handle: Handle, rotationDeg: number): string {
	const axisDeg = handle === "top-left" || handle === "bottom-right" ? 45 : 135;
	const step = Math.round((axisDeg + rotationDeg) / 45);
	return RESIZE_CURSORS[((step % 4) + 4) % 4] ?? "nwse-resize";
}

export function selectionBounds(
	element: PlacedElement,
	spec: PageSpec,
	gapIn: number,
	reach: { knobIn: number; padIn: number; knob: KnobSide },
): Rect {
	const points = [
		{ xIn: 0, yIn: 0 },
		{ xIn: element.widthIn, yIn: 0 },
		{ xIn: 0, yIn: element.heightIn },
		{ xIn: element.widthIn, yIn: element.heightIn },
		knobPoint(element, reach.knob, reach.knobIn),
	].map((local) => toWorld(element, local, spec, gapIn));
	const left = Math.min(...points.map((point) => point.xIn)) - reach.padIn;
	const top = Math.min(...points.map((point) => point.yIn)) - reach.padIn;
	const right = Math.max(...points.map((point) => point.xIn)) + reach.padIn;
	const bottom = Math.max(...points.map((point) => point.yIn)) + reach.padIn;
	return { xIn: left, yIn: top, widthIn: right - left, heightIn: bottom - top };
}

export function menuPlacement(params: {
	bounds: Rect;
	sheet: { widthIn: number; topIn: number; heightIn: number };
	menu: { widthIn: number; heightIn: number };
	gapIn: number;
}): { leftIn: number; topIn: number } {
	const { bounds, sheet, menu, gapIn } = params;
	const centreIn = bounds.xIn + bounds.widthIn / 2;
	const leftIn = Math.max(
		0,
		Math.min(centreIn - menu.widthIn / 2, sheet.widthIn - menu.widthIn),
	);
	const below = bounds.yIn + bounds.heightIn + gapIn;
	const above = bounds.yIn - gapIn - menu.heightIn;
	const sheetBottom = sheet.topIn + sheet.heightIn;
	if (below + menu.heightIn <= sheetBottom) return { leftIn, topIn: below };
	if (above >= sheet.topIn) return { leftIn, topIn: above };
	return {
		leftIn,
		topIn: Math.max(sheet.topIn, sheetBottom - menu.heightIn),
	};
}
