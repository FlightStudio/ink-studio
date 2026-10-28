"use client";

import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { MergeFieldKey } from "@repo/types";

export type MergeFieldItem = { field: MergeFieldKey; label: string };

export function MergeFieldMenu({
	items,
	selectedIndex,
	onPick,
}: {
	items: MergeFieldItem[];
	selectedIndex: number;
	onPick: (field: MergeFieldKey) => void;
}) {
	return (
		<div
			role="listbox"
			aria-label="Fields"
			className="min-w-40 rounded-2xl bg-paper p-1 text-ink shadow-float ring-1 ring-[oklch(0.3_0.03_60/0.06)]"
		>
			{items.map((item, index) => (
				<button
					key={item.field}
					type="button"
					role="option"
					aria-selected={index === selectedIndex}
					data-selected={index === selectedIndex ? "true" : "false"}
					className="block w-full rounded-full px-3 py-1.5 text-left text-ui data-[selected=true]:bg-muted"
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

export async function placeMergeFieldMenu(
	element: HTMLElement,
	clientRect: () => DOMRect | null,
): Promise<void> {
	const rect = clientRect();
	if (!rect) return;
	const { x, y } = await computePosition(
		{ getBoundingClientRect: () => rect },
		element,
		{
			placement: "bottom-start",
			strategy: "fixed",
			middleware: [offset(6), flip(), shift({ padding: 8 })],
		},
	);
	element.style.position = "fixed";
	element.style.left = `${x}px`;
	element.style.top = `${y}px`;
	element.style.zIndex = "40";
}
