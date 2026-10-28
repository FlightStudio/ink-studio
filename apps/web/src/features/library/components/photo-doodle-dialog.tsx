"use client";

import {
	createDrawing,
	getAssetStatus,
	requestLift,
	uploadFile,
} from "@repo/api";
import type { DrawingKind, LibraryDrawing } from "@repo/types";
import { StatusPill } from "@repo/ui/components/status-pill";
import { Button } from "@repo/ui/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { MaskEditor, type MaskEditorHandle } from "./mask-editor.tsx";

const NAME_LIMIT = 60;
const SLOW_AFTER_MS = 120_000;
const ACCEPT = "image/jpeg,image/png,image/webp";

export type PhotoDoodleDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (drawing: LibraryDrawing) => void;
	kind?: DrawingKind;
};

type Phase = "pick" | "lifting" | "edit" | "failed";

export function PhotoDoodleDialog({
	open,
	onOpenChange,
	onSaved,
	kind = "doodle",
}: PhotoDoodleDialogProps) {
	const signature = kind === "signature";
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{signature ? "Photograph a signature" : "Photograph a doodle"}
					</DialogTitle>
					<DialogDescription>
						{signature
							? "Choose a photo of ink on paper. Crop and erase, then save your signature."
							: "Choose a photo of ink on paper. Crop and erase, then save it to the library."}
					</DialogDescription>
				</DialogHeader>
				{open ? (
					<PhotoForm
						kind={kind}
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

function PhotoForm({
	kind,
	onSaved,
}: {
	kind: DrawingKind;
	onSaved: (drawing: LibraryDrawing) => void;
}) {
	const file = useRef<HTMLInputElement>(null);
	const editor = useRef<MaskEditorHandle>(null);
	const timer = useRef<ReturnType<typeof setInterval> | null>(null);
	const [phase, setPhase] = useState<Phase>("pick");
	const [photoAssetId, setPhotoAssetId] = useState<string | null>(null);
	const [liftId, setLiftId] = useState<string | null>(null);
	const [liftStatus, setLiftStatus] = useState<"pending" | "running">(
		"pending",
	);
	const [polling, setPolling] = useState(false);
	const [slow, setSlow] = useState(false);
	const [name, setName] = useState(
		kind === "signature" ? "Signature" : "Doodle",
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const trimmed = name.trim();

	function stopPolling() {
		if (timer.current) clearInterval(timer.current);
		timer.current = null;
		setPolling(false);
	}

	useEffect(
		() => () => {
			if (timer.current) clearInterval(timer.current);
		},
		[],
	);

	function watch(id: string) {
		const started = Date.now();
		const tick = async () => {
			if (Date.now() - started >= SLOW_AFTER_MS) setSlow(true);
			const response = await getAssetStatus(id);
			if (response.status !== 200) return;
			if (response.data.status === "done") {
				stopPolling();
				setPhase("edit");
				return;
			}
			if (response.data.status === "failed") {
				stopPolling();
				setPhase("failed");
				setError("That photo could not be lifted.");
				return;
			}
			if (response.data.status === "running") setLiftStatus("running");
		};
		stopPolling();
		setPolling(true);
		void tick();
		timer.current = setInterval(() => void tick(), 1000);
	}

	function reset() {
		stopPolling();
		setPhase("pick");
		setPhotoAssetId(null);
		setLiftId(null);
		setLiftStatus("pending");
		setSlow(false);
		setError(null);
		if (file.current) file.current.value = "";
	}

	async function onFile(chosen: File) {
		setError(null);
		setSlow(false);
		setLiftStatus("pending");
		setPhase("lifting");
		try {
			const uploaded = await uploadFile(
				chosen,
				{ purpose: "photo" },
				{ headers: { "x-file-name": encodeURIComponent(chosen.name) } },
			);
			if (uploaded.status !== 201) {
				setPhase("failed");
				setError("That photo could not be used.");
				return;
			}
			const lift = await requestLift({ photoAssetId: uploaded.data.id });
			if (lift.status !== 201) {
				setPhase("failed");
				setError("That photo could not be lifted.");
				return;
			}
			setPhotoAssetId(uploaded.data.id);
			setLiftId(lift.data.assetId);
			watch(lift.data.assetId);
		} catch {
			setPhase("failed");
			setError("That photo could not be lifted.");
		}
	}

	async function save() {
		if (!photoAssetId || !editor.current || trimmed === "" || saving) return;
		setSaving(true);
		setError(null);
		try {
			const composed = await editor.current.compose();
			const uploaded = await uploadFile(
				composed.png,
				{ purpose: "mask" },
				{ headers: { "x-file-name": encodeURIComponent(`${trimmed}.png`) } },
			);
			if (uploaded.status !== 201) {
				setError(
					kind === "signature"
						? "That signature could not be saved."
						: "That doodle could not be saved.",
				);
				return;
			}
			const created = await createDrawing({
				kind,
				name: trimmed,
				maskAssetId: uploaded.data.id,
				source: { kind: "photo", photoAssetId },
			});
			if (created.status !== 201) {
				setError(
					kind === "signature"
						? "That signature could not be saved."
						: "That doodle could not be saved.",
				);
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
			setError(
				kind === "signature"
					? "That signature could not be saved."
					: "That doodle could not be saved.",
			);
		} finally {
			setSaving(false);
		}
	}

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
				className="sr-only"
				onChange={(event) => {
					const chosen = event.target.files?.[0];
					if (chosen) void onFile(chosen);
				}}
			/>
			{phase === "pick" || phase === "failed" ? (
				<Button type="button" onClick={() => file.current?.click()}>
					Choose a photo
				</Button>
			) : null}
			{phase === "lifting" && liftId ? (
				<StatusPill status={liftStatus} label="Lifting the ink" />
			) : null}
			{slow && phase === "lifting" ? (
				<p className="text-ui text-ink">This is taking longer than usual</p>
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
						className="rounded-md bg-desk/50 px-2 py-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
			) : null}
			{error ? <p className="text-ui text-danger">{error}</p> : null}
			{slow || phase === "failed" ? (
				<Button type="button" variant="outline" onClick={reset}>
					Try again
				</Button>
			) : null}
			{phase === "edit" ? (
				<Button
					type="button"
					disabled={trimmed === "" || saving}
					onClick={() => void save()}
				>
					{kind === "signature" ? "Save signature" : "Save doodle"}
				</Button>
			) : null}
		</div>
	);
}
