import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export function Desk({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={cn("desk", className)}>{children}</div>;
}
