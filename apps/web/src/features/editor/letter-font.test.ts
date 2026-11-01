import { letterExtensions } from "@repo/render/schema";
import type { FontRef } from "@repo/types";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import { Node } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import { writeLetterIn } from "./letter-font.ts";

const schema = getSchema(letterExtensions);
const own: FontRef = {
	kind: "own",
	fontId: "0192e4a0-7b1c-7cc3-9a5e-3f1d2b4c5a10",
};

function stateOf(content: unknown[]): EditorState {
	const doc = Node.fromJSON(schema, {
		type: "doc",
		attrs: { elements: [], minSides: 1, frontImageAssetId: null },
		content,
	});
	return EditorState.create({ schema, doc, plugins: [history()] });
}

function inks(state: EditorState): unknown[] {
	const found: unknown[] = [];
	state.doc.descendants((node) => {
		if (!node.isInline) return;
		found.push(node.marks.find((mark) => mark.type.name === "ink")?.attrs);
	});
	return found;
}

it("the whole letter takes the font and keeps each run's ink and size", () => {
	const state = stateOf([
		{
			type: "paragraph",
			attrs: { align: "left" },
			content: [
				{ type: "text", text: "Dear " },
				{
					type: "text",
					text: "Sam",
					marks: [
						{
							type: "ink",
							attrs: {
								font: { kind: "stock", id: "patrick-hand" },
								sizePt: 24,
								color: "oxblood",
							},
						},
					],
				},
				{ type: "mergeField", attrs: { field: "first_name" } },
			],
		},
	]);
	const next = state.apply(writeLetterIn(state, own));
	expect(inks(next)).toEqual([
		{ font: own, sizePt: null, color: null },
		{ font: own, sizePt: 24, color: "oxblood" },
		{ font: own, sizePt: null, color: null },
	]);
	expect(next.doc.textContent).toBe(state.doc.textContent);
});

it("one undo takes the font back off the whole letter", () => {
	const state = stateOf([
		{
			type: "paragraph",
			attrs: { align: "left" },
			content: [{ type: "text", text: "Dear Sam" }],
		},
		{
			type: "paragraph",
			attrs: { align: "left" },
			content: [{ type: "text", text: "See you soon" }],
		},
	]);
	const next = state.apply(writeLetterIn(state, own));
	let back = next;
	undo(next, (transaction) => {
		back = next.apply(transaction);
	});
	expect(back.doc.eq(state.doc)).toBe(true);
});

it("a blank letter writes its next words in the font", () => {
	const state = stateOf([{ type: "paragraph", attrs: { align: "left" } }]);
	const next = state.apply(writeLetterIn(state, own));
	expect(next.storedMarks?.map((mark) => mark.attrs)).toEqual([
		{ font: own, sizePt: null, color: null },
	]);
});

it("the caret stays where it was", () => {
	const base = stateOf([
		{
			type: "paragraph",
			attrs: { align: "left" },
			content: [{ type: "text", text: "Dear Sam" }],
		},
	]);
	const state = base.apply(
		base.tr.setSelection(TextSelection.create(base.doc, 3)),
	);
	const next = state.apply(writeLetterIn(state, own));
	expect(next.selection.from).toBe(3);
	expect(next.selection.empty).toBe(true);
});
