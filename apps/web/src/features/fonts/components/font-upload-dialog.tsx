"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { FileUp } from "lucide-react";
import { useId, useState } from "react";
import { UploadButtons } from "./upload-buttons.tsx";

export const OWN_HANDWRITING = "This font is made from my own handwriting.";

export type FontUploadDialogProps = {
	open: boolean;
	onOpenChange(open: boolean): void;
	ownerName: string;
	from: string | null;
	replacing: string | null;
};

export function FontUploadDialog({
	open,
	onOpenChange,
	ownerName,
	from,
	replacing,
}: FontUploadDialogProps) {
	const [busy, setBusy] = useState(false);
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!busy || next) onOpenChange(next);
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="font-display text-title font-normal">
						Use a font file
					</DialogTitle>
					<DialogDescription>
						A .ttf or .otf with at least a to z. We rebuild it from its
						outlines, so your letters print exactly as it looks.
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<UploadForm
						ownerName={ownerName}
						from={from}
						replacing={replacing}
						onBusy={setBusy}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function UploadForm({
	ownerName,
	from,
	replacing,
	onBusy,
}: Omit<FontUploadDialogProps, "open" | "onOpenChange"> & {
	onBusy(busy: boolean): void;
}) {
	const id = useId();
	const [own, setOwn] = useState(false);
	return (
		<div className="flex flex-col gap-5">
			<label
				htmlFor={id}
				className="flex cursor-pointer items-start gap-3 rounded-md border border-rule bg-paper px-3 py-3 text-ui text-ink has-checked:border-ink-accent/50 has-focus-visible:ring-3 has-focus-visible:ring-ring pointer-coarse:py-3.5"
			>
				<input
					id={id}
					type="checkbox"
					required
					checked={own}
					onChange={(event) => setOwn(event.target.checked)}
					className="mt-0.5 size-4 shrink-0 accent-ink-accent outline-none pointer-coarse:size-5"
				/>
				{OWN_HANDWRITING}
			</label>
			<UploadButtons
				kind="font-file"
				ownerName={ownerName}
				from={from}
				replacing={replacing}
				disabled={!own}
				onBusy={onBusy}
				choices={[{ label: "Choose a font file", icon: <FileUp /> }]}
			/>
		</div>
	);
}
