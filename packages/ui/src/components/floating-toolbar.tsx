"use client";

import { Toolbar } from "@base-ui/react/toolbar";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

export type FloatingToolbarProps = ComponentProps<typeof Toolbar.Root> & {
	placement: "top" | "bottom";
};

export function FloatingToolbar({
	placement,
	className,
	...props
}: FloatingToolbarProps) {
	return (
		<Toolbar.Root
			data-placement={placement}
			className={cn("studio-toolbar animate-settle", className)}
			{...props}
		/>
	);
}

export { Toolbar };
