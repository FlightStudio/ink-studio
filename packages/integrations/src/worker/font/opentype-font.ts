import { Worker } from "node:worker_threads";
import { ServiceError } from "@repo/errors";
import { CELL } from "@repo/types";
import opentype from "opentype.js";
import { readTemplate } from "./template.ts";
import { vectorize } from "./vectorize.ts";

export type PathSegment =
	| ["M", number, number]
	| ["L", number, number]
	| ["Q", number, number, number, number]
	| ["C", number, number, number, number, number, number];
export type Contour = PathSegment[];
export type GlyphOutline = {
	char: string;
	variant: number;
	contours: Contour[];
	advanceWidth: number;
};
export type BuildFontParams = {
	familyName: string;
	ascender: number;
	descender: number;
	glyphs: GlyphOutline[];
};

export const UNITS_PER_EM = 1000;

const SPACE_ADVANCE = 300;
const VARIANT_SETS = ["ss01", "ss02", "ss03"] as const;
const SCRIPTS = ["DFLT", "latn"] as const;
const NO_REQUIRED_FEATURE = 0xffff;

type Letter = { char: string; outlines: GlyphOutline[] };
type Coverage = { format: 1; glyphs: number[] };
type LookupRecord = { sequenceIndex: number; lookupListIndex: number };
type SingleSubtable = {
	substFormat: 2;
	coverage: Coverage;
	substitute: number[];
};
type ChainSubtable = {
	substFormat: 3;
	backtrackCoverage: Coverage[];
	inputCoverage: Coverage[];
	lookaheadCoverage: Coverage[];
	lookupRecords: LookupRecord[];
};
type Lookup =
	| { lookupType: 1; lookupFlag: 0; subtables: SingleSubtable[] }
	| { lookupType: 6; lookupFlag: 0; subtables: ChainSubtable[] };
type Gsub = {
	version: 1;
	scripts: {
		tag: string;
		script: {
			defaultLangSys: { reqFeatureIndex: number; featureIndexes: number[] };
			langSysRecords: [];
		};
	}[];
	features: {
		tag: string;
		feature: { featureParams: 0; lookupListIndexes: number[] };
	}[];
	lookups: Lookup[];
};

function baseName(char: string): string {
	if (/^[A-Za-z0-9]$/u.test(char)) return char;
	const code = char.codePointAt(0) ?? 0;
	return code > 0xffff
		? `u${code.toString(16).toUpperCase()}`
		: `uni${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function glyphName(char: string, variant: number): string {
	return variant === 0 ? baseName(char) : `${baseName(char)}.alt${variant}`;
}

function lettersOf(glyphs: GlyphOutline[]): Letter[] {
	const byChar = new Map<string, GlyphOutline[]>();
	for (const outline of glyphs) {
		if ([...outline.char].length !== 1) {
			throw new Error(
				`A glyph is drawn for one character, not "${outline.char}"`,
			);
		}
		const outlines = byChar.get(outline.char) ?? [];
		outlines.push(outline);
		byChar.set(outline.char, outlines);
	}
	return [...byChar.entries()].map(([char, outlines]) => {
		const sorted = outlines.toSorted((a, b) => a.variant - b.variant);
		for (const [index, outline] of sorted.entries()) {
			if (outline.variant !== index) {
				throw new Error(
					`The variants of "${char}" must run from 0 without gaps or repeats`,
				);
			}
		}
		return { char, outlines: sorted };
	});
}

function pathOf(contours: Contour[]): opentype.Path {
	const path = new opentype.Path();
	for (const contour of contours) {
		for (const segment of contour) {
			switch (segment[0]) {
				case "M":
					path.moveTo(segment[1], segment[2]);
					break;
				case "L":
					path.lineTo(segment[1], segment[2]);
					break;
				case "Q":
					path.quadraticCurveTo(segment[1], segment[2], segment[3], segment[4]);
					break;
				case "C":
					path.bezierCurveTo(
						segment[1],
						segment[2],
						segment[3],
						segment[4],
						segment[5],
						segment[6],
					);
					break;
			}
		}
		path.close();
	}
	return path;
}

function coverage(glyphs: number[]): Coverage {
	return { format: 1, glyphs };
}

function chain(
	backtrack: number[],
	input: number,
	lookupListIndex: number | null,
): ChainSubtable {
	return {
		substFormat: 3,
		backtrackCoverage: backtrack.map((glyph) => coverage([glyph])),
		inputCoverage: [coverage([input])],
		lookaheadCoverage: [],
		lookupRecords:
			lookupListIndex === null ? [] : [{ sequenceIndex: 0, lookupListIndex }],
	};
}

function variantGsub(
	letters: Letter[],
	glyphIndex: (char: string, variant: number) => number,
): Gsub | null {
	const varying = letters.filter((letter) => letter.outlines.length > 1);
	if (varying.length === 0) return null;
	const mostVariants = Math.max(
		...varying.map((letter) => letter.outlines.length),
	);
	const toVariant = (variant: number) => VARIANT_SETS.length + variant - 1;
	const singles: Lookup[] = [];
	for (let variant = 1; variant < mostVariants; variant += 1) {
		const pairs = varying
			.filter((letter) => letter.outlines.length > variant)
			.map((letter) => ({
				from: glyphIndex(letter.char, 0),
				to: glyphIndex(letter.char, variant),
			}))
			.toSorted((a, b) => a.from - b.from);
		singles.push({
			lookupType: 1,
			lookupFlag: 0,
			subtables: [
				{
					substFormat: 2,
					coverage: coverage(pairs.map((pair) => pair.from)),
					substitute: pairs.map((pair) => pair.to),
				},
			],
		});
	}
	const cycles: Lookup[] = VARIANT_SETS.map((_, start) => {
		const subtables: ChainSubtable[] = [];
		for (const letter of varying) {
			const count = letter.outlines.length;
			const glyph = (variant: number) => glyphIndex(letter.char, variant);
			subtables.push(chain([glyph(count - 1)], glyph(0), null));
			for (let variant = count - 2; variant >= 0; variant -= 1) {
				subtables.push(
					chain([glyph(variant)], glyph(0), toVariant(variant + 1)),
				);
			}
		}
		for (const letter of varying) {
			const offset = start % letter.outlines.length;
			if (offset === 0) continue;
			subtables.push(chain([], glyphIndex(letter.char, 0), toVariant(offset)));
		}
		return { lookupType: 6, lookupFlag: 0, subtables };
	});
	const featureIndexes = VARIANT_SETS.map((_, index) => index);
	return {
		version: 1,
		scripts: SCRIPTS.map((tag) => ({
			tag,
			script: {
				defaultLangSys: {
					reqFeatureIndex: NO_REQUIRED_FEATURE,
					featureIndexes,
				},
				langSysRecords: [],
			},
		})),
		features: VARIANT_SETS.map((tag, index) => ({
			tag,
			feature: { featureParams: 0, lookupListIndexes: [index] },
		})),
		lookups: [...cycles, ...singles],
	};
}

export function buildFont(params: BuildFontParams): Uint8Array {
	const letters = lettersOf(params.glyphs);
	const glyphs = [
		new opentype.Glyph({
			name: ".notdef",
			advanceWidth: UNITS_PER_EM / 2,
			path: new opentype.Path(),
		}),
		new opentype.Glyph({
			name: "space",
			unicode: 32,
			advanceWidth: SPACE_ADVANCE,
			path: new opentype.Path(),
		}),
	];
	for (const letter of letters) {
		for (const outline of letter.outlines) {
			glyphs.push(
				new opentype.Glyph({
					name: glyphName(letter.char, outline.variant),
					...(outline.variant === 0
						? { unicode: letter.char.codePointAt(0) }
						: {}),
					advanceWidth: outline.advanceWidth,
					path: pathOf(outline.contours),
				}),
			);
		}
	}
	const font = new opentype.Font({
		familyName: params.familyName,
		styleName: "Regular",
		unitsPerEm: UNITS_PER_EM,
		ascender: params.ascender,
		descender: params.descender,
		glyphs,
	});
	const indexByName = new Map(glyphs.map((item, index) => [item.name, index]));
	const gsub = variantGsub(letters, (char, variant) => {
		const index = indexByName.get(glyphName(char, variant));
		if (index === undefined) {
			throw new Error(`No glyph for variant ${variant} of "${char}"`);
		}
		return index;
	});
	if (gsub !== null) Object.assign(font.tables, { gsub });
	return new Uint8Array(font.toArrayBuffer());
}

export type OutlineGlyph = {
	char: string;
	variant: number;
	polygons: [number, number][][];
};
export type FromStrokeOutlinesParams = {
	familyName: string;
	glyphs: OutlineGlyph[];
};
export type FromTemplatePhotoParams = {
	familyName: string;
	photo: Uint8Array;
};
export type FromUploadParams = { familyName: string; file: Uint8Array };
export type BuiltFont = { bytes: Uint8Array; chars: string };
export type FontBuilderParams = {
	thread: { url: URL; execArgv: string[] };
	parseTimeoutMs: number;
	parseMaxMemoryMb: number;
};

export interface FontBuilder {
	fromStrokeOutlines(params: FromStrokeOutlinesParams): Promise<BuiltFont>;
	fromTemplatePhoto(params: FromTemplatePhotoParams): Promise<BuiltFont>;
	fromUpload(params: FromUploadParams): Promise<BuiltFont>;
}

const DEFAULT_BUILDER: FontBuilderParams = {
	thread: {
		url: new URL("./parse-thread.ts", import.meta.url),
		execArgv: ["--import", "tsx"],
	},
	parseTimeoutMs: 5_000,
	parseMaxMemoryMb: 256,
};

type UploadReply =
	| { ok: true; bytes: Uint8Array; chars: string }
	| { ok: false; code: "font_unreadable" | "font_missing_glyphs" };

const SIDE_BEARING = 60;

type Point = [number, number];

function signedArea(points: readonly Point[]): number {
	let sum = 0;
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		if (!current || !next) continue;
		sum += current[0] * next[1] - next[0] * current[1];
	}
	return sum;
}

function fontPoint(point: Point): Point {
	return [point[0], CELL.baseline - point[1]];
}

function sameWay(points: readonly Point[]): Point[] {
	const mapped = points.map(fontPoint);
	if (mapped.length < 3) return mapped;
	return signedArea(mapped) < 0 ? [...mapped].reverse() : mapped;
}

function outlineOf(
	char: string,
	variant: number,
	polygons: readonly Point[][],
): GlyphOutline | null {
	const usable = polygons.filter((points) => points.length >= 3);
	if (usable.length === 0) return null;
	const xs = usable.flat().map((point) => point[0]);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const shift = SIDE_BEARING - minX;
	return {
		char,
		variant,
		advanceWidth: maxX - minX + SIDE_BEARING * 2,
		contours: usable.map((points) =>
			contourOf(points.map((point) => [point[0] + shift, point[1]])),
		),
	};
}

function contourOf(points: readonly Point[]): Contour {
	const first = points[0];
	if (!first) return [];
	const contour: Contour = [["M", first[0], first[1]]];
	for (let index = 0; index < points.length; index += 1) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		if (!current || !next) continue;
		contour.push([
			"Q",
			(current[0] + next[0]) / 2,
			(current[1] + next[1]) / 2,
			next[0],
			next[1],
		]);
	}
	return contour;
}

export class OpentypeFontBuilder implements FontBuilder {
	constructor(private readonly params: FontBuilderParams = DEFAULT_BUILDER) {}

	async fromStrokeOutlines(
		params: FromStrokeOutlinesParams,
	): Promise<BuiltFont> {
		return this.assemble(
			params.familyName,
			params.glyphs.flatMap((glyph) => {
				const outline = outlineOf(
					glyph.char,
					glyph.variant,
					glyph.polygons.map(sameWay),
				);
				return outline ? [outline] : [];
			}),
		);
	}

	async fromTemplatePhoto(params: FromTemplatePhotoParams): Promise<BuiltFont> {
		const cells = await readTemplate(params.photo);
		const glyphs: GlyphOutline[] = [];
		for (const cell of cells) {
			const polygons = vectorize(cell.mask).map((loop) =>
				loop
					.map(
						([x, y]): Point =>
							fontPoint([
								(x / cell.mask.widthPx) * CELL.size,
								(y / cell.mask.heightPx) * CELL.size,
							]),
					)
					.reverse(),
			);
			const outline = outlineOf(cell.char, cell.variant, polygons);
			if (outline) glyphs.push(outline);
		}
		return this.assemble(params.familyName, glyphs);
	}

	async fromUpload(params: FromUploadParams): Promise<BuiltFont> {
		const worker = new Worker(this.params.thread.url, {
			execArgv: [...this.params.thread.execArgv],
			resourceLimits: {
				maxOldGenerationSizeMb: this.params.parseMaxMemoryMb,
			},
		});
		const file = params.file;
		const bytes = file.buffer.slice(
			file.byteOffset,
			file.byteOffset + file.byteLength,
		);
		let settled = false;
		try {
			return await new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					if (settled) return;
					settled = true;
					reject(new ServiceError("invalid_input", "font_timeout"));
				}, this.params.parseTimeoutMs);
				worker.once("message", (reply: UploadReply) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					if (reply.ok) {
						resolve({ bytes: reply.bytes, chars: reply.chars });
						return;
					}
					reject(
						new ServiceError(
							"invalid_input",
							reply.code === "font_missing_glyphs"
								? "font_missing_glyphs"
								: "font_unreadable",
						),
					);
				});
				worker.once("error", () => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					reject(new ServiceError("invalid_input", "font_unreadable"));
				});
				worker.postMessage({
					familyName: params.familyName,
					bytes: new Uint8Array(bytes),
				});
			});
		} finally {
			await worker.terminate();
		}
	}

	private assemble(familyName: string, glyphs: GlyphOutline[]): BuiltFont {
		const chars: string[] = [];
		for (const glyph of glyphs) {
			if (!chars.includes(glyph.char)) chars.push(glyph.char);
		}
		return {
			bytes: buildFont({
				familyName,
				ascender: CELL.baseline - CELL.ascender,
				descender: CELL.baseline - CELL.descender,
				glyphs,
			}),
			chars: chars.join(""),
		};
	}
}
