import type { DrawnGlyph, Stroke } from "@repo/types";
import { GLYPH_LIMITS } from "@repo/types";
import { describe, expect, test } from "vitest";
import {
	addStroke,
	canRedo,
	canUndo,
	cellKey,
	clearCell,
	drawnGlyphs,
	glyphHistory,
	isFull,
	parseCellKey,
	redo,
	redoTarget,
	rollback,
	strokesOf,
	undo,
	undoTarget,
} from "./glyph-history.ts";

function stroke(x: number): Stroke {
	return { input: "pen", points: [[x, 500, 0.5, 0]] };
}

const saved: DrawnGlyph[] = [
	{ char: "a", variant: 0, strokes: [stroke(1)] },
	{ char: "e", variant: 1, strokes: [stroke(2), stroke(3)] },
];

describe("cellKey", () => {
	test("a key names the character and the variant", () => {
		expect(cellKey("a", 0)).toBe("a:0");
		expect(parseCellKey("a:2")).toEqual({ char: "a", variant: 2 });
	});

	test("a colon is a character too", () => {
		expect(parseCellKey(cellKey(":", 0))).toEqual({ char: ":", variant: 0 });
	});
});

describe("glyphHistory", () => {
	test("starts from the saved cells with nothing to undo or redo", () => {
		const history = glyphHistory(saved);
		expect(strokesOf(history, "a:0")).toEqual([stroke(1)]);
		expect(strokesOf(history, "e:1")).toEqual([stroke(2), stroke(3)]);
		expect(strokesOf(history, "b:0")).toEqual([]);
		expect(canUndo(history)).toBe(false);
		expect(canRedo(history)).toBe(false);
		expect(undoTarget(history)).toBeNull();
	});

	test("undo takes back the last stroke in whichever cell it was drawn", () => {
		let history = glyphHistory(saved);
		history = addStroke(history, "b:0", stroke(4));
		history = addStroke(history, "a:0", stroke(5));
		expect(undoTarget(history)).toBe("a:0");
		history = undo(history);
		expect(strokesOf(history, "a:0")).toEqual([stroke(1)]);
		expect(undoTarget(history)).toBe("b:0");
		history = undo(history);
		expect(strokesOf(history, "b:0")).toEqual([]);
		expect(canUndo(history)).toBe(false);
	});

	test("undo goes no further back than the strokes this visit drew", () => {
		const history = undo(glyphHistory(saved));
		expect(strokesOf(history, "a:0")).toEqual([stroke(1)]);
		expect(history).toEqual(glyphHistory(saved));
	});

	test("redo puts back what undo took, in order", () => {
		let history = glyphHistory([]);
		history = addStroke(history, "b:0", stroke(1));
		history = addStroke(history, "c:0", stroke(2));
		history = undo(undo(history));
		expect(redoTarget(history)).toBe("b:0");
		history = redo(history);
		expect(strokesOf(history, "b:0")).toEqual([stroke(1)]);
		expect(strokesOf(history, "c:0")).toEqual([]);
		history = redo(history);
		expect(strokesOf(history, "c:0")).toEqual([stroke(2)]);
		expect(canRedo(history)).toBe(false);
		expect(redo(history)).toBe(history);
	});

	test("a new stroke after undo drops the redo steps", () => {
		let history = addStroke(glyphHistory([]), "b:0", stroke(1));
		history = undo(history);
		history = addStroke(history, "c:0", stroke(2));
		expect(canRedo(history)).toBe(false);
	});

	test("clearing a cell is one step that undo brings back", () => {
		let history = addStroke(glyphHistory(saved), "a:0", stroke(9));
		history = clearCell(history, "a:0");
		expect(strokesOf(history, "a:0")).toEqual([]);
		expect(undoTarget(history)).toBe("a:0");
		history = undo(history);
		expect(strokesOf(history, "a:0")).toEqual([stroke(1), stroke(9)]);
		history = redo(history);
		expect(strokesOf(history, "a:0")).toEqual([]);
	});

	test("a saved cell can be cleared and restored on the first visit", () => {
		let history = clearCell(glyphHistory(saved), "e:1");
		expect(drawnGlyphs(history)).toEqual([saved[0]]);
		history = undo(history);
		expect(strokesOf(history, "e:1")).toEqual([stroke(2), stroke(3)]);
	});

	test("clearing an empty cell adds no step", () => {
		const history = glyphHistory(saved);
		expect(clearCell(history, "b:0")).toBe(history);
	});

	test("a full cell takes no more strokes", () => {
		let history = glyphHistory([]);
		for (let index = 0; index < GLYPH_LIMITS.strokes; index += 1) {
			history = addStroke(history, "w:0", stroke(index));
		}
		expect(isFull(history, "w:0")).toBe(true);
		expect(isFull(history, "v:0")).toBe(false);
		expect(addStroke(history, "w:0", stroke(99))).toBe(history);
	});

	test("rollback sets a cell back to what the server has and forgets its steps", () => {
		let history = addStroke(glyphHistory(saved), "a:0", stroke(5));
		history = addStroke(history, "b:0", stroke(6));
		history = addStroke(history, "a:0", stroke(7));
		history = rollback(history, "a:0", [stroke(1)]);
		expect(strokesOf(history, "a:0")).toEqual([stroke(1)]);
		expect(undoTarget(history)).toBe("b:0");
		history = undo(history);
		expect(strokesOf(history, "b:0")).toEqual([]);
		expect(canUndo(history)).toBe(false);
	});

	test("rollback also forgets the redo steps of that cell", () => {
		let history = addStroke(glyphHistory([]), "a:0", stroke(1));
		history = addStroke(history, "b:0", stroke(2));
		history = undo(undo(history));
		history = rollback(history, "a:0", []);
		expect(redoTarget(history)).toBe("b:0");
		history = redo(history);
		expect(canRedo(history)).toBe(false);
	});

	test("drawnGlyphs lists every cell with ink, by character and variant", () => {
		let history = addStroke(glyphHistory(saved), "b:0", stroke(4));
		history = clearCell(history, "a:0");
		expect(drawnGlyphs(history)).toEqual([
			{ char: "e", variant: 1, strokes: [stroke(2), stroke(3)] },
			{ char: "b", variant: 0, strokes: [stroke(4)] },
		]);
	});
});
