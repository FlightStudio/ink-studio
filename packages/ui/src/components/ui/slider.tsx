"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "../../lib/cn.ts";

function Slider({ className, ...props }: SliderPrimitive.Root.Props) {
	return (
		<SliderPrimitive.Root
			className={cn("flex w-48 touch-none items-center", className)}
			{...props}
		>
			<SliderPrimitive.Control className="relative flex h-8 w-full items-center">
				<SliderPrimitive.Track className="h-1 w-full rounded-full bg-[var(--rule)]">
					<SliderPrimitive.Indicator className="rounded-full bg-primary" />
				</SliderPrimitive.Track>
				<SliderPrimitive.Thumb className="size-4 rounded-full border border-primary bg-[var(--paper)]" />
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };
