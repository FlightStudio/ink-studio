"use client";

import { deleteDrawing, renameDrawing } from "@repo/api";
import type { LibraryDrawing } from "@repo/types";
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

export type LibrarySheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	drawings: LibraryDrawing[];
	onPlace: (drawing: LibraryDrawing) => void;
};

export function LibrarySheet({
	open,
	onOpenChange,
	drawings: initial,
	onPlace,
}: LibrarySheetProps) {
	const narrow = useNarrow();
	const [drawings, setDrawings] = useState(initial);
	const [drawOpen, setDrawOpen] = useState(false);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [draft, setDraft] = useState("");

	async function saveName(drawing: LibraryDrawing) {
		const name = draft.trim();
		if (name === "" || name === drawing.name) {
			setRenaming(null);
			return;
		}
		const response = await renameDrawing(drawing.id, { name });
		if (response.status === 204) {
			setDrawings((current) =>
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
			setDrawings((current) =>
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
							Doodles saved for this studio. Tap one to put it on the page.
						</SheetDescription>
					</SheetHeader>
					{drawings.length === 0 ? (
						<div className="flex flex-col gap-3 px-4 pb-4">
							<p className="text-ui text-ink-muted">
								Nothing saved yet. Draw one, or photograph one later.
							</p>
							<div className="flex gap-2">
								<Button type="button" onClick={() => setDrawOpen(true)}>
									Draw
								</Button>
								<Button type="button" variant="outline">
									Photograph
								</Button>
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-3 px-4 pb-4">
							<Button type="button" onClick={() => setDrawOpen(true)}>
								Draw
							</Button>
							<ul className="flex flex-col gap-3">
								{drawings.map((drawing) => (
									<li
										key={drawing.id}
										className="flex items-center gap-3 rounded-lg bg-desk/40 p-2"
									>
										<button
											type="button"
											className="flex min-w-0 flex-1 items-center gap-3 text-left"
											onClick={() => onPlace(drawing)}
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
						</div>
					)}
				</SheetContent>
			</Sheet>
			<DrawDoodleDialog
				open={drawOpen}
				onOpenChange={setDrawOpen}
				onSaved={(drawing) => setDrawings((current) => [drawing, ...current])}
			/>
		</>
	);
}
