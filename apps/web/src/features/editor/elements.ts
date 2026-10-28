import type { PlacedElement, SignatureNode } from "@repo/types";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export type ElementChange = Partial<
	Omit<PlacedElement, "id" | "kind" | "drawingId">
>;

function elementsOf(state: EditorState): PlacedElement[] {
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

export function signLetter(
	state: EditorState,
	signature: SignatureNode["attrs"],
): Transaction {
	const type = state.schema.nodes.signature;
	if (!type) throw new Error("the letter cannot hold a signature");
	const node = type.create(signature);
	const { doc } = state;
	const transaction = state.tr;
	const last = doc.lastChild;
	const end = doc.content.size;
	if (last?.type.name === "signature") {
		transaction.replaceWith(end - last.nodeSize, end, node);
	} else {
		transaction.insert(end, node);
	}
	closeHistory(transaction);
	return transaction;
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
