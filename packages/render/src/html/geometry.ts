import type { KeepClearZone, PageSpec, PlacedElement } from "@repo/types";

export type Rect = {
	xIn: number;
	yIn: number;
	widthIn: number;
	heightIn: number;
};
export type PlacedBox = Rect & { side: number; rotationDeg: number };
export type Exclusion = Rect & { wrap: "left" | "right" | "both" };
export const WRAP_PADDING_IN = 0.12;
export type FloatBox = {
	float: "left" | "right";
	clear: "none" | "left" | "right" | "both";
	widthIn: number;
	heightIn: number;
};
export type PlacementIssue = {
	elementId: string;
	kind: "outside-safe" | "keep-clear" | "beyond-sides";
};
export type SidesUsedParams = {
	textBottomIn: number;
	boxes: readonly PlacedBox[];
	minSides: number;
};
export type OverflowParams = { textBottomIn: number };
export type PlacementIssuesParams = {
	boxes: readonly (PlacedBox & { id: string })[];
	sides: number;
};

function firstWritingSide(spec: PageSpec): number {
	return spec.front === "image" ? 1 : 0;
}

function textWidthIn(spec: PageSpec): number {
	return spec.widthIn - 2 * spec.marginIn;
}

function textHeightIn(spec: PageSpec): number {
	return spec.heightIn - 2 * spec.marginIn;
}

function intersect(a: Rect, b: Rect): Rect | null {
	const left = Math.max(a.xIn, b.xIn);
	const top = Math.max(a.yIn, b.yIn);
	const right = Math.min(a.xIn + a.widthIn, b.xIn + b.widthIn);
	const bottom = Math.min(a.yIn + a.heightIn, b.yIn + b.heightIn);
	if (right <= left || bottom <= top) return null;
	return { xIn: left, yIn: top, widthIn: right - left, heightIn: bottom - top };
}

function contains(outer: Rect, inner: Rect): boolean {
	return (
		inner.xIn >= outer.xIn &&
		inner.yIn >= outer.yIn &&
		inner.xIn + inner.widthIn <= outer.xIn + outer.widthIn &&
		inner.yIn + inner.heightIn <= outer.yIn + outer.heightIn
	);
}

function zoneRect(spec: PageSpec, zone: KeepClearZone): Rect {
	return {
		xIn: zone.corner.endsWith("left") ? 0 : spec.widthIn - zone.widthIn,
		yIn: zone.corner.startsWith("top") ? 0 : spec.heightIn - zone.heightIn,
		widthIn: zone.widthIn,
		heightIn: zone.heightIn,
	};
}

export function writingSides(spec: PageSpec): number[] {
	const sides: number[] = [];
	for (let side = firstWritingSide(spec); side < spec.maxPages; side += 1) {
		sides.push(side);
	}
	return sides;
}

export function sideTopIn(spec: PageSpec, side: number, gapIn: number): number {
	return (side - firstWritingSide(spec)) * (spec.heightIn + gapIn);
}

export function columnBox(spec: PageSpec, gapIn: number): Rect {
	return {
		xIn: 0,
		yIn: 0,
		widthIn: textWidthIn(spec),
		heightIn: sideTopIn(spec, spec.maxPages - 1, gapIn) + textHeightIn(spec),
	};
}

export function clipToText(
	spec: PageSpec,
	side: number,
	rect: Rect,
	gapIn: number,
): Rect | null {
	const clipped = intersect(rect, {
		xIn: spec.marginIn,
		yIn: spec.marginIn,
		widthIn: textWidthIn(spec),
		heightIn: textHeightIn(spec),
	});
	if (!clipped) return null;
	return {
		xIn: clipped.xIn - spec.marginIn,
		yIn: clipped.yIn - spec.marginIn + sideTopIn(spec, side, gapIn),
		widthIn: clipped.widthIn,
		heightIn: clipped.heightIn,
	};
}

export function pageExclusions(spec: PageSpec, gapIn: number): Exclusion[] {
	const sides = writingSides(spec);
	const exclusions: Exclusion[] = [];
	for (const [index, side] of sides.entries()) {
		const next = sides[index + 1];
		if (next === undefined) continue;
		const yIn = sideTopIn(spec, side, gapIn) + textHeightIn(spec);
		exclusions.push({
			xIn: 0,
			yIn,
			widthIn: textWidthIn(spec),
			heightIn: sideTopIn(spec, next, gapIn) - yIn,
			wrap: "both",
		});
	}
	for (const zone of spec.keepClear) {
		if (!sides.includes(zone.side)) continue;
		const clipped = clipToText(spec, zone.side, zoneRect(spec, zone), gapIn);
		if (!clipped) continue;
		exclusions.push({
			...clipped,
			wrap: zone.corner.endsWith("left") ? "left" : "right",
		});
	}
	return exclusions;
}

function pad(rect: Rect): Rect {
	return {
		xIn: rect.xIn - WRAP_PADDING_IN,
		yIn: rect.yIn - WRAP_PADDING_IN,
		widthIn: rect.widthIn + 2 * WRAP_PADDING_IN,
		heightIn: rect.heightIn + 2 * WRAP_PADDING_IN,
	};
}

function mergeRuns(items: Exclusion[]): Exclusion[] {
	const sorted = [...items].sort((a, b) => a.yIn - b.yIn);
	const merged: Exclusion[] = [];
	for (const item of sorted) {
		const last = merged.at(-1);
		if (!last || last.yIn + last.heightIn < item.yIn) {
			merged.push({ ...item });
			continue;
		}
		const top = Math.min(last.yIn, item.yIn);
		const bottom = Math.max(last.yIn + last.heightIn, item.yIn + item.heightIn);
		const left = Math.min(last.xIn, item.xIn);
		const right = Math.max(last.xIn + last.widthIn, item.xIn + item.widthIn);
		last.xIn = left;
		last.yIn = top;
		last.widthIn = right - left;
		last.heightIn = bottom - top;
	}
	return merged;
}

export function wrapExclusions(
	spec: PageSpec,
	elements: readonly PlacedElement[],
	gapIn: number,
): Exclusion[] {
	const columnWidth = textWidthIn(spec);
	const groups = new Map<string, Exclusion[]>();
	for (const element of elements) {
		if (!element.wrap) continue;
		const clipped = clipToText(
			spec,
			element.side,
			pad(boundsOf(element)),
			gapIn,
		);
		if (!clipped) continue;
		const right = clipped.xIn + clipped.widthIn;
		const onLeft = clipped.xIn <= columnWidth - right;
		const exclusion: Exclusion = onLeft
			? {
					xIn: 0,
					yIn: clipped.yIn,
					widthIn: right,
					heightIn: clipped.heightIn,
					wrap: "left",
				}
			: {
					xIn: clipped.xIn,
					yIn: clipped.yIn,
					widthIn: columnWidth - clipped.xIn,
					heightIn: clipped.heightIn,
					wrap: "right",
				};
		const key = `${element.side}:${exclusion.wrap}`;
		const group = groups.get(key) ?? [];
		group.push(exclusion);
		groups.set(key, group);
	}
	return [...groups.values()].flatMap(mergeRuns);
}

function turn(rotationDeg: number): { cos: number; sin: number } {
	const quarterTurns = rotationDeg / 90;
	if (Number.isInteger(quarterTurns)) {
		const odd = Math.abs(quarterTurns) % 2 === 1;
		return { cos: odd ? 0 : 1, sin: odd ? 1 : 0 };
	}
	const radians = (rotationDeg * Math.PI) / 180;
	return { cos: Math.abs(Math.cos(radians)), sin: Math.abs(Math.sin(radians)) };
}

export function boundsOf(box: PlacedBox): Rect {
	const { cos, sin } = turn(box.rotationDeg);
	const widthIn = box.widthIn * cos + box.heightIn * sin;
	const heightIn = box.widthIn * sin + box.heightIn * cos;
	const centreXIn = box.xIn + box.widthIn / 2;
	const centreYIn = box.yIn + box.heightIn / 2;
	return {
		xIn: centreXIn - widthIn / 2,
		yIn: centreYIn - heightIn / 2,
		widthIn,
		heightIn,
	};
}

export function sidesUsed(spec: PageSpec, params: SidesUsedParams): number {
	const textSides =
		firstWritingSide(spec) +
		1 +
		Math.max(
			0,
			Math.ceil((params.textBottomIn - textHeightIn(spec)) / spec.heightIn),
		);
	const boxSides = params.boxes.map((box) => box.side + 1);
	return Math.min(
		spec.maxPages,
		Math.max(params.minSides, textSides, ...boxSides),
	);
}

export function overflowIn(spec: PageSpec, params: OverflowParams): number {
	const lastBottomIn =
		sideTopIn(spec, spec.maxPages - 1, 0) + textHeightIn(spec);
	return Math.max(0, params.textBottomIn - lastBottomIn);
}

export function placementIssues(
	spec: PageSpec,
	params: PlacementIssuesParams,
): PlacementIssue[] {
	const safe: Rect = {
		xIn: spec.safeIn,
		yIn: spec.safeIn,
		widthIn: spec.widthIn - 2 * spec.safeIn,
		heightIn: spec.heightIn - 2 * spec.safeIn,
	};
	const lastSide = Math.min(params.sides, spec.maxPages);
	const issues: PlacementIssue[] = [];
	for (const box of params.boxes) {
		const footprint = boundsOf(box);
		if (!contains(safe, footprint)) {
			issues.push({ elementId: box.id, kind: "outside-safe" });
		}
		const blocked = spec.keepClear.some(
			(zone) =>
				zone.side === box.side &&
				intersect(zoneRect(spec, zone), footprint) !== null,
		);
		if (blocked) issues.push({ elementId: box.id, kind: "keep-clear" });
		if (box.side >= lastSide) {
			issues.push({ elementId: box.id, kind: "beyond-sides" });
		}
	}
	return issues;
}

export function exclusionFloats(
	column: Rect,
	exclusions: readonly Exclusion[],
): FloatBox[] {
	const sorted = [...exclusions].sort((a, b) => a.yIn - b.yIn);
	const floats: FloatBox[] = [];
	let previousTopIn = column.yIn;
	for (const exclusion of sorted) {
		const side = exclusion.wrap === "both" ? "left" : exclusion.wrap;
		floats.push({
			float: side,
			clear: "none",
			widthIn: 0,
			heightIn: exclusion.yIn - previousTopIn,
		});
		floats.push({
			float: side,
			clear: exclusion.wrap,
			widthIn: exclusion.wrap === "both" ? column.widthIn : exclusion.widthIn,
			heightIn: exclusion.heightIn,
		});
		previousTopIn = exclusion.yIn;
	}
	return floats;
}
