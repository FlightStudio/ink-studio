"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn.ts";

const toggleVariants = cva(
	"inline-flex items-center justify-center rounded-full text-ui transition-colors duration-(--duration-quick) ease-(--ease-settle) outline-none data-pressed:bg-primary data-pressed:text-primary-foreground hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				outline: "border border-input bg-transparent",
			},
			size: {
				default: "h-8 min-w-8 px-2.5",
				sm: "h-7 min-w-7 px-2",
				lg: "h-9 min-w-9 px-3",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Toggle({
	className,
	variant = "default",
	size = "default",
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive
			className={cn(toggleVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };
