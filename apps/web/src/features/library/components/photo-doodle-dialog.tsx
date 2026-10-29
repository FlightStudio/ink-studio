"use client";

import { createDrawing, requestLift, uploadFile } from "@repo/api";
import { errorMessages, isApiErrorCode } from "@repo/errors";
import type { DrawingKind, LibraryDrawing } from "@repo/types";
import { ConfirmDialog } from "@repo/ui/components/confirm-dialog";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { watchAssetStatus } from "@/lib/use-asset-watch";
import { nextDrawingName } from "../drawing-name.ts";
import { MaskEditor, type MaskEditorHandle } from "./mask-editor.tsx";
import { useDiscardGuard } from "./use-discard-guard.ts";

const NAME_LIMIT = 60;
const ACCEPT = "image/jpeg,image/png,image/webp";

export type PhotoDoodleDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (drawing: LibraryDrawing) => void;
	kind?: DrawingKind;
	defaultName?: string;
};

type Phase = "pick" | "uploading" | "lifting" | "edit" | "failed";

export function PhotoDoodleDialog({
	open,
	onOpenChange,
	onSaved,
	kind = "doodle",
	defaultName = nextDrawingName(kind, []),
}: PhotoDoodleDialogProps) {
	const signature = kind === "signature";
	const guard = useDiscardGuard(onOpenChange);
	return (
		<Dialog open={open} onOpenChange={guard.onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader className="pr-8">
					<DialogTitle>
						{signature ? "Photograph a signature" : "Photograph a doodle"}
					</DialogTitle>
					<DialogDescription>
						{signature
							? "Choose a photo of ink on paper. Crop and erase, then save it to sign this letter."
							: "Choose a photo of ink on paper. Crop and erase, then save it to place it on this letter."}
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<PhotoForm
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
					description="The photo and your crop have not been saved."
					cancelLabel="Keep editing"
					confirmLabel="Discard"
				/>
			</DialogContent>
		</Dialog>
	);
}

function liftFailure(code: string | null): string {
	return code !== null && isApiErrorCode(code)
		? errorMessages[code]
		: "That photo could not be lifted.";
}

function PhotoForm({
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
	const file = useRef<HTMLInputElement>(null);
	const editor = useRef<MaskEditorHandle>(null);
	const stopWatching = useRef<() => void>(() => {});
	const run = useRef(0);
	const [phase, setPhase] = useState<Phase>("pick");
	const [preview, setPreview] = useState<string | null>(null);
	const [photoAssetId, setPhotoAssetId] = useState<string | null>(null);
	const [liftId, setLiftId] = useState<string | null>(null);
	const [liftStatus, setLiftStatus] = useState<"pending" | "running">(
		"pending",
	);
	const [polling, setPolling] = useState(false);
	const [slow, setSlow] = useState(false);
	const [name, setName] = useState(defaultName);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const trimmed = name.trim();
	const failure = signature
		? "That signature could not be saved."
		: "That doodle could not be saved.";

	useEffect(() => {
		onDirty(phase !== "pick" && phase !== "failed");
	}, [phase, onDirty]);

	useEffect(
		() => () => {
			if (preview) URL.revokeObjectURL(preview);
		},
		[preview],
	);

	useEffect(
		() => () => {
			stopWatching.current();
			run.current += 1;
		},
		[],
	);

	function restart(): number {
		stopWatching.current();
		setPolling(false);
		run.current += 1;
		return run.current;
	}

	function watch(id: string) {
		setPolling(true);
		stopWatching.current = watchAssetStatus(id, (reading) => {
			setSlow(reading.slow);
			if (reading.status === "done") {
				restart();
				setLiftId(id);
				setPhase("edit");
				return;
			}
			if (reading.status === "failed") {
				restart();
				setPhase("failed");
				setError(liftFailure(reading.error));
				return;
			}
			setLiftStatus(reading.status);
		});
	}

	async function lift(photoId: string) {
		const current = restart();
		setSlow(false);
		setLiftStatus("pending");
		setPhase("lifting");
		const response = await requestLift({ photoAssetId: photoId }).catch(
			() => null,
		);
		if (run.current !== current) return;
		if (response?.status !== 201) {
			setPhase("failed");
			setError("That photo could not be lifted.");
			return;
		}
		watch(response.data.assetId);
	}

	function choose() {
		restart();
		setPhase("pick");
		setPreview(null);
		setPhotoAssetId(null);
		setLiftId(null);
		setSlow(false);
		setError(null);
		if (file.current) {
			file.current.value = "";
			file.current.click();
		}
	}

	async function onFile(chosen: File) {
		const current = restart();
		setError(null);
		setPreview(URL.createObjectURL(chosen));
		setPhase("uploading");
		try {
			const uploaded = await uploadFile(
				chosen,
				{ purpose: "photo" },
				{ headers: { "x-file-name": encodeURIComponent(chosen.name) } },
			);
			if (run.current !== current) return;
			if (uploaded.status !== 201) {
				setPhase("failed");
				setError("That photo could not be used.");
				return;
			}
			setPhotoAssetId(uploaded.data.id);
			await lift(uploaded.data.id);
		} catch {
			if (run.current !== current) return;
			setPhase("failed");
			setError("That photo could not be lifted.");
		}
	}

	async function save() {
		if (!photoAssetId || !editor.current || trimmed === "" || saving) return;
		setSaving(true);
		onSaving(true);
		setError(null);
		try {
			const composed = await editor.current.compose();
			if (!composed) {
				setError(
					"Nothing is left to save. Undo or reset to bring the ink back.",
				);
				return;
			}
			const uploaded = await uploadFile(
				composed.png,
				{ purpose: "mask" },
				{ headers: { "x-file-name": encodeURIComponent(`${trimmed}.png`) } },
			);
			if (uploaded.status !== 201) {
				setError(failure);
				return;
			}
			const created = await createDrawing({
				kind,
				name: trimmed,
				maskAssetId: uploaded.data.id,
				source: { kind: "photo", photoAssetId },
			});
			if (created.status !== 201) {
				setError(failure);
				return;
			}
			onSaved({
				id: created.data.id,
				kind,
				name: trimmed,
				aspect: composed.aspect,
				maskAssetId: uploaded.data.id,
			});
		} catch {
			setError(failure);
		} finally {
			setSaving(false);
			onSaving(false);
		}
	}

	const waiting = phase === "uploading" || phase === "lifting";

	return (
		<div
			className="flex flex-col gap-3"
			data-polling={polling ? "true" : "false"}
		>
			<input
				ref={file}
				type="file"
				accept={ACCEPT}
				aria-label="Choose a photo"
				tabIndex={-1}
				className="sr-only"
				onChange={(event) => {
					const chosen = event.target.files?.[0];
					if (chosen) void onFile(chosen);
				}}
			/>
			{phase === "pick" ? (
				<Button
					type="button"
					className="self-start"
					onClick={() => file.current?.click()}
				>
					Choose a photo
				</Button>
			) : null}
			{waiting && preview ? (
				<figure
					aria-busy="true"
					className="relative m-0 grid place-items-center overflow-hidden rounded-md bg-desk/60 ring-1 ring-rule"
				>
					<div
						role="img"
						aria-label="The chosen photo"
						className="h-64 w-full bg-contain bg-center bg-no-repeat opacity-60 motion-safe:animate-[ink-pulse_2.4s_ease-in-out_infinite]"
						style={{ backgroundImage: `url(${preview})` }}
					/>
					<figcaption className="absolute inset-x-0 bottom-3 flex justify-center">
						<StatusPill
							status={phase === "uploading" ? "pending" : liftStatus}
							label={
								phase === "uploading"
									? "Uploading the photo"
									: "Lifting the ink"
							}
						/>
					</figcaption>
				</figure>
			) : null}
			{waiting && slow ? (
				<div className="flex flex-wrap items-center gap-2">
					<p className="mr-auto text-ui text-ink">
						This is taking longer than usual
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							if (photoAssetId) void lift(photoAssetId);
						}}
					>
						Try again
					</Button>
					<Button type="button" variant="ghost" size="sm" onClick={choose}>
						Choose another photo
					</Button>
				</div>
			) : null}
			{phase === "edit" && liftId ? (
				<MaskEditor ref={editor} assetId={liftId} />
			) : null}
			{phase === "edit" ? (
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
			) : null}
			{error ? (
				<p role="alert" className="text-ui text-danger">
					{error}
				</p>
			) : null}
			{phase === "failed" ? (
				<Button type="button" className="self-start" onClick={choose}>
					Choose another photo
				</Button>
			) : null}
			{phase === "edit" ? (
				<DialogFooter className="sticky -bottom-4 bg-paper">
					<Button
						type="button"
						disabled={trimmed === "" || saving}
						onClick={() => void save()}
					>
						{saving
							? "Saving…"
							: signature
								? "Save and sign"
								: "Save and place"}
					</Button>
				</DialogFooter>
			) : null}
		</div>
	);
}
