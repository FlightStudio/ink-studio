import { outlinePath, strokeOutline } from "@repo/render/html";
import type { Stroke } from "@repo/types";
import { CROP_PAD } from "./ink-bounds.ts";

const LONG_SIDE_PX = 1200;

export const MIN_STROKE_SCALE = 0.2;

export type Raster = { png: Blob; aspect: number };

export type RasterPlan = {
	strokeScale: number;
	outlines: [number, number][][];
	inkX: number;
	inkY: number;
	inkWidth: number;
	inkHeight: number;
	factor: number;
	widthPx: number;
	heightPx: number;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function pointBounds(points: Iterable<readonly number[]>): Bounds | null {
	let bounds: Bounds | null = null;
	for (const [x = 0, y = 0] of points) {
		bounds = bounds
			? {
					minX: Math.min(bounds.minX, x),
					minY: Math.min(bounds.minY, y),
					maxX: Math.max(bounds.maxX, x),
					maxY: Math.max(bounds.maxY, y),
				}
			: { minX: x, minY: y, maxX: x, maxY: y };
	}
	return bounds;
}

export function rasterPlan(
	strokes: Stroke[],
	box: { widthPx: number; heightPx: number },
): RasterPlan | null {
	const centre = pointBounds(strokes.flatMap((stroke) => stroke.points));
	if (!centre) return null;
	const drawnLong = Math.max(
		centre.maxX - centre.minX,
		centre.maxY - centre.minY,
	);
	const strokeScale = Math.min(
		1,
		Math.max(
			MIN_STROKE_SCALE,
			drawnLong / Math.max(box.widthPx, box.heightPx, 1),
		),
	);
	const outlines = strokes.map((stroke) => strokeOutline(stroke, strokeScale));
	const ink = pointBounds(outlines.flat());
	if (!ink) return null;
	const pad = CROP_PAD * Math.max(ink.maxX - ink.minX, ink.maxY - ink.minY);
	const inkWidth = Math.max(ink.maxX - ink.minX + 2 * pad, 1);
	const inkHeight = Math.max(ink.maxY - ink.minY + 2 * pad, 1);
	const factor = LONG_SIDE_PX / Math.max(inkWidth, inkHeight);
	return {
		strokeScale,
		outlines,
		inkX: ink.minX - pad,
		inkY: ink.minY - pad,
		inkWidth,
		inkHeight,
		factor,
		widthPx: Math.max(1, Math.round(inkWidth * factor)),
		heightPx: Math.max(1, Math.round(inkHeight * factor)),
	};
}

export async function rasterize(
	strokes: Stroke[],
	box: { widthPx: number; heightPx: number },
): Promise<Raster> {
	const plan = rasterPlan(strokes, box);
	if (!plan) throw new Error("Draw something before saving.");
	const canvas = new OffscreenCanvas(plan.widthPx, plan.heightPx);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("The doodle could not be drawn.");
	context.setTransform(
		plan.factor,
		0,
		0,
		plan.factor,
		-plan.inkX * plan.factor,
		-plan.inkY * plan.factor,
	);
	context.fillStyle = "#000000";
	for (const outline of plan.outlines) {
		context.fill(new Path2D(outlinePath(outline)));
	}
	const png = await canvas.convertToBlob({ type: "image/png" });
	return { png, aspect: plan.widthPx / plan.heightPx };
}
