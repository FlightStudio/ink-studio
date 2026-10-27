import { ServiceError } from "@repo/errors";
import type { ImageProcessor } from "@repo/services/drawings";
import sharp from "sharp";

export type LiftMaskOptions = { removeLines: boolean; cropToInk: boolean };
export type Mask = { widthPx: number; heightPx: number; alpha: Uint8Array };

export const LIFT_LIMITS = {
	maxInputPixels: 40_000_000,
	workingLongSidePx: 2400,
} as const;

const BACKGROUND_SCALE = 16;
const BACKGROUND_MAX_RADIUS = 2;
const BACKGROUND_BLUR_RADIUS = 1;
const WINDOW_DIVISOR = 30;
const SAUVOLA_K = 0.3;
const SAUVOLA_R = 0.5;
const LINE_LENGTH_DIVISOR = 12;
const LINE_THICKNESS_BASE_PX = 2;
const LINE_THICKNESS_DIVISOR = 800;
const SPECK_MIN_PX = 12;
const SPECK_SHARE = 0.000004;
const BORDER_SHARE = 0.02;
const MATTE_RAMP = 0.04;
const CROP_MARGIN = 0.02;

type Rgb = { widthPx: number; heightPx: number; data: Uint8Array };
type Plane = { widthPx: number; heightPx: number; data: Float32Array };

function unreadable(): ServiceError {
	return new ServiceError("invalid_input", "photo_unreadable");
}

async function decode(photo: Uint8Array): Promise<Rgb> {
	const metadata = await sharp(photo)
		.metadata()
		.catch(() => {
			throw unreadable();
		});
	const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
	if (pixels === 0) throw unreadable();
	if (pixels > LIFT_LIMITS.maxInputPixels) {
		throw new ServiceError("invalid_input", "photo_too_large");
	}
	const { data, info } = await sharp(photo, {
		limitInputPixels: LIFT_LIMITS.maxInputPixels,
	})
		.rotate()
		.flatten({ background: "#ffffff" })
		.resize({
			width: LIFT_LIMITS.workingLongSidePx,
			height: LIFT_LIMITS.workingLongSidePx,
			fit: "inside",
			withoutEnlargement: true,
		})
		.toColourspace("srgb")
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
		.catch(() => {
			throw unreadable();
		});
	if (info.channels !== 3) throw unreadable();
	return { widthPx: info.width, heightPx: info.height, data };
}

function downscale(rgb: Rgb, channel: number): Plane {
	const widthPx = Math.ceil(rgb.widthPx / BACKGROUND_SCALE);
	const heightPx = Math.ceil(rgb.heightPx / BACKGROUND_SCALE);
	const sums = new Float32Array(widthPx * heightPx);
	const counts = new Uint32Array(widthPx * heightPx);
	for (let y = 0; y < rgb.heightPx; y += 1) {
		const row = Math.floor(y / BACKGROUND_SCALE) * widthPx;
		for (let x = 0; x < rgb.widthPx; x += 1) {
			const cell = row + Math.floor(x / BACKGROUND_SCALE);
			sums[cell] =
				(sums[cell] ?? 0) +
				(rgb.data[(y * rgb.widthPx + x) * 3 + channel] ?? 0);
			counts[cell] = (counts[cell] ?? 0) + 1;
		}
	}
	const data = new Float32Array(widthPx * heightPx);
	for (let cell = 0; cell < data.length; cell += 1) {
		data[cell] = (sums[cell] ?? 0) / (counts[cell] ?? 1) / 255;
	}
	return { widthPx, heightPx, data };
}

function slide(
	plane: Plane,
	radius: number,
	horizontal: boolean,
	reduce: (
		values: Float32Array,
		from: number,
		to: number,
		step: number,
	) => number,
): Plane {
	const { widthPx, heightPx } = plane;
	const data = new Float32Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		for (let x = 0; x < widthPx; x += 1) {
			if (horizontal) {
				const from = y * widthPx + Math.max(0, x - radius);
				const to = y * widthPx + Math.min(widthPx - 1, x + radius);
				data[y * widthPx + x] = reduce(plane.data, from, to, 1);
			} else {
				const from = Math.max(0, y - radius) * widthPx + x;
				const to = Math.min(heightPx - 1, y + radius) * widthPx + x;
				data[y * widthPx + x] = reduce(plane.data, from, to, widthPx);
			}
		}
	}
	return { widthPx, heightPx, data };
}

function maximum(
	values: Float32Array,
	from: number,
	to: number,
	step: number,
): number {
	let best = 0;
	for (let index = from; index <= to; index += step) {
		best = Math.max(best, values[index] ?? 0);
	}
	return best;
}

function mean(
	values: Float32Array,
	from: number,
	to: number,
	step: number,
): number {
	let total = 0;
	let seen = 0;
	for (let index = from; index <= to; index += step) {
		total += values[index] ?? 0;
		seen += 1;
	}
	return total / seen;
}

function upscale(plane: Plane, widthPx: number, heightPx: number): Plane {
	const data = new Float32Array(widthPx * heightPx);
	const lastX = plane.widthPx - 1;
	const lastY = plane.heightPx - 1;
	for (let y = 0; y < heightPx; y += 1) {
		const sourceY = Math.min(
			lastY,
			Math.max(0, (y + 0.5) / BACKGROUND_SCALE - 0.5),
		);
		const top = Math.floor(sourceY);
		const bottom = Math.min(lastY, top + 1);
		const down = sourceY - top;
		for (let x = 0; x < widthPx; x += 1) {
			const sourceX = Math.min(
				lastX,
				Math.max(0, (x + 0.5) / BACKGROUND_SCALE - 0.5),
			);
			const left = Math.floor(sourceX);
			const right = Math.min(lastX, left + 1);
			const across = sourceX - left;
			const upper =
				(plane.data[top * plane.widthPx + left] ?? 0) * (1 - across) +
				(plane.data[top * plane.widthPx + right] ?? 0) * across;
			const lower =
				(plane.data[bottom * plane.widthPx + left] ?? 0) * (1 - across) +
				(plane.data[bottom * plane.widthPx + right] ?? 0) * across;
			data[y * widthPx + x] = upper * (1 - down) + lower * down;
		}
	}
	return { widthPx, heightPx, data };
}

function background(rgb: Rgb, channel: number): Plane {
	let plane = downscale(rgb, channel);
	plane = slide(plane, BACKGROUND_MAX_RADIUS, true, maximum);
	plane = slide(plane, BACKGROUND_MAX_RADIUS, false, maximum);
	plane = slide(plane, BACKGROUND_BLUR_RADIUS, true, mean);
	plane = slide(plane, BACKGROUND_BLUR_RADIUS, false, mean);
	return upscale(plane, rgb.widthPx, rgb.heightPx);
}

function brightness(rgb: Rgb): Plane {
	const data = new Float32Array(rgb.widthPx * rgb.heightPx);
	for (let channel = 0; channel < 3; channel += 1) {
		const lighting = background(rgb, channel).data;
		for (let index = 0; index < data.length; index += 1) {
			const value = (rgb.data[index * 3 + channel] ?? 0) / 255;
			const level = Math.max(lighting[index] ?? 0, 1 / 255);
			data[index] = Math.max(data[index] ?? 0, Math.min(1, value / level));
		}
	}
	return { widthPx: rgb.widthPx, heightPx: rgb.heightPx, data };
}

function odd(value: number): number {
	return value % 2 === 0 ? value + 1 : value;
}

function sauvola(plane: Plane): Float32Array {
	const { widthPx, heightPx } = plane;
	const stride = widthPx + 1;
	const sums = new Float64Array(stride * (heightPx + 1));
	const squares = new Float64Array(stride * (heightPx + 1));
	for (let y = 0; y < heightPx; y += 1) {
		let rowSum = 0;
		let rowSquare = 0;
		for (let x = 0; x < widthPx; x += 1) {
			const value = plane.data[y * widthPx + x] ?? 0;
			rowSum += value;
			rowSquare += value * value;
			const at = (y + 1) * stride + x + 1;
			sums[at] = (sums[at - stride] ?? 0) + rowSum;
			squares[at] = (squares[at - stride] ?? 0) + rowSquare;
		}
	}
	const window = Math.max(
		3,
		odd(Math.round(Math.min(widthPx, heightPx) / WINDOW_DIVISOR)),
	);
	const radius = (window - 1) / 2;
	const thresholds = new Float32Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		const top = Math.max(0, y - radius) * stride;
		const bottom = (Math.min(heightPx - 1, y + radius) + 1) * stride;
		const rows = bottom / stride - top / stride;
		for (let x = 0; x < widthPx; x += 1) {
			const left = Math.max(0, x - radius);
			const right = Math.min(widthPx - 1, x + radius) + 1;
			const area = rows * (right - left);
			const sum =
				(sums[bottom + right] ?? 0) -
				(sums[bottom + left] ?? 0) -
				(sums[top + right] ?? 0) +
				(sums[top + left] ?? 0);
			const square =
				(squares[bottom + right] ?? 0) -
				(squares[bottom + left] ?? 0) -
				(squares[top + right] ?? 0) +
				(squares[top + left] ?? 0);
			const average = sum / area;
			const deviation = Math.sqrt(
				Math.max(0, square / area - average * average),
			);
			thresholds[y * widthPx + x] =
				average * (1 + SAUVOLA_K * (deviation / SAUVOLA_R - 1));
		}
	}
	return thresholds;
}

function hardMask(plane: Plane, thresholds: Float32Array): Uint8Array {
	const hard = new Uint8Array(plane.data.length);
	for (let index = 0; index < hard.length; index += 1) {
		hard[index] = (plane.data[index] ?? 1) < (thresholds[index] ?? 0) ? 1 : 0;
	}
	return hard;
}

function runLengths(
	bits: Uint8Array,
	widthPx: number,
	heightPx: number,
	horizontal: boolean,
): Uint32Array {
	const lengths = new Uint32Array(bits.length);
	const lines = horizontal ? heightPx : widthPx;
	const along = horizontal ? widthPx : heightPx;
	const step = horizontal ? 1 : widthPx;
	for (let line = 0; line < lines; line += 1) {
		const first = horizontal ? line * widthPx : line;
		let position = 0;
		while (position < along) {
			if (bits[first + position * step] !== 1) {
				position += 1;
				continue;
			}
			let end = position;
			while (end < along && bits[first + end * step] === 1) end += 1;
			for (let at = position; at < end; at += 1) {
				lengths[first + at * step] = end - position;
			}
			position = end;
		}
	}
	return lengths;
}

function stripRuns(
	bits: Uint8Array,
	widthPx: number,
	heightPx: number,
	horizontal: boolean,
): Uint8Array {
	const minLength = Math.round(
		(horizontal ? widthPx : heightPx) / LINE_LENGTH_DIVISOR,
	);
	const maxThickness =
		LINE_THICKNESS_BASE_PX +
		Math.round(Math.min(widthPx, heightPx) / LINE_THICKNESS_DIVISOR);
	const along = runLengths(bits, widthPx, heightPx, horizontal);
	const across = runLengths(bits, widthPx, heightPx, !horizontal);
	const kept = bits.slice();
	for (let index = 0; index < kept.length; index += 1) {
		if (
			kept[index] === 1 &&
			(along[index] ?? 0) >= minLength &&
			(across[index] ?? 0) <= maxThickness
		) {
			kept[index] = 0;
		}
	}
	return kept;
}

function removeLines(
	bits: Uint8Array,
	widthPx: number,
	heightPx: number,
): Uint8Array {
	const withoutRows = stripRuns(bits, widthPx, heightPx, true);
	return stripRuns(withoutRows, widthPx, heightPx, false);
}

function root(parents: Int32Array, run: number): number {
	let at = run;
	while ((parents[at] ?? at) !== at) {
		const parent = parents[at] ?? at;
		const grandparent = parents[parent] ?? parent;
		parents[at] = grandparent;
		at = grandparent;
	}
	return at;
}

function dropComponents(
	bits: Uint8Array,
	widthPx: number,
	heightPx: number,
): Uint8Array {
	let runCount = 0;
	for (let y = 0; y < heightPx; y += 1) {
		for (let x = 0; x < widthPx; x += 1) {
			const index = y * widthPx + x;
			if (bits[index] === 1 && (x === 0 || bits[index - 1] !== 1)) {
				runCount += 1;
			}
		}
	}
	const rows = new Int32Array(runCount);
	const starts = new Int32Array(runCount);
	const ends = new Int32Array(runCount);
	const parents = new Int32Array(runCount);
	let next = 0;
	let previousFrom = 0;
	let previousTo = 0;
	for (let y = 0; y < heightPx; y += 1) {
		const from = next;
		let x = 0;
		while (x < widthPx) {
			if (bits[y * widthPx + x] !== 1) {
				x += 1;
				continue;
			}
			let end = x;
			while (end + 1 < widthPx && bits[y * widthPx + end + 1] === 1) end += 1;
			rows[next] = y;
			starts[next] = x;
			ends[next] = end;
			parents[next] = next;
			next += 1;
			x = end + 1;
		}
		let above = previousFrom;
		for (let run = from; run < next; run += 1) {
			const start = starts[run] ?? 0;
			const end = ends[run] ?? 0;
			while (above < previousTo && (ends[above] ?? 0) < start - 1) above += 1;
			for (
				let other = above;
				other < previousTo && (starts[other] ?? 0) <= end + 1;
				other += 1
			) {
				const a = root(parents, run);
				const b = root(parents, other);
				if (a !== b) parents[Math.max(a, b)] = Math.min(a, b);
			}
		}
		previousFrom = from;
		previousTo = next;
	}
	const sizes = new Uint32Array(runCount);
	const touches = new Uint8Array(runCount);
	for (let run = 0; run < runCount; run += 1) {
		const top = root(parents, run);
		const start = starts[run] ?? 0;
		const end = ends[run] ?? 0;
		const row = rows[run] ?? 0;
		sizes[top] = (sizes[top] ?? 0) + end - start + 1;
		if (
			start === 0 ||
			end === widthPx - 1 ||
			row === 0 ||
			row === heightPx - 1
		) {
			touches[top] = 1;
		}
	}
	const pixels = widthPx * heightPx;
	const minSize = Math.max(SPECK_MIN_PX, SPECK_SHARE * pixels);
	const maxBorderSize = BORDER_SHARE * pixels;
	const kept = bits.slice();
	for (let run = 0; run < runCount; run += 1) {
		const top = root(parents, run);
		const size = sizes[top] ?? 0;
		if (size >= minSize && !(touches[top] === 1 && size > maxBorderSize)) {
			continue;
		}
		const offset = (rows[run] ?? 0) * widthPx;
		kept.fill(0, offset + (starts[run] ?? 0), offset + (ends[run] ?? 0) + 1);
	}
	return kept;
}

function dilate(
	bits: Uint8Array,
	widthPx: number,
	heightPx: number,
): Uint8Array {
	const grown = new Uint8Array(bits.length);
	for (let y = 0; y < heightPx; y += 1) {
		for (let x = 0; x < widthPx; x += 1) {
			if (bits[y * widthPx + x] !== 1) continue;
			for (
				let dy = Math.max(0, y - 1);
				dy <= Math.min(heightPx - 1, y + 1);
				dy += 1
			) {
				for (
					let dx = Math.max(0, x - 1);
					dx <= Math.min(widthPx - 1, x + 1);
					dx += 1
				) {
					grown[dy * widthPx + dx] = 1;
				}
			}
		}
	}
	return grown;
}

function matte(
	plane: Plane,
	thresholds: Float32Array,
	hard: Uint8Array,
	beforeRemoval: Uint8Array,
): Uint8Array {
	const inside = dilate(hard, plane.widthPx, plane.heightPx);
	const alpha = new Uint8Array(hard.length);
	for (let index = 0; index < alpha.length; index += 1) {
		if (inside[index] !== 1) continue;
		if (beforeRemoval[index] === 1 && hard[index] !== 1) continue;
		const below = (thresholds[index] ?? 0) - (plane.data[index] ?? 1);
		const ramp = (below + MATTE_RAMP) / (2 * MATTE_RAMP);
		alpha[index] = Math.round(255 * Math.min(1, Math.max(0, ramp)));
	}
	return alpha;
}

function cropToInk(mask: Mask): Mask {
	let left = mask.widthPx;
	let top = mask.heightPx;
	let right = -1;
	let bottom = -1;
	for (let y = 0; y < mask.heightPx; y += 1) {
		for (let x = 0; x < mask.widthPx; x += 1) {
			if ((mask.alpha[y * mask.widthPx + x] ?? 0) === 0) continue;
			left = Math.min(left, x);
			top = Math.min(top, y);
			right = Math.max(right, x);
			bottom = Math.max(bottom, y);
		}
	}
	const margin = Math.round(
		CROP_MARGIN * Math.max(mask.widthPx, mask.heightPx),
	);
	const fromX = Math.max(0, left - margin);
	const fromY = Math.max(0, top - margin);
	const widthPx = Math.min(mask.widthPx - 1, right + margin) - fromX + 1;
	const heightPx = Math.min(mask.heightPx - 1, bottom + margin) - fromY + 1;
	const alpha = new Uint8Array(widthPx * heightPx);
	for (let y = 0; y < heightPx; y += 1) {
		const start = (fromY + y) * mask.widthPx + fromX;
		alpha.set(mask.alpha.subarray(start, start + widthPx), y * widthPx);
	}
	return { widthPx, heightPx, alpha };
}

export async function liftMask(
	photo: Uint8Array,
	options: LiftMaskOptions,
): Promise<Mask> {
	const rgb = await decode(photo);
	const plane = brightness(rgb);
	const thresholds = sauvola(plane);
	const sauvolaMask = hardMask(plane, thresholds);
	const hard = options.removeLines
		? dropComponents(
				removeLines(sauvolaMask, rgb.widthPx, rgb.heightPx),
				rgb.widthPx,
				rgb.heightPx,
			)
		: sauvolaMask;
	if (!hard.includes(1))
		throw new ServiceError("invalid_input", "no_ink_found");
	const mask: Mask = {
		widthPx: rgb.widthPx,
		heightPx: rgb.heightPx,
		alpha: matte(plane, thresholds, hard, sauvolaMask),
	};
	return options.cropToInk ? cropToInk(mask) : mask;
}

export async function liftInk(photo: Uint8Array): Promise<Uint8Array> {
	const mask = await liftMask(photo, { removeLines: true, cropToInk: true });
	const rgba = new Uint8Array(mask.widthPx * mask.heightPx * 4);
	for (let index = 0; index < mask.alpha.length; index += 1) {
		rgba[index * 4 + 3] = mask.alpha[index] ?? 0;
	}
	const png = await sharp(rgba, {
		raw: { width: mask.widthPx, height: mask.heightPx, channels: 4 },
	})
		.png()
		.toBuffer();
	return new Uint8Array(png);
}

export class SharpImageProcessor implements ImageProcessor {
	liftInk(photo: Uint8Array): Promise<Uint8Array> {
		return liftInk(photo);
	}
}
