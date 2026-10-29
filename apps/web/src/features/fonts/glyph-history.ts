import type { DrawnGlyph, Stroke } from "@repo/types";
import { GLYPH_LIMITS } from "@repo/types";

export type CellStrokes = Readonly<Record<string, readonly Stroke[]>>;

type Change = {
	key: string;
	before: readonly Stroke[];
	after: readonly Stroke[];
};

export type GlyphHistory = {
	cells: CellStrokes;
	past: readonly Change[];
	future: readonly Change[];
};

const NONE: readonly Stroke[] = [];

export function cellKey(char: string, variant: number): string {
	return `${char}:${variant}`;
}

export function parseCellKey(key: string): { char: string; variant: number } {
	const split = key.lastIndexOf(":");
	return { char: key.slice(0, split), variant: Number(key.slice(split + 1)) };
}

export function glyphHistory(glyphs: readonly DrawnGlyph[]): GlyphHistory {
	const cells: Record<string, readonly Stroke[]> = {};
	for (const glyph of glyphs) {
		cells[cellKey(glyph.char, glyph.variant)] = glyph.strokes;
	}
	return { cells, past: [], future: [] };
}

export function strokesOf(
	history: GlyphHistory,
	key: string,
): readonly Stroke[] {
	return history.cells[key] ?? NONE;
}

export function isFull(history: GlyphHistory, key: string): boolean {
	return strokesOf(history, key).length >= GLYPH_LIMITS.strokes;
}

function record(
	history: GlyphHistory,
	key: string,
	after: readonly Stroke[],
): GlyphHistory {
	return {
		cells: { ...history.cells, [key]: after },
		past: [...history.past, { key, before: strokesOf(history, key), after }],
		future: [],
	};
}

export function addStroke(
	history: GlyphHistory,
	key: string,
	stroke: Stroke,
): GlyphHistory {
	if (isFull(history, key)) return history;
	return record(history, key, [...strokesOf(history, key), stroke]);
}

export function clearCell(history: GlyphHistory, key: string): GlyphHistory {
	if (strokesOf(history, key).length === 0) return history;
	return record(history, key, NONE);
}

export function canUndo(history: GlyphHistory): boolean {
	return history.past.length > 0;
}

export function canRedo(history: GlyphHistory): boolean {
	return history.future.length > 0;
}

export function undoTarget(history: GlyphHistory): string | null {
	return history.past.at(-1)?.key ?? null;
}

export function redoTarget(history: GlyphHistory): string | null {
	return history.future.at(-1)?.key ?? null;
}

export function undo(history: GlyphHistory): GlyphHistory {
	const change = history.past.at(-1);
	if (!change) return history;
	return {
		cells: { ...history.cells, [change.key]: change.before },
		past: history.past.slice(0, -1),
		future: [...history.future, change],
	};
}

export function redo(history: GlyphHistory): GlyphHistory {
	const change = history.future.at(-1);
	if (!change) return history;
	return {
		cells: { ...history.cells, [change.key]: change.after },
		past: [...history.past, change],
		future: history.future.slice(0, -1),
	};
}

export function rollback(
	history: GlyphHistory,
	key: string,
	strokes: readonly Stroke[],
): GlyphHistory {
	const other = (change: Change) => change.key !== key;
	return {
		cells: { ...history.cells, [key]: strokes },
		past: history.past.filter(other),
		future: history.future.filter(other),
	};
}

export function drawnGlyphs(history: GlyphHistory): DrawnGlyph[] {
	return Object.entries(history.cells)
		.filter(([, strokes]) => strokes.length > 0)
		.map(([key, strokes]) => ({ ...parseCellKey(key), strokes: [...strokes] }));
}
