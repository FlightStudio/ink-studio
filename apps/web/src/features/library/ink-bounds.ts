export type InkBox = { x: number; y: number; width: number; height: number };

export const CROP_PAD = 0.02;
export const INK_ALPHA = 8;

export function inkBox(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	padShare: number,
): InkBox | null {
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if ((data[(y * width + x) * 4 + 3] ?? 0) < INK_ALPHA) continue;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) return null;
	const pad = Math.round(padShare * Math.max(maxX - minX + 1, maxY - minY + 1));
	const x = Math.max(0, minX - pad);
	const y = Math.max(0, minY - pad);
	return {
		x,
		y,
		width: Math.min(width, maxX + 1 + pad) - x,
		height: Math.min(height, maxY + 1 + pad) - y,
	};
}
