import { outlinePath, strokeOutline } from "@repo/render/html";
import type { Stroke } from "@repo/types";

export type MaskCrop = { x: number; y: number; width: number; height: number };

export type ComposeMaskParams = {
	bitmap: CanvasImageSource;
	imageWidth: number;
	imageHeight: number;
	crop: MaskCrop;
	strokes: Stroke[];
	strokeScale: number;
	viewWidth: number;
	viewHeight: number;
};

export type ComposedMask = { png: Blob; aspect: number };

export async function composeMask(
	params: ComposeMaskParams,
): Promise<ComposedMask> {
	const x = clamp(Math.round(params.crop.x), 0, params.imageWidth - 1);
	const y = clamp(Math.round(params.crop.y), 0, params.imageHeight - 1);
	const width = clamp(Math.round(params.crop.width), 1, params.imageWidth - x);
	const height = clamp(
		Math.round(params.crop.height),
		1,
		params.imageHeight - y,
	);
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("The doodle could not be drawn.");
	context.drawImage(params.bitmap, x, y, width, height, 0, 0, width, height);
	context.globalCompositeOperation = "destination-out";
	context.fillStyle = "#000000";
	const scaleX = params.imageWidth / params.viewWidth;
	const scaleY = params.imageHeight / params.viewHeight;
	context.setTransform(scaleX, 0, 0, scaleY, -x, -y);
	for (const stroke of params.strokes) {
		context.fill(
			new Path2D(outlinePath(strokeOutline(stroke, params.strokeScale))),
		);
	}
	const png = await canvas.convertToBlob({ type: "image/png" });
	return { png, aspect: width / height };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
