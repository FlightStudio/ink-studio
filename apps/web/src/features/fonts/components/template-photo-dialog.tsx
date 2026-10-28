"use client";

import { createFont, getAssetStatus, uploadFile } from "@repo/api";
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

const ACCEPT = "image/jpeg,image/png,image/webp";

export type TemplatePhotoDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function TemplatePhotoDialog({
	open,
	onOpenChange,
}: TemplatePhotoDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Photograph the template</DialogTitle>
					<DialogDescription>
						Print the page at 100%, write in the cells, then photograph the
						whole page.
					</DialogDescription>
				</DialogHeader>
				{open ? <TemplatePhotoForm /> : null}
			</DialogContent>
		</Dialog>
	);
}

function TemplatePhotoForm() {
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
				setError("The template's corner marks were not found.");
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
				{ purpose: "photo" },
				{ headers: { "x-file-name": encodeURIComponent(chosen.name) } },
			);
			if (uploaded.status !== 201) {
				setBuilding(false);
				setError("That photo could not be used.");
				return;
			}
			const created = await createFont({
				ownerName: name,
				source: {
					kind: "template-photo",
					templateVersion: 1,
					photoAssetId: uploaded.data.id,
				},
			});
			if (created.status !== 201 || !created.data.assetId) {
				setBuilding(false);
				setError("That handwriting could not be started.");
				return;
			}
			watch(created.data.assetId, created.data.id);
		} catch {
			setBuilding(false);
			setError("That photo could not be used.");
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
				aria-label="Choose a photo"
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
					{building ? "Building" : "Choose a photo"}
				</Button>
			)}
		</div>
	);
}
