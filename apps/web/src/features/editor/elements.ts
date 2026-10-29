import type { PlacedElement } from "@repo/types";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export type ElementChange = Partial<Omit<PlacedElement, "id" | "kind">>;

export function elementsOf(state: EditorState): PlacedElement[] {
	const elements = state.doc.attrs.elements;
	return Array.isArray(elements) ? (elements as PlacedElement[]) : [];
}

function replaceElements(
	state: EditorState,
	elements: PlacedElement[],
): Transaction {
	const transaction = state.tr.setDocAttribute("elements", elements);
	closeHistory(transaction);
	return transaction;
}

export function placeElement(
	state: EditorState,
	element: PlacedElement,
): Transaction {
	return replaceElements(state, [...elementsOf(state), element]);
}

export function updateElement(
	state: EditorState,
	id: string,
	change: ElementChange,
): Transaction {
	const elements = elementsOf(state);
	const index = elements.findIndex((element) => element.id === id);
	if (index < 0) throw new Error(`Element ${id} is not on the letter`);
	const next = elements.slice();
	const current = next[index];
	if (!current) throw new Error(`Element ${id} is not on the letter`);
	next[index] = { ...current, ...change };
	return replaceElements(state, next);
}

export function signatureOf(state: EditorState): PlacedElement | null {
	return (
		elementsOf(state).find((element) => element.kind === "signature") ?? null
	);
}

export function signLetter(
	state: EditorState,
	signature: PlacedElement,
): Transaction {
	const current = signatureOf(state);
	if (!current) return placeElement(state, signature);
	return updateElement(state, current.id, {
		drawingId: signature.drawingId,
		tint: signature.tint,
		widthIn: signature.widthIn,
		heightIn: signature.heightIn,
		xIn: current.xIn + (current.widthIn - signature.widthIn) / 2,
		yIn: current.yIn + (current.heightIn - signature.heightIn) / 2,
	});
}

export function removeElement(state: EditorState, id: string): Transaction {
	const elements = elementsOf(state);
	if (!elements.some((element) => element.id === id)) {
		throw new Error(`Element ${id} is not on the letter`);
	}
	return replaceElements(
		state,
		elements.filter((element) => element.id !== id),
	);
}
