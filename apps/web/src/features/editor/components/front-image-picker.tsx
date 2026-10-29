"use client";

import { uploadFile } from "@repo/api";
import { Button } from "@repo/ui/components/ui/button";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { ImageUp, Trash2 } from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";

export type FrontImagePickerProps = {
	editor: Editor;
	assetId: string | null;
	style: CSSProperties;
};

function setFront(editor: Editor, assetId: string | null): void {
	const tr = editor.state.tr.setDocAttribute("frontImageAssetId", assetId);
	closeHistory(tr);
	editor.view.dispatch(tr);
}

export function FrontImagePicker({
	editor,
	assetId,
	style,
}: FrontImagePickerProps) {
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
				setError("That image could not be used. Choose a JPEG or PNG.");
				return;
			}
			setFront(editor, uploaded.data.id);
		} catch {
			setError("That image could not be used. Choose a JPEG or PNG.");
		} finally {
			setPending(false);
			if (file.current) file.current.value = "";
		}
	}

	const choose = () => file.current?.click();

	return (
		<div
			data-front-picker=""
			className="group/front absolute top-0 left-0 w-full"
			style={style}
		>
			<input
				ref={file}
				type="file"
				accept="image/jpeg,image/png"
				className="sr-only"
				tabIndex={-1}
				aria-label="Front image"
				onChange={(event) => {
					const chosen = event.target.files?.[0];
					if (chosen) void onFile(chosen);
				}}
			/>
			{assetId === null ? (
				<button
					type="button"
					disabled={pending}
					onClick={choose}
					className="absolute inset-0 cursor-pointer rounded-[3px] transition-colors duration-(--duration-quick) hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-8 focus-visible:outline-ring disabled:cursor-progress"
				>
					<span className="sr-only">Choose a front image</span>
				</button>
			) : (
				<div className="absolute top-3 right-3 flex gap-2 opacity-0 transition-opacity duration-(--duration-quick) group-hover/front:opacity-100 group-focus-within/front:opacity-100 pointer-coarse:opacity-100">
					<Button
						variant="outline"
						size="sm"
						className="rounded-full bg-paper shadow-float"
						disabled={pending}
						onClick={choose}
					>
						<ImageUp />
						Replace front image
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Remove front image"
						className="rounded-full bg-paper shadow-float"
						disabled={pending}
						onClick={() => setFront(editor, null)}
					>
						<Trash2 />
					</Button>
				</div>
			)}
			{pending || error ? (
				<p
					role={error ? "alert" : "status"}
					className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-paper px-3 py-1 text-label shadow-float"
					style={error ? { color: "var(--danger)" } : undefined}
				>
					{error ?? "Adding the image…"}
				</p>
			) : null}
		</div>
	);
}
