import type { Stroke, StrokePoint } from "@repo/types";
import { CELL } from "@repo/types";

function cellCoord(value: number, scale: number): number {
	const scaled = Math.round(value * scale);
	return Math.min(CELL.size, Math.max(0, scaled));
}

export function toCellUnits(stroke: Stroke, cellPx: number): Stroke {
	const scale = CELL.size / cellPx;
	return {
		input: stroke.input,
		points: stroke.points.map(
			([x, y, pressure, t]): StrokePoint => [
				cellCoord(x, scale),
				cellCoord(y, scale),
				pressure,
				t,
			],
		),
	};
}
