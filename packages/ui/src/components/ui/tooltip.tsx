"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";
import { cn } from "../../lib/cn.ts";

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
	return <TooltipPrimitive.Provider {...props} />;
}

function Tooltip({
	children,
	label,
}: {
	children: ReactElement;
	label: string;
}) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger render={children} />
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Positioner sideOffset={8}>
					<TooltipPrimitive.Popup className={cn("studio-popup")}>
						{label}
					</TooltipPrimitive.Popup>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);
}

export { Tooltip, TooltipProvider };
