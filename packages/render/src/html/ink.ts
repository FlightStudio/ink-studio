import type { Stroke } from "@repo/types";
import { getStroke } from "perfect-freehand";

export const STROKE_OPTIONS = {
	size: 8,
	thinning: 0.6,
	smoothing: 0.55,
	streamline: 0.4,
} as const;

export function strokeOutline(
	stroke: Stroke,
	scale: number,
): [number, number][] {
	const pen = stroke.input === "pen";
	return getStroke(
		stroke.points.map(([x, y, pressure]) => (pen ? [x, y, pressure] : [x, y])),
		{
			...STROKE_OPTIONS,
			size: STROKE_OPTIONS.size * scale,
			simulatePressure: !pen,
			last: true,
		},
	);
}

function midpoint(a: readonly [number, number], b: readonly [number, number]) {
	return `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)}`;
}

function point(a: readonly [number, number]) {
	return `${a[0].toFixed(2)},${a[1].toFixed(2)}`;
}

export function outlinePath(outline: readonly [number, number][]): string {
	const [first, second, third] = outline;
	if (!first) return "";
	if (!second || !third) {
		return `M${outline.map(point).join(" L")} Z`;
	}
	const rest = outline
		.slice(2, -1)
		.map((current, index) => midpoint(current, outline[index + 3] ?? current));
	return `M${point(first)} Q${point(second)} ${midpoint(second, third)} T${rest.join(" ")} Z`;
}
