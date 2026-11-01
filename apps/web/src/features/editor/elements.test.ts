import { letterExtensions } from "@repo/render/schema";
import type { PlacedElement } from "@repo/types";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import {
	placeElement,
	removeElement,
	signLetter,
	updateElement,
} from "./elements.ts";

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

const firstSignature: PlacedElement = {
	id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a32",
	kind: "signature",
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a30",
	side: 0,
	xIn: 5,
	yIn: 4,
	widthIn: 1.5,
	heightIn: 0.5,
	rotationDeg: 0,
	tint: "sepia",
	wrap: false,
};

const secondSignature: PlacedElement = {
	...firstSignature,
	id: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a33",
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a31",
	xIn: 1,
	yIn: 1,
	widthIn: 3,
	heightIn: 1.5,
	tint: "oxblood",
};

function signaturesOf(state: EditorState): PlacedElement[] {
	return elementsOf(state).filter((placed) => placed.kind === "signature");
}

it("signing places the signature on the page in one undo step", () => {
	let state = apply(fresh(), placeElement(fresh(), element));
	state = apply(state, signLetter(state, firstSignature));
	expect(elementsOf(state)).toEqual([element, firstSignature]);
	expect(state.doc.childCount).toBe(1);
	expect(elementsOf(stepBack(state))).toEqual([element]);
});

it("signing again swaps the drawing in place, keeping where it was put and turned", () => {
	let state = apply(fresh(), signLetter(fresh(), firstSignature));
	state = apply(
		state,
		updateElement(state, firstSignature.id, { side: 1, rotationDeg: 12 }),
	);
	state = apply(state, signLetter(state, secondSignature));
	expect(signaturesOf(state)).toEqual([
		{
			...firstSignature,
			drawingId: secondSignature.drawingId,
			tint: secondSignature.tint,
			side: 1,
			rotationDeg: 12,
			xIn: 4.25,
			yIn: 3.5,
			widthIn: 3,
			heightIn: 1.5,
		},
	]);
	state = stepBack(state);
	expect(signaturesOf(state)[0]?.drawingId).toBe(firstSignature.drawingId);
});

it("a placed signature moves, turns, recolours and comes off like a doodle", () => {
	let state = apply(fresh(), signLetter(fresh(), firstSignature));
	state = apply(state, state.tr.insertText("Love,"));
	state = apply(
		state,
		updateElement(state, firstSignature.id, {
			xIn: 2,
			rotationDeg: -8,
			tint: "forest",
		}),
	);
	expect(signaturesOf(state)).toEqual([
		{ ...firstSignature, xIn: 2, rotationDeg: -8, tint: "forest" },
	]);
	state = apply(state, removeElement(state, firstSignature.id));
	expect(signaturesOf(state)).toEqual([]);
	expect(state.doc.textContent).toBe("Love,");
	state = stepBack(state);
	expect(signaturesOf(state)).toHaveLength(1);
});

it("updating an element that does not exist throws", () => {
	expect(() =>
		updateElement(fresh(), "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99", { xIn: 4 }),
	).toThrow();
});
