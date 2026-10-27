"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "../../lib/cn.ts";

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
	return (
		<ToggleGroupPrimitive
			className={cn("flex items-center gap-1", className)}
			{...props}
		/>
	);
}

export { ToggleGroup };
