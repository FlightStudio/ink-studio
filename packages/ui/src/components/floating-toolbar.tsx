"use client";

import { Toolbar } from "@base-ui/react/toolbar";
import { cn } from "cn";
import type { ComponentProps } from "react";

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
			data-slot="floating-toolbar"
			data-placement={placement}
			className={cn("floating-toolbar animate-settle", className)}
			{...props}
		/>
	);
}

export { Toolbar };
