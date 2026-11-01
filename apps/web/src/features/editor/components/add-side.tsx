"use client";

import { Button } from "@repo/ui/components/ui/button";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plus } from "lucide-react";

export type AddSideProps = {
	editor: Editor;
	sides: number;
	maxPages: number;
	onAdded: (side: number) => void;
};

export function AddSide({ editor, sides, maxPages, onAdded }: AddSideProps) {
	if (sides >= maxPages) return null;
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="rounded-full bg-paper"
			onClick={() => {
				const next = sides + 1;
				const tr = editor.state.tr.setDocAttribute("minSides", next);
				closeHistory(tr);
				editor.view.dispatch(tr);
				onAdded(next - 1);
			}}
		>
			<Plus />
			Add a side
		</Button>
	);
}
