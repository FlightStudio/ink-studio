import type { MergeFieldKey } from "@repo/types";
import { MERGE_FIELDS } from "@repo/types";
import type { EditorState } from "@tiptap/pm/state";

export type MergeFieldItem = { field: MergeFieldKey; label: string };

export function mergeFieldItems(query: string): MergeFieldItem[] {
	const needle = query.toLocaleLowerCase();
	return (
		Object.entries(MERGE_FIELDS) as [
			MergeFieldKey,
			(typeof MERGE_FIELDS)[MergeFieldKey],
		][]
	)
		.filter(([, field]) => field.label.toLocaleLowerCase().includes(needle))
		.map(([field, value]) => ({ field, label: value.label }));
}

export function fieldTrigger(state: EditorState): string {
	const { $to } = state.selection;
	if ($to.parentOffset === 0) return "@";
	const before = state.doc.textBetween($to.pos - 1, $to.pos, "\n", "\uFFFC");
	return /\s/u.test(before) ? "@" : " @";
}
