import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";

export type Box = { x: number; y: number; width: number; height: number };

export type InkSpec = {
	color: string;
	widthUnits: number;
	lineSpacingUnits: number;
	area: Box;
	seed: number;
};

export type RulingSpec = {
	color: string;
	widthUnits: number;
	spacingUnits: number;
	margin?: string;
};

export type GridSpec = {
	color: string;
	widthUnits: number;
	spacingUnits: number;
};

export type UnderlineSpec = {
	color: string;
	widthUnits: number;
	x: number;
	y: number;
	lengthUnits: number;
	riseUnits: number;
	amplitudeUnits: number;
	wavelengthUnits: number;
};

export type SpeckSpec = {
	color: string;
	count: number;
	radiusUnits: number;
	area: Box;
	seed: number;
};

export type LetterISpec = {
	color: string;
	widthUnits: number;
	heightUnits: number;
	baselines: { x: number; y: number }[];
};

export type TableSpec = { color: string; insetUnits: number; tiltDeg: number };

export type PageSpec = {
	widthPx: number;
	heightPx: number;
	paper?: string;
	shadow?: number;
	rulings?: RulingSpec;
	grid?: GridSpec;
	ink?: InkSpec;
	underline?: UnderlineSpec;
	letterI?: LetterISpec;
	specks?: SpeckSpec;
	table?: TableSpec;
	blurPx?: number;
	noise?: number;
	format?: "jpeg" | "png";
};

export type SyntheticPage = {
	photo: Uint8Array;
	widthPx: number;
	heightPx: number;
	ink: Uint8Array;
	rulings: Uint8Array;
	grid: Uint8Array;
	underline: Uint8Array;
	dots: Uint8Array;
	specks: Uint8Array;
	table: Uint8Array;
};

type Layers = {
	paper: string | null;
	table: string | null;
	rulings: string | null;
	margin: string | null;
	grid: string | null;
	specks: string | null;
	ink: string | null;
	underline: string | null;
	stems: string | null;
	dots: string | null;
	shadow: number;
};

const NO_LAYERS: Layers = {
	paper: "#ffffff",
	table: null,
	rulings: null,
	margin: null,
	grid: null,
	specks: null,
	ink: null,
	underline: null,
	stems: null,
	dots: null,
	shadow: 0,
};

const UNITS_WIDE = 1000;

function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function n(value: number): string {
	return value.toFixed(1);
}

function letter(
	kind: number,
	x: number,
	y: number,
	w: number,
	h: number,
): string {
	if (kind === 0) {
		return `C ${n(x + 0.05 * w)} ${n(y - h)} ${n(x + 0.95 * w)} ${n(y - h)} ${n(x + w)} ${n(y)}`;
	}
	if (kind === 1) {
		const tall = h * 2.2;
		return `C ${n(x + w)} ${n(y - 0.6 * tall)} ${n(x + 0.9 * w)} ${n(y - tall)} ${n(x + 0.6 * w)} ${n(y - tall)} C ${n(x + 0.3 * w)} ${n(y - tall)} ${n(x + 0.3 * w)} ${n(y - 0.3 * tall)} ${n(x + w)} ${n(y)}`;
	}
	if (kind === 2) {
		const deep = h * 1.4;
		return `C ${n(x + 0.6 * w)} ${n(y - h)} ${n(x + 0.9 * w)} ${n(y - 0.5 * h)} ${n(x + 0.7 * w)} ${n(y + deep)} C ${n(x + 0.6 * w)} ${n(y + 1.2 * deep)} ${n(x + 0.2 * w)} ${n(y + deep)} ${n(x + w)} ${n(y)}`;
	}
	return `C ${n(x + 0.2 * w)} ${n(y - h)} ${n(x + 0.1 * w)} ${n(y + 0.2 * h)} ${n(x + 0.5 * w)} ${n(y + 0.1 * h)} C ${n(x + 0.9 * w)} ${n(y)} ${n(x + 0.8 * w)} ${n(y - h)} ${n(x + w)} ${n(y - 0.9 * h)} L ${n(x + w)} ${n(y)}`;
}

export function handwriting(ink: InkSpec): string[] {
	const next = random(ink.seed);
	const xHeight = ink.lineSpacingUnits * 0.28;
	const right = ink.area.x + ink.area.width;
	const bottom = ink.area.y + ink.area.height;
	const paths: string[] = [];
	for (
		let baseline = ink.area.y + 0.75 * ink.lineSpacingUnits;
		baseline + 0.3 * ink.lineSpacingUnits <= bottom;
		baseline += ink.lineSpacingUnits
	) {
		let x = ink.area.x + next() * xHeight;
		for (;;) {
			const letters = 2 + Math.floor(next() * 6);
			const widths = Array.from(
				{ length: letters },
				() => xHeight * (0.9 + 0.5 * next()),
			);
			const wordWidth = widths.reduce((sum, width) => sum + width, 0);
			if (x + wordWidth > right) break;
			let d = `M ${n(x)} ${n(baseline)}`;
			for (const width of widths) {
				d += ` ${letter(Math.floor(next() * 4), x, baseline, width, xHeight)}`;
				x += width;
			}
			paths.push(d);
			x += xHeight * (0.8 + 0.6 * next());
		}
	}
	return paths;
}

function heightUnits(spec: PageSpec): number {
	return (UNITS_WIDE * spec.heightPx) / spec.widthPx;
}

function underlinePath(underline: UnderlineSpec): string {
	const steps = Math.ceil(underline.lengthUnits / 2);
	const points: string[] = [];
	for (let step = 0; step <= steps; step += 1) {
		const along = (step / steps) * underline.lengthUnits;
		const wave =
			underline.amplitudeUnits *
			Math.sin((2 * Math.PI * along) / underline.wavelengthUnits);
		const rise = (underline.riseUnits * along) / underline.lengthUnits;
		points.push(`${n(underline.x + along)} ${n(underline.y + wave - rise)}`);
	}
	return `M ${points.join(" L ")}`;
}

function speckCircles(specks: SpeckSpec, color: string): string[] {
	const next = random(specks.seed);
	return Array.from({ length: specks.count }, () => {
		const x = specks.area.x + next() * specks.area.width;
		const y = specks.area.y + next() * specks.area.height;
		const r = specks.radiusUnits * (0.7 + 0.6 * next());
		return `<circle cx="${n(x)}" cy="${n(y)}" r="${r.toFixed(2)}" fill="${color}"/>`;
	});
}

function paperRect(spec: PageSpec, color: string): string {
	const tall = heightUnits(spec);
	const table = spec.table;
	if (!table) {
		return `<rect x="0" y="0" width="${UNITS_WIDE}" height="${n(tall)}" fill="${color}"/>`;
	}
	const inset = table.insetUnits;
	return `<rect x="${n(inset)}" y="${n(inset)}" width="${n(UNITS_WIDE - 2 * inset)}" height="${n(tall - 2 * inset)}" fill="${color}" transform="rotate(${table.tiltDeg} ${UNITS_WIDE / 2} ${n(tall / 2)})"/>`;
}

function pageSvg(spec: PageSpec, layers: Layers): string {
	const tall = heightUnits(spec);
	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.widthPx}" height="${spec.heightPx}" viewBox="0 0 ${UNITS_WIDE} ${n(tall)}">`,
		`<defs><linearGradient id="shadow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${layers.shadow}"/></linearGradient></defs>`,
	];
	if (spec.table && layers.table) {
		parts.push(
			`<rect x="0" y="0" width="${UNITS_WIDE}" height="${n(tall)}" fill="${layers.table}"/>`,
		);
	}
	if (layers.paper) {
		parts.push(
			layers.table
				? paperRect(spec, layers.paper)
				: `<rect x="0" y="0" width="${UNITS_WIDE}" height="${n(tall)}" fill="${layers.paper}"/>`,
		);
	}
	const grid = spec.grid;
	if (grid && layers.grid) {
		for (let y = grid.spacingUnits; y < tall; y += grid.spacingUnits) {
			parts.push(
				`<line x1="0" y1="${n(y)}" x2="${UNITS_WIDE}" y2="${n(y)}" stroke="${layers.grid}" stroke-width="${grid.widthUnits}"/>`,
			);
		}
		for (let x = grid.spacingUnits; x < UNITS_WIDE; x += grid.spacingUnits) {
			parts.push(
				`<line x1="${n(x)}" y1="0" x2="${n(x)}" y2="${n(tall)}" stroke="${layers.grid}" stroke-width="${grid.widthUnits}"/>`,
			);
		}
	}
	const rulings = spec.rulings;
	if (rulings && layers.rulings) {
		for (let y = rulings.spacingUnits; y < tall; y += rulings.spacingUnits) {
			parts.push(
				`<line x1="0" y1="${n(y)}" x2="${UNITS_WIDE}" y2="${n(y)}" stroke="${layers.rulings}" stroke-width="${rulings.widthUnits}"/>`,
			);
		}
	}
	if (rulings?.margin && layers.margin) {
		parts.push(
			`<line x1="100" y1="0" x2="100" y2="${n(tall)}" stroke="${layers.margin}" stroke-width="${rulings.widthUnits}"/>`,
		);
	}
	if (spec.specks && layers.specks) {
		parts.push(...speckCircles(spec.specks, layers.specks));
	}
	if (spec.ink && layers.ink) {
		for (const d of handwriting(spec.ink)) {
			parts.push(
				`<path d="${d}" fill="none" stroke="${layers.ink}" stroke-width="${spec.ink.widthUnits}" stroke-linecap="round" stroke-linejoin="round"/>`,
			);
		}
	}
	const underline = spec.underline;
	if (underline && layers.underline) {
		parts.push(
			`<path d="${underlinePath(underline)}" fill="none" stroke="${layers.underline}" stroke-width="${underline.widthUnits}" stroke-linecap="round" stroke-linejoin="round"/>`,
		);
	}
	const letterI = spec.letterI;
	if (letterI) {
		for (const { x, y } of letterI.baselines) {
			if (layers.stems) {
				parts.push(
					`<line x1="${n(x)}" y1="${n(y)}" x2="${n(x)}" y2="${n(y - letterI.heightUnits)}" stroke="${layers.stems}" stroke-width="${letterI.widthUnits}" stroke-linecap="round"/>`,
				);
			}
			if (layers.dots) {
				const dotY = y - 1.6 * letterI.heightUnits;
				parts.push(
					`<circle cx="${n(x)}" cy="${n(dotY)}" r="${n(0.7 * letterI.widthUnits)}" fill="${layers.dots}"/>`,
				);
			}
		}
	}
	if (layers.shadow > 0) {
		parts.push(
			`<rect x="0" y="0" width="${UNITS_WIDE}" height="${n(tall)}" fill="url(#shadow)"/>`,
		);
	}
	parts.push("</svg>");
	return parts.join("");
}

async function truthMask(spec: PageSpec, layers: Layers): Promise<Uint8Array> {
	const { data } = await sharp(Buffer.from(pageSvg(spec, layers)))
		.removeAlpha()
		.extractChannel(0)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const mask = new Uint8Array(spec.widthPx * spec.heightPx);
	for (let index = 0; index < mask.length; index += 1) {
		mask[index] = (data[index] ?? 255) < 128 ? 1 : 0;
	}
	return mask;
}

function addNoise(data: Uint8Array, sigma: number, seed: number): void {
	const next = random(seed);
	for (let index = 0; index < data.length; index += 1) {
		const gaussian = (next() + next() + next() + next() - 2) * Math.sqrt(3);
		const value = (data[index] ?? 0) + sigma * gaussian;
		data[index] = Math.max(0, Math.min(255, Math.round(value)));
	}
}

async function truthIf(
	spec: PageSpec,
	present: unknown,
	layers: Partial<Layers>,
): Promise<Uint8Array> {
	if (!present) return new Uint8Array(spec.widthPx * spec.heightPx);
	return truthMask(spec, { ...NO_LAYERS, ...layers });
}

export async function syntheticPage(spec: PageSpec): Promise<SyntheticPage> {
	const rulings = spec.rulings;
	const photoLayers: Layers = {
		paper: spec.paper ?? "#ffffff",
		table: spec.table?.color ?? null,
		rulings: rulings?.color ?? null,
		margin: rulings?.margin ?? null,
		grid: spec.grid?.color ?? null,
		specks: spec.specks?.color ?? null,
		ink: spec.ink?.color ?? null,
		underline: spec.underline?.color ?? null,
		stems: spec.letterI?.color ?? null,
		dots: spec.letterI?.color ?? null,
		shadow: spec.shadow ?? 0,
	};
	let rendered = sharp(Buffer.from(pageSvg(spec, photoLayers))).removeAlpha();
	if (spec.blurPx) rendered = rendered.blur(spec.blurPx);
	const { data } = await rendered.raw().toBuffer({ resolveWithObject: true });
	const pixels = new Uint8Array(data);
	if (spec.noise) addNoise(pixels, spec.noise, spec.ink?.seed ?? 7);
	const raw = sharp(pixels, {
		raw: { width: spec.widthPx, height: spec.heightPx, channels: 3 },
	});
	const photo =
		spec.format === "png"
			? await raw.png().toBuffer()
			: await raw.jpeg({ quality: 92 }).toBuffer();
	const black = "#000000";
	const [ink, rulingTruth, grid, underline, dots, specks, table] =
		await Promise.all([
			truthIf(spec, spec.ink || spec.underline || spec.letterI, {
				ink: black,
				underline: black,
				stems: black,
				dots: black,
			}),
			truthIf(spec, rulings, { rulings: black, margin: black }),
			truthIf(spec, spec.grid, { grid: black }),
			truthIf(spec, spec.underline, { underline: black }),
			truthIf(spec, spec.letterI, { dots: black }),
			truthIf(spec, spec.specks, { specks: black }),
			truthIf(spec, spec.table, { table: black }),
		]);
	return {
		photo: new Uint8Array(photo),
		widthPx: spec.widthPx,
		heightPx: spec.heightPx,
		ink,
		rulings: rulingTruth,
		grid,
		underline,
		dots,
		specks,
		table,
	};
}

export async function transparentInk(spec: PageSpec): Promise<SyntheticPage> {
	const layers: Layers = {
		...NO_LAYERS,
		paper: null,
		ink: spec.ink?.color ?? "#000000",
	};
	const photo = await sharp(Buffer.from(pageSvg(spec, layers)))
		.ensureAlpha()
		.png()
		.toBuffer();
	const truthLayers: Layers = { ...layers, paper: "#ffffff", ink: "#000000" };
	const empty = new Uint8Array(spec.widthPx * spec.heightPx);
	return {
		photo: new Uint8Array(photo),
		widthPx: spec.widthPx,
		heightPx: spec.heightPx,
		ink: await truthMask(spec, truthLayers),
		rulings: empty,
		grid: empty,
		underline: empty,
		dots: empty,
		specks: empty,
		table: empty,
	};
}

export async function sidewaysL(): Promise<Uint8Array> {
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">`,
		`<rect x="0" y="0" width="1200" height="800" fill="#ffffff"/>`,
		`<rect x="120" y="640" width="960" height="16" fill="#111111"/>`,
		`<rect x="1040" y="80" width="16" height="576" fill="#111111"/>`,
		"</svg>",
	].join("");
	const photo = await sharp(Buffer.from(svg))
		.removeAlpha()
		.jpeg({ quality: 92 })
		.withMetadata({ orientation: 6 })
		.toBuffer();
	return new Uint8Array(photo);
}

function pngChunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([length, body, checksum]);
}

export function headerOnlyPng(widthPx: number, heightPx: number): Uint8Array {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(widthPx, 0);
	header.writeUInt32BE(heightPx, 4);
	header[8] = 8;
	header[9] = 2;
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return new Uint8Array(
		Buffer.concat([
			signature,
			pngChunk("IHDR", header),
			pngChunk("IDAT", deflateSync(Buffer.alloc(1 + 3 * widthPx))),
			pngChunk("IEND", Buffer.alloc(0)),
		]),
	);
}

export async function handwrittenG(): Promise<{
	widthPx: number;
	heightPx: number;
	alpha: Uint8Array;
}> {
	const widthPx = 200;
	const heightPx = 300;
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">`,
		`<rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="#ffffff"/>`,
		`<g fill="none" stroke="#000000" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">`,
		`<path d="M 137 96 C 124 66 70 60 54 100 C 40 136 64 170 98 162 C 126 156 140 128 137 96 Z"/>`,
		`<path d="M 146 70 C 140 120 150 190 134 224 C 118 258 66 266 44 232 C 38 222 42 212 50 214"/>`,
		"</g>",
		"</svg>",
	].join("");
	const { data } = await sharp(Buffer.from(svg))
		.removeAlpha()
		.blur(0.8)
		.extractChannel(0)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const alpha = new Uint8Array(widthPx * heightPx);
	for (let index = 0; index < alpha.length; index += 1) {
		alpha[index] = 255 - (data[index] ?? 255);
	}
	return { widthPx, heightPx, alpha };
}
