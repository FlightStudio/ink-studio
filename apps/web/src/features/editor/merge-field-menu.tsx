"use client";

import type { MergeFieldKey } from "@repo/types";
import type { MergeFieldItem } from "./merge-fields.ts";

const PANEL =
	"min-w-40 rounded-2xl bg-paper text-ink shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)]";

export function MergeFieldMenu({
	items,
	selectedIndex,
	onPick,
}: {
	items: MergeFieldItem[];
	selectedIndex: number;
	onPick: (field: MergeFieldKey) => void;
}) {
	if (items.length === 0) {
		return (
			<p
				role="status"
				className={`${PANEL} px-4 py-2.5 text-ui text-ink-muted`}
			>
				No matching field
			</p>
		);
	}
	return (
		<div role="listbox" aria-label="Fields" className={`${PANEL} p-1`}>
			{items.map((item, index) => (
				<button
					key={item.field}
					type="button"
					role="option"
					aria-selected={index === selectedIndex}
					data-selected={index === selectedIndex ? "true" : "false"}
					className="block w-full rounded-full px-3 py-1.5 text-left text-ui data-[selected=true]:bg-muted pointer-coarse:min-h-11"
					onMouseDown={(event) => {
						event.preventDefault();
						onPick(item.field);
					}}
				>
					{item.label}
				</button>
			))}
		</div>
	);
}
