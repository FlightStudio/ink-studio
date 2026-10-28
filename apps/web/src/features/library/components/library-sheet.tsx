"use client";

import { deleteDrawing, renameDrawing } from "@repo/api";
import type { InkColorId, LibraryDrawing } from "@repo/types";
import { INK_COLORS, SIGNATURE_WIDTHS } from "@repo/types";
import { Swatch } from "@repo/ui/components/swatch";
import { Button } from "@repo/ui/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { useState, useSyncExternalStore } from "react";
import { DrawDoodleDialog } from "./draw-doodle-dialog.tsx";
import { PhotoDoodleDialog } from "./photo-doodle-dialog.tsx";

const NARROW = "(max-width: 899px)";
const NAME_LIMIT = 60;

function subscribeNarrow(onChange: () => void): () => void {
	const query = window.matchMedia(NARROW);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function useNarrow(): boolean {
	return useSyncExternalStore(
		subscribeNarrow,
		() => window.matchMedia(NARROW).matches,
		() => false,
	);
}

export type LibraryTab = "doodle" | "signature";

export type LibrarySheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	doodles: LibraryDrawing[];
	signatures: LibraryDrawing[];
	tab: LibraryTab;
	onTab: (tab: LibraryTab) => void;
	onPlace: (drawing: LibraryDrawing) => void;
	onSign: (
		drawing: LibraryDrawing,
		choice: {
			widthIn: (typeof SIGNATURE_WIDTHS)[number];
			color: InkColorId;
		},
	) => void;
};

export function LibrarySheet({
	open,
	onOpenChange,
	doodles: initialDoodles,
	signatures: initialSignatures,
	tab,
	onTab,
	onPlace,
	onSign,
}: LibrarySheetProps) {
	const narrow = useNarrow();
	const [doodles, setDoodles] = useState(initialDoodles);
	const [signatures, setSignatures] = useState(initialSignatures);
	const [drawOpen, setDrawOpen] = useState(false);
	const [photoOpen, setPhotoOpen] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [widthIn, setWidthIn] =
		useState<(typeof SIGNATURE_WIDTHS)[number]>(2.25);
	const [color, setColor] = useState<InkColorId>("ink-blue");
	const signature = tab === "signature";
	const drawings = signature ? signatures : doodles;
	const kind = signature ? "signature" : "doodle";

	function replace(
		drawingKind: LibraryDrawing["kind"],
		update: (current: LibraryDrawing[]) => LibraryDrawing[],
	) {
		if (drawingKind === "signature") setSignatures(update);
		else setDoodles(update);
	}

	async function saveName(drawing: LibraryDrawing) {
		const name = draft.trim();
		if (name === "" || name === drawing.name) {
			setRenaming(null);
			return;
		}
		const response = await renameDrawing(drawing.id, { name });
		if (response.status === 204) {
			replace(drawing.kind, (current) =>
				current.map((item) =>
					item.id === drawing.id ? { ...item, name } : item,
				),
			);
		}
		setRenaming(null);
	}

	async function remove(drawing: LibraryDrawing) {
		const response = await deleteDrawing(drawing.id);
		if (response.status === 204) {
			replace(drawing.kind, (current) =>
				current.filter((item) => item.id !== drawing.id),
			);
		}
	}

	return (
		<>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent
					side={narrow ? "bottom" : "right"}
					className="max-h-[80vh] overflow-y-auto bg-paper text-ink data-[side=right]:w-full data-[side=right]:sm:max-w-sm"
				>
					<SheetHeader>
						<SheetTitle>Library</SheetTitle>
						<SheetDescription>
							{signature
								? "Signatures belong to you. Pick a size and an ink, then tap one to sign."
								: "Doodles saved for this studio. Tap one to put it on the page."}
						</SheetDescription>
					</SheetHeader>
					<div className="flex flex-col gap-3 px-4 pb-4">
						<div className="flex gap-2" role="tablist" aria-label="Library">
							<Button
								type="button"
								role="tab"
								aria-selected={tab === "doodle"}
								variant={tab === "doodle" ? "default" : "outline"}
								onClick={() => onTab("doodle")}
							>
								Doodles
							</Button>
							<Button
								type="button"
								role="tab"
								aria-selected={tab === "signature"}
								variant={tab === "signature" ? "default" : "outline"}
								onClick={() => onTab("signature")}
							>
								Signatures
							</Button>
						</div>
						{signature ? (
							<>
								<fieldset
									aria-label="Width"
									className="m-0 flex gap-2 border-0 p-0"
								>
									{SIGNATURE_WIDTHS.map((width) => (
										<Button
											key={width}
											type="button"
											size="sm"
											variant={widthIn === width ? "default" : "outline"}
											aria-pressed={widthIn === width}
											onClick={() => setWidthIn(width)}
										>
											{width} in
										</Button>
									))}
								</fieldset>
								<fieldset
									aria-label="Ink"
									className="m-0 flex flex-wrap gap-1 border-0 p-0"
								>
									{Object.entries(INK_COLORS).map(([id, ink]) => (
										<Swatch
											key={id}
											color={ink.css}
											label={ink.label}
											selected={color === id}
											labelHidden
											onSelect={() => setColor(id as InkColorId)}
										/>
									))}
								</fieldset>
							</>
						) : null}
						{drawings.length === 0 ? (
							<p className="text-ui text-ink-muted">
								{signature
									? "No signatures yet. Draw one, or photograph one."
									: "Nothing saved yet. Draw one, or photograph one."}
							</p>
						) : null}
						<div className="flex gap-2">
							<Button type="button" onClick={() => setDrawOpen(true)}>
								Draw
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setPhotoOpen(true)}
							>
								Photograph
							</Button>
						</div>
						{drawings.length > 0 ? (
							<ul className="flex flex-col gap-3">
								{drawings.map((drawing) => (
									<li
										key={drawing.id}
										className="flex items-center gap-3 rounded-lg bg-desk/40 p-2"
									>
										<button
											type="button"
											className="flex min-w-0 flex-1 items-center gap-3 text-left"
											onClick={() =>
												signature
													? onSign(drawing, { widthIn, color })
													: onPlace(drawing)
											}
										>
											<span
												aria-hidden
												className="size-14 shrink-0 bg-contain bg-center bg-no-repeat"
												style={{
													backgroundImage: `url(/api/assets/${drawing.maskAssetId})`,
												}}
											/>
											<span className="truncate text-ui">{drawing.name}</span>
										</button>
										{renaming === drawing.id ? (
											<form
												className="flex gap-1"
												onSubmit={(event) => {
													event.preventDefault();
													void saveName(drawing);
												}}
											>
												<input
													aria-label={`Rename ${drawing.name}`}
													value={draft}
													maxLength={NAME_LIMIT}
													onChange={(event) =>
														setDraft(event.target.value.replace(/\p{Cc}/gu, ""))
													}
													className="w-28 rounded-md bg-paper px-2 py-1 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring"
												/>
												<Button type="submit" size="sm">
													Save
												</Button>
											</form>
										) : (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												aria-label={`Rename ${drawing.name}`}
												onClick={() => {
													setRenaming(drawing.id);
													setDraft(drawing.name);
												}}
											>
												Rename
											</Button>
										)}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											aria-label={`Delete ${drawing.name}`}
											onClick={() => void remove(drawing)}
										>
											Delete
										</Button>
									</li>
								))}
							</ul>
						) : null}
					</div>
				</SheetContent>
			</Sheet>
			<DrawDoodleDialog
				open={drawOpen}
				onOpenChange={setDrawOpen}
				kind={kind}
				onSaved={(drawing) =>
					replace(drawing.kind, (current) => [drawing, ...current])
				}
			/>
			<PhotoDoodleDialog
				open={photoOpen}
				onOpenChange={setPhotoOpen}
				kind={kind}
				onSaved={(drawing) =>
					replace(drawing.kind, (current) => [drawing, ...current])
				}
			/>
		</>
	);
}
