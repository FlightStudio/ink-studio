"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";

function Dialog(props: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger {...props} />;
}

function DialogPopup({
	className,
	title,
	children,
}: {
	className?: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Backdrop className="fixed inset-0 bg-[oklch(0.25_0.02_262/0.25)]" />
			<DialogPrimitive.Popup
				className={cn(
					"studio-popup fixed top-1/2 left-1/2 w-[min(420px,calc(100%-32px))] -translate-1/2 animate-settle",
					className,
				)}
			>
				<DialogPrimitive.Title className="font-display text-title">
					{title}
				</DialogPrimitive.Title>
				<div className="mt-2 text-ink-muted">{children}</div>
				<DialogPrimitive.Close className="mt-4 underline">
					Close
				</DialogPrimitive.Close>
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	);
}

export { Dialog, DialogPopup, DialogTrigger };
