"use client";

import { Button } from "@repo/ui/components/ui/button";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { useEditorState } from "@tiptap/react";

export type AddSideProps = { editor: Editor; maxPages: number };

function minSidesOf(editor: Editor): number {
	const value = Number(editor.state.doc.attrs.minSides);
	return Number.isFinite(value) && value > 0 ? value : 1;
}

export function AddSide({ editor, maxPages }: AddSideProps) {
	const minSides = useEditorState({
		editor,
		selector: ({ editor: current }) => minSidesOf(current),
	});
	if (minSides >= maxPages) return null;
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="rounded-full bg-paper"
			onClick={() => {
				const current = minSidesOf(editor);
				if (current >= maxPages) return;
				const tr = editor.state.tr.setDocAttribute("minSides", current + 1);
				closeHistory(tr);
				editor.view.dispatch(tr);
			}}
		>
			Add a side
		</Button>
	);
}
