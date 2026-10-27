"use client";

import { Drawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

function Sheet(props: Drawer.Root.Props) {
	return <Drawer.Root swipeDirection="right" {...props} />;
}

function SheetTrigger(props: Drawer.Trigger.Props) {
	return <Drawer.Trigger {...props} />;
}

function SheetPopup({
	className,
	title,
	children,
}: {
	className?: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<Drawer.Portal>
			<Drawer.Backdrop className="fixed inset-0 bg-[oklch(0.25_0.02_262/0.2)]" />
			<Drawer.Popup
				className={cn(
					"studio-popup fixed inset-y-0 right-0 h-full w-[min(360px,100%)] rounded-none animate-settle",
					className,
				)}
			>
				<Drawer.Title className="font-display text-title">{title}</Drawer.Title>
				<div className="mt-3">{children}</div>
				<Drawer.Close className="mt-6 underline">Close</Drawer.Close>
			</Drawer.Popup>
		</Drawer.Portal>
	);
}

export { Sheet, SheetPopup, SheetTrigger };
