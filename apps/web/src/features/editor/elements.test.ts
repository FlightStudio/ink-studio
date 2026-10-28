import { letterExtensions } from "@repo/render/schema";
import type { PlacedElement } from "@repo/types";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import { placeElement, updateElement } from "./elements.ts";

const schema = getSchema(letterExtensions);

const element: PlacedElement = {
	id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a12",
	kind: "drawing",
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a13",
	side: 0,
	xIn: 1,
	yIn: 1,
	widthIn: 2,
	heightIn: 1,
	rotationDeg: 0,
	tint: "ink-blue",
	wrap: false,
};

function fresh(): EditorState {
	return EditorState.create({ schema, plugins: [history()] });
}

function apply(state: EditorState, transaction: Transaction): EditorState {
	return state.apply(transaction);
}

function elementsOf(state: EditorState): PlacedElement[] {
	return state.doc.attrs.elements as PlacedElement[];
}

function stepBack(state: EditorState): EditorState {
	let next = state;
	const done = undo(state, (transaction) => {
		next = state.apply(transaction);
	});
	if (!done) throw new Error("nothing to undo");
	return next;
}

it("placing an element and undoing removes it", () => {
	const start = fresh();
	const placed = apply(start, placeElement(start, element));
	expect(elementsOf(placed)).toEqual([element]);
	expect(elementsOf(stepBack(placed))).toEqual([]);
});

it("one undo stack covers text and placement, newest first", () => {
	const start = fresh();
	let state = apply(start, placeElement(start, element));
	state = apply(state, updateElement(state, element.id, { xIn: 3 }));
	state = apply(state, state.tr.insertText("Hi"));
	expect(state.doc.textContent).toBe("Hi");
	expect(elementsOf(state)[0]?.xIn).toBe(3);
	state = stepBack(state);
	expect(state.doc.textContent).toBe("");
	expect(elementsOf(state)[0]?.xIn).toBe(3);
	state = stepBack(state);
	expect(elementsOf(state)[0]?.xIn).toBe(1);
});

it("updating an element that does not exist throws", () => {
	expect(() =>
		updateElement(fresh(), "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99", { xIn: 4 }),
	).toThrow();
});
