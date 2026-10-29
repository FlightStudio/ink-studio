"use client";

import { createDrawing, uploadFile } from "@repo/api";
import type { DrawingKind, LibraryDrawing, Stroke } from "@repo/types";
import { ConfirmDialog } from "@repo/ui/components/confirm-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Eraser, Redo2, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import {
	InkCanvas,
	type InkCanvasHandle,
	type InkHistory,
} from "@/features/ink/ink-canvas";
import { nextDrawingName } from "../drawing-name.ts";
import { rasterize } from "../rasterize.ts";
import { useDiscardGuard } from "./use-discard-guard.ts";

const BOXES: Record<DrawingKind, { widthPx: number; heightPx: number }> = {
	doodle: { widthPx: 640, heightPx: 400 },
	signature: { widthPx: 640, heightPx: 240 },
};
const NAME_LIMIT = 60;
const CHROME_REM = 20;

export type DrawDoodleDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (drawing: LibraryDrawing) => void;
	kind?: DrawingKind;
	defaultName?: string;
};

export function DrawDoodleDialog({
	open,
	onOpenChange,
	onSaved,
	kind = "doodle",
	defaultName = nextDrawingName(kind, []),
}: DrawDoodleDialogProps) {
	const signature = kind === "signature";
	const guard = useDiscardGuard(onOpenChange);
	const popup = useRef<HTMLDivElement>(null);
	return (
		<Dialog open={open} onOpenChange={guard.onOpenChange}>
			<DialogContent
				ref={popup}
				initialFocus={popup}
				className="sm:max-w-[42rem]"
			>
				<DialogHeader className="pr-8">
					<DialogTitle>
						{signature ? "Draw a signature" : "Draw a doodle"}
					</DialogTitle>
					<DialogDescription>
						{signature
							? "Sign above the line. It is saved to your signatures and signs this letter."
							: "Draw on the paper. It is saved to the library and placed on this letter."}
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<DrawForm
						kind={kind}
						defaultName={defaultName}
						onDirty={guard.setDirty}
						onSaving={guard.setSaving}
						onSaved={(drawing) => {
							guard.close();
							onSaved(drawing);
						}}
					/>
				) : null}
				<ConfirmDialog
					{...guard.confirm}
					title={signature ? "Discard this signature?" : "Discard this doodle?"}
					description="What you drew has not been saved."
					cancelLabel="Keep drawing"
					confirmLabel="Discard"
				/>
			</DialogContent>
		</Dialog>
	);
}

function SigningLine() {
	return (
		<div
			data-signing-line
			className="absolute inset-x-[6%] bottom-[24%] border-b border-ink-muted/50"
		>
			<span
				aria-hidden
				className="absolute bottom-1 left-0 text-title leading-none text-ink-muted/70"
			>
				×
			</span>
		</div>
	);
}

function DrawForm({
	kind,
	defaultName,
	onDirty,
	onSaving,
	onSaved,
}: {
	kind: DrawingKind;
	defaultName: string;
	onDirty: (dirty: boolean) => void;
	onSaving: (saving: boolean) => void;
	onSaved: (drawing: LibraryDrawing) => void;
}) {
	const signature = kind === "signature";
	const box = BOXES[kind];
	const canvas = useRef<InkCanvasHandle>(null);
	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const [history, setHistory] = useState<InkHistory>({
		canUndo: false,
		canRedo: false,
	});
	const [name, setName] = useState(defaultName);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const trimmed = name.trim();
	const failure = signature
		? "That signature could not be saved."
		: "That doodle could not be saved.";

	async function save() {
		if (strokes.length === 0 || trimmed === "" || saving) return;
		setSaving(true);
		onSaving(true);
		setError(null);
		try {
			const raster = await rasterize(strokes, box);
			const uploaded = await uploadFile(
				raster.png,
				{ purpose: "mask" },
				{
					headers: { "x-file-name": encodeURIComponent(`${trimmed}.png`) },
				},
			);
			if (uploaded.status !== 201) {
				setError(failure);
				return;
			}
			const created = await createDrawing({
				kind,
				name: trimmed,
				maskAssetId: uploaded.data.id,
				source: {
					kind: "drawn",
					box,
					strokes: strokes.map((stroke) => ({
						input: stroke.input,
						points: stroke.points.map((point) => [...point]),
					})),
				},
			});
			if (created.status !== 201) {
				setError(failure);
				return;
			}
			onSaved({
				id: created.data.id,
				kind,
				name: trimmed,
				aspect: raster.aspect,
				maskAssetId: uploaded.data.id,
			});
		} catch {
			setError(failure);
		} finally {
			setSaving(false);
			onSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div
				className="mx-auto w-full"
				style={{
					maxWidth: `max(16rem, calc((100dvh - ${CHROME_REM}rem) * ${box.widthPx / box.heightPx}))`,
				}}
			>
				<InkCanvas
					ref={canvas}
					widthPx={box.widthPx}
					heightPx={box.heightPx}
					aria-label={signature ? "Signature" : "Doodle"}
					guides={signature ? <SigningLine /> : undefined}
					className="mx-auto rounded-md bg-paper text-ink ring-1 ring-rule"
					onStrokeEnd={(next, nextHistory) => {
						onDirty(next.length > 0);
						setStrokes(next);
						setHistory(nextHistory);
					}}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!history.canUndo}
					onClick={() => canvas.current?.undo()}
				>
					<Undo2 />
					Undo
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!history.canRedo}
					onClick={() => canvas.current?.redo()}
				>
					<Redo2 />
					Redo
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!history.canUndo && !history.canRedo}
					onClick={() => canvas.current?.clear()}
				>
					<Eraser />
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
					className="rounded-md bg-desk/50 px-2 py-1.5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</label>
			{error ? (
				<p role="alert" className="text-ui text-danger">
					{error}
				</p>
			) : null}
			<DialogFooter className="sticky -bottom-4 bg-paper">
				<Button
					type="button"
					disabled={strokes.length === 0 || trimmed === "" || saving}
					onClick={() => void save()}
				>
					{saving ? "Saving…" : signature ? "Save and sign" : "Save and place"}
				</Button>
			</DialogFooter>
		</div>
	);
}
