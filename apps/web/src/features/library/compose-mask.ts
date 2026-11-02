import { outlinePath, strokeOutline } from "@repo/render/html";
import type { CanvasStroke } from "../ink/pointer-session.ts";
import { CROP_PAD, inkBox } from "./ink-bounds.ts";

export type MaskCrop = { x: number; y: number; width: number; height: number };

export type ComposeMaskParams = {
	bitmap: CanvasImageSource;
	imageWidth: number;
	imageHeight: number;
	crop: MaskCrop;
	strokes: CanvasStroke[];
	viewWidth: number;
	viewHeight: number;
};

export type ComposedMask = { png: Blob; aspect: number };

export async function composeMask(
	params: ComposeMaskParams,
): Promise<ComposedMask | null> {
	const x = clamp(Math.round(params.crop.x), 0, params.imageWidth - 1);
	const y = clamp(Math.round(params.crop.y), 0, params.imageHeight - 1);
	const width = clamp(Math.round(params.crop.width), 1, params.imageWidth - x);
	const height = clamp(
		Math.round(params.crop.height),
		1,
		params.imageHeight - y,
	);
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("The doodle could not be drawn.");
	context.drawImage(params.bitmap, x, y, width, height, 0, 0, width, height);
	context.globalCompositeOperation = "destination-out";
	context.fillStyle = "#000000";
	const scaleX = params.imageWidth / params.viewWidth;
	const scaleY = params.imageHeight / params.viewHeight;
	context.setTransform(scaleX, 0, 0, scaleY, -x, -y);
	for (const stroke of params.strokes) {
		context.fill(
			new Path2D(outlinePath(strokeOutline(stroke, stroke.strokeScale ?? 1))),
		);
	}
	const ink = inkBox(
		context.getImageData(0, 0, width, height).data,
		width,
		height,
		CROP_PAD,
	);
	if (!ink) return null;
	const trimmed = new OffscreenCanvas(ink.width, ink.height);
	const trimmedContext = trimmed.getContext("2d");
	if (!trimmedContext) throw new Error("The doodle could not be drawn.");
	trimmedContext.drawImage(
		canvas,
		ink.x,
		ink.y,
		ink.width,
		ink.height,
		0,
		0,
		ink.width,
		ink.height,
	);
	const png = await trimmed.convertToBlob({ type: "image/png" });
	return { png, aspect: ink.width / ink.height };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
