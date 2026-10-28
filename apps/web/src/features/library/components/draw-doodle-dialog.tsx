"use client";

import { createDrawing, uploadFile } from "@repo/api";
import type { LibraryDrawing, Stroke } from "@repo/types";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useRef, useState } from "react";
import { InkCanvas, type InkCanvasHandle } from "@/features/ink/ink-canvas";
import { rasterize } from "../rasterize.ts";

const BOX = { widthPx: 640, heightPx: 400 };
const NAME_LIMIT = 60;

export type DrawDoodleDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (drawing: LibraryDrawing) => void;
};

export function DrawDoodleDialog({
	open,
	onOpenChange,
	onSaved,
}: DrawDoodleDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Draw a doodle</DialogTitle>
					<DialogDescription>
						Draw on the page, name it, and save it to the library.
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<DrawForm
						onSaved={(drawing) => {
							onSaved(drawing);
							onOpenChange(false);
						}}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function DrawForm({ onSaved }: { onSaved: (drawing: LibraryDrawing) => void }) {
	const canvas = useRef<InkCanvasHandle>(null);
	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const [name, setName] = useState("Doodle");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const trimmed = name.trim();

	async function save() {
		if (strokes.length === 0 || trimmed === "" || saving) return;
		setSaving(true);
		setError(null);
		try {
			const raster = await rasterize(strokes, BOX);
			const uploaded = await uploadFile(
				raster.png,
				{ purpose: "mask" },
				{
					headers: { "x-file-name": encodeURIComponent(`${trimmed}.png`) },
				},
			);
			if (uploaded.status !== 201) {
				setError("That doodle could not be saved.");
				return;
			}
			const created = await createDrawing({
				kind: "doodle",
				name: trimmed,
				maskAssetId: uploaded.data.id,
				source: {
					kind: "drawn",
					box: BOX,
					strokes: strokes.map((stroke) => ({
						input: stroke.input,
						points: stroke.points.map((point) => [...point]),
					})),
				},
			});
			if (created.status !== 201) {
				setError("That doodle could not be saved.");
				return;
			}
			onSaved({
				id: created.data.id,
				kind: "doodle",
				name: trimmed,
				aspect: raster.aspect,
				maskAssetId: uploaded.data.id,
			});
		} catch {
			setError("That doodle could not be saved.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<InkCanvas
				ref={canvas}
				widthPx={BOX.widthPx}
				heightPx={BOX.heightPx}
				aria-label="Doodle"
				className="rounded-md bg-paper text-ink ring-1 ring-rule"
				onStrokeEnd={setStrokes}
			/>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={() => canvas.current?.undo()}
				>
					Undo
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() => canvas.current?.clear()}
				>
					Clear
				</Button>
			</div>
			<label className="flex flex-col gap-1 text-ui text-ink">
				Name
				<input
					aria-label="Name"
					value={name}
					maxLength={NAME_LIMIT}
					onChange={(event) =>
						setName(event.target.value.replace(/\p{Cc}/gu, ""))
					}
					className="rounded-md bg-desk/50 px-2 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</label>
			{error ? <p className="text-ui text-danger">{error}</p> : null}
			<Button
				type="button"
				disabled={strokes.length === 0 || trimmed === "" || saving}
				onClick={() => void save()}
			>
				Save doodle
			</Button>
		</div>
	);
}
