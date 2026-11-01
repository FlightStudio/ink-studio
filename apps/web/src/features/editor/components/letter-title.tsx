"use client";

import { TITLE_MAX_CHARACTERS } from "@repo/types";
import { useState } from "react";

export type LetterTitleProps = {
	title: string;
	editable: boolean;
	onTitle: (title: string) => void;
	onDone: () => void;
};

function cleanTitle(value: string): string {
	return value.replace(/\p{Cc}/gu, " ");
}

export function LetterTitle({
	title,
	editable,
	onTitle,
	onDone,
}: LetterTitleProps) {
	const [draft, setDraft] = useState(title);

	if (!editable) {
		return <h1 className="min-w-0 truncate text-title">{title}</h1>;
	}

	return (
		<input
			aria-label="Title"
			value={draft}
			maxLength={TITLE_MAX_CHARACTERS}
			size={Math.max(draft.length, 8)}
			spellCheck
			onChange={(event) => {
				const next = cleanTitle(event.target.value);
				setDraft(next);
				if (next.trim() !== "") onTitle(next.trim());
			}}
			onBlur={() => {
				if (draft.trim() === "") setDraft(title);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === "Escape") {
					event.preventDefault();
					if (draft.trim() === "") setDraft(title);
					onDone();
				}
			}}
			className="field-sizing-content pointer-coarse:min-h-11 min-w-[8ch] max-w-[min(30rem,55vw)] truncate rounded-md bg-transparent px-1.5 py-0.5 -mx-1.5 text-title text-ink outline-none transition-colors duration-(--duration-quick) placeholder:text-ink-muted hover:bg-desk/60 focus-visible:bg-desk/60 focus-visible:ring-2 focus-visible:ring-ring"
		/>
	);
}
