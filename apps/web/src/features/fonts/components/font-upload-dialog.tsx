"use client";

import { createFont, getAssetStatus, uploadFile } from "@repo/api";
import { errorMessages } from "@repo/errors";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { FontPreview } from "./font-preview.tsx";

const ACCEPT = ".ttf,.otf,font/ttf,font/otf";

const FAILURES = {
	font_unreadable: errorMessages.font_unreadable,
	font_timeout: errorMessages.font_timeout,
	font_missing_glyphs: errorMessages.font_missing_glyphs,
} as const;

export type FontUploadDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function FontUploadDialog({
	open,
	onOpenChange,
}: FontUploadDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Upload a font file</DialogTitle>
					<DialogDescription>
						A TTF or OTF is rebuilt from its outlines. The file you upload is
						not kept as the font people read.
					</DialogDescription>
				</DialogHeader>
				{open ? <FontUploadForm /> : null}
			</DialogContent>
		</Dialog>
	);
}

function failureCopy(code: string | null): string {
	if (code === "font_timeout") return FAILURES.font_timeout;
	if (code === "font_missing_glyphs") return FAILURES.font_missing_glyphs;
	return FAILURES.font_unreadable;
}

function FontUploadForm() {
	const file = useRef<HTMLInputElement>(null);
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);
	const [ownerName, setOwnerName] = useState("");
	const [building, setBuilding] = useState(false);
	const [fontId, setFontId] = useState<string | null>(null);
	const [assetId, setAssetId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(
		() => () => {
			if (timer.current) clearInterval(timer.current);
		},
		[],
	);

	function watch(id: string, builtFontId: string) {
		const tick = async () => {
			const status = await getAssetStatus(id);
			if (status.status !== 200) return;
			if (status.data.status === "done") {
				if (timer.current) clearInterval(timer.current);
				timer.current = null;
				setAssetId(id);
				setFontId(builtFontId);
				setBuilding(false);
				return;
			}
			if (status.data.status === "failed") {
				if (timer.current) clearInterval(timer.current);
				timer.current = null;
				setBuilding(false);
				setError(failureCopy(status.data.error));
			}
		};
		if (timer.current) clearInterval(timer.current);
		void tick();
		timer.current = setInterval(() => void tick(), 500);
	}

	async function onFile(chosen: File) {
		const name = ownerName.trim();
		if (name === "" || building) return;
		setError(null);
		setBuilding(true);
		try {
			const uploaded = await uploadFile(
				chosen,
				{ purpose: "font-file" },
				{ headers: { "x-file-name": encodeURIComponent(chosen.name) } },
			);
			if (uploaded.status !== 201) {
				setBuilding(false);
				setError("That font file could not be used.");
				return;
			}
			const created = await createFont({
				ownerName: name,
				source: { kind: "upload", fileAssetId: uploaded.data.id },
			});
			if (created.status !== 201 || !created.data.assetId) {
				setBuilding(false);
				setError("That handwriting could not be started.");
				return;
			}
			watch(created.data.assetId, created.data.id);
		} catch {
			setBuilding(false);
			setError("That font file could not be used.");
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<label className="flex flex-col gap-1 text-ui text-ink">
				What name should the seal use?
				<input
					aria-label="What name should the seal use?"
					value={ownerName}
					onChange={(event) =>
						setOwnerName(event.target.value.replace(/\p{Cc}/gu, ""))
					}
					className="rounded-md bg-desk/50 px-2 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</label>
			<input
				ref={file}
				type="file"
				accept={ACCEPT}
				aria-label="Choose a font file"
				className="sr-only"
				onChange={(event) => {
					const chosen = event.target.files?.[0];
					if (chosen) void onFile(chosen);
				}}
			/>
			{error ? (
				<p className="text-ui" style={{ color: "var(--danger)" }}>
					{error}
				</p>
			) : null}
			{assetId && fontId ? (
				<FontPreview fontId={fontId} assetId={assetId} text="hello, world." />
			) : (
				<Button
					type="button"
					disabled={building || ownerName.trim() === ""}
					onClick={() => file.current?.click()}
				>
					{building ? "Building" : "Choose a font file"}
				</Button>
			)}
		</div>
	);
}
