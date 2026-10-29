import type { FontRef, InkMark } from "@repo/types";
import { closeHistory } from "@tiptap/pm/history";
import type { Mark } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

type InkAttrs = InkMark["attrs"];

const NO_INK: InkAttrs = { font: null, sizePt: null, color: null };

function inkAttrs(marks: readonly Mark[]): InkAttrs {
	const ink = marks.find((mark) => mark.type.name === "ink");
	return ink ? (ink.attrs as InkAttrs) : NO_INK;
}

export function writeLetterIn(state: EditorState, font: FontRef): Transaction {
	const tr = state.tr;
	const ink = state.schema.marks.ink;
	if (!ink) return tr;
	state.doc.descendants((node, pos) => {
		if (!node.isInline) return;
		tr.addMark(
			pos,
			pos + node.nodeSize,
			ink.create({ ...inkAttrs(node.marks), font }),
		);
	});
	const caret = state.storedMarks ?? state.selection.$from.marks();
	tr.setStoredMarks([ink.create({ ...inkAttrs(caret), font })]);
	closeHistory(tr);
	return tr;
}
