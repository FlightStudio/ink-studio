import { MERGE_FIELDS, type MergeFieldKey } from "@repo/types";
import React, { type ReactElement } from "react";
import { useLetterPage } from "./letter-page.tsx";

export function MergeChip(props: { field: MergeFieldKey }): ReactElement {
	void React;
	const page = useLetterPage();
	const editing = page.mode === "edit" || page.mergeValues === null;
	return (
		<span
			className="merge-chip"
			data-field={props.field}
			data-editing={editing ? "true" : undefined}
		>
			{editing
				? MERGE_FIELDS[props.field].label
				: page.mergeValues?.[props.field]}
		</span>
	);
}
