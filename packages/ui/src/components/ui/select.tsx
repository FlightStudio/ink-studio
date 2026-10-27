"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

function Select(props: SelectPrimitive.Root.Props<string>) {
	return <SelectPrimitive.Root {...props} />;
}

function SelectTrigger({ className, ...props }: SelectPrimitive.Trigger.Props) {
	return (
		<SelectPrimitive.Trigger
			className={cn(
				"inline-flex h-9 min-w-36 items-center justify-between gap-2 rounded-full border border-input bg-[var(--paper)] px-3 text-ui",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.Value />
			<SelectPrimitive.Icon>⌄</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectPopup({ children }: { children: ReactNode }) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner sideOffset={6}>
				<SelectPrimitive.Popup className="studio-popup min-w-36 p-1">
					<SelectPrimitive.List>{children}</SelectPrimitive.List>
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	);
}

function SelectItem({
	className,
	children,
	...props
}: SelectPrimitive.Item.Props) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"flex cursor-default items-center rounded-lg px-2 py-1.5 text-ui data-highlighted:bg-foreground/5",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

export { Select, SelectItem, SelectPopup, SelectTrigger };
