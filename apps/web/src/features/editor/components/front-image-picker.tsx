"use client";

import { uploadFile } from "@repo/api";
import { Button } from "@repo/ui/components/ui/button";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { useRef, useState } from "react";

export type FrontImagePickerProps = { editor: Editor };

export function FrontImagePicker({ editor }: FrontImagePickerProps) {
	const file = useRef<HTMLInputElement>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onFile(chosen: File) {
		setPending(true);
		setError(null);
		try {
			const uploaded = await uploadFile(
				chosen,
				{ purpose: "cover" },
				{ headers: { "x-file-name": encodeURIComponent(chosen.name) } },
			);
			if (uploaded.status !== 201) {
				setError("That image could not be used.");
				return;
			}
			const tr = editor.state.tr.setDocAttribute(
				"frontImageAssetId",
				uploaded.data.id,
			);
			closeHistory(tr);
			editor.view.dispatch(tr);
		} catch {
			setError("That image could not be used.");
		} finally {
			setPending(false);
			if (file.current) file.current.value = "";
		}
	}

	return (
		<div className="flex flex-col items-center gap-1">
			<input
				ref={file}
				type="file"
				accept="image/jpeg,image/png"
				className="sr-only"
				aria-label="Front image"
				onChange={(event) => {
					const chosen = event.target.files?.[0];
					if (chosen) void onFile(chosen);
				}}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="rounded-full bg-paper"
				disabled={pending}
				onClick={() => file.current?.click()}
			>
				Choose a front image
			</Button>
			{error ? (
				<p role="alert" className="text-label text-danger">
					{error}
				</p>
			) : null}
		</div>
	);
}
