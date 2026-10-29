import { outlinePath, strokeOutline } from "@repo/render/html";
import type { DrawnGlyph } from "@repo/types";
import { CELL } from "@repo/types";

export const SPECIMEN_TEXT = "Connect with your community through your writing";

export const SIDE_BEARING = 60;

export type SpecimenGlyph =
	| { char: string; kind: "stock" }
	| {
			char: string;
			kind: "ink";
			paths: string[];
			left: number;
			advance: number;
	  };

type InkShape = { paths: string[]; left: number; advance: number };

function xRange(outlines: readonly (readonly number[])[][]): {
	minX: number;
	maxX: number;
} {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	for (const outline of outlines) {
		for (const [x = 0] of outline) {
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
		}
	}
	return { minX, maxX };
}

function shapeOf(glyph: DrawnGlyph): InkShape {
	const outlines = glyph.strokes.map((stroke) =>
		strokeOutline(stroke, CELL.strokeScale),
	);
	const { minX, maxX } = xRange(outlines);
	return {
		paths: outlines.map(outlinePath),
		left: minX - SIDE_BEARING,
		advance: maxX - minX + SIDE_BEARING * 2,
	};
}

function versionsByChar(
	glyphs: readonly DrawnGlyph[],
): Map<string, InkShape[]> {
	const versions = new Map<string, DrawnGlyph[]>();
	for (const glyph of glyphs) {
		if (glyph.strokes.length === 0) continue;
		versions.set(glyph.char, [...(versions.get(glyph.char) ?? []), glyph]);
	}
	return new Map(
		[...versions].map(([char, drawn]) => [
			char,
			drawn.sort((a, b) => a.variant - b.variant).map(shapeOf),
		]),
	);
}

export function specimenWords(
	text: string,
	glyphs: readonly DrawnGlyph[],
): SpecimenGlyph[][] {
	const versions = versionsByChar(glyphs);
	const seen = new Map<string, number>();
	return text.split(" ").map((word) =>
		[...word].map((char): SpecimenGlyph => {
			const shapes = versions.get(char) ?? [];
			const count = seen.get(char) ?? 0;
			const shape = shapes[count % shapes.length];
			if (!shape) return { char, kind: "stock" };
			seen.set(char, count + 1);
			return { char, kind: "ink", ...shape };
		}),
	);
}
