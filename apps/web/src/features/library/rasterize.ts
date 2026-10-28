import { outlinePath, strokeOutline } from "@repo/render/html";
import type { Stroke } from "@repo/types";

const LONG_SIDE_PX = 1200;
const CROP_PAD = 0.02;

export type Raster = { png: Blob; aspect: number };

export async function rasterize(
	strokes: Stroke[],
	box: { widthPx: number; heightPx: number },
): Promise<Raster> {
	const longSide = Math.max(box.widthPx, box.heightPx, 1);
	const factor = LONG_SIDE_PX / longSide;
	const width = Math.max(1, Math.round(box.widthPx * factor));
	const height = Math.max(1, Math.round(box.heightPx * factor));
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) throw new Error("The doodle could not be drawn.");
	context.scale(factor, factor);
	context.fillStyle = "#000000";
	for (const stroke of strokes) {
		context.fill(new Path2D(outlinePath(strokeOutline(stroke, 1))));
	}
	const bounds = inkBounds(
		context.getImageData(0, 0, width, height).data,
		width,
		height,
	);
	if (!bounds) throw new Error("Draw something before saving.");
	const inkWidth = bounds.maxX - bounds.minX + 1;
	const inkHeight = bounds.maxY - bounds.minY + 1;
	const pad = Math.round(CROP_PAD * Math.max(inkWidth, inkHeight));
	const cropX = Math.max(0, bounds.minX - pad);
	const cropY = Math.max(0, bounds.minY - pad);
	const cropRight = Math.min(width, bounds.maxX + 1 + pad);
	const cropBottom = Math.min(height, bounds.maxY + 1 + pad);
	const cropWidth = Math.max(1, cropRight - cropX);
	const cropHeight = Math.max(1, cropBottom - cropY);
	const cropped = new OffscreenCanvas(cropWidth, cropHeight);
	const croppedContext = cropped.getContext("2d");
	if (!croppedContext) throw new Error("The doodle could not be drawn.");
	croppedContext.drawImage(
		canvas,
		cropX,
		cropY,
		cropWidth,
		cropHeight,
		0,
		0,
		cropWidth,
		cropHeight,
	);
	const png = await cropped.convertToBlob({ type: "image/png" });
	return { png, aspect: cropWidth / cropHeight };
}

function inkBounds(
	data: Uint8ClampedArray,
	width: number,
	height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const alpha = data[(y * width + x) * 4 + 3] ?? 0;
			if (alpha === 0) continue;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) return null;
	return { minX, minY, maxX, maxY };
}
