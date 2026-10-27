"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "../../lib/cn.ts";

function Popover(props: PopoverPrimitive.Root.Props) {
	return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
	return <PopoverPrimitive.Trigger {...props} />;
}

function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner sideOffset={8}>
				<PopoverPrimitive.Popup
					className={cn("studio-popup animate-settle", className)}
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverPopup, PopoverTrigger };
