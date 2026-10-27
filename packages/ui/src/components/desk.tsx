import { cn } from "cn";
import type { ComponentProps } from "react";

export function Desk({ className, ...props }: ComponentProps<"div">) {
	return <div data-slot="desk" className={cn("desk", className)} {...props} />;
}
