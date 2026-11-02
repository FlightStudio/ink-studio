"use client";

import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import type { ComponentProps, ReactNode } from "react";

export type ConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	confirmLabel: string;
	cancelLabel?: string;
	pendingLabel?: string;
	pending?: boolean;
	error?: string | null;
	finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
	onConfirm: () => void;
};

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	cancelLabel = "Keep it",
	pendingLabel,
	pending = false,
	error = null,
	finalFocus,
	onConfirm,
}: ConfirmDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!pending || next) onOpenChange(next);
			}}
		>
			<DialogContent showCloseButton={false} finalFocus={finalFocus}>
				<DialogHeader>
					<DialogTitle className="text-title font-normal">{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				{error ? (
					<p role="alert" className="text-ui text-danger">
						{error}
					</p>
				) : null}
				<DialogFooter>
					<DialogClose render={<Button variant="outline" disabled={pending} />}>
						{cancelLabel}
					</DialogClose>
					<Button variant="destructive" disabled={pending} onClick={onConfirm}>
						{pending && pendingLabel ? pendingLabel : confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
