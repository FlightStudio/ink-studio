import { letterExtensions } from "@repo/render/schema";
import { getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { expect, it } from "vitest";
import { fieldTrigger, mergeFieldItems } from "./merge-fields.ts";

const schema = getSchema(letterExtensions);

function at(content: unknown[], pos: number, to = pos): EditorState {
	const doc = Node.fromJSON(schema, {
		type: "doc",
		attrs: { elements: [], minSides: 1, frontImageAssetId: null },
		content: [{ type: "paragraph", attrs: { align: "left" }, content }],
	});
	const state = EditorState.create({ schema, doc });
	return state.apply(
		state.tr.setSelection(TextSelection.create(state.doc, pos, to)),
	);
}

it("an @ at the start of a line needs no space before it", () => {
	expect(fieldTrigger(at([], 1))).toBe("@");
});

it("an @ after a space needs no space before it", () => {
	expect(fieldTrigger(at([{ type: "text", text: "Dear " }], 6))).toBe("@");
});

it("an @ right after a word gets a space, so the menu opens", () => {
	expect(fieldTrigger(at([{ type: "text", text: "Dear" }], 5))).toBe(" @");
});

it("an @ right after a chip gets a space", () => {
	expect(
		fieldTrigger(
			at([{ type: "mergeField", attrs: { field: "first_name" } }], 2),
		),
	).toBe(" @");
});

it("with words selected the @ goes after them", () => {
	expect(fieldTrigger(at([{ type: "text", text: "Dear Sam" }], 1, 5))).toBe(
		" @",
	);
});

it("the field list filters by label and can come back empty", () => {
	expect(mergeFieldItems("last").map((item) => item.label)).toEqual([
		"Last name",
	]);
	expect(mergeFieldItems("xyz")).toEqual([]);
});
