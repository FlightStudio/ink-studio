import { letterExtensions } from "@repo/render/schema";
import type { PlacedElement, SignatureNode } from "@repo/types";
import { getSchema } from "@tiptap/core";
import { splitBlock } from "@tiptap/pm/commands";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import { placeElement, signLetter, updateElement } from "./elements.ts";

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

const firstSignature: SignatureNode["attrs"] = {
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a30",
	widthIn: 1.5,
	align: "left",
	color: "sepia",
};

const secondSignature: SignatureNode["attrs"] = {
	drawingId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a31",
	widthIn: 3,
	align: "right",
	color: "oxblood",
};

function signaturesOf(state: EditorState): SignatureNode["attrs"][] {
	const found: SignatureNode["attrs"][] = [];
	state.doc.forEach((node) => {
		if (node.type.name === "signature") {
			found.push(node.attrs as SignatureNode["attrs"]);
		}
	});
	return found;
}

it("signing twice keeps one signature, the newer one", () => {
	const start = fresh();
	const once = apply(start, signLetter(start, firstSignature));
	const twice = apply(once, signLetter(once, secondSignature));
	expect(signaturesOf(twice)).toEqual([secondSignature]);
	expect(twice.doc.childCount).toBe(2);
});

it("Enter at the end of the last paragraph adds a paragraph above the signature", () => {
	let state = apply(fresh(), signLetter(fresh(), firstSignature));
	state = apply(state, state.tr.insertText("Hi"));
	const paragraph = state.doc.firstChild;
	if (paragraph?.type.name !== "paragraph") {
		throw new Error("the letter has no paragraph");
	}
	state = state.apply(
		state.tr.setSelection(
			TextSelection.create(state.doc, 1 + paragraph.content.size),
		),
	);
	const split = splitBlock(state, (transaction) => {
		state = state.apply(transaction);
	});
	expect(split).toBe(true);
	expect(state.doc.child(0).textContent).toBe("Hi");
	expect(state.doc.child(1).type.name).toBe("paragraph");
	expect(state.doc.child(2).type.name).toBe("signature");
	expect(signaturesOf(state)).toEqual([firstSignature]);
});

it("updating an element that does not exist throws", () => {
	expect(() =>
		updateElement(fresh(), "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a99", { xIn: 4 }),
	).toThrow();
});
